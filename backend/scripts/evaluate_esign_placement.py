"""Opt-in live evaluation or offline replay; never creates runs or usage events.

Run from the repository root with PYTHONPATH=backend. Outputs contain document
text and private prompts: choose a private, untracked directory.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import time

from google import genai
from google.oauth2.credentials import Credentials

from services.esign.placement_analysis import analyze_documents, replay_analysis
from services.esign.placement_evaluation import check_consent_result, consent_inputs
from services.esign.placement_model import generate_placement_response


def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pdf',type=Path,default=Path('examples/e-signature/Informed_Consent.pdf'))
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--iterations',type=int,default=10)
    parser.add_argument('--project',default=os.getenv('GOOGLE_CLOUD_PROJECT_ID'))
    parser.add_argument('--location',default='global')
    parser.add_argument('--model',default='gemini-2.5-flash')
    parser.add_argument('--gcloud-auth',action='store_true')
    parser.add_argument('--replay',type=Path)
    args=parser.parse_args()
    if not 1<=args.iterations<=10: parser.error('iterations must be between 1 and 10')
    args.output.mkdir(parents=True,exist_ok=True,mode=0o700)
    if args.replay:
        diagnostics=json.loads(args.replay.read_text())
        pdfs,_=consent_inputs(args.pdf)
        result=replay_analysis(pdfs,diagnostics)
        (args.output/'replay.json').write_text(json.dumps({'proposals':result.proposals,'issues':result.issues},indent=2))
        print('Offline replay completed; no model calls or production writes.')
        return 0
    if not args.project: parser.error('--project is required for live evaluation')
    credentials=Credentials(subprocess.check_output(['gcloud','auth','print-access-token'],text=True).strip()) if args.gcloud_auth else None
    settings={'model':args.model,'location':args.location,'temperature':.1}

    def evaluate(iteration: int, existing: bool) -> dict:
        case=f'{"existing" if existing else "empty"}-{iteration:02}'
        pdfs,snapshot=consent_inputs(args.pdf,existing=existing)
        diagnostics={}; started=time.monotonic()
        try:
            with genai.Client(vertexai=True,project=args.project,location=args.location,credentials=credentials) as client:
                result=analyze_documents(pdfs,snapshot,'Place checkboxes in both Yes and No' if existing else None,
                    lambda phase,prompt,schema,image: generate_placement_response(client,settings,phase,prompt,schema,image),
                    model_settings=settings,diagnostics_sink=diagnostics)
            errors=check_consent_result(result.proposals,existing=existing)
            errors += [i['reason'] for i in result.issues if i['code']=='unresolved']
            (args.output/f'{case}-result.json').write_text(json.dumps({'proposals':result.proposals,'issues':result.issues},indent=2))
        except Exception as exc:
            errors=[f'{type(exc).__name__}: {exc}']
        finally:
            (args.output/f'{case}-diagnostics.json').write_text(json.dumps(diagnostics,indent=2))
        row={'case':case,'passed':not errors,'errors':errors,'duration_seconds':round(time.monotonic()-started,2),
             'calls':len(diagnostics.get('calls',[])),
             'total_tokens':sum(c.get('provider',{}).get('usage',{}).get('total_token_count',0) or 0 for c in diagnostics.get('calls',[]))}
        print(json.dumps(row),flush=True)
        return row

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures=[pool.submit(evaluate,i,existing) for i in range(1,args.iterations+1) for existing in (False,True)]
        rows=[f.result() for f in futures]
    (args.output/'summary.json').write_text(json.dumps({'settings':settings,'results':rows,'passed':all(r['passed'] for r in rows)},indent=2))
    return 0 if all(r['passed'] for r in rows) else 1


if __name__=='__main__':
    raise SystemExit(main())
