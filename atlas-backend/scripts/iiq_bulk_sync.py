#!/usr/bin/env python3
"""
IIQ Bulk Sync Script
Syncs ALL assets from Incident IQ to local database.
Run via cron at 3 AM daily (after Google sync at 2 AM).

Usage:
    python scripts/iiq_bulk_sync.py

Cron entry:
    0 3 * * * cd /opt/atlas/atlas-backend && /opt/atlas/atlas-backend/venv/bin/python scripts/iiq_bulk_sync.py >> /var/log/atlas/iiq_sync.log 2>&1
"""

import sys
import os
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.services.iiq_sync import IIQConnector
from app.config import get_iiq_config
from app.models import SyncLog, IIQSyncConfig
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def main():
    logger.info("Starting IIQ bulk sync script...")

    # Create database session
    db = SessionLocal()

    # Determine trigger type (cron vs manual based on environment)
    triggered_by = os.environ.get("SYNC_TRIGGER", "cron")

    # Create sync log entry
    sync_log = SyncLog(
        source="iiq",
        started_at=datetime.utcnow(),
        status="running",
        triggered_by=triggered_by
    )
    db.add(sync_log)
    db.commit()
    db.refresh(sync_log)

    total_records = 0
    total_failed = 0

    try:
        # Initialize IIQ connector
        iiq_cfg = get_iiq_config()
        connector = IIQConnector(
            base_url=iiq_cfg["url"],
            token=iiq_cfg["token"],
            site_id=iiq_cfg.get("site_id"),
            product_id=iiq_cfg.get("product_id")
        )

        # Config-driven sync
        SYNC_FUNCTIONS = {
            'assets': connector.bulk_sync,
            'users': connector.bulk_sync_users,
            'tickets': connector.bulk_sync_tickets,
            'locations': connector.bulk_sync_locations,
            'teams': connector.bulk_sync_teams,
            'manufacturers': connector.bulk_sync_manufacturers,
        }

        enabled_sources = db.query(IIQSyncConfig).filter(IIQSyncConfig.enabled == True).all()
        logger.info(f"Found {len(enabled_sources)} enabled sources to sync")

        for source in enabled_sources:
            sync_func = SYNC_FUNCTIONS.get(source.source_key)
            if sync_func:
                logger.info(f"Syncing {source.display_name}...")
                try:
                    result = sync_func(db)
                    source.last_synced = datetime.utcnow()
                    db.commit()
                    logger.info(f"{source.display_name} complete: {result}")
                    # Track records from result
                    if isinstance(result, dict):
                        total_records += result.get("inserted", 0) + result.get("updated", 0) + result.get("success", 0)
                        total_failed += result.get("failed", 0)
                except Exception as e:
                    logger.error(f"Error syncing {source.display_name}: {e}")
                    total_failed += 1
            else:
                logger.warning(f"No sync function found for {source.source_key}")

        # Cache ticket stats (for dashboard, separate from data sync)
        logger.info("Caching ticket statistics...")
        ticket_stats = connector.cache_ticket_stats(db)
        logger.info(f"Ticket stats cached: {ticket_stats}")

        # Cache user stats (total students, etc.)
        logger.info("Caching user statistics...")
        user_stats = connector.cache_user_stats(db)
        logger.info(f"User stats cached: {user_stats}")

        # Update sync log with success
        sync_log.status = "success"
        sync_log.completed_at = datetime.utcnow()
        sync_log.records_processed = total_records
        sync_log.records_failed = total_failed
        db.commit()

        logger.info(f"Successfully synced {total_records} records")

    except Exception as e:
        logger.error(f"Sync failed: {e}")

        # Update sync log with error
        sync_log.status = "error"
        sync_log.completed_at = datetime.utcnow()
        sync_log.error_message = str(e)[:500]
        sync_log.records_processed = total_records
        sync_log.records_failed = total_failed
        db.commit()

        raise
    finally:
        db.close()

if __name__ == "__main__":
    main()
