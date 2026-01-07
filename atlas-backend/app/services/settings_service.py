"""
ATLAS Settings Service
Handles reading/writing application settings with encryption for secrets.
"""
from typing import Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session

from app.models import AppSettings
from app.crypto import encrypt_value, decrypt_value


# Keys that should be encrypted
SECRET_KEYS = {
    "iiq_token",
    "google_credentials_json",
    "meraki_api_key",
    "oauth_client_secret",
}


def get_setting(db: Session, key: str) -> Optional[str]:
    """Get a single setting value, decrypting if necessary."""
    setting = db.query(AppSettings).filter(AppSettings.key == key).first()
    if not setting or setting.value is None:
        return None

    if setting.is_secret:
        return decrypt_value(setting.value)
    return setting.value


def get_all_settings(db: Session) -> Dict[str, Any]:
    """
    Get all settings as a dictionary.
    Secrets are returned as boolean (configured/not configured) rather than actual values.
    """
    settings = db.query(AppSettings).all()
    result = {}
    for s in settings:
        if s.is_secret:
            # Don't expose secrets - just indicate if configured
            result[s.key] = {"configured": bool(s.value), "is_secret": True}
        else:
            result[s.key] = s.value
    return result


def set_setting(db: Session, key: str, value: str, user_id: Optional[str] = None) -> None:
    """Set a single setting, encrypting if it's a secret."""
    is_secret = key in SECRET_KEYS
    stored_value = encrypt_value(value) if is_secret and value else value

    setting = db.query(AppSettings).filter(AppSettings.key == key).first()
    if setting:
        setting.value = stored_value
        setting.is_secret = is_secret
        setting.updated_at = datetime.utcnow()
        setting.updated_by = user_id
    else:
        setting = AppSettings(
            key=key,
            value=stored_value,
            is_secret=is_secret,
            updated_at=datetime.utcnow(),
            updated_by=user_id
        )
        db.add(setting)

    db.commit()


def set_multiple_settings(db: Session, settings: Dict[str, str], user_id: Optional[str] = None) -> None:
    """Set multiple settings at once."""
    for key, value in settings.items():
        set_setting(db, key, value, user_id)


def delete_setting(db: Session, key: str) -> bool:
    """Delete a setting. Returns True if deleted, False if not found."""
    setting = db.query(AppSettings).filter(AppSettings.key == key).first()
    if setting:
        db.delete(setting)
        db.commit()
        return True
    return False


def is_service_configured(db: Session, service: str) -> bool:
    """Check if a service has its required settings configured."""
    required_keys = {
        "iiq": ["iiq_url", "iiq_token", "iiq_site_id"],
        "google": ["google_credentials_json", "google_admin_email"],
        "meraki": ["meraki_api_key", "meraki_org_id"],
        "oauth": ["oauth_client_id", "oauth_client_secret", "oauth_allowed_domain"],
    }

    keys = required_keys.get(service, [])
    for key in keys:
        if not get_setting(db, key):
            return False
    return True
