# ATLAS Configuration
# Loads all settings from environment variables (.env file)

import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# =============================================================================
# IIQ (Incident IQ) Configuration
# =============================================================================
IIQ_URL = os.getenv("IIQ_URL")
IIQ_TOKEN = os.getenv("IIQ_TOKEN")
IIQ_SITE_ID = os.getenv("IIQ_SITE_ID")
IIQ_PRODUCT_ID = os.getenv("IIQ_PRODUCT_ID")

# =============================================================================
# Google Workspace Configuration
# =============================================================================
GOOGLE_CREDS_PATH = os.getenv("GOOGLE_CREDS_PATH", "google_credentials.json")
GOOGLE_ADMIN_EMAIL = os.getenv("GOOGLE_ADMIN_EMAIL")

# =============================================================================
# Meraki Configuration
# =============================================================================
MERAKI_API_KEY = os.getenv("MERAKI_API_KEY")
MERAKI_ORG_ID = os.getenv("MERAKI_ORG_ID")

# =============================================================================
# Security Configuration (for OAuth - Phase 2)
# =============================================================================
SECRET_KEY = os.getenv("SECRET_KEY")
ALLOWED_DOMAIN = os.getenv("ALLOWED_DOMAIN")  # Required - set in .env
REQUIRED_GROUP = os.getenv("REQUIRED_GROUP")

# =============================================================================
# Google OAuth Configuration (for Phase 2)
# =============================================================================
GOOGLE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID")
GOOGLE_OAUTH_CLIENT_SECRET = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET")


def validate_config():
    """Validate that required environment variables are set."""
    required = [
        "IIQ_URL",
        "IIQ_TOKEN",
        "GOOGLE_ADMIN_EMAIL",
        "MERAKI_API_KEY",
    ]
    missing = [var for var in required if not os.getenv(var)]
    if missing:
        raise ValueError(f"Missing required environment variables: {', '.join(missing)}")
