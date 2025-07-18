#!/usr/bin/env python3
"""
Simple worker runner for ByteReview
Much cleaner than dealing with ARQ module paths
"""
import sys
import os
from pathlib import Path

# Set up Python path for proper imports
backend_dir = Path(__file__).parent.parent.resolve()  # Go up to backend/ directory
sys.path.insert(0, str(backend_dir))
os.environ['PYTHONPATH'] = str(backend_dir)

# Set Google Application Credentials to absolute path
service_account_path = backend_dir / "service-account.json"
if service_account_path.exists():
    os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = str(service_account_path)
    print(f"Set GOOGLE_APPLICATION_CREDENTIALS to: {service_account_path}")
else:
    print(f"Warning: service-account.json not found at {service_account_path}")

from arq import run_worker
from worker import WorkerSettings, ZipWorkerSettings

def main():
    if len(sys.argv) < 2:
        print("Usage: python run_workers.py [ai|zip]")
        print("  ai  - Run AI extraction worker")
        print("  zip - Run ZIP unpacking worker")
        sys.exit(1)
    
    worker_type = sys.argv[1].lower()
    
    # Set up logging
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    if worker_type == "ai":
        print("Starting AI Worker (extraction tasks)...")
        print("Logs will appear below...")
        run_worker(WorkerSettings)
    elif worker_type == "zip":
        print("Starting ZIP Worker (unpacking tasks)...")
        print("Logs will appear below...")
        run_worker(ZipWorkerSettings)
    else:
        print(f"Unknown worker type: {worker_type}")
        print("Use 'ai' or 'zip'")
        sys.exit(1)

if __name__ == "__main__":
    main()