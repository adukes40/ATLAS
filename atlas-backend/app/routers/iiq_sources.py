from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
import requests

from app.database import get_db
from app.models import IIQSyncConfig
from app.config import get_config

router = APIRouter(prefix="/api/settings/iiq-sources", tags=["IIQ Sources"])


class IIQSourceResponse(BaseModel):
    key: str
    display_name: str
    enabled: bool
    record_count: Optional[int]
    last_synced: Optional[datetime]
    last_checked: Optional[datetime]
    sync_table: str
    api_endpoint: str
    api_method: str

    class Config:
        from_attributes = True


class IIQSourcesListResponse(BaseModel):
    sources: List[IIQSourceResponse]


class IIQPreviewResponse(BaseModel):
    source_key: str
    display_name: str
    record_count: int
    sample_records: List[dict]
    fields: List[str]


def get_iiq_headers():
    """Get IIQ API headers from settings."""
    site_id = get_config('iiq_site_id') or ""
    return {
        "Authorization": f"Bearer {get_config('iiq_token')}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Client": site_id,
    }


def get_iiq_base_url():
    """Get IIQ base URL from settings."""
    return get_config('iiq_url')


@router.get("", response_model=IIQSourcesListResponse)
def list_sources(db: Session = Depends(get_db)):
    """List all IIQ data sources with their sync status."""
    configs = db.query(IIQSyncConfig).order_by(IIQSyncConfig.display_name).all()

    sources = []
    for config in configs:
        sources.append(IIQSourceResponse(
            key=config.source_key,
            display_name=config.display_name,
            enabled=config.enabled,
            record_count=config.record_count,
            last_synced=config.last_synced,
            last_checked=config.last_checked,
            sync_table=config.sync_table or "",
            api_endpoint=config.api_endpoint,
            api_method=config.api_method or "GET"
        ))

    return IIQSourcesListResponse(sources=sources)


@router.post("/{source_key}/toggle")
def toggle_source(source_key: str, db: Session = Depends(get_db)):
    """Enable or disable a data source for syncing."""
    config = db.query(IIQSyncConfig).filter(
        IIQSyncConfig.source_key == source_key
    ).first()

    if not config:
        raise HTTPException(status_code=404, detail=f"Source '{source_key}' not found")

    config.enabled = not config.enabled
    db.commit()

    return {
        "source_key": source_key,
        "enabled": config.enabled,
        "message": f"{'Enabled' if config.enabled else 'Disabled'} {config.display_name} sync"
    }


@router.get("/{source_key}/preview", response_model=IIQPreviewResponse)
def preview_source(source_key: str, db: Session = Depends(get_db)):
    """Fetch 5 sample records from an IIQ data source."""
    config = db.query(IIQSyncConfig).filter(
        IIQSyncConfig.source_key == source_key
    ).first()

    if not config:
        raise HTTPException(status_code=404, detail=f"Source '{source_key}' not found")

    headers = get_iiq_headers()
    base_url = get_iiq_base_url()

    try:
        if config.api_method == "POST":
            resp = requests.post(
                f"{base_url}{config.api_endpoint}",
                headers=headers,
                json={"OnlyShowDeleted": False, "Paging": {"PageIndex": 0, "PageSize": 5}},
                timeout=15
            )
        else:
            resp = requests.get(
                f"{base_url}{config.api_endpoint}",
                headers=headers,
                params={"$p": 0, "$s": 5},
                timeout=15
            )

        resp.raise_for_status()
        data = resp.json()

        items = data.get("Items", [])
        record_count = data.get("Paging", {}).get("TotalRows", len(items))

        # Extract field names from first record
        fields = []
        if items:
            fields = list(items[0].keys())[:15]  # Limit to first 15 fields

        return IIQPreviewResponse(
            source_key=source_key,
            display_name=config.display_name,
            record_count=record_count,
            sample_records=items,
            fields=fields
        )

    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"IIQ API error: {str(e)}")


@router.post("/{source_key}/sync")
def sync_source(source_key: str, db: Session = Depends(get_db)):
    """Trigger immediate sync for a specific IIQ data source."""
    from app.services.iiq_sync import IIQConnector

    config = db.query(IIQSyncConfig).filter(
        IIQSyncConfig.source_key == source_key
    ).first()

    if not config:
        raise HTTPException(status_code=404, detail=f"Source '{source_key}' not found")

    # Create connector
    connector = IIQConnector(
        base_url=get_iiq_base_url(),
        token=get_config('iiq_token'),
        site_id=get_config('iiq_site_id'),
        product_id=get_config('iiq_product_id')
    )

    # Map source keys to sync functions
    sync_functions = {
        'assets': connector.bulk_sync,
        'users': connector.bulk_sync_users,
        'tickets': connector.bulk_sync_tickets,
        'locations': connector.bulk_sync_locations,
        'teams': connector.bulk_sync_teams,
        'manufacturers': connector.bulk_sync_manufacturers,
    }

    sync_func = sync_functions.get(source_key)
    if not sync_func:
        raise HTTPException(status_code=400, detail=f"No sync function for '{source_key}'")

    try:
        result = sync_func(db)
        config.last_synced = datetime.utcnow()
        db.commit()
        return {
            "source_key": source_key,
            "status": "success",
            "result": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")


@router.post("/refresh-counts")
def refresh_counts(db: Session = Depends(get_db)):
    """Re-probe IIQ API to update record counts for all sources."""
    headers = get_iiq_headers()
    base_url = get_iiq_base_url()

    results = []
    configs = db.query(IIQSyncConfig).all()

    for config in configs:
        try:
            if config.api_method == "POST":
                resp = requests.post(
                    f"{base_url}{config.api_endpoint}",
                    headers=headers,
                    json={"OnlyShowDeleted": False, "Paging": {"PageIndex": 0, "PageSize": 1}},
                    timeout=10
                )
            else:
                resp = requests.get(
                    f"{base_url}{config.api_endpoint}",
                    headers=headers,
                    params={"$p": 0, "$s": 1},
                    timeout=10
                )

            if resp.status_code == 200:
                data = resp.json()
                count = data.get("Paging", {}).get("TotalRows", 0)
                config.record_count = count
                config.last_checked = datetime.utcnow()
                results.append({"source": config.source_key, "count": count, "status": "ok"})
            else:
                results.append({"source": config.source_key, "count": None, "status": f"error: {resp.status_code}"})

        except Exception as e:
            results.append({"source": config.source_key, "count": None, "status": f"error: {str(e)}"})

    db.commit()
    return {"results": results}
