"""
ATLAS Settings Router
Admin-only endpoints for managing application settings and users.
"""
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel

from app.database import SessionLocal
from app.auth import require_admin
from app.config import refresh_config
from app.services.settings_service import (
    get_all_settings,
    set_multiple_settings,
    is_service_configured,
    get_setting,
    seed_iiq_sync_config,
)
from app.services.local_auth import (
    create_user,
    get_all_users,
    get_user_by_id,
    update_user,
    delete_user,
    reset_password,
)

router = APIRouter(prefix="/api/settings", tags=["Settings"])


# =============================================================================
# Request/Response Models
# =============================================================================
class SettingsUpdate(BaseModel):
    settings: Dict[str, str]


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "readonly"
    email: Optional[str] = None


class UserUpdate(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class PasswordReset(BaseModel):
    new_password: str


class TestConnectionResult(BaseModel):
    success: bool
    message: str
    sample_data: Optional[Dict[str, Any]] = None


# =============================================================================
# Settings Endpoints
# =============================================================================
@router.get("")
async def get_settings(current_user: dict = Depends(require_admin)):
    """
    Get all application settings.
    Secrets are returned as configured/not-configured only.
    """
    db = SessionLocal()
    try:
        settings = get_all_settings(db)

        # Add service configuration status
        service_status = {
            "iiq_configured": is_service_configured(db, "iiq"),
            "google_configured": is_service_configured(db, "google"),
            "meraki_configured": is_service_configured(db, "meraki"),
            "oauth_configured": is_service_configured(db, "oauth"),
        }

        return {
            "settings": settings,
            "services": service_status,
        }
    finally:
        db.close()


@router.post("")
async def update_settings(
    data: SettingsUpdate,
    current_user: dict = Depends(require_admin)
):
    """
    Update multiple settings at once.
    """
    db = SessionLocal()
    try:
        user_id = current_user.get("user_id") or current_user.get("email")
        set_multiple_settings(db, data.settings, user_id)

        # If IIQ settings are being saved, seed the sync config table
        iiq_keys = {"iiq_url", "iiq_token", "iiq_site_id"}
        if any(key in data.settings for key in iiq_keys):
            seeded = seed_iiq_sync_config(db)
            if seeded > 0:
                import logging
                logging.info(f"Seeded {seeded} IIQ sync config entries")

        # Refresh config cache so new settings take effect
        refresh_config()

        return {"success": True}
    finally:
        db.close()


@router.post("/test/{service}")
async def test_connection(
    service: str,
    current_user: dict = Depends(require_admin)
) -> TestConnectionResult:
    """
    Test connection to a service (IIQ, Google, Meraki).
    Returns success/failure with sample data count.
    """
    db = SessionLocal()
    try:
        if service == "iiq":
            return await _test_iiq_connection(db)
        elif service == "google":
            return await _test_google_connection(db)
        elif service == "meraki":
            return await _test_meraki_connection(db)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown service: {service}")
    finally:
        db.close()


async def _test_iiq_connection(db) -> TestConnectionResult:
    """Test IIQ API connection."""
    try:
        iiq_url = get_setting(db, "iiq_url")
        iiq_token = get_setting(db, "iiq_token")
        iiq_site_id = get_setting(db, "iiq_site_id")

        if not iiq_url or not iiq_token:
            return TestConnectionResult(
                success=False,
                message="IIQ URL or token not configured"
            )

        if not iiq_site_id:
            return TestConnectionResult(
                success=False,
                message="IIQ Site ID not configured"
            )

        import httpx

        headers = {
            "Client": iiq_site_id,
            "Authorization": f"Bearer {iiq_token}",
            "Accept": "application/json",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{iiq_url}/api/v1.0/assets",
                headers=headers,
                json={
                    "OnlyShowDeleted": False,
                    "Paging": {"PageSize": 1, "PageIndex": 0}
                }
            )

            if response.status_code == 200:
                data = response.json()
                total = data.get("Paging", {}).get("TotalRows", 0)
                return TestConnectionResult(
                    success=True,
                    message=f"Connected successfully",
                    sample_data={"total_assets": total}
                )
            else:
                return TestConnectionResult(
                    success=False,
                    message=f"API returned status {response.status_code}"
                )
    except Exception as e:
        return TestConnectionResult(
            success=False,
            message=f"Connection failed: {str(e)}"
        )


async def _test_google_connection(db) -> TestConnectionResult:
    """Test Google Admin API connection."""
    try:
        creds_json = get_setting(db, "google_credentials_json")
        admin_email = get_setting(db, "google_admin_email")

        if not creds_json or not admin_email:
            return TestConnectionResult(
                success=False,
                message="Google credentials or admin email not configured"
            )

        import json
        import tempfile
        import os
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        # Write credentials to temp file
        creds_dict = json.loads(creds_json)
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(creds_dict, f)
            temp_path = f.name

        try:
            scopes = ['https://www.googleapis.com/auth/admin.directory.device.chromeos.readonly']
            credentials = service_account.Credentials.from_service_account_file(
                temp_path, scopes=scopes
            )
            delegated_credentials = credentials.with_subject(admin_email)
            service = build('admin', 'directory_v1', credentials=delegated_credentials)

            # Try to list one device
            results = service.chromeosdevices().list(
                customerId='my_customer',
                maxResults=1
            ).execute()

            devices = results.get('chromeosdevices', [])
            return TestConnectionResult(
                success=True,
                message="Connected successfully",
                sample_data={"sample_devices": len(devices)}
            )
        finally:
            os.unlink(temp_path)

    except Exception as e:
        return TestConnectionResult(
            success=False,
            message=f"Connection failed: {str(e)}"
        )


async def _test_meraki_connection(db) -> TestConnectionResult:
    """Test Meraki Dashboard API connection."""
    try:
        api_key = get_setting(db, "meraki_api_key")
        org_id = get_setting(db, "meraki_org_id")

        if not api_key or not org_id:
            return TestConnectionResult(
                success=False,
                message="Meraki API key or org ID not configured"
            )

        import httpx

        headers = {
            "X-Cisco-Meraki-API-Key": api_key,
            "Accept": "application/json",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"https://api.meraki.com/api/v1/organizations/{org_id}/networks",
                headers=headers
            )

            if response.status_code == 200:
                networks = response.json()
                return TestConnectionResult(
                    success=True,
                    message="Connected successfully",
                    sample_data={"total_networks": len(networks)}
                )
            else:
                return TestConnectionResult(
                    success=False,
                    message=f"API returned status {response.status_code}"
                )
    except Exception as e:
        return TestConnectionResult(
            success=False,
            message=f"Connection failed: {str(e)}"
        )


# =============================================================================
# User Management Endpoints
# =============================================================================
@router.get("/users")
async def list_users(current_user: dict = Depends(require_admin)):
    """Get all local users."""
    db = SessionLocal()
    try:
        users = get_all_users(db)
        return {
            "users": [
                {
                    "id": u.id,
                    "username": u.username,
                    "email": u.email,
                    "role": u.role,
                    "is_active": u.is_active,
                    "must_change_password": u.must_change_password,
                    "created_at": u.created_at.isoformat() if u.created_at else None,
                    "last_login": u.last_login.isoformat() if u.last_login else None,
                }
                for u in users
            ]
        }
    finally:
        db.close()


@router.post("/users")
async def create_new_user(
    data: UserCreate,
    current_user: dict = Depends(require_admin)
):
    """Create a new local user."""
    db = SessionLocal()
    try:
        creator_id = current_user.get("user_id") or current_user.get("email")
        user, error = create_user(
            db,
            username=data.username,
            password=data.password,
            role=data.role,
            email=data.email,
            must_change_password=True,
            created_by=creator_id
        )

        if not user:
            raise HTTPException(status_code=400, detail=error)

        return {
            "success": True,
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": user.role,
            }
        }
    finally:
        db.close()


@router.put("/users/{user_id}")
async def update_existing_user(
    user_id: str,
    data: UserUpdate,
    current_user: dict = Depends(require_admin)
):
    """Update a local user."""
    db = SessionLocal()
    try:
        success, error = update_user(
            db,
            user_id,
            email=data.email,
            role=data.role,
            is_active=data.is_active
        )

        if not success:
            raise HTTPException(status_code=400, detail=error)

        return {"success": True}
    finally:
        db.close()


@router.delete("/users/{user_id}")
async def delete_existing_user(
    user_id: str,
    current_user: dict = Depends(require_admin)
):
    """Delete (deactivate) a local user."""
    # Prevent self-deletion
    if current_user.get("user_id") == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    db = SessionLocal()
    try:
        success, error = delete_user(db, user_id)

        if not success:
            raise HTTPException(status_code=400, detail=error)

        return {"success": True}
    finally:
        db.close()


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    data: PasswordReset,
    current_user: dict = Depends(require_admin)
):
    """Reset a user's password (admin action)."""
    db = SessionLocal()
    try:
        admin_id = current_user.get("user_id") or current_user.get("email")
        success, error = reset_password(db, user_id, data.new_password, admin_id)

        if not success:
            raise HTTPException(status_code=400, detail=error)

        return {"success": True}
    finally:
        db.close()
