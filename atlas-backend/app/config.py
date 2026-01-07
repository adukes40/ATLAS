# ATLAS Configuration
# Core settings from .env, service credentials from database.

import os
from typing import Optional, Dict, Any
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# =============================================================================
# Bootstrap Configuration (always from .env - needed before DB access)
# =============================================================================
DATABASE_URL = os.getenv("DATABASE_URL")
SECRET_KEY = os.getenv("SECRET_KEY")
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")

# Legacy fallbacks - used during migration from .env to database
_ENV_FALLBACKS = {
    "iiq_url": os.getenv("IIQ_URL"),
    "iiq_token": os.getenv("IIQ_TOKEN"),
    "iiq_site_id": os.getenv("IIQ_SITE_ID"),
    "iiq_product_id": os.getenv("IIQ_PRODUCT_ID"),
    "google_admin_email": os.getenv("GOOGLE_ADMIN_EMAIL"),
    "google_creds_path": os.getenv("GOOGLE_CREDS_PATH", "google_credentials.json"),
    "meraki_api_key": os.getenv("MERAKI_API_KEY"),
    "meraki_org_id": os.getenv("MERAKI_ORG_ID"),
    "oauth_client_id": os.getenv("GOOGLE_OAUTH_CLIENT_ID"),
    "oauth_client_secret": os.getenv("GOOGLE_OAUTH_CLIENT_SECRET"),
    "oauth_allowed_domain": os.getenv("ALLOWED_DOMAIN"),
    "oauth_required_group": os.getenv("REQUIRED_GROUP"),
}


# =============================================================================
# Settings Cache
# =============================================================================
_settings_cache: Dict[str, Any] = {}
_cache_loaded = False


def _load_settings_cache():
    """Load all settings from database into cache."""
    global _settings_cache, _cache_loaded

    try:
        # Avoid circular imports
        from app.database import SessionLocal
        from app.services.settings_service import get_setting

        db = SessionLocal()
        try:
            # Load all known settings keys
            setting_keys = [
                "iiq_url", "iiq_token", "iiq_site_id", "iiq_product_id",
                "google_admin_email", "google_credentials_json",
                "meraki_api_key", "meraki_org_id",
                "oauth_enabled", "oauth_client_id", "oauth_client_secret",
                "oauth_allowed_domain", "oauth_required_group",
            ]

            for key in setting_keys:
                value = get_setting(db, key)
                if value is not None:
                    _settings_cache[key] = value

            _cache_loaded = True
        finally:
            db.close()
    except Exception as e:
        # During initial setup, database might not have settings table yet
        print(f"[Config] Could not load settings from database: {e}")
        _cache_loaded = True  # Mark as loaded to avoid repeated failures


def get_config(key: str, default: Optional[str] = None) -> Optional[str]:
    """
    Get a configuration value.
    Checks database cache first, falls back to .env for migration period.
    """
    global _cache_loaded

    # Lazy load settings on first access
    if not _cache_loaded:
        _load_settings_cache()

    # Check cache first
    if key in _settings_cache:
        return _settings_cache[key]

    # Fall back to environment variable
    return _ENV_FALLBACKS.get(key, default)


def refresh_config():
    """Force reload of settings from database."""
    global _cache_loaded, _settings_cache
    _cache_loaded = False
    _settings_cache = {}
    _load_settings_cache()


def get_config_direct(key: str) -> Optional[str]:
    """
    Get a configuration value directly from database (bypasses cache).
    Useful for settings pages that need fresh values.
    """
    from app.database import SessionLocal
    from app.services.settings_service import get_setting

    db = SessionLocal()
    try:
        return get_setting(db, key)
    finally:
        db.close()


# =============================================================================
# Service Configuration Helpers
# =============================================================================
def get_iiq_config() -> Dict[str, Optional[str]]:
    """Get IIQ configuration."""
    return {
        "url": get_config("iiq_url"),
        "token": get_config("iiq_token"),
        "site_id": get_config("iiq_site_id"),
        "product_id": get_config("iiq_product_id"),
    }


def get_google_config() -> Dict[str, Optional[str]]:
    """Get Google Admin configuration."""
    # Check for credentials in database first
    creds_json = get_config("google_credentials_json")

    return {
        "admin_email": get_config("google_admin_email"),
        "credentials_json": creds_json,
        # Fallback to file path if no JSON in database
        "credentials_path": get_config("google_creds_path") if not creds_json else None,
    }


def get_meraki_config() -> Dict[str, Optional[str]]:
    """Get Meraki configuration."""
    return {
        "api_key": get_config("meraki_api_key"),
        "org_id": get_config("meraki_org_id"),
    }


def get_oauth_config() -> Dict[str, Any]:
    """Get OAuth configuration."""
    enabled = get_config("oauth_enabled")
    return {
        "enabled": enabled == "true" if enabled else False,
        "client_id": get_config("oauth_client_id"),
        "client_secret": get_config("oauth_client_secret"),
        "allowed_domain": get_config("oauth_allowed_domain"),
        "required_group": get_config("oauth_required_group"),
    }
