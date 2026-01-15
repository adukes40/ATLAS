"""
Sync Scheduler Service

Replaces system cron with in-app scheduling.
Runs every minute and triggers syncs based on sync_schedules table.
"""

import asyncio
import threading
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from app.database import SessionLocal
from app.models import SyncSchedule, SyncLog, SyncNotification
from app.services.settings_service import get_setting


# Global reference to the scheduler task
_scheduler_task: Optional[asyncio.Task] = None
_scheduler_running = False


def check_and_run_scheduled_syncs():
    """
    Check if any syncs are due to run and trigger them.
    Called every minute by the scheduler loop.
    """
    from app.routers.utilities import run_sync_script

    db = SessionLocal()
    try:
        # Get configured timezone (defaults to Eastern if not set)
        schedule_timezone = get_setting(db, 'schedule_timezone') or 'America/New_York'

        # Convert current UTC time to configured timezone
        utc_now = datetime.utcnow().replace(tzinfo=ZoneInfo('UTC'))
        local_now = utc_now.astimezone(ZoneInfo(schedule_timezone))

        current_hour = local_now.hour
        current_minute = local_now.minute

        # Only run at the top of the hour (minute 0)
        if current_minute != 0:
            return

        # Get all enabled schedules
        schedules = db.query(SyncSchedule).filter(
            SyncSchedule.enabled == True
        ).all()

        for schedule in schedules:
            # Check if current hour is in the schedule
            if current_hour not in (schedule.hours or []):
                continue

            # Check if already running
            running = db.query(SyncLog).filter(
                SyncLog.source == schedule.source,
                SyncLog.status == "running"
            ).first()

            if running:
                # Log that we skipped due to running sync
                print(f"[Scheduler] Skipping {schedule.source} - already running")
                continue

            # Trigger the sync in a background thread
            print(f"[Scheduler] Triggering scheduled {schedule.source} sync")
            thread = threading.Thread(
                target=run_sync_script,
                args=(schedule.source, "scheduled"),
                daemon=True
            )
            thread.start()

    except Exception as e:
        print(f"[Scheduler] Error: {e}")
    finally:
        db.close()


def create_notification_for_failures():
    """
    Check recent sync completions and create notifications for failures.
    Called every minute to catch newly completed syncs.
    """
    from datetime import timedelta

    db = SessionLocal()
    try:
        # Find syncs completed in the last 2 minutes with errors
        cutoff = datetime.utcnow() - timedelta(minutes=2)

        failed_syncs = db.query(SyncLog).filter(
            SyncLog.status.in_(["error", "partial"]),
            SyncLog.completed_at >= cutoff
        ).all()

        for sync_log in failed_syncs:
            # Check if notification already exists
            existing = db.query(SyncNotification).filter(
                SyncNotification.sync_log_id == sync_log.id
            ).first()

            if not existing:
                notification = SyncNotification(
                    sync_log_id=sync_log.id,
                    acknowledged=False,
                    created_at=datetime.utcnow()
                )
                db.add(notification)
                print(f"[Scheduler] Created notification for {sync_log.source} sync failure")

        db.commit()

    except Exception as e:
        print(f"[Scheduler] Error creating notifications: {e}")
    finally:
        db.close()


async def scheduler_loop():
    """
    Main scheduler loop. Runs every 60 seconds.
    """
    global _scheduler_running
    _scheduler_running = True

    print("[Scheduler] Started - checking schedules every minute")

    while _scheduler_running:
        try:
            # Run checks in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, check_and_run_scheduled_syncs)
            await loop.run_in_executor(None, create_notification_for_failures)
        except Exception as e:
            print(f"[Scheduler] Loop error: {e}")

        # Wait 60 seconds before next check
        await asyncio.sleep(60)


def start_scheduler():
    """
    Start the background scheduler.
    Should be called on FastAPI startup.
    """
    global _scheduler_task

    if _scheduler_task is not None:
        print("[Scheduler] Already running")
        return

    loop = asyncio.get_event_loop()
    _scheduler_task = loop.create_task(scheduler_loop())
    print("[Scheduler] Scheduler started")


def stop_scheduler():
    """
    Stop the background scheduler.
    Should be called on FastAPI shutdown.
    """
    global _scheduler_task, _scheduler_running

    _scheduler_running = False

    if _scheduler_task:
        _scheduler_task.cancel()
        _scheduler_task = None

    print("[Scheduler] Scheduler stopped")
