#!/usr/bin/env python3
"""
Generate OpenAPI schema for the FastAPI backend
This script outputs the OpenAPI schema to stdout for use with openapi-typescript
"""
import json
import sys
import argparse
from pathlib import Path
from main import app

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", type=Path)
    args = parser.parse_args()
    openapi_schema = app.openapi()
    rendered = json.dumps(openapi_schema, indent=2) + "\n"
    if args.check:
        current = args.check.read_text() if args.check.exists() else ""
        if current != rendered:
            print(f"OpenAPI schema drift detected: regenerate {args.check}", file=sys.stderr)
            raise SystemExit(1)
    elif args.output:
        args.output.write_text(rendered)
    else:
        sys.stdout.write(rendered)
