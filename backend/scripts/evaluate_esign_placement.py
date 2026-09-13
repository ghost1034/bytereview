"""Opt-in live evaluation and exact offline replay. Never creates production runs.

Outputs contain private model evidence; use a private untracked directory.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

from google import genai
from google.genai import types
from google.oauth2.credentials import Credentials

from services.esign.placement_single_call import analyze_documents, replay_analysis
from services.esign.placement_analysis import analyze_documents as baseline_analysis
from services.esign.placement_evaluation import check_consent_result, consent_inputs, general_inputs, check_general_result, party_inputs
from services.esign.placement_model import generate_placement_response


def cases(pdf: Path, suite: str):
    if suite in {'all', 'consent'}:
        for existing in (False, True):
            pdfs, snapshot = consent_inputs(pdf, existing=existing)
            yield ('consent-existing' if existing else 'consent-empty', pdfs, snapshot,
                   'Place checkboxes in both Yes and No' if existing else None, None, existing)
    if suite in {'all', 'parties'}:
        pdfs, snapshot, expected = party_inputs()
        yield 'parties', pdfs, snapshot, 'Add one optional multiline text field for Client in the unlabeled rectangle at the bottom.', expected, False
    if suite in {'all', 'general', 'scanned', 'rotated', 'multiple'}:
        variants = ['general', 'scanned', 'rotated', 'multiple'] if suite == 'all' else [suite]
        for variant in variants:
            pdfs, snapshot, expected = general_inputs(scanned=variant == 'scanned', rotation=90 if variant == 'rotated' else 0)
            if variant == 'multiple':
                pdfs['second'] = pdfs['general']
                snapshot['documents'].append({**snapshot['documents'][0], 'id': 'second'})
                expected += [{**e, 'document_id': 'second', 'group': e['group']+'-second'} if e.get('group') else {**e, 'document_id': 'second'} for e in copy.deepcopy(expected)]
            yield variant, pdfs, snapshot, None, expected, False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pdf', type=Path, default=Path('examples/e-signature/Informed_Consent.pdf'))
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--iterations', type=int, default=10)
    parser.add_argument('--suite', choices=['all', 'consent', 'general', 'scanned', 'rotated', 'multiple', 'parties'], default='all')
    parser.add_argument('--workers', type=int, choices=[1, 2, 3, 4], default=2)
    parser.add_argument('--project', default=os.getenv('GOOGLE_CLOUD_PROJECT_ID'))
    parser.add_argument('--location', default='global')
    parser.add_argument('--model', default='gemini-2.5-flash')
    parser.add_argument('--gcloud-auth', action='store_true')
    parser.add_argument('--baseline', action='store_true', help='Explicitly evaluate the previous multi-call pipeline for comparison')
    parser.add_argument('--replay', type=Path)
    args = parser.parse_args()
    if not 1 <= args.iterations <= 10:
        parser.error('iterations must be between 1 and 10')
    args.output.mkdir(parents=True, exist_ok=True, mode=0o700)
    inputs = list(cases(args.pdf, args.suite))
    if args.replay:
        diagnostics = json.loads(args.replay.read_text())
        snapshot = diagnostics['snapshot']
        pdfs = None
        if diagnostics.get('source_files'):
            pdfs = {}
            for doc_id, relative_path in diagnostics['source_files'].items():
                source = (args.replay.parent/relative_path).resolve()
                if not source.is_relative_to(args.replay.parent.resolve()):
                    parser.error('Replay source path escapes the evidence directory')
                pdfs[doc_id] = source.read_bytes()
        pdfs = pdfs or next((p for _, p, s, _, _, _ in inputs if s['documents'] == snapshot['documents']), None)
        if pdfs is None:
            parser.error('No fixture matches replay snapshot')
        result = replay_analysis(pdfs, diagnostics)
        (args.output/'replay.json').write_text(json.dumps({'proposals': result.proposals, 'issues': result.issues}, indent=2))
        return 0
    if not args.project:
        parser.error('--project is required for live evaluation')
    credentials = Credentials(subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()) if args.gcloud_auth else None
    (args.output/'sources').mkdir(exist_ok=True, mode=0o700)
    source_files = {}
    for name, pdfs, _, _, _, _ in inputs:
        source_files[name] = {}
        for doc_id, data in pdfs.items():
            relative = f'sources/{hashlib.sha256(data).hexdigest()}.pdf'
            (args.output/relative).write_bytes(data)
            source_files[name][doc_id] = relative
    settings = {'model': args.model, 'location': args.location, 'temperature': .1}

    def evaluate(case, iteration):
        name, pdfs, snapshot, instructions, expected, existing = case
        diagnostics = {'source_files': source_files[name]}
        name = f'{name}-{iteration:02}'
        started = time.monotonic()
        metrics = {}
        try:
            with genai.Client(vertexai=True, project=args.project, location=args.location, credentials=credentials,
                              http_options=types.HttpOptions(retry_options=types.HttpRetryOptions(attempts=1))) as client:
                result = (baseline_analysis if args.baseline else analyze_documents)(pdfs, snapshot, instructions,
                    lambda phase, prompt, schema, images: generate_placement_response(client, settings, phase, prompt, schema, images),
                    model_settings=settings, diagnostics_sink=diagnostics)
            if expected is None:
                errors = check_consent_result(result.proposals, existing=existing)
                errors += [i['reason'] for i in result.issues if i['code'] == 'unresolved']
            else:
                metrics = check_general_result(result.proposals, expected)
                errors = metrics.pop('errors')
            if not args.baseline and len(diagnostics['calls']) != 1:
                errors.append('Expected exactly one request')
            (args.output/f'{name}-result.json').write_text(json.dumps({'proposals': result.proposals, 'issues': result.issues}, indent=2))
        except Exception as exc:
            errors = [f'{type(exc).__name__}: {exc}']
        (args.output/f'{name}-diagnostics.json').write_text(json.dumps(diagnostics, indent=2))
        row = {'case': name, 'passed': not errors, 'errors': errors, **metrics,
               'duration_seconds': round(time.monotonic()-started, 2), 'calls': len(diagnostics.get('calls', [])),
               'total_tokens': sum(c.get('provider', {}).get('usage', {}).get('total_token_count', 0) or 0 for c in diagnostics.get('calls', []))}
        print(json.dumps(row), flush=True)
        return row

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(evaluate, case, iteration) for case in inputs for iteration in range(1, args.iterations+1)]
        rows = [f.result() for f in futures]
    (args.output/'summary.json').write_text(json.dumps({'settings': settings, 'baseline': args.baseline, 'results': rows, 'passed': all(r['passed'] for r in rows)}, indent=2))
    return 0 if all(r['passed'] for r in rows) else 1


if __name__ == '__main__':
    raise SystemExit(main())
