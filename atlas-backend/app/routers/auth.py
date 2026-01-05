"""
ATLAS Authentication Router
Handles Google OAuth login flow and session management.
"""
import secrets
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse

from app.auth import (
    oauth,
    create_session_token,
    validate_google_user,
    get_current_user,
    SESSION_COOKIE_NAME,
    SESSION_MAX_AGE,
    ALLOWED_DOMAIN,
    REQUIRED_GROUP,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/login")
async def login(request: Request):
    """
    Initiates Google OAuth login flow.
    Redirects user to Google's consent screen.
    """
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
        is_valid, error_message = validate_google_user(user_info)
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
    if not user:
        return {
            "authenticated": False,
            "user": None,
            "domain": ALLOWED_DOMAIN,
            "group": REQUIRED_GROUP
        }
    return {
        "authenticated": True,
        "user": {
            "email": user.get("email"),
            "name": user.get("name"),
            "picture": user.get("picture"),
        },
        "domain": ALLOWED_DOMAIN,
        "group": REQUIRED_GROUP
    }
