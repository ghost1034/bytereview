# ARQ Cron Worker for ByteReview

This document explains the cron worker system for scheduled maintenance tasks.

## Overview

The cron worker handles periodic billing, cleanup, and maintenance tasks using ARQ's built-in cron functionality. It runs on a separate Redis queue (`cron_queue`) to avoid interfering with main processing tasks.

## Scheduled Tasks

### 🔄 **Free User Period Reset**
- **Schedule:** Daily at 00:30 UTC
- **Purpose:** Reset billing periods for free users at month boundaries
- **Function:** `schedule_free_user_period_reset()`
- **Critical:** Prevents free users from being permanently blocked

### 💳 **Stripe Usage Reconciliation**
- **Schedule:** Every 2 hours (at :15 minutes)
- **Purpose:** Retry failed Stripe usage reports for paid users
- **Function:** `schedule_stripe_usage_reconciliation()`
- **Important:** Ensures accurate billing

### 🧹 **Usage Counter Cleanup**
- **Schedule:** Weekly on Sundays at 02:00 UTC
- **Purpose:** Remove old usage counters (>13 months)
- **Function:** `schedule_usage_counter_cleanup()`
- **Benefit:** Prevents database bloat

### 🗑️ **Abandoned Job Cleanup**
- **Schedule:** Daily at 01:00 UTC
- **Purpose:** Clean up jobs that were never started
- **Function:** `schedule_abandoned_cleanup()`

### 📦 **Artifact Cleanup**
- **Schedule:** Daily at 03:00 UTC
- **Purpose:** Remove old unpacked ZIP artifacts from GCS
- **Function:** `schedule_artifact_cleanup()`

### 👤 **Opt-out Data Cleanup**
- **Schedule:** Weekly on Saturdays at 04:00 UTC
- **Purpose:** Clean up data for users who opted out
- **Function:** `schedule_opt_out_cleanup()`

## Running the Cron Worker

### Development
```bash
# Run cron worker only
cd backend
python workers/run_workers.py cron

# Or use the dedicated script
python scripts/run_cron_worker.py

# Or use the shell script
./scripts/start_cron_worker.sh
```

### Production
```bash
# Run both main and cron workers
cd backend
python workers/run_workers.py ai &    # Main worker
python workers/run_workers.py cron &  # Cron worker

# Or run them in separate containers/processes
```

## Testing Cron Tasks

### Test All Tasks
```bash
cd backend
python scripts/test_cron_tasks.py
```

### Test Specific Task
```bash
cd backend
python scripts/test_cron_tasks.py period    # Free user period reset
python scripts/test_cron_tasks.py stripe    # Stripe reconciliation
python scripts/test_cron_tasks.py usage     # Usage counter cleanup
python scripts/test_cron_tasks.py abandoned # Abandoned job cleanup
python scripts/test_cron_tasks.py artifact  # Artifact cleanup
python scripts/test_cron_tasks.py optout    # Opt-out cleanup
```

## Configuration

### Redis Queue
- **Queue Name:** `cron_queue`
- **Max Jobs:** 5 (lower concurrency for maintenance)
- **Job Timeout:** 30 minutes
- **Keep Results:** 24 hours

### Cron Schedule Format
ARQ uses standard cron syntax:
- `hour=0, minute=30` = Daily at 00:30
- `hour={0,2,4,6,8,10,12,14,16,18,20,22}, minute=15` = Every 2 hours at :15
- `weekday=6, hour=2, minute=0` = Sundays at 02:00

### Environment Variables
The cron worker uses the same environment variables as the main worker:
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_URL` - Redis connection (defaults to localhost:6379)
- `STRIPE_SECRET_KEY` - For Stripe reconciliation
- `STRIPE_METER_PAGES` - For usage reporting

## Monitoring

### Logs
- Cron worker logs to stdout and `logs/cron_worker.log` (if logs/ exists)
- Each task logs start/completion with results
- Failed tasks log detailed error information

### Health Checks
- Worker performs health checks every 5 minutes
- Tasks return structured results with success/failure status
- Failed tasks don't crash the worker (graceful error handling)

### Metrics
Each task returns metrics:
```python
{
    "success": True,
    "message": "Period reset completed for 5 free users",
    "updated_count": 5
}
```

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Check `DATABASE_URL` environment variable
   - Ensure PostgreSQL is accessible

2. **Redis Connection Errors**
   - Check Redis is running on localhost:6379
   - Or set `REDIS_URL` environment variable

3. **Stripe API Errors**
   - Check `STRIPE_SECRET_KEY` is valid
   - Check `STRIPE_METER_PAGES` is configured

4. **Permission Errors**
   - Ensure worker has database write permissions
   - Check file system permissions for logs

### Manual Task Execution
You can manually trigger tasks for debugging:
```python
# In Python shell
from workers.cron_worker import schedule_free_user_period_reset
import asyncio

result = asyncio.run(schedule_free_user_period_reset({}))
print(result)
```

## Architecture

```
┌─────────────────┐    ┌─────────────────┐
│   Main Worker   │    │   Cron Worker   │
│   (ai queue)    │    │ (cron_queue)    │
├─────────────────┤    ├─────────────────┤
│ • AI Extraction │    │ • Period Reset  │
│ • ZIP Unpacking │    │ • Stripe Sync   │
│ • File Imports  │    │ • Cleanup Tasks │
│ • Exports       │    │ • Maintenance   │
│ • Automations   │    │                 │
└─────────────────┘    └─────────────────┘
         │                       │
         └───────────┬───────────┘
                     │
              ┌─────────────┐
              │    Redis    │
              │   Queues    │
              └─────────────┘
```

The cron worker operates independently from the main worker, ensuring that scheduled maintenance tasks don't interfere with user-facing operations.