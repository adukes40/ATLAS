from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel
import subprocess
import os
import signal

from app.database import get_db
from app.models import (
    IIQAsset, IIQUser, GoogleDevice, GoogleUser, NetworkCache, SyncLog,
    MerakiNetwork, MerakiDevice, MerakiSSID, MerakiClient,
    SyncSchedule, SyncNotification,
    IIQTicket, IIQLocation, IIQTeam, IIQManufacturer
)

router = APIRouter(prefix="/api/utilities", tags=["utilities"])

# Allowed tables for preview (security - prevent arbitrary table access)
ALLOWED_TABLES = {
    "iiq_assets": {
        "model": IIQAsset,
        "pk": "serial_number",
        "columns": ["serial_number", "asset_tag", "model", "status", "assigned_user_name",
                   "assigned_user_email", "assigned_user_role", "location", "last_updated"]
    },
    "iiq_users": {
        "model": IIQUser,
        "pk": "user_id",
        "columns": ["user_id", "email", "full_name", "role_name", "grade",
                   "location_name", "is_active", "last_updated"]
    },
    "google_devices": {
        "model": GoogleDevice,
        "pk": "serial_number",
        "columns": ["serial_number", "model", "status", "aue_date", "os_version",
                   "battery_health_percent", "last_sync"]
    },
    "google_users": {
        "model": GoogleUser,
        "pk": "google_id",
        "columns": ["email", "full_name", "role", "school", "org_unit_path",
                   "is_suspended", "last_login", "last_updated"]
    },
    "network_cache": {
        "model": NetworkCache,
        "pk": "mac_address",
        "columns": ["mac_address", "ip_address", "last_ap_name", "ssid", "last_seen"]
    },
    "meraki_networks": {
        "model": MerakiNetwork,
        "pk": "network_id",
        "columns": ["network_id", "name", "product_types", "tags", "time_zone", "last_updated"]
    },
    "meraki_devices": {
        "model": MerakiDevice,
        "pk": "serial",
        "columns": ["serial", "name", "model", "mac", "network_id", "product_type", "status", "lan_ip", "last_updated"]
    },
    "meraki_ssids": {
        "model": MerakiSSID,
        "pk": "id",
        "columns": ["id", "network_id", "ssid_number", "name", "enabled", "auth_mode", "encryption_mode", "last_updated"]
    },
    "meraki_clients": {
        "model": MerakiClient,
        "pk": "mac",
        "columns": ["mac", "description", "manufacturer", "os", "last_ssid", "last_ap_name", "status", "last_seen", "last_updated"]
    },
    "iiq_tickets": {
        "model": IIQTicket,
        "pk": "ticket_id",
        "columns": ["ticket_id", "ticket_number", "subject", "status", "priority", "category",
                   "owner_name", "assignee_name", "location_name", "created_date", "closed_date", "last_updated"]
    },
    "iiq_locations": {
        "model": IIQLocation,
        "pk": "location_id",
        "columns": ["location_id", "name", "abbreviation", "address", "city", "state", "location_type", "last_updated"]
    },
    "iiq_teams": {
        "model": IIQTeam,
        "pk": "team_id",
        "columns": ["team_id", "name", "description", "member_count", "is_active", "last_updated"]
    },
    "iiq_manufacturers": {
        "model": IIQManufacturer,
        "pk": "manufacturer_id",
        "columns": ["manufacturer_id", "name", "last_updated"]
    }
}


@router.get("/sync-status")
def get_sync_status(db: Session = Depends(get_db)):
    """
    Returns last sync time and status for each data source.
    """
    sources = ["iiq", "google", "meraki"]
    status = {}

    for source in sources:
        last_sync = db.query(SyncLog).filter(
            SyncLog.source == source,
            SyncLog.status.in_(["success", "error"])
        ).order_by(SyncLog.started_at.desc()).first()

        running = db.query(SyncLog).filter(
            SyncLog.source == source,
            SyncLog.status == "running"
        ).first()

        if running:
            status[source] = {
                "status": "running",
                "started_at": running.started_at.isoformat(),
                "last_success": last_sync.completed_at.isoformat() if last_sync and last_sync.status == "success" else None,
                "records_processed": running.records_processed
            }
        elif last_sync:
            status[source] = {
                "status": last_sync.status,
                "started_at": last_sync.started_at.isoformat(),
                "completed_at": last_sync.completed_at.isoformat() if last_sync.completed_at else None,
                "records_processed": last_sync.records_processed,
                "records_failed": last_sync.records_failed,
                "error_message": last_sync.error_message
            }
        else:
            status[source] = {
                "status": "never",
                "message": "No sync history found"
            }

    return status


SCRIPT_MAP = {
    "iiq": "/opt/atlas/atlas-backend/scripts/iiq_bulk_sync.py",
    "google": "/opt/atlas/atlas-backend/scripts/google_bulk_sync.py",
    "meraki": "/opt/atlas/atlas-backend/scripts/meraki_bulk_sync.py"
}

# In-memory store for running process PIDs (cleared on restart)
RUNNING_PROCESSES: dict = {}  # {source: subprocess.Popen}


def run_sync_script(source: str, trigger: str = "manual"):
    """
    Start sync script as a detached subprocess (fire-and-forget).
    The script itself handles logging to sync_logs table.
    We store the Popen object for PID tracking (cancellation support).

    NOTE: We do NOT wait for completion - this allows parallel execution
    when multiple syncs are triggered via /sync/all.
    """
    script_path = SCRIPT_MAP.get(source)
    if not script_path:
        return

    log_file_path = f"/opt/atlas/logs/{source}_sync.log"

    try:
        # Set UTF-8 encoding environment for proper Unicode handling
        env = {
            **os.environ,
            "SYNC_TRIGGER": trigger,
            "PYTHONIOENCODING": "utf-8",
            "LANG": "en_US.UTF-8",
            "LC_ALL": "en_US.UTF-8"
        }

        print(f"[run_sync_script] Starting {source} sync: {script_path}")

        # Open log file to prevent subprocess deadlock (PIPE buffer overflow)
        # and to capture output consistent with cron jobs
        with open(log_file_path, "a") as log_file:
            # Start the sync script as a subprocess (fire-and-forget)
            process = subprocess.Popen(
                ["/opt/atlas/atlas-backend/venv/bin/python3", script_path],
                stdout=log_file,
                stderr=subprocess.STDOUT,
                cwd="/opt/atlas/atlas-backend",
                env=env,
                start_new_session=True  # Detach from parent process group
            )

        print(f"[run_sync_script] {source} subprocess started with PID {process.pid}")

        # Track the running process for cancellation support
        RUNNING_PROCESSES[source] = process

    except Exception as e:
        print(f"[run_sync_script] ERROR starting {source} sync: {e}")
        import traceback
        traceback.print_exc()


@router.post("/sync/all")
def trigger_all_syncs(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Triggers all syncs (IIQ, Google, Meraki) in parallel.
    Skips any source that is already running.
    NOTE: This route MUST be defined before /sync/{source} so FastAPI matches it first.
    """
    sources = ["iiq", "google", "meraki"]
    started = []
    skipped = []

    for source in sources:
        # Check if already running
        running = db.query(SyncLog).filter(
            SyncLog.source == source,
            SyncLog.status == "running"
        ).first()

        if running:
            skipped.append({
                "source": source,
                "reason": f"Already running (started {running.started_at.isoformat()})"
            })
        else:
            # Start sync in background
            background_tasks.add_task(run_sync_script, source)
            started.append(source)

    return {
        "message": f"Started {len(started)} sync(s)",
        "started": started,
        "skipped": skipped,
        "started_at": datetime.utcnow().isoformat()
    }


@router.post("/sync/{source}")
def trigger_sync(source: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Triggers a manual sync for the specified data source.
    Returns immediately - the sync script handles its own logging.
    """
    if source not in ["iiq", "google", "meraki"]:
        raise HTTPException(status_code=400, detail=f"Invalid source: {source}. Must be 'iiq', 'google', or 'meraki'")

    # Check if already running
    running = db.query(SyncLog).filter(
        SyncLog.source == source,
        SyncLog.status == "running"
    ).first()

    if running:
        raise HTTPException(
            status_code=409,
            detail=f"{source.upper()} sync is already running (started {running.started_at.isoformat()})"
        )

    # Start sync in background - the script handles its own logging
    background_tasks.add_task(run_sync_script, source)

    return {
        "message": f"{source.upper()} sync started",
        "started_at": datetime.utcnow().isoformat()
    }


@router.post("/sync/{source}/cancel")
def cancel_sync(source: str, db: Session = Depends(get_db)):
    """
    Cancels a running sync by sending SIGTERM to the process.
    Updates the sync log status to 'cancelled'.
    """
    if source not in ["iiq", "google", "meraki"]:
        raise HTTPException(status_code=400, detail=f"Invalid source: {source}")

    # Check if running in database
    running_log = db.query(SyncLog).filter(
        SyncLog.source == source,
        SyncLog.status == "running"
    ).first()

    if not running_log:
        raise HTTPException(status_code=404, detail=f"No running {source.upper()} sync found")

    # Try to kill the process if we have it tracked
    process = RUNNING_PROCESSES.get(source)
    if process and process.poll() is None:  # Still running
        try:
            process.terminate()  # SIGTERM
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()  # SIGKILL if still running
            process.wait()
        except Exception:
            pass

    # Update the sync log
    running_log.status = "cancelled"
    running_log.completed_at = datetime.utcnow()
    running_log.error_message = "Cancelled by user"
    db.commit()

    # Clean up tracking
    RUNNING_PROCESSES.pop(source, None)

    return {
        "message": f"{source.upper()} sync cancelled",
        "sync_log_id": running_log.id,
        "cancelled_at": running_log.completed_at.isoformat()
    }


@router.get("/sync-history")
def get_sync_history(limit: int = 20, db: Session = Depends(get_db)):
    """
    Returns history of past sync runs.
    """
    logs = db.query(SyncLog).order_by(SyncLog.started_at.desc()).limit(limit).all()

    return [{
        "id": log.id,
        "source": log.source,
        "started_at": log.started_at.isoformat(),
        "completed_at": log.completed_at.isoformat() if log.completed_at else None,
        "duration_seconds": (log.completed_at - log.started_at).total_seconds() if log.completed_at else None,
        "status": log.status,
        "records_processed": log.records_processed,
        "records_failed": log.records_failed,
        "error_message": log.error_message,
        "error_details": log.error_details if hasattr(log, 'error_details') else [],
        "triggered_by": log.triggered_by
    } for log in logs]


@router.get("/tables")
def get_tables_overview(db: Session = Depends(get_db)):
    """
    Returns overview of database tables with row counts and last updated.
    """
    tables = []

    for table_name, config in ALLOWED_TABLES.items():
        model = config["model"]

        # Get row count
        count = db.query(func.count(getattr(model, config["pk"]))).scalar() or 0

        # Get last updated (find max last_updated or last_sync column)
        last_updated = None
        if hasattr(model, "last_updated"):
            last_updated = db.query(func.max(model.last_updated)).scalar()
        elif hasattr(model, "last_sync"):
            last_updated = db.query(func.max(model.last_sync)).scalar()
        elif hasattr(model, "last_seen"):
            last_updated = db.query(func.max(model.last_seen)).scalar()

        tables.append({
            "name": table_name,
            "display_name": table_name.replace("_", " ").title(),
            "rows": count,
            "last_updated": last_updated.isoformat() if last_updated else None,
            "columns": config["columns"]
        })

    # Sort alphabetically by table name
    tables.sort(key=lambda x: x["name"])

    return tables


@router.get("/tables/{table_name}/preview")
def get_table_preview(table_name: str, page: int = 0, page_size: int = 100, db: Session = Depends(get_db)):
    """
    Returns preview of table data with pagination.
    """
    if table_name not in ALLOWED_TABLES:
        raise HTTPException(status_code=400, detail=f"Table '{table_name}' not available for preview")

    config = ALLOWED_TABLES[table_name]
    model = config["model"]
    columns = config["columns"]

    # Get total count
    total = db.query(func.count(getattr(model, config["pk"]))).scalar() or 0

    # Get paginated data - order first, then paginate
    query = db.query(model)

    # Order by last_updated or primary key
    if hasattr(model, "last_updated"):
        query = query.order_by(model.last_updated.desc())
    elif hasattr(model, "last_sync"):
        query = query.order_by(model.last_sync.desc())
    else:
        query = query.order_by(getattr(model, config["pk"]))

    # Apply pagination after ordering
    rows = query.offset(page * page_size).limit(page_size).all()

    # Convert to dict with only specified columns
    data = []
    for row in rows:
        row_data = {}
        for col in columns:
            value = getattr(row, col, None)
            if isinstance(value, datetime):
                value = value.isoformat()
            row_data[col] = value
        data.append(row_data)

    return {
        "table": table_name,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
        "columns": columns,
        "data": data
    }


@router.get("/job/{job_id}")
def get_job_status(job_id: int, db: Session = Depends(get_db)):
    """
    Returns status of a specific sync job.
    """
    log = db.query(SyncLog).filter(SyncLog.id == job_id).first()

    if not log:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    return {
        "id": log.id,
        "source": log.source,
        "started_at": log.started_at.isoformat(),
        "completed_at": log.completed_at.isoformat() if log.completed_at else None,
        "duration_seconds": (log.completed_at - log.started_at).total_seconds() if log.completed_at else None,
        "status": log.status,
        "records_processed": log.records_processed,
        "records_failed": log.records_failed,
        "error_message": log.error_message,
        "error_details": log.error_details if hasattr(log, 'error_details') else [],
        "triggered_by": log.triggered_by
    }


# =============================================================================
# Schedule Management
# =============================================================================

class ScheduleUpdate(BaseModel):
    enabled: Optional[bool] = None
    hours: Optional[List[int]] = None


@router.get("/schedules")
def get_schedules(db: Session = Depends(get_db)):
    """
    Returns all sync schedules with their next scheduled run times.
    """
    sources = ["iiq", "google", "meraki"]
    schedules = {}

    for source in sources:
        schedule = db.query(SyncSchedule).filter(SyncSchedule.source == source).first()

        if schedule:
            # Calculate next scheduled run
            next_run = _calculate_next_run(schedule.hours, schedule.enabled)

            # Get average duration from last 5 successful syncs
            avg_duration = _get_average_duration(db, source)

            schedules[source] = {
                "source": source,
                "enabled": schedule.enabled,
                "hours": schedule.hours,
                "updated_at": schedule.updated_at.isoformat() if schedule.updated_at else None,
                "updated_by": schedule.updated_by,
                "next_run": next_run,
                "avg_duration_seconds": avg_duration
            }
        else:
            # Return default schedule (disabled, no hours set)
            # Still calculate avg duration from sync history
            avg_duration = _get_average_duration(db, source)
            schedules[source] = {
                "source": source,
                "enabled": False,
                "hours": [],
                "updated_at": None,
                "updated_by": None,
                "next_run": None,
                "avg_duration_seconds": avg_duration
            }

    return schedules


@router.put("/schedules/{source}")
def update_schedule(
    source: str,
    data: ScheduleUpdate,
    db: Session = Depends(get_db)
):
    """
    Update schedule for a sync source (hours and/or enabled state).
    """
    if source not in ["iiq", "google", "meraki"]:
        raise HTTPException(status_code=400, detail=f"Invalid source: {source}")

    # Validate hours if provided
    if data.hours is not None:
        if not all(isinstance(h, int) and 0 <= h <= 23 for h in data.hours):
            raise HTTPException(status_code=400, detail="Hours must be integers between 0 and 23")
        # Remove duplicates and sort
        data.hours = sorted(list(set(data.hours)))

    schedule = db.query(SyncSchedule).filter(SyncSchedule.source == source).first()

    if schedule:
        # Update existing
        if data.enabled is not None:
            schedule.enabled = data.enabled
        if data.hours is not None:
            schedule.hours = data.hours
        schedule.updated_at = datetime.utcnow()
        # TODO: Get user email from auth context
        schedule.updated_by = "api"
    else:
        # Create new
        schedule = SyncSchedule(
            source=source,
            enabled=data.enabled if data.enabled is not None else True,
            hours=data.hours if data.hours is not None else [],
            updated_at=datetime.utcnow(),
            updated_by="api"
        )
        db.add(schedule)

    db.commit()
    db.refresh(schedule)

    return {
        "source": schedule.source,
        "enabled": schedule.enabled,
        "hours": schedule.hours,
        "updated_at": schedule.updated_at.isoformat(),
        "next_run": _calculate_next_run(schedule.hours, schedule.enabled)
    }


def _calculate_next_run(hours: List[int], enabled: bool) -> Optional[str]:
    """Calculate the next scheduled run time based on hours array."""
    if not enabled or not hours:
        return None

    now = datetime.utcnow()
    current_hour = now.hour

    # Find next hour in schedule
    future_hours = [h for h in hours if h > current_hour]
    if future_hours:
        next_hour = min(future_hours)
        next_run = now.replace(hour=next_hour, minute=0, second=0, microsecond=0)
    else:
        # Next run is tomorrow at earliest hour
        from datetime import timedelta
        next_hour = min(hours)
        next_run = (now + timedelta(days=1)).replace(hour=next_hour, minute=0, second=0, microsecond=0)

    return next_run.isoformat()


def _get_average_duration(db: Session, source: str) -> Optional[float]:
    """Get average sync duration from last 5 successful syncs."""
    logs = db.query(SyncLog).filter(
        SyncLog.source == source,
        SyncLog.status.in_(["success", "partial"]),
        SyncLog.completed_at.isnot(None)
    ).order_by(SyncLog.started_at.desc()).limit(5).all()

    if not logs:
        return None

    durations = [
        (log.completed_at - log.started_at).total_seconds()
        for log in logs
    ]
    return sum(durations) / len(durations)


# =============================================================================
# Notifications
# =============================================================================

@router.get("/notifications")
def get_notifications(db: Session = Depends(get_db)):
    """
    Returns unacknowledged sync failure notifications from the last 24 hours.
    """
    from datetime import timedelta

    # Get notifications from last 24 hours
    cutoff = datetime.utcnow() - timedelta(hours=24)

    notifications = db.query(SyncNotification).filter(
        SyncNotification.acknowledged == False,
        SyncNotification.created_at >= cutoff
    ).order_by(SyncNotification.created_at.desc()).all()

    result = []
    for notif in notifications:
        # Get the associated sync log
        sync_log = db.query(SyncLog).filter(SyncLog.id == notif.sync_log_id).first()

        if sync_log:
            result.append({
                "id": notif.id,
                "sync_log_id": notif.sync_log_id,
                "source": sync_log.source,
                "status": sync_log.status,
                "records_failed": sync_log.records_failed,
                "error_message": sync_log.error_message,
                "created_at": notif.created_at.isoformat(),
                "sync_completed_at": sync_log.completed_at.isoformat() if sync_log.completed_at else None
            })

    return {
        "count": len(result),
        "notifications": result
    }


@router.post("/notifications/{notification_id}/dismiss")
def dismiss_notification(notification_id: int, db: Session = Depends(get_db)):
    """
    Dismiss (acknowledge) a single notification.
    """
    notification = db.query(SyncNotification).filter(
        SyncNotification.id == notification_id
    ).first()

    if not notification:
        raise HTTPException(status_code=404, detail=f"Notification {notification_id} not found")

    notification.acknowledged = True
    db.commit()

    return {"message": "Notification dismissed", "id": notification_id}


@router.post("/notifications/dismiss-all")
def dismiss_all_notifications(db: Session = Depends(get_db)):
    """
    Dismiss all unacknowledged notifications.
    """
    count = db.query(SyncNotification).filter(
        SyncNotification.acknowledged == False
    ).update({"acknowledged": True})

    db.commit()

    return {"message": f"Dismissed {count} notification(s)", "count": count}


# =============================================================================
# MAC Address Vendor Lookup
# =============================================================================

import re
from app.models import OuiVendor


def normalize_mac(mac: str) -> str:
    """
    Normalize MAC address to uppercase hex without separators.
    Accepts: AA:BB:CC:DD:EE:FF, AA-BB-CC-DD-EE-FF, AABBCCDDEEFF
    Returns: AABBCCDDEEFF (uppercase)
    """
    cleaned = re.sub(r'[^a-fA-F0-9]', '', mac)
    return cleaned.upper()


def extract_oui(mac: str) -> Optional[str]:
    """
    Extract OUI (first 6 hex characters) from normalized MAC.
    """
    normalized = normalize_mac(mac)
    if len(normalized) < 6:
        return None
    return normalized[:6]


def format_mac(mac: str) -> str:
    """
    Format normalized MAC to standard format (AA:BB:CC:DD:EE:FF).
    """
    normalized = normalize_mac(mac)
    if len(normalized) == 12:
        return ':'.join(normalized[i:i+2] for i in range(0, 12, 2))
    elif len(normalized) == 6:
        return ':'.join(normalized[i:i+2] for i in range(0, 6, 2))
    return normalized


@router.get("/mac-lookup")
def lookup_mac(mac: str, db: Session = Depends(get_db)):
    """
    Look up vendor information for a single MAC address.
    """
    oui = extract_oui(mac)
    if not oui:
        raise HTTPException(status_code=400, detail="Invalid MAC address format")

    vendor = db.query(OuiVendor).filter(OuiVendor.oui == oui).first()

    return {
        "mac": format_mac(mac),
        "oui": format_mac(oui),
        "vendor": vendor.vendor_name if vendor else "Unknown",
        "address": vendor.address if vendor else None,
        "found": vendor is not None
    }


class MacLookupBulkRequest(BaseModel):
    macs: List[str]


@router.post("/mac-lookup/bulk")
def lookup_mac_bulk(request: MacLookupBulkRequest, db: Session = Depends(get_db)):
    """
    Look up vendor information for multiple MAC addresses.
    Maximum 100 addresses per request.
    """
    macs = request.macs

    if len(macs) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 MAC addresses per request")

    results = []

    # Extract all OUIs and fetch in one query
    oui_map = {}
    for mac in macs:
        oui = extract_oui(mac)
        if oui:
            oui_map[oui] = None

    # Batch fetch all vendors
    if oui_map:
        vendors = db.query(OuiVendor).filter(OuiVendor.oui.in_(oui_map.keys())).all()
        for vendor in vendors:
            oui_map[vendor.oui] = vendor

    # Build results
    for mac in macs:
        oui = extract_oui(mac)
        if not oui:
            results.append({
                "mac": mac,
                "oui": None,
                "vendor": "Invalid MAC",
                "address": None,
                "found": False,
                "error": True
            })
            continue

        vendor = oui_map.get(oui)
        results.append({
            "mac": format_mac(mac),
            "oui": format_mac(oui),
            "vendor": vendor.vendor_name if vendor else "Unknown",
            "address": vendor.address if vendor else None,
            "found": vendor is not None,
            "error": False
        })

    return {
        "results": results,
        "total": len(results),
        "found": sum(1 for r in results if r["found"]),
        "unknown": sum(1 for r in results if not r["found"] and not r.get("error")),
        "errors": sum(1 for r in results if r.get("error"))
    }


@router.get("/mac-lookup/stats")
def get_oui_stats(db: Session = Depends(get_db)):
    """
    Get OUI database statistics.
    """
    count = db.query(OuiVendor).count()
    latest = db.query(OuiVendor).order_by(OuiVendor.last_updated.desc()).first()

    return {
        "vendor_count": count,
        "last_updated": latest.last_updated.isoformat() if latest else None
    }
