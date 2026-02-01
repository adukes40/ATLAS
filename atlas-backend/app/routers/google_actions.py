"""
Google Device Actions Router
Provides endpoints for managing Chrome OS devices via Google Admin SDK.
Actions: enable, disable, deprovision, move OU, list OUs.
"""
import time
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from pydantic import BaseModel
from typing import Optional, List

from app.database import get_db
from app.models import GoogleDevice
from app.services.google_sync import GoogleConnector
from app.config import get_google_config
from app.utils import get_user_identifier
from app.auth import get_current_user, require_auth

logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_user_identifier)

router = APIRouter(prefix="/api", tags=["google-actions"])

# OU cache with TTL
_ou_cache: Optional[List[str]] = None
_ou_cache_time: float = 0
_OU_CACHE_TTL = 300  # 5 minutes


def _get_google_connector() -> GoogleConnector:
    """Create a GoogleConnector from current config."""
    google_cfg = get_google_config()
    if not google_cfg.get("admin_email"):
        raise HTTPException(status_code=503, detail="Google Admin is not configured")
    return GoogleConnector(
        credentials_path=google_cfg.get("credentials_path"),
        admin_email=google_cfg["admin_email"],
        credentials_json=google_cfg.get("credentials_json")
    )


def _get_device_record(db: Session, serial: str) -> GoogleDevice:
    """Look up a Google device by serial number."""
    record = db.query(GoogleDevice).filter(GoogleDevice.serial_number == serial).first()
    if not record or not record.google_id:
        raise HTTPException(status_code=404, detail=f"No Google device found for serial '{serial}'")
    return record


def _resync_device(db: Session, connector: GoogleConnector, serial: str):
    """Re-sync device data from Google after an action."""
    try:
        connector.sync_record(db, serial)
    except Exception as e:
        logger.warning(f"Post-action re-sync failed for {serial}: {e}")


# =============================================================================
# ACTION ENDPOINTS
# =============================================================================

@router.post("/device/{serial}/google/enable")
@limiter.limit("10/minute")
def enable_device(
    request: Request,
    serial: str,
    db: Session = Depends(get_db),
    user: dict = Depends(require_auth)
):
    """Enable a disabled Chrome OS device."""
    record = _get_device_record(db, serial)

    if record.status and record.status.upper() == "ACTIVE":
        raise HTTPException(status_code=409, detail="Device is already enabled")

    connector = _get_google_connector()
    try:
        connector.enable_device(record.google_id)
        logger.info(f"[{user.get('email')}] Enabled device {serial}")
    except Exception as e:
        logger.error(f"Failed to enable device {serial}: {e}")
        raise HTTPException(status_code=502, detail=f"Google API error: {str(e)}")

    _resync_device(db, connector, serial)
    return {"status": "success", "message": f"Device {serial} has been enabled"}


@router.post("/device/{serial}/google/disable")
@limiter.limit("10/minute")
def disable_device(
    request: Request,
    serial: str,
    db: Session = Depends(get_db),
    user: dict = Depends(require_auth)
):
    """Disable an active Chrome OS device."""
    record = _get_device_record(db, serial)

    if record.status and record.status.upper() == "DISABLED":
        raise HTTPException(status_code=409, detail="Device is already disabled")

    connector = _get_google_connector()
    try:
        connector.disable_device(record.google_id)
        logger.info(f"[{user.get('email')}] Disabled device {serial}")
    except Exception as e:
        logger.error(f"Failed to disable device {serial}: {e}")
        raise HTTPException(status_code=502, detail=f"Google API error: {str(e)}")

    _resync_device(db, connector, serial)
    return {"status": "success", "message": f"Device {serial} has been disabled"}


class DeprovisionRequest(BaseModel):
    deprovision_reason: str


@router.post("/device/{serial}/google/deprovision")
@limiter.limit("5/minute")
def deprovision_device(
    request: Request,
    serial: str,
    body: DeprovisionRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_auth)
):
    """Deprovision a Chrome OS device. Requires a deprovision reason."""
    valid_reasons = ["same_model_replacement", "different_model_replacement", "retiring_device"]
    if body.deprovision_reason not in valid_reasons:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid deprovision reason. Must be one of: {', '.join(valid_reasons)}"
        )

    record = _get_device_record(db, serial)

    connector = _get_google_connector()
    try:
        connector.deprovision_device(record.google_id, body.deprovision_reason)
        logger.info(f"[{user.get('email')}] Deprovisioned device {serial} (reason: {body.deprovision_reason})")
    except Exception as e:
        logger.error(f"Failed to deprovision device {serial}: {e}")
        raise HTTPException(status_code=502, detail=f"Google API error: {str(e)}")

    _resync_device(db, connector, serial)
    return {"status": "success", "message": f"Device {serial} has been deprovisioned"}


class MoveOURequest(BaseModel):
    target_ou: str


@router.post("/device/{serial}/google/move-ou")
@limiter.limit("10/minute")
def move_device_ou(
    request: Request,
    serial: str,
    body: MoveOURequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_auth)
):
    """Move a Chrome OS device to a different organizational unit."""
    if not body.target_ou or not body.target_ou.startswith("/"):
        raise HTTPException(status_code=422, detail="Target OU must be an absolute path starting with /")

    record = _get_device_record(db, serial)

    connector = _get_google_connector()
    try:
        connector.move_device_ou(record.google_id, body.target_ou)
        logger.info(f"[{user.get('email')}] Moved device {serial} to OU: {body.target_ou}")
    except Exception as e:
        logger.error(f"Failed to move device {serial} to {body.target_ou}: {e}")
        raise HTTPException(status_code=502, detail=f"Google API error: {str(e)}")

    _resync_device(db, connector, serial)
    return {"status": "success", "message": f"Device {serial} moved to {body.target_ou}"}


# =============================================================================
# ORG UNITS ENDPOINT
# =============================================================================

@router.get("/google/org-units")
@limiter.limit("30/minute")
def list_org_units(
    request: Request,
    user: dict = Depends(require_auth)
):
    """Fetch all organizational units from Google Admin. Cached for 5 minutes."""
    global _ou_cache, _ou_cache_time

    now = time.time()
    if _ou_cache is not None and (now - _ou_cache_time) < _OU_CACHE_TTL:
        return {"org_units": _ou_cache}

    connector = _get_google_connector()
    try:
        org_units = connector.list_org_units()
        _ou_cache = org_units
        _ou_cache_time = now
        return {"org_units": org_units}
    except Exception as e:
        logger.error(f"Failed to fetch org units: {e}")
        raise HTTPException(status_code=502, detail=f"Google API error: {str(e)}")
