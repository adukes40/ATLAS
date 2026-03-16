import os
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
from app.routers import devices, utilities, reports, settings, config, iiq_sources, system, google_actions, bulk_actions, iiq_actions
from app.routers import auth as auth_router
from app.auth import require_auth, get_current_user, SECRET_KEY
from app.services.iiq_sync import IIQConnector
from app.config import get_iiq_config
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
    version="1.1.8"  # Action Panel - Unified Device Management
)

# Attach rate limiter to app state and register exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# =============================================================================
# MIDDLEWARE
# =============================================================================

# Session Middleware (required for OAuth state)
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable is required. Cannot start without it.")
app.add_middleware(
    SessionMiddleware,
    secret_key=SECRET_KEY,
    session_cookie="atlas_oauth_session",
    max_age=3600,
    same_site="lax",
    https_only=os.getenv("HTTPS_ONLY", "false").lower() == "true"
)

# CORS Middleware
# Origins loaded from environment variable ALLOWED_ORIGINS (comma-separated)
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

# Google Actions router (must be registered before devices to avoid route conflicts)
app.include_router(google_actions.router, dependencies=[Depends(require_auth)])

# Bulk Actions router (must be registered before devices to avoid route conflicts)
app.include_router(bulk_actions.router, dependencies=[Depends(require_auth)])

# IIQ Actions router (write-back to IIQ)
app.include_router(iiq_actions.router, dependencies=[Depends(require_auth)])

# Protected routers (require authentication)
app.include_router(devices.router, dependencies=[Depends(require_auth)])
app.include_router(utilities.router, dependencies=[Depends(require_auth)])
app.include_router(reports.router, dependencies=[Depends(require_auth)])

# Settings router (require admin - checked per-endpoint)
app.include_router(settings.router)

# IIQ Sources router (require authentication)
app.include_router(iiq_sources.router, dependencies=[Depends(require_auth)])

# Config router (integrations status - public, returns non-sensitive data)
app.include_router(config.router)

# System router (version, updates - auth handled per-endpoint)
app.include_router(system.router)

# =============================================================================
# STARTUP / SHUTDOWN
# =============================================================================
def seed_system_reports():
    """Seed system report templates into saved_reports table (idempotent)."""
    from app.database import SessionLocal
    from app.models import SavedReport

    SYSTEM_TEMPLATES = [
        {
            "name": "Device Inventory",
            "system_slug": "device-inventory",
            "config": {
                "query_type": "standard",
                "columns": [
                    {"source": "iiq_assets", "field": "asset_tag"},
                    {"source": "iiq_assets", "field": "serial_number"},
                    {"source": "iiq_assets", "field": "model"},
                    {"source": "iiq_assets", "field": "model_category"},
                    {"source": "iiq_assets", "field": "status"},
                    {"source": "google_devices", "field": "status"},
                    {"source": "iiq_assets", "field": "location"},
                    {"source": "iiq_assets", "field": "assigned_user_name"},
                    {"source": "iiq_assets", "field": "assigned_user_grade"},
                    {"source": "google_devices", "field": "aue_date"},
                ],
                "filters": [],
                "sort": [{"source": "iiq_assets", "field": "serial_number", "direction": "asc"}],
            },
        },
        {
            "name": "AUE / End-of-Life",
            "system_slug": "aue-eol",
            "config": {
                "query_type": "standard",
                "columns": [
                    {"source": "google_devices", "field": "serial_number"},
                    {"source": "google_devices", "field": "model"},
                    {"source": "google_devices", "field": "aue_date"},
                    {"source": "google_devices", "field": "status"},
                    {"source": "google_devices", "field": "os_version"},
                    {"source": "google_devices", "field": "org_unit_path"},
                    {"source": "iiq_assets", "field": "status"},
                    {"source": "iiq_assets", "field": "assigned_user_name"},
                ],
                "filters": [],
                "sort": [{"source": "google_devices", "field": "aue_date", "direction": "asc"}],
            },
        },
        {
            "name": "Fee Balances",
            "system_slug": "fee-balances",
            "config": {
                "query_type": "specialized",
                "specialized_key": "fee_balances",
                "columns": [
                    {"source": "iiq_users", "field": "full_name"},
                    {"source": "iiq_users", "field": "school_id_number"},
                    {"source": "iiq_users", "field": "email"},
                    {"source": "iiq_users", "field": "grade"},
                    {"source": "iiq_users", "field": "location_name"},
                    {"source": "iiq_users", "field": "fee_balance"},
                    {"source": "iiq_users", "field": "fee_past_due"},
                ],
                "filters": [],
                "sort": [{"source": "iiq_users", "field": "fee_balance", "direction": "desc"}],
                "allowed_sources": ["iiq_users"],
            },
        },
        {
            "name": "Students Without Chromebook",
            "system_slug": "no-chromebook",
            "config": {
                "query_type": "specialized",
                "specialized_key": "no_chromebook",
                "columns": [
                    {"source": "iiq_users", "field": "full_name"},
                    {"source": "iiq_users", "field": "email"},
                    {"source": "iiq_users", "field": "school_id_number"},
                    {"source": "iiq_users", "field": "grade"},
                    {"source": "iiq_users", "field": "location_name"},
                    {"source": "iiq_users", "field": "homeroom"},
                ],
                "filters": [],
                "sort": [{"source": "iiq_users", "field": "full_name", "direction": "asc"}],
                "allowed_sources": ["iiq_users"],
            },
        },
        {
            "name": "Multiple Devices",
            "system_slug": "multiple-devices",
            "config": {
                "query_type": "specialized",
                "specialized_key": "multiple_devices",
                "columns": [
                    {"source": "iiq_users", "field": "full_name"},
                    {"source": "iiq_users", "field": "email"},
                    {"source": "iiq_users", "field": "grade"},
                    {"source": "iiq_users", "field": "location_name"},
                ],
                "filters": [],
                "sort": [{"source": "iiq_assets", "field": "device_count", "direction": "desc"}],
                "allowed_sources": ["iiq_users", "iiq_assets"],
            },
        },
        {
            "name": "Infrastructure Inventory",
            "system_slug": "infrastructure-inventory",
            "config": {
                "query_type": "standard",
                "columns": [
                    {"source": "meraki_devices", "field": "serial"},
                    {"source": "meraki_devices", "field": "name"},
                    {"source": "meraki_devices", "field": "model"},
                    {"source": "meraki_devices", "field": "product_type"},
                    {"source": "meraki_devices", "field": "status"},
                    {"source": "meraki_devices", "field": "mac"},
                    {"source": "meraki_devices", "field": "lan_ip"},
                    {"source": "meraki_devices", "field": "firmware"},
                    {"source": "meraki_networks", "field": "name"},
                    {"source": "meraki_devices", "field": "last_updated"},
                ],
                "filters": [],
                "sort": [{"source": "meraki_devices", "field": "name", "direction": "asc"}],
            },
        },
        {
            "name": "Firmware Compliance",
            "system_slug": "firmware-compliance",
            "config": {
                "query_type": "standard",
                "columns": [
                    {"source": "meraki_devices", "field": "name"},
                    {"source": "meraki_devices", "field": "model"},
                    {"source": "meraki_devices", "field": "product_type"},
                    {"source": "meraki_devices", "field": "firmware"},
                    {"source": "meraki_devices", "field": "status"},
                    {"source": "meraki_networks", "field": "name"},
                    {"source": "meraki_devices", "field": "last_updated"},
                ],
                "filters": [],
                "sort": [{"source": "meraki_devices", "field": "firmware", "direction": "asc"}],
            },
        },
    ]

    db = SessionLocal()
    try:
        for tmpl in SYSTEM_TEMPLATES:
            existing = db.query(SavedReport).filter(
                SavedReport.system_slug == tmpl["system_slug"]
            ).first()
            if not existing:
                import copy
                report = SavedReport(
                    name=tmpl["name"],
                    folder=None,
                    config=tmpl["config"],
                    is_system=True,
                    system_slug=tmpl["system_slug"],
                    default_config=copy.deepcopy(tmpl["config"]),
                    created_by="system",
                )
                db.add(report)
        db.commit()
        print(f">> System report templates verified")
    except Exception as e:
        db.rollback()
        print(f"!! Failed to seed system reports: {e}")
    finally:
        db.close()


@app.on_event("startup")
async def startup_event():
    Base.metadata.create_all(bind=engine)

    # Migrate saved_reports table: add template columns if missing
    from sqlalchemy import text, inspect
    inspector = inspect(engine)
    if 'saved_reports' in inspector.get_table_names():
        existing_cols = {c['name'] for c in inspector.get_columns('saved_reports')}
        with engine.begin() as conn:
            if 'is_system' not in existing_cols:
                conn.execute(text("ALTER TABLE saved_reports ADD COLUMN is_system BOOLEAN DEFAULT FALSE"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_saved_reports_is_system ON saved_reports (is_system)"))
            if 'system_slug' not in existing_cols:
                conn.execute(text("ALTER TABLE saved_reports ADD COLUMN system_slug VARCHAR(50) UNIQUE"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_saved_reports_system_slug ON saved_reports (system_slug)"))
            if 'default_config' not in existing_cols:
                conn.execute(text("ALTER TABLE saved_reports ADD COLUMN default_config JSON"))

    seed_system_reports()

    print(">> ATLAS Systems Online: Database Connected & Routes Loaded.")
    print(">> Authentication: ENABLED")
    print(">> Rate Limiting: ENABLED")
    print(">> Security Headers: ENABLED")

    # Start the sync scheduler
    from app.services.sync_scheduler import start_scheduler
    start_scheduler()
    print(">> Sync Scheduler: ENABLED")


@app.on_event("shutdown")
async def shutdown_event():
    from app.services.sync_scheduler import stop_scheduler
    stop_scheduler()
    print(">> ATLAS Systems Offline: Scheduler stopped.")

# =============================================================================
# HEALTH CHECK (No auth required)
# =============================================================================
@app.get("/")
def read_root():
    return {
        "system": "ATLAS",
        "status": "Operational",
        "version": "1.1.8",
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

    iiq_cfg = get_iiq_config()
    connector = IIQConnector(
        iiq_cfg["url"], iiq_cfg["token"],
        site_id=iiq_cfg.get("site_id"), product_id=iiq_cfg.get("product_id")
    )
    result = connector.sync_record(db, serial)

    if result.get("status") == "error":
        print(f"!! Sync Failed: {result.get('message')}")
        raise HTTPException(status_code=404, detail=result.get("message", "Sync Failed"))

    print(f">> Sync Complete: {result}")
    return result

# NOTE: /test/seed-data endpoint REMOVED for security
