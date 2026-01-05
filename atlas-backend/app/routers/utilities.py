from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from datetime import datetime
import subprocess
import os

from app.database import get_db
from app.models import (
    IIQAsset, IIQUser, GoogleDevice, GoogleUser, NetworkCache, SyncLog,
    MerakiNetwork, MerakiDevice, MerakiSSID, MerakiClient
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


def run_sync_script(source: str):
    """
    Background task to run sync script.
    The script itself handles logging to sync_logs table.
    """
    script_map = {
        "iiq": "/opt/atlas/atlas-backend/scripts/iiq_bulk_sync.py",
        "google": "/opt/atlas/atlas-backend/scripts/google_bulk_sync.py",
        "meraki": "/opt/atlas/atlas-backend/scripts/meraki_bulk_sync.py"
    }

    script_path = script_map.get(source)
    if not script_path:
        return

    try:
        # Set UTF-8 encoding environment for proper Unicode handling
        env = {
            **os.environ,
            "SYNC_TRIGGER": "manual",
            "PYTHONIOENCODING": "utf-8",
            "LANG": "en_US.UTF-8",
            "LC_ALL": "en_US.UTF-8"
        }

        # Run the sync script - it handles its own logging
        subprocess.run(
            ["/opt/atlas/atlas-backend/venv/bin/python3", script_path],
            capture_output=True,
            text=True,
            cwd="/opt/atlas/atlas-backend",
            env=env,
            timeout=600  # 10 minute timeout
        )
    except subprocess.TimeoutExpired:
        # Script timed out - log will show as running
        # The script's finally block should have committed whatever state it was in
        pass
    except Exception:
        # Script failed to run
        pass


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
