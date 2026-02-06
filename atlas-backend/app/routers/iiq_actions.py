import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from pydantic import BaseModel
from typing import List, Optional

from sqlalchemy import or_

from app.database import get_db
from sqlalchemy import text

from app.models import IIQAsset, IIQUser, IIQLocation
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


class UpdateAssignedUser(BaseModel):
    user_id: str


class CombinedIIQUpdate(BaseModel):
    status_id: Optional[str] = None
    location_id: Optional[str] = None
    asset_tag: Optional[str] = None
    user_id: Optional[str] = None


class BulkCombinedIIQUpdate(BaseModel):
    serials: List[str]
    status_id: Optional[str] = None
    location_id: Optional[str] = None
    asset_tag: Optional[str] = None
    user_id: Optional[str] = None


# --- LOOKUP ENDPOINTS ---

@router.get("/iiq/statuses")
@limiter.limit("30/minute")
def get_iiq_statuses(request: Request, db: Session = Depends(get_db), user: dict = Depends(require_auth)):
    """Return distinct IIQ asset statuses (name + ID) from local DB."""
    # Use denormalized columns for fast query (avoids JSONB parsing across 27K rows)
    rows = db.execute(text(
        "SELECT DISTINCT status_type_id, status "
        "FROM iiq_assets "
        "WHERE status IS NOT NULL AND status_type_id IS NOT NULL "
        "ORDER BY status"
    )).fetchall()
    statuses = [{"name": r[1], "id": r[0]} for r in rows if r[0] and r[1]]
    return {"statuses": statuses}


@router.get("/iiq/locations")
@limiter.limit("30/minute")
def get_iiq_locations(request: Request, db: Session = Depends(get_db), user: dict = Depends(require_auth)):
    """Return IIQ locations from local DB."""
    locations = db.query(IIQLocation).filter(
        IIQLocation.is_active == True
    ).order_by(IIQLocation.name).all()
    return {"locations": [{"name": loc.name, "id": loc.location_id} for loc in locations]}


# --- SEARCH ENDPOINTS ---

@router.get("/iiq/search-users")
@limiter.limit("30/minute")
def search_iiq_users(request: Request, q: str = "", db: Session = Depends(get_db), user: dict = Depends(require_auth)):
    """Search IIQ users by name, email, or school ID number from local DB."""
    if len(q) < 2:
        return {"users": []}
    pattern = f"%{q}%"
    results = db.query(IIQUser).filter(
        IIQUser.is_active == True,
        IIQUser.is_deleted == False,
        or_(
            IIQUser.full_name.ilike(pattern),
            IIQUser.first_name.ilike(pattern),
            IIQUser.last_name.ilike(pattern),
            IIQUser.email.ilike(pattern),
            IIQUser.school_id_number.ilike(pattern),
        )
    ).order_by(IIQUser.full_name).limit(20).all()
    users = []
    for u in results:
        users.append({
            "user_id": u.user_id,
            "name": u.full_name or "",
            "email": u.email or "",
            "school_id": u.school_id_number or "",
            "role": u.role_name or "",
            "location": u.location_name or "",
        })
    return {"users": users}


# --- SINGLE DEVICE ENDPOINTS ---

@router.post("/device/{serial}/iiq/update-status")
@limiter.limit("10/minute")
def update_iiq_status(request: Request, serial: str, body: UpdateValue, db: Session = Depends(get_db), user: dict = Depends(require_auth)):
    record = _get_iiq_asset(db, serial)
    connector = _get_iiq_connector()
    try:
        connector.update_asset_status(record.iiq_id, record.serial_number, body.value)
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
        connector.update_asset_location(record.iiq_id, record.serial_number, body.value)
        logger.info(f"[{user.get('email')}] Updated IIQ location for {serial} to {body.value}")
        return {"status": "success", "message": f"Location updated"}
    except Exception as e:
        logger.error(f"Failed to update IIQ location for {serial}: {e}")
        raise HTTPException(status_code=502, detail=f"IIQ API error: {str(e)}")


@router.post("/device/{serial}/iiq/update-asset-tag")
@limiter.limit("10/minute")
def update_iiq_tag(request: Request, serial: str, body: UpdateValue, db: Session = Depends(get_db), user: dict = Depends(require_auth)):
    record = _get_iiq_asset(db, serial)
    connector = _get_iiq_connector()
    try:
        connector.update_asset_tag(record.iiq_id, record.serial_number, body.value)
        logger.info(f"[{user.get('email')}] Updated IIQ asset tag for {serial} to {body.value}")
        return {"status": "success", "message": f"Asset tag updated to {body.value}"}
    except Exception as e:
        logger.error(f"Failed to update IIQ tag for {serial}: {e}")
        raise HTTPException(status_code=502, detail=f"IIQ API error: {str(e)}")


@router.post("/device/{serial}/iiq/update-assigned-user")
@limiter.limit("10/minute")
def update_iiq_user(request: Request, serial: str, body: UpdateAssignedUser, db: Session = Depends(get_db), user: dict = Depends(require_auth)):
    record = _get_iiq_asset(db, serial)
    connector = _get_iiq_connector()
    try:
        connector.update_assigned_user(record.iiq_id, body.user_id)
        logger.info(f"[{user.get('email')}] Updated IIQ assigned user for {serial} to user_id={body.user_id}")
        return {"status": "success", "message": f"Assigned user updated"}
    except Exception as e:
        logger.error(f"Failed to update IIQ user for {serial}: {e}")
        raise HTTPException(status_code=502, detail=f"IIQ API error: {str(e)}")


# --- COMBINED UPDATE ENDPOINT ---

@router.post("/device/{serial}/iiq/update")
@limiter.limit("10/minute")
def combined_iiq_update(request: Request, serial: str, body: CombinedIIQUpdate, db: Session = Depends(get_db), user: dict = Depends(require_auth)):
    """Update multiple IIQ asset fields in a single API call."""
    record = _get_iiq_asset(db, serial)
    connector = _get_iiq_connector()
    results = []

    try:
        # Asset-level fields (status, location, tag) go in a single POST.
        # CRITICAL: We must REMOVE all nested objects before POSTing.
        # IIQ silently rejects payloads when nested objects conflict with top-level IDs.
        # By removing nested objects, IIQ rebuilds them from the top-level IDs.
        has_asset_changes = body.status_id or body.location_id or body.asset_tag
        if has_asset_changes:
            full_asset = connector.fetch_asset_by_serial(record.serial_number)
            if not full_asset:
                raise Exception("Could not fetch asset from IIQ")

            # Remove ALL nested objects that could cause conflicts
            for key in ['Status', 'Location', 'Owner', 'PreviousOwner', 'Model', 'Site']:
                if key in full_asset:
                    del full_asset[key]

            # Apply all changes to top-level ID fields
            if body.status_id:
                full_asset["StatusTypeId"] = body.status_id
                results.append("Status")
            if body.location_id:
                full_asset["LocationId"] = body.location_id
                results.append("Location")
            if body.asset_tag:
                full_asset["AssetTag"] = body.asset_tag
                results.append("Asset Tag")

            # Single POST with all changes
            url = f"{connector.base_url}/api/v1.0/assets/{record.iiq_id}"
            connector._iiq_post(url, full_asset)

        # Owner uses a separate API endpoint (/assets/{id}/owner)
        # Must run AFTER the asset POST
        if body.user_id:
            connector.update_assigned_user(record.iiq_id, body.user_id)
            results.append("Owner")

        if not results:
            raise HTTPException(status_code=400, detail="No fields to update")

        logger.info(f"[{user.get('email')}] IIQ update for {serial}: {', '.join(results)}")
        return {"status": "success", "message": f"Updated: {', '.join(results)}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed IIQ update for {serial}: {e}")
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
            action_fn(record)
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
    return _run_bulk_iiq(db, connector, body.serials, lambda rec: connector.update_asset_status(rec.iiq_id, rec.serial_number, body.value), user.get("email", ""), "status")


@router.post("/bulk/iiq/update-location")
@limiter.limit("5/minute")
def bulk_update_location(request: Request, body: BulkIIQUpdate, db: Session = Depends(get_db), user: dict = Depends(require_auth)):
    connector = _get_iiq_connector()
    return _run_bulk_iiq(db, connector, body.serials, lambda rec: connector.update_asset_location(rec.iiq_id, rec.serial_number, body.value), user.get("email", ""), "location")


@router.post("/bulk/iiq/update")
@limiter.limit("5/minute")
def bulk_combined_iiq_update(request: Request, body: BulkCombinedIIQUpdate, db: Session = Depends(get_db), user: dict = Depends(require_auth)):
    """Bulk update multiple IIQ asset fields in single API calls per device."""
    connector = _get_iiq_connector()
    user_email = user.get("email", "")
    success = 0
    failed = 0
    errors = []

    for serial in body.serials:
        record = db.query(IIQAsset).filter(IIQAsset.serial_number == serial).first()
        if not record or not record.iiq_id:
            failed += 1
            errors.append({"serial": serial, "error": "Asset not found in IIQ"})
            continue

        try:
            has_asset_changes = body.status_id or body.location_id or body.asset_tag
            if has_asset_changes:
                full_asset = connector.fetch_asset_by_serial(record.serial_number)
                if not full_asset:
                    raise Exception("Could not fetch asset from IIQ")

                # Remove ALL nested objects to prevent silent rejection
                for key in ['Status', 'Location', 'Owner', 'PreviousOwner', 'Model', 'Site']:
                    if key in full_asset:
                        del full_asset[key]

                # Apply all changes at once
                if body.status_id:
                    full_asset["StatusTypeId"] = body.status_id
                if body.location_id:
                    full_asset["LocationId"] = body.location_id
                if body.asset_tag:
                    full_asset["AssetTag"] = body.asset_tag

                # Single POST with all changes
                url = f"{connector.base_url}/api/v1.0/assets/{record.iiq_id}"
                connector._iiq_post(url, full_asset)

            # Owner uses separate endpoint
            if body.user_id:
                connector.update_assigned_user(record.iiq_id, body.user_id)

            success += 1
            logger.info(f"[{user_email}] Bulk IIQ update succeeded: {serial}")
        except Exception as e:
            failed += 1
            errors.append({"serial": serial, "error": str(e)[:200]})
            logger.error(f"[{user_email}] Bulk IIQ update failed for {serial}: {e}")

    return {"success": success, "failed": failed, "errors": errors}
