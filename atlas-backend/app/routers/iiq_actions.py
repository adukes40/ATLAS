import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from pydantic import BaseModel
from typing import List

from app.database import get_db
from app.models import IIQAsset
from app.services.iiq_sync import IIQConnector
from app.config import get_iiq_config
from app.utils import get_user_identifier
from app.auth import require_auth

logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_user_identifier)

router = APIRouter(prefix="/api", tags=["iiq-actions"])


def _get_iiq_connector() -> IIQConnector:
    iiq_cfg = get_iiq_config()
    if not iiq_cfg.get("url") or not iiq_cfg.get("token"):
        raise HTTPException(status_code=503, detail="IIQ is not configured")
    return IIQConnector(
        iiq_cfg["url"], iiq_cfg["token"],
        site_id=iiq_cfg.get("site_id"), product_id=iiq_cfg.get("product_id")
    )


def _get_iiq_asset(db: Session, serial: str) -> IIQAsset:
    record = db.query(IIQAsset).filter(IIQAsset.serial_number == serial).first()
    if not record or not record.iiq_id:
        raise HTTPException(status_code=404, detail=f"No IIQ asset found for serial '{serial}'")
    return record


class UpdateValue(BaseModel):
    value: str


# --- SINGLE DEVICE ENDPOINTS ---

@router.post("/device/{serial}/iiq/update-status")
@limiter.limit("10/minute")
def update_iiq_status(request: Request, serial: str, body: UpdateValue, db: Session = Depends(get_db), user: dict = Depends(require_auth)):
    record = _get_iiq_asset(db, serial)
    connector = _get_iiq_connector()
    try:
        connector.update_asset_status(record.iiq_id, body.value)
        logger.info(f"[{user.get('email')}] Updated IIQ status for {serial} to {body.value}")
        return {"status": "success", "message": f"Status updated to {body.value}"}
    except Exception as e:
        logger.error(f"Failed to update IIQ status for {serial}: {e}")
        raise HTTPException(status_code=502, detail=f"IIQ API error: {str(e)}")


@router.post("/device/{serial}/iiq/update-location")
@limiter.limit("10/minute")
def update_iiq_location(request: Request, serial: str, body: UpdateValue, db: Session = Depends(get_db), user: dict = Depends(require_auth)):
    record = _get_iiq_asset(db, serial)
    connector = _get_iiq_connector()
    try:
        locations = connector.search_locations(body.value)
        if not locations:
            raise HTTPException(status_code=404, detail=f"Location '{body.value}' not found in IIQ")
        location_id = locations[0].get("LocationId")
        connector.update_asset_location(record.iiq_id, location_id)
        logger.info(f"[{user.get('email')}] Updated IIQ location for {serial} to {body.value}")
        return {"status": "success", "message": f"Location updated to {body.value}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update IIQ location for {serial}: {e}")
        raise HTTPException(status_code=502, detail=f"IIQ API error: {str(e)}")


@router.post("/device/{serial}/iiq/update-asset-tag")
@limiter.limit("10/minute")
def update_iiq_tag(request: Request, serial: str, body: UpdateValue, db: Session = Depends(get_db), user: dict = Depends(require_auth)):
    record = _get_iiq_asset(db, serial)
    connector = _get_iiq_connector()
    try:
        connector.update_asset_tag(record.iiq_id, body.value)
        logger.info(f"[{user.get('email')}] Updated IIQ asset tag for {serial} to {body.value}")
        return {"status": "success", "message": f"Asset tag updated to {body.value}"}
    except Exception as e:
        logger.error(f"Failed to update IIQ tag for {serial}: {e}")
        raise HTTPException(status_code=502, detail=f"IIQ API error: {str(e)}")


@router.post("/device/{serial}/iiq/update-assigned-user")
@limiter.limit("10/minute")
def update_iiq_user(request: Request, serial: str, body: UpdateValue, db: Session = Depends(get_db), user: dict = Depends(require_auth)):
    record = _get_iiq_asset(db, serial)
    connector = _get_iiq_connector()
    try:
        users = connector.search_users(body.value)
        if not users:
            raise HTTPException(status_code=404, detail=f"User '{body.value}' not found in IIQ")
        user_id = users[0].get("UserId")
        connector.update_assigned_user(record.iiq_id, user_id)
        logger.info(f"[{user.get('email')}] Updated IIQ assigned user for {serial} to {body.value}")
        return {"status": "success", "message": f"Assigned user updated to {body.value}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update IIQ user for {serial}: {e}")
        raise HTTPException(status_code=502, detail=f"IIQ API error: {str(e)}")


# --- BULK ENDPOINTS ---

class BulkIIQUpdate(BaseModel):
    serials: List[str]
    value: str


def _run_bulk_iiq(db: Session, connector: IIQConnector, serials: list, action_fn, user_email: str, action_name: str):
    success = 0
    failed = 0
    errors = []

    for serial in serials:
        record = db.query(IIQAsset).filter(IIQAsset.serial_number == serial).first()
        if not record or not record.iiq_id:
            failed += 1
            errors.append({"serial": serial, "error": "Asset not found in IIQ"})
            continue
        try:
            action_fn(record.iiq_id)
            success += 1
            logger.info(f"[{user_email}] Bulk IIQ {action_name} succeeded: {serial}")
        except Exception as e:
            failed += 1
            errors.append({"serial": serial, "error": str(e)[:200]})
            logger.error(f"[{user_email}] Bulk IIQ {action_name} failed for {serial}: {e}")

    return {"success": success, "failed": failed, "errors": errors}


@router.post("/bulk/iiq/update-status")
@limiter.limit("5/minute")
def bulk_update_status(request: Request, body: BulkIIQUpdate, db: Session = Depends(get_db), user: dict = Depends(require_auth)):
    connector = _get_iiq_connector()
    return _run_bulk_iiq(db, connector, body.serials, lambda aid: connector.update_asset_status(aid, body.value), user.get("email", ""), "status")


@router.post("/bulk/iiq/update-location")
@limiter.limit("5/minute")
def bulk_update_location(request: Request, body: BulkIIQUpdate, db: Session = Depends(get_db), user: dict = Depends(require_auth)):
    connector = _get_iiq_connector()
    locations = connector.search_locations(body.value)
    if not locations:
        raise HTTPException(status_code=404, detail=f"Location '{body.value}' not found in IIQ")
    location_id = locations[0].get("LocationId")
    return _run_bulk_iiq(db, connector, body.serials, lambda aid: connector.update_asset_location(aid, location_id), user.get("email", ""), "location")
