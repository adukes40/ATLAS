#!/usr/bin/env python3
"""
Google Bulk Sync Script
Runs nightly via cron to populate google_devices and google_users tables.

Usage:
    python3 scripts/google_bulk_sync.py

Cron example (run at 2 AM daily):
    0 2 * * * cd /opt/atlas/atlas-backend && /opt/atlas/atlas-backend/venv/bin/python3 scripts/google_bulk_sync.py >> /var/log/atlas-google-sync.log 2>&1
"""

import sys
import os
from datetime import datetime

# Add the parent directory to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.config import GOOGLE_CREDS_PATH, GOOGLE_ADMIN_EMAIL
from app.services.google_sync import GoogleConnector
from app.models import SyncLog

def main():
    print("=" * 60)
    print("ATLAS Google Bulk Sync (Devices + Users)")
    print("=" * 60)

    # Resolve credentials path relative to backend directory
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    creds_path = os.path.join(backend_dir, GOOGLE_CREDS_PATH)

    if not os.path.exists(creds_path):
        print(f"ERROR: Credentials file not found at {creds_path}")
        sys.exit(1)

    print(f"Using credentials: {creds_path}")
    print(f"Admin email: {GOOGLE_ADMIN_EMAIL}")
    print()

    # Initialize connector
    connector = GoogleConnector(creds_path, GOOGLE_ADMIN_EMAIL)

    # Get database session
    db = SessionLocal()

    # Determine trigger type (cron vs manual based on environment)
    triggered_by = os.environ.get("SYNC_TRIGGER", "cron")

    # Create sync log entry
    sync_log = SyncLog(
        source="google",
        started_at=datetime.utcnow(),
        status="running",
        triggered_by=triggered_by
    )
    db.add(sync_log)
    db.commit()
    db.refresh(sync_log)

    total_records = 0
    total_errors = 0
    all_error_details = []

    try:
        # Sync devices
        print("Phase 1: Syncing Google Devices...")
        print("-" * 40)
        device_result = connector.bulk_sync(db)
        print(f"Devices: {device_result['success']} synced, {device_result['errors']} errors")
        total_records += device_result.get("success", 0)
        total_errors += device_result.get("errors", 0)
        print()

        # Sync users
        print("Phase 2: Syncing Google Users...")
        print("-" * 40)
        user_result = connector.bulk_sync_users(db)
        print(f"Users: {user_result['success']} synced, {user_result['errors']} errors")
        total_records += user_result.get("success", 0)
        total_errors += user_result.get("errors", 0)
        # Collect error details from user sync
        if user_result.get("error_details"):
            all_error_details.extend(user_result["error_details"])
        print()

        # Update sync log with success
        sync_log.status = "success"
        sync_log.completed_at = datetime.utcnow()
        sync_log.records_processed = total_records
        sync_log.records_failed = total_errors
        sync_log.error_details = all_error_details
        db.commit()

        print("=" * 60)
        print(f"GOOGLE SYNC COMPLETE")
        print(f"Total: {total_records} records, {total_errors} errors")
        print(f"Successfully synced {total_records} records")
        print("=" * 60)

    except Exception as e:
        print(f"FATAL ERROR: {e}")

        # Update sync log with error
        sync_log.status = "error"
        sync_log.completed_at = datetime.utcnow()
        sync_log.error_message = str(e)[:500]
        sync_log.records_processed = total_records
        sync_log.records_failed = total_errors
        db.commit()

        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    main()
