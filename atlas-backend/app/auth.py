"""
ATLAS Authentication Module
Google OAuth 2.0 with group-based authorization.
Users must be members of the required Google Group to access the application.
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

load_dotenv()

# =============================================================================
# Configuration
# =============================================================================
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET")
SECRET_KEY = os.getenv("SECRET_KEY")
ALLOWED_DOMAIN = os.getenv("ALLOWED_DOMAIN")  # Required - no default
REQUIRED_GROUP = os.getenv("REQUIRED_GROUP")
GOOGLE_CREDS_PATH = os.getenv("GOOGLE_CREDS_PATH", "google_credentials.json")
GOOGLE_ADMIN_EMAIL = os.getenv("GOOGLE_ADMIN_EMAIL")

# Session settings
SESSION_COOKIE_NAME = "atlas_session"
SESSION_MAX_AGE = 8 * 60 * 60  # 8 hours

# =============================================================================
# OAuth Client Setup
# =============================================================================
oauth = OAuth()
oauth.register(
    name='google',
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={
        'scope': 'openid email profile',
    }
)

# =============================================================================
# Session Serializer
# =============================================================================
if SECRET_KEY:
    serializer = URLSafeTimedSerializer(SECRET_KEY)
else:
    serializer = None


# =============================================================================
# Google Admin SDK Client (for group membership check)
# =============================================================================
@lru_cache(maxsize=1)
def get_admin_service():
    """
    Create Google Admin SDK service for group membership checks.
    Uses the same service account as data sync.
    """
    if not os.path.exists(GOOGLE_CREDS_PATH):
        raise RuntimeError(f"Google credentials file not found: {GOOGLE_CREDS_PATH}")

    scopes = ['https://www.googleapis.com/auth/admin.directory.group.member.readonly']
    credentials = service_account.Credentials.from_service_account_file(
        GOOGLE_CREDS_PATH, scopes=scopes
    )
    delegated_credentials = credentials.with_subject(GOOGLE_ADMIN_EMAIL)
    return build('admin', 'directory_v1', credentials=delegated_credentials)


def check_group_membership(user_email: str) -> bool:
    """
    Check if user is a member of the required Google Group.
    Returns True if user is a member, False otherwise.
    """
    if not REQUIRED_GROUP:
        # No group requirement configured - allow all domain users
        return True

    try:
        service = get_admin_service()
        result = service.members().hasMember(
            groupKey=REQUIRED_GROUP,
            memberKey=user_email
        ).execute()
        return result.get('isMember', False)
    except HttpError as e:
        if e.resp.status == 404:
            # User not found in group
            return False
        # Log other errors but don't block authentication
        print(f"[Auth] Error checking group membership: {e}")
        return False
    except Exception as e:
        print(f"[Auth] Unexpected error checking group membership: {e}")
        return False


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

    # Verify domain is still correct
    email = user_data.get("email", "")
    if not email.endswith(f"@{ALLOWED_DOMAIN}"):
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


# =============================================================================
# User Validation
# =============================================================================
def validate_google_user(user_info: dict) -> tuple[bool, str]:
    """
    Validate that the Google user meets all requirements:
    1. Email is from the allowed domain
    2. User is a member of the required group

    Returns (is_valid, error_message)
    """
    email = user_info.get("email", "")

    # Check domain
    if not email.endswith(f"@{ALLOWED_DOMAIN}"):
        return False, f"Access restricted to @{ALLOWED_DOMAIN} accounts"

    # Check group membership
    if REQUIRED_GROUP and not check_group_membership(email):
        return False, f"Access restricted to members of {REQUIRED_GROUP}"

    return True, ""
