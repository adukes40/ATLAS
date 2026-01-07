#!/usr/bin/env python3
"""
Meraki Bulk Sync Script
Runs nightly via cron to populate meraki_* tables.

Usage:
    python3 scripts/meraki_bulk_sync.py

Cron example (run at 4 AM daily, after IIQ and Google syncs):
    0 4 * * * cd /opt/atlas/atlas-backend && /opt/atlas/atlas-backend/venv/bin/python3 scripts/meraki_bulk_sync.py >> /var/log/atlas-meraki-sync.log 2>&1
"""

import sys
import os
from datetime import datetime

# Add the parent directory to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.config import get_meraki_config
from app.services.meraki_bulk_sync import MerakiBulkSync
from app.models import SyncLog


def main():
    print("=" * 60)
    print("ATLAS Meraki Bulk Sync")
    print(f"Started: {datetime.utcnow().isoformat()}")
    print("=" * 60)
    print()

    # Get Meraki config
    meraki_cfg = get_meraki_config()
    api_key = meraki_cfg.get("api_key")
    org_id = meraki_cfg.get("org_id")

    # Validate configuration
    if not api_key:
        print("ERROR: Meraki API key not configured")
        sys.exit(1)

    if not org_id:
        print("ERROR: Meraki Organization ID not configured")
        sys.exit(1)

    print(f"Organization ID: {org_id}")
    print()

    # Get database session
    db = SessionLocal()

    # Determine trigger type (cron vs manual based on environment)
    triggered_by = os.environ.get("SYNC_TRIGGER", "cron")

    # Create sync log entry
    sync_log = SyncLog(
        source="meraki",
        started_at=datetime.utcnow(),
        status="running",
        triggered_by=triggered_by
    )
    db.add(sync_log)
    db.commit()
    db.refresh(sync_log)

    try:
        # Initialize sync service
        sync_service = MerakiBulkSync(api_key, org_id)

        # Run bulk sync
        result = sync_service.bulk_sync(db)

        # Update sync log with success
        sync_log.status = "success" if result["total_errors"] == 0 else "partial"
        sync_log.completed_at = datetime.utcnow()
        sync_log.records_processed = result["total_success"]
        sync_log.records_failed = result["total_errors"]
        sync_log.error_details = []  # Could add detailed errors here if needed
        db.commit()

        print()
        print(f"Sync completed with status: {sync_log.status}")

        if result["total_errors"] > 0:
            sys.exit(1)  # Exit with error code if there were failures

    except Exception as e:
        print(f"FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()

        # Update sync log with error
        sync_log.status = "error"
        sync_log.completed_at = datetime.utcnow()
        sync_log.error_message = str(e)[:500]
        db.commit()

        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
