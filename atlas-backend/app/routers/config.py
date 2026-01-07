"""
Configuration endpoints for ATLAS.
Exposes which integrations are enabled based on environment variables.
"""
from fastapi import APIRouter
import os

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("/integrations")
def get_integrations():
    """
    Return which integrations are enabled based on env vars.
    Used by frontend to conditionally render vendor-specific UI.
    """
    google_creds_path = os.getenv("GOOGLE_CREDS_PATH", "")

    return {
        "iiq": bool(os.getenv("IIQ_TOKEN")),
        "google": bool(google_creds_path) and os.path.exists(google_creds_path),
        "meraki": bool(os.getenv("MERAKI_API_KEY"))
    }
