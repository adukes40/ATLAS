"""
ATLAS Authentication Module
Supports both local authentication and Google OAuth 2.0.
Local auth is always available; Google OAuth is optional (enabled via settings).
"""
import os
from typing import Optional
from functools import lru_cache

from fastapi import Request, HTTPException, status
from authlib.integrations.starlette_client import OAuth
from itsdangerous import URLSafeTimedSerializer
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from dotenv import load_dotenv

from app.database import SessionLocal
from app.services.settings_service import get_setting

load_dotenv()

# =============================================================================
# Configuration (from .env - only SECRET_KEY needed)
# =============================================================================
SECRET_KEY = os.getenv("SECRET_KEY")

# Session settings
SESSION_COOKIE_NAME = "atlas_session"
SESSION_MAX_AGE = 8 * 60 * 60  # 8 hours

# =============================================================================
# Session Serializer
# =============================================================================
if SECRET_KEY:
    serializer = URLSafeTimedSerializer(SECRET_KEY)
else:
    serializer = None


def get_oauth_client():
    """
    Get configured OAuth client, or None if not configured.
    Reads settings from database.
    """
    db = SessionLocal()
    try:
        client_id = get_setting(db, "oauth_client_id")
        client_secret = get_setting(db, "oauth_client_secret")

        if not client_id or not client_secret:
            return None

        oauth = OAuth()
        oauth.register(
            name='google',
            client_id=client_id,
            client_secret=client_secret,
            server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
            client_kwargs={
                'scope': 'openid email profile',
            }
        )
        return oauth
    finally:
        db.close()


def is_oauth_enabled() -> bool:
    """Check if Google OAuth is enabled in settings."""
    db = SessionLocal()
    try:
        enabled = get_setting(db, "oauth_enabled")
        return enabled == "true"
    finally:
        db.close()


def get_oauth_settings() -> dict:
    """Get all OAuth-related settings."""
    db = SessionLocal()
    try:
        return {
            "enabled": get_setting(db, "oauth_enabled") == "true",
            "allowed_domain": get_setting(db, "oauth_allowed_domain"),
            "admin_group": get_setting(db, "oauth_admin_group"),
            "user_group": get_setting(db, "oauth_user_group"),
        }
    finally:
        db.close()


# =============================================================================
# Google Admin SDK Client (for group membership check)
# =============================================================================
def get_admin_service():
    """
    Create Google Admin SDK service for group membership checks.
    Uses credentials from database settings.
    """
    db = SessionLocal()
    try:
        creds_json = get_setting(db, "google_credentials_json")
        admin_email = get_setting(db, "google_admin_email")

        if not creds_json or not admin_email:
            raise RuntimeError("Google credentials not configured")

        import json
        import tempfile

        # Write credentials to temp file for Google SDK
        creds_dict = json.loads(creds_json)
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(creds_dict, f)
            temp_path = f.name

        try:
            scopes = ['https://www.googleapis.com/auth/admin.directory.group.member.readonly']
            credentials = service_account.Credentials.from_service_account_file(
                temp_path, scopes=scopes
            )
            delegated_credentials = credentials.with_subject(admin_email)
            return build('admin', 'directory_v1', credentials=delegated_credentials)
        finally:
            os.unlink(temp_path)
    finally:
        db.close()


def check_group_membership(user_email: str, group_email: str) -> bool:
    """
    Check if user is a member of a Google Group.
    Returns True if user is a member, False otherwise.
    """
    if not group_email:
        return False

    try:
        service = get_admin_service()
        result = service.members().hasMember(
            groupKey=group_email,
            memberKey=user_email
        ).execute()
        return result.get('isMember', False)
    except HttpError as e:
        if e.resp.status == 404:
            return False
        print(f"[Auth] Error checking group membership: {e}")
        return False
    except Exception as e:
        print(f"[Auth] Unexpected error checking group membership: {e}")
        return False


def get_google_user_role(user_email: str) -> Optional[str]:
    """
    Determine user's role based on Google Group membership.
    Returns 'admin', 'readonly', or None if not in any group.
    """
    settings = get_oauth_settings()

    # Check admin group first
    if settings.get("admin_group") and check_group_membership(user_email, settings["admin_group"]):
        return "admin"

    # Check user group
    if settings.get("user_group") and check_group_membership(user_email, settings["user_group"]):
        return "readonly"

    return None


# =============================================================================
# Session Management
# =============================================================================
def create_session_token(user_data: dict) -> str:
    """Create a signed session token containing user data."""
    if not serializer:
        raise RuntimeError("SECRET_KEY not configured")
    return serializer.dumps(user_data)


def verify_session_token(token: str) -> Optional[dict]:
    """
    Verify and decode a session token.
    Returns user data if valid, None if invalid or expired.
    """
    if not serializer:
        return None
    try:
        return serializer.loads(token, max_age=SESSION_MAX_AGE)
    except Exception:
        return None


def get_current_user(request: Request) -> Optional[dict]:
    """
    Extract and validate current user from session cookie.
    Returns user dict or None if not authenticated.
    """
    session_token = request.cookies.get(SESSION_COOKIE_NAME)
    if not session_token:
        return None

    user_data = verify_session_token(session_token)
    if not user_data:
        return None

    return user_data


def require_auth(request: Request) -> dict:
    """
    FastAPI dependency that requires authentication.
    Raises 401 if user is not authenticated.
    """
    user = get_current_user(request)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"}
        )
    return user


def require_admin(request: Request) -> dict:
    """
    FastAPI dependency that requires admin role.
    Raises 401 if not authenticated, 403 if not admin.
    """
    user = require_auth(request)
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return user


# =============================================================================
# User Validation for Google OAuth
# =============================================================================
def validate_google_user(user_info: dict) -> tuple[bool, str, str]:
    """
    Validate that the Google user meets all requirements:
    1. Email is from the allowed domain
    2. User is a member of admin or user group

    Returns (is_valid, error_message, role)
    """
    email = user_info.get("email", "")
    settings = get_oauth_settings()

    # Check domain
    allowed_domain = settings.get("allowed_domain")
    if allowed_domain and not email.endswith(f"@{allowed_domain}"):
        return False, f"Access restricted to @{allowed_domain} accounts", ""

    # Check group membership and get role
    role = get_google_user_role(email)
    if not role:
        return False, "Access restricted. You must be a member of an authorized group.", ""

    return True, "", role
