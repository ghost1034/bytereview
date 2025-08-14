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
from worker import (
    WorkerSettings, ZipWorkerSettings, ImportWorkerSettings, ExportWorkerSettings, 
    AutomationWorkerSettings, CronWorkerSettings,
    # Hybrid worker settings for production
    ExtractWorkerSettings, IOWorkerSettings, MaintenanceWorkerSettings
)

def main():
    if len(sys.argv) < 2:
        print("Usage: python run_workers.py [extract|io|maint|ai|zip|import|export|automation|cron]")
        print("Production (hybrid) workers:")
        print("  extract    - Run extraction worker (AI tasks only)")
        print("  io         - Run I/O worker (imports, exports, ZIP unpacking)")
        print("  maint      - Run maintenance worker (cron tasks)")
        print("")
        print("Legacy (individual) workers:")
        print("  ai         - Run AI extraction worker")
        print("  zip        - Run ZIP unpacking worker")
        print("  import     - Run file import worker (Drive, Gmail)")
        print("  export     - Run export worker (Google Drive exports)")
        print("  automation - Run automation worker (Gmail triggers, job initialization)")
        print("  cron       - Run cron worker (scheduled maintenance tasks)")
        sys.exit(1)
    
    worker_type = sys.argv[1].lower()
    
    # Set up logging
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Production hybrid workers
    if worker_type == "extract":
        print("Starting Extract Worker (AI extraction tasks only)...")
        print("Queues: extract")
        print("Logs will appear below...")
        run_worker(ExtractWorkerSettings)
    elif worker_type == "io":
        print("Starting I/O Worker (imports, exports, ZIP unpacking)...")
        print("Queues: imports, exports, zip_queue")
        print("Logs will appear below...")
        run_worker(IOWorkerSettings)
    elif worker_type == "maint":
        print("Starting Maintenance Worker (cron tasks)...")
        print("📅 Scheduled tasks:")
        print("  - Free user period reset: Daily at 00:30 UTC")
        print("  - Stripe usage reconciliation: Every 2 hours")
        print("  - Usage counter cleanup: Weekly on Sundays at 02:00 UTC")
        print("  - Abandoned job cleanup: Daily at 01:00 UTC")
        print("  - Artifact cleanup: Daily at 03:00 UTC")
        print("  - Opt-out data cleanup: Weekly on Saturdays at 04:00 UTC")
        print("Logs will appear below...")
        run_worker(MaintenanceWorkerSettings)
    # Legacy individual workers (for backward compatibility)
    elif worker_type == "ai":
        print("Starting AI Worker (extraction tasks)...")
        print("Logs will appear below...")
        run_worker(WorkerSettings)
    elif worker_type == "zip":
        print("Starting ZIP Worker (unpacking tasks)...")
        print("Logs will appear below...")
        run_worker(ZipWorkerSettings)
    elif worker_type == "import":
        print("Starting Import Worker (Drive, Gmail import tasks)...")
        print("Logs will appear below...")
        run_worker(ImportWorkerSettings)
    elif worker_type == "export":
        print("Starting Export Worker (Google Drive export tasks)...")
        print("Logs will appear below...")
        run_worker(ExportWorkerSettings)
    elif worker_type == "automation":
        print("Starting Automation Worker (Gmail triggers, job initialization)...")
        print("Logs will appear below...")
        run_worker(AutomationWorkerSettings)
    elif worker_type == "cron":
        print("Starting Cron Worker (scheduled maintenance tasks)...")
        print("📅 Scheduled tasks:")
        print("  - Free user period reset: Daily at 00:30 UTC")
        print("  - Stripe usage reconciliation: Every 2 hours")
        print("  - Usage counter cleanup: Weekly on Sundays at 02:00 UTC")
        print("  - Abandoned job cleanup: Daily at 01:00 UTC")
        print("  - Artifact cleanup: Daily at 03:00 UTC")
        print("  - Opt-out data cleanup: Weekly on Saturdays at 04:00 UTC")
        print("Logs will appear below...")
        run_worker(CronWorkerSettings)
    else:
        print(f"Unknown worker type: {worker_type}")
        print("Use 'extract', 'io', 'maint' for production, or legacy individual worker types")
        sys.exit(1)

if __name__ == "__main__":
    main()