"""
ATLAS Authentication Router
Handles both local authentication and Google OAuth.
"""
import secrets
from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel

from app.database import SessionLocal
from app.auth import (
    get_oauth_client,
    is_oauth_enabled,
    get_oauth_settings,
    create_session_token,
    validate_google_user,
    get_current_user,
    require_auth,
    SESSION_COOKIE_NAME,
    SESSION_MAX_AGE,
)
from app.services.local_auth import (
    authenticate_user,
    change_password,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


# =============================================================================
# Request/Response Models
# =============================================================================
class LocalLoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# =============================================================================
# Local Authentication
# =============================================================================
@router.post("/local/login")
async def local_login(request: Request, credentials: LocalLoginRequest):
    """
    Authenticate with local username/password.
    Returns session cookie on success.
    """
    db = SessionLocal()
    try:
        user, error = authenticate_user(db, credentials.username, credentials.password)

        if not user:
            raise HTTPException(status_code=401, detail=error)

        # Create session data
        session_data = {
            "user_id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "auth_type": "local",
            "must_change_password": user.must_change_password,
        }
        session_token = create_session_token(session_data)

        # Return JSON with cookie
        response = JSONResponse(content={
            "success": True,
            "user": {
                "username": user.username,
                "email": user.email,
                "role": user.role,
                "auth_type": "local",
            },
            "must_change_password": user.must_change_password,
        })
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=session_token,
            max_age=SESSION_MAX_AGE,
            httponly=True,
            secure=request.url.scheme == "https",
            samesite="lax"
        )
        return response

    finally:
        db.close()


@router.post("/change-password")
async def change_user_password(
    request: Request,
    data: ChangePasswordRequest,
    current_user: dict = Depends(require_auth)
):
    """
    Change password for current user.
    Only works for local auth users.
    """
    if current_user.get("auth_type") != "local":
        raise HTTPException(
            status_code=400,
            detail="Password change only available for local accounts"
        )

    db = SessionLocal()
    try:
        success, error = change_password(
            db,
            current_user.get("user_id"),
            data.current_password,
            data.new_password
        )

        if not success:
            raise HTTPException(status_code=400, detail=error)

        # Update session to clear must_change_password flag
        session_data = {
            "user_id": current_user.get("user_id"),
            "username": current_user.get("username"),
            "email": current_user.get("email"),
            "role": current_user.get("role"),
            "auth_type": "local",
            "must_change_password": False,
        }
        session_token = create_session_token(session_data)

        response = JSONResponse(content={"success": True})
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=session_token,
            max_age=SESSION_MAX_AGE,
            httponly=True,
            secure=request.url.scheme == "https",
            samesite="lax"
        )
        return response

    finally:
        db.close()


# =============================================================================
# Google OAuth
# =============================================================================
@router.get("/login")
async def login(request: Request):
    """
    Initiates Google OAuth login flow.
    Redirects user to Google's consent screen.
    """
    if not is_oauth_enabled():
        raise HTTPException(
            status_code=400,
            detail="Google OAuth is not enabled"
        )

    oauth = get_oauth_client()
    if not oauth:
        raise HTTPException(
            status_code=500,
            detail="OAuth not configured properly"
        )

    # Generate CSRF state token
    state = secrets.token_urlsafe(32)
    request.session['oauth_state'] = state

    # Determine redirect URI based on request
    scheme = request.headers.get('x-forwarded-proto', request.url.scheme)
    host = request.headers.get('host', request.url.netloc)
    redirect_uri = f"{scheme}://{host}/auth/callback"

    return await oauth.google.authorize_redirect(
        request,
        redirect_uri,
        state=state
    )


@router.get("/callback")
async def auth_callback(request: Request):
    """
    Handles OAuth callback from Google.
    Validates user, checks group membership, and creates session.
    """
    if not is_oauth_enabled():
        raise HTTPException(
            status_code=400,
            detail="Google OAuth is not enabled"
        )

    oauth = get_oauth_client()
    if not oauth:
        raise HTTPException(
            status_code=500,
            detail="OAuth not configured properly"
        )

    try:
        # Validate CSRF state
        state = request.query_params.get('state')
        session_state = request.session.get('oauth_state')

        if not state or not session_state or state != session_state:
            raise HTTPException(
                status_code=400,
                detail="Invalid state parameter - possible CSRF attack"
            )

        # Clear the state from session
        request.session.pop('oauth_state', None)

        # Exchange code for token and get user info
        token = await oauth.google.authorize_access_token(request)
        user_info = token.get("userinfo")

        if not user_info:
            raise HTTPException(status_code=400, detail="Failed to get user info from Google")

        # Validate user (domain + group membership)
        is_valid, error_message, role = validate_google_user(user_info)
        if not is_valid:
            # Redirect to login with error
            return RedirectResponse(
                url=f"/?auth_error={error_message}",
                status_code=302
            )

        # Create session data
        session_data = {
            "email": user_info.get("email"),
            "name": user_info.get("name"),
            "picture": user_info.get("picture"),
            "sub": user_info.get("sub"),  # Google user ID
            "role": role,
            "auth_type": "google",
        }
        session_token = create_session_token(session_data)

        # Redirect to app with session cookie
        response = RedirectResponse(url="/", status_code=302)
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=session_token,
            max_age=SESSION_MAX_AGE,
            httponly=True,
            secure=request.url.scheme == "https",
            samesite="lax"
        )
        return response

    except HTTPException:
        raise
    except Exception as e:
        print(f"[Auth] OAuth callback error: {e}")
        raise HTTPException(status_code=400, detail=f"Authentication failed: {str(e)}")


@router.get("/logout")
async def logout(request: Request):
    """
    Logs out user by clearing session cookie.
    Redirects to home page.
    """
    response = RedirectResponse(url="/", status_code=302)
    response.delete_cookie(SESSION_COOKIE_NAME)
    return response


@router.get("/me")
async def get_me(request: Request):
    """
    Returns current authenticated user info.
    Used by frontend to check auth status.
    """
    user = get_current_user(request)
    oauth_settings = get_oauth_settings()

    if not user:
        return {
            "authenticated": False,
            "user": None,
            "oauth_enabled": oauth_settings.get("enabled", False),
            "allowed_domain": oauth_settings.get("allowed_domain"),
        }

    return {
        "authenticated": True,
        "user": {
            "email": user.get("email"),
            "name": user.get("name") or user.get("username"),
            "username": user.get("username"),
            "picture": user.get("picture"),
            "role": user.get("role"),
            "auth_type": user.get("auth_type"),
        },
        "must_change_password": user.get("must_change_password", False),
        "oauth_enabled": oauth_settings.get("enabled", False),
        "allowed_domain": oauth_settings.get("allowed_domain"),
    }
