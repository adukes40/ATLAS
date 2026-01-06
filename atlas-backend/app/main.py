from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.database import engine, get_db
from app.models import Base
from app.routers import devices, dashboards, utilities, reports
from app.routers import auth as auth_router
from app.auth import require_auth, get_current_user, SECRET_KEY
from app.services.iiq_sync import IIQConnector
from app.config import IIQ_URL, IIQ_TOKEN
from app.middleware.security import SecurityHeadersMiddleware


# =============================================================================
# RATE LIMITING
# =============================================================================
def get_user_identifier(request: Request) -> str:
    """
    Get rate limit key from authenticated user email or fall back to IP.
    This ensures rate limits are per-user, not per-IP (important for shared IPs).
    """
    user = get_current_user(request)
    if user and user.get("email"):
        return user.get("email")
    return get_remote_address(request)


# Initialize rate limiter
limiter = Limiter(key_func=get_user_identifier)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """
    Custom handler for rate limit exceeded errors.
    Provides clear message about limit and retry time.
    """
    # Parse the limit details from the exception
    limit_value = exc.detail

    return JSONResponse(
        status_code=429,
        content={
            "error": "Rate limit exceeded",
            "message": f"Too many requests. Limit: {limit_value}. Please slow down and try again shortly.",
            "detail": "Rate limits protect the system from overload. Normal usage should never hit these limits."
        }
    )

# Initialize App
app = FastAPI(
    title="ATLAS API",
    description="Asset, Telemetry, Location, & Analytics System",
    version="0.5.0"  # Security Update - System Hardening
)

# Attach rate limiter to app state and register exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# =============================================================================
# MIDDLEWARE
# =============================================================================

# Session Middleware (required for OAuth state)
app.add_middleware(
    SessionMiddleware,
    secret_key=SECRET_KEY or "fallback-dev-key",
    session_cookie="atlas_oauth_session",
    max_age=3600,
    same_site="lax",
    https_only=False  # Set True in production with HTTPS
)

# CORS Middleware
# Origins loaded from environment variable ALLOWED_ORIGINS (comma-separated)
import os
cors_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Security Headers Middleware
app.add_middleware(SecurityHeadersMiddleware)

# =============================================================================
# ROUTERS
# =============================================================================

# Auth router (no authentication required)
app.include_router(auth_router.router)

# Protected routers (require authentication)
app.include_router(devices.router, dependencies=[Depends(require_auth)])
app.include_router(dashboards.router, dependencies=[Depends(require_auth)])
app.include_router(utilities.router, dependencies=[Depends(require_auth)])
app.include_router(reports.router, dependencies=[Depends(require_auth)])

# =============================================================================
# STARTUP
# =============================================================================
@app.on_event("startup")
def startup_event():
    Base.metadata.create_all(bind=engine)
    print(">> ATLAS Systems Online: Database Connected & Routes Loaded.")
    print(">> Authentication: ENABLED")
    print(">> Rate Limiting: ENABLED")
    print(">> Security Headers: ENABLED")

# =============================================================================
# HEALTH CHECK (No auth required)
# =============================================================================
@app.get("/")
def read_root():
    return {
        "system": "ATLAS",
        "status": "Operational",
        "version": "0.5.0",
        "auth": "enabled",
        "rate_limiting": "enabled",
        "security_headers": "enabled"
    }

# =============================================================================
# PROTECTED ENDPOINTS
# =============================================================================
@app.post("/api/sync/iiq/{serial}")
@limiter.limit("5/hour")
def sync_single_asset(
    request: Request,
    serial: str,
    db: Session = Depends(get_db),
    user: dict = Depends(require_auth)
):
    """
    Triggers a real-time fetch from Incident IQ.
    Requires authentication.
    """
    print(f">> [{user.get('email')}] Initiating Sync for Serial: {serial}")

    connector = IIQConnector(IIQ_URL, IIQ_TOKEN)
    result = connector.sync_record(db, serial)

    if result.get("status") == "error":
        print(f"!! Sync Failed: {result.get('message')}")
        raise HTTPException(status_code=404, detail=result.get("message", "Sync Failed"))

    print(f">> Sync Complete: {result}")
    return result

# NOTE: /test/seed-data endpoint REMOVED for security
