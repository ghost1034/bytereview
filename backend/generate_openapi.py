#!/usr/bin/env python3
"""
Generate OpenAPI schema for the FastAPI backend
This script outputs the OpenAPI schema to stdout for use with openapi-typescript
"""
import json
import sys
from main import app

if __name__ == "__main__":
    openapi_schema = app.openapi()
    print(json.dumps(openapi_schema, indent=2))