"""
Configuration endpoints for ATLAS.
Exposes which integrations are enabled based on database settings.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.settings_service import get_setting
import os

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("/integrations")
def get_integrations(db: Session = Depends(get_db)):
    """
    Return which integrations are enabled based on configured credentials.
    Checks database settings first, falls back to env vars.
    Used by frontend to conditionally render vendor-specific UI.
    """
    # Check IIQ - need token and URL
    iiq_token = get_setting(db, "iiq_token") or os.getenv("IIQ_TOKEN")
    iiq_url = get_setting(db, "iiq_url") or os.getenv("IIQ_URL")
    iiq_enabled = bool(iiq_token and iiq_url)

    # Check Google - need credentials JSON or file
    google_creds = get_setting(db, "google_credentials_json")
    google_creds_path = os.getenv("GOOGLE_CREDS_PATH", "")
    google_enabled = bool(google_creds) or (bool(google_creds_path) and os.path.exists(google_creds_path))

    # Check Meraki - need API key
    meraki_key = get_setting(db, "meraki_api_key") or os.getenv("MERAKI_API_KEY")
    meraki_enabled = bool(meraki_key)

    return {
        "iiq": iiq_enabled,
        "google": google_enabled,
        "meraki": meraki_enabled
    }
