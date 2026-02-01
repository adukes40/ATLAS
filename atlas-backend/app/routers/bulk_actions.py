import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from pydantic import BaseModel
from typing import List

from app.database import get_db
from app.models import GoogleDevice
from app.services.google_sync import GoogleConnector
from app.config import get_google_config
from app.utils import get_user_identifier
from app.auth import require_auth

logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_user_identifier)

router = APIRouter(prefix="/api/bulk", tags=["bulk-actions"])


def _get_google_connector() -> GoogleConnector:
    google_cfg = get_google_config()
    if not google_cfg.get("admin_email"):
        raise HTTPException(status_code=503, detail="Google Admin is not configured")
    return GoogleConnector(
        credentials_path=google_cfg.get("credentials_path"),
        admin_email=google_cfg["admin_email"],
        credentials_json=google_cfg.get("credentials_json")
    )


class BulkSerials(BaseModel):
    serials: List[str]


class BulkMoveOU(BaseModel):
    serials: List[str]
    target_ou: str


class BulkDeprovision(BaseModel):
    serials: List[str]
    deprovision_reason: str


def _run_bulk_google(db: Session, connector: GoogleConnector, serials: List[str], action_fn, user_email: str, action_name: str):
    """Run a Google action across multiple devices, collecting results."""
    success = 0
    failed = 0
    errors = []

    for serial in serials:
        record = db.query(GoogleDevice).filter(GoogleDevice.serial_number == serial).first()
        if not record or not record.google_id:
            failed += 1
            errors.append({"serial": serial, "error": "Device not found in Google"})
            continue
        try:
            action_fn(record.google_id)
            success += 1
            logger.info(f"[{user_email}] Bulk {action_name} succeeded: {serial}")
        except Exception as e:
            failed += 1
            errors.append({"serial": serial, "error": str(e)[:200]})
            logger.error(f"[{user_email}] Bulk {action_name} failed for {serial}: {e}")

    return {"success": success, "failed": failed, "errors": errors}


@router.post("/google/enable")
@limiter.limit("5/minute")
def bulk_enable(request: Request, body: BulkSerials, db: Session = Depends(get_db), user: dict = Depends(require_auth)):
    connector = _get_google_connector()
    return _run_bulk_google(db, connector, body.serials, connector.enable_device, user.get("email", ""), "enable")


@router.post("/google/disable")
@limiter.limit("5/minute")
def bulk_disable(request: Request, body: BulkSerials, db: Session = Depends(get_db), user: dict = Depends(require_auth)):
    connector = _get_google_connector()
    return _run_bulk_google(db, connector, body.serials, connector.disable_device, user.get("email", ""), "disable")


@router.post("/google/move-ou")
@limiter.limit("5/minute")
def bulk_move_ou(request: Request, body: BulkMoveOU, db: Session = Depends(get_db), user: dict = Depends(require_auth)):
    if not body.target_ou.startswith("/"):
        raise HTTPException(status_code=422, detail="Target OU must start with /")
    connector = _get_google_connector()
    return _run_bulk_google(
        db, connector, body.serials,
        lambda gid: connector.move_device_ou(gid, body.target_ou),
        user.get("email", ""), "move-ou"
    )


@router.post("/google/deprovision")
@limiter.limit("3/minute")
def bulk_deprovision(request: Request, body: BulkDeprovision, db: Session = Depends(get_db), user: dict = Depends(require_auth)):
    valid_reasons = ["same_model_replacement", "different_model_replacement", "retiring_device"]
    if body.deprovision_reason not in valid_reasons:
        raise HTTPException(status_code=422, detail=f"Invalid reason. Must be: {', '.join(valid_reasons)}")
    connector = _get_google_connector()
    return _run_bulk_google(
        db, connector, body.serials,
        lambda gid: connector.deprovision_device(gid, body.deprovision_reason),
        user.get("email", ""), "deprovision"
    )
