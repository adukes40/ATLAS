#!/usr/bin/env bash

# ATLAS - Asset, Telemetry, Location, & Analytics System
# One-line installer script
#
# Prerequisites: curl (install with: sudo apt install -y curl)
# Usage: sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/adukes40/ATLAS/main/installer/install.sh)"
#
# This script will:
# - Install all required dependencies (PostgreSQL, Node.js, Python, Nginx)
# - Set up the ATLAS backend (FastAPI) and frontend (React/Vite)
# - Configure systemd services for automatic startup
# - Set up Nginx as a reverse proxy
# - Create cron jobs for nightly data sync
#
# Tested on: Ubuntu 22.04 LTS, Debian 12

set -e

# ============================================================================
# COLORS AND FORMATTING
# ============================================================================
RD=$(echo "\033[01;31m")
GN=$(echo "\033[1;92m")
YW=$(echo "\033[33m")
BL=$(echo "\033[36m")
CM='\xE2\x9C\x94\033'
CL=$(echo "\033[m")
BOLD=$(echo "\033[1m")
DIM=$(echo "\033[2m")

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================
msg_info() { echo -ne " ${BL}[INFO]${CL} $1..."; }
msg_ok() { echo -e " ${GN}[OK]${CL} $1"; }
msg_error() { echo -e " ${RD}[ERROR]${CL} $1"; }
msg_warn() { echo -e " ${YW}[WARN]${CL} $1"; }

header_info() {
  clear
  cat <<"EOF"
    ___  ________    ___   ____
   /   |/_  __/ /   /   | / __/
  / /| | / / / /   / /| |_\ \
 / ___ |/ / / /___/ ___ /___/
/_/  |_/_/ /_____/_/  |_/____/

Asset, Telemetry, Location, & Analytics System
EOF
  echo -e "${BL}--------------------------------------------------------------------${CL}"
  echo -e "${DIM}IT Operations Platform for K-12 School Districts${CL}"
  echo -e "${BL}--------------------------------------------------------------------${CL}"
  echo ""
}

spinner() {
  local pid=$1
  local delay=0.1
  local spinstr='|/-\'
  while [ "$(ps a | awk '{print $1}' | grep $pid)" ]; do
    local temp=${spinstr#?}
    printf " [%c]  " "$spinstr"
    local spinstr=$temp${spinstr%"$temp"}
    sleep $delay
    printf "\b\b\b\b\b\b"
  done
  printf "    \b\b\b\b"
}

check_root() {
  if [[ $EUID -ne 0 ]]; then
    msg_error "This script must be run as root"
    exit 1
  fi
}

check_os() {
  if [[ ! -f /etc/os-release ]]; then
    msg_error "Cannot detect OS. /etc/os-release not found."
    exit 1
  fi

  . /etc/os-release

  if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
    msg_error "This installer requires Ubuntu or Debian. Detected: $ID"
    exit 1
  fi

  msg_ok "Detected OS: $PRETTY_NAME"
}

# ============================================================================
# INSTALLATION VARIABLES
# ============================================================================
ATLAS_DIR="/opt/atlas"
ATLAS_USER="atlas"
VENV_DIR="$ATLAS_DIR/atlas-backend/venv"
NODE_VERSION="20"

# GitHub repository
GITHUB_REPO="https://github.com/adukes40/ATLAS.git"
GITHUB_BRANCH="main"

# ============================================================================
# CREDENTIAL COLLECTION WIZARD
# ============================================================================
collect_credentials() {
  echo ""
  echo -e "${BOLD}${BL}+-------------------------------------------------------------------+${CL}"
  echo -e "${BOLD}${BL}|                    CONFIGURATION WIZARD                          |${CL}"
  echo -e "${BOLD}${BL}+-------------------------------------------------------------------+${CL}"
  echo ""

  # Domain/Hostname
  echo -e "${YW}Step 1/8: Server Configuration${CL}"
  read -p "  Enter your domain or hostname (e.g., atlas.yourdistrict.org): " ATLAS_DOMAIN
  if [[ -z "$ATLAS_DOMAIN" ]]; then
    ATLAS_DOMAIN="localhost"
  fi

  # Extract just the domain part for OAuth
  ALLOWED_DOMAIN=$(echo "$ATLAS_DOMAIN" | sed 's/.*\.\([^.]*\.[^.]*\)$/\1/' | sed 's/^[^.]*\.//')
  if [[ -z "$ALLOWED_DOMAIN" || "$ALLOWED_DOMAIN" == "$ATLAS_DOMAIN" ]]; then
    read -p "  Enter your email domain (e.g., yourdistrict.org): " ALLOWED_DOMAIN
  else
    echo -e "  ${DIM}Detected email domain: $ALLOWED_DOMAIN${CL}"
    read -p "  Press Enter to confirm or type a different domain: " DOMAIN_OVERRIDE
    if [[ -n "$DOMAIN_OVERRIDE" ]]; then
      ALLOWED_DOMAIN="$DOMAIN_OVERRIDE"
    fi
  fi
  echo ""

  # PostgreSQL Password
  echo -e "${YW}Step 2/8: Database Configuration${CL}"
  read -sp "  Enter PostgreSQL password for atlas user (leave blank to generate): " DB_PASSWORD
  echo ""
  if [[ -z "$DB_PASSWORD" ]]; then
    DB_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    echo -e "  ${DIM}Generated secure password${CL}"
  fi
  echo ""

  # IIQ Configuration
  echo -e "${YW}Step 3/8: Incident IQ (IIQ) Configuration${CL}"
  echo ""
  echo -e "  ${DIM}Where to find these values:${CL}"
  echo -e "  ${DIM}  - Login to IIQ as Admin${CL}"
  echo -e "  ${DIM}  - Go to Admin > Developer Tools${CL}"
  echo ""
  read -p "  IIQ Instance URL (e.g., https://yourdistrict.incidentiq.com): " IIQ_BASE_URL
  echo ""
  echo -e "  ${DIM}Site ID: Found at Admin > Developer Tools${CL}"
  read -p "  IIQ Site ID (UUID format): " IIQ_SITE_ID
  echo ""
  echo -e "  ${DIM}API Token: Create at Admin > Developer Tools > Create Token${CL}"
  read -sp "  IIQ API Token: " IIQ_TOKEN
  echo ""
  echo ""
  echo -e "  ${DIM}Product ID: Found at Admin > Developer Tools${CL}"
  echo -e "  ${DIM}  Common: Chromebooks = 88df910c-91aa-e711-80c2-0004ffa00050${CL}"
  read -p "  IIQ Product ID (press Enter for Chromebooks default): " IIQ_PRODUCT_ID
  if [[ -z "$IIQ_PRODUCT_ID" ]]; then
    IIQ_PRODUCT_ID="88df910c-91aa-e711-80c2-0004ffa00050"
    echo -e "  ${DIM}Using default Chromebooks Product ID${CL}"
  fi
  echo ""

  # Google Service Account Configuration
  echo -e "${YW}Step 4/8: Google Workspace - Service Account (for data sync)${CL}"
  echo -e "  ${DIM}You'll need a Service Account JSON file with Admin SDK access${CL}"
  echo -e "  ${DIM}Required scopes (domain-wide delegation):${CL}"
  echo -e "  ${DIM}  - https://www.googleapis.com/auth/admin.directory.device.chromeos.readonly${CL}"
  echo -e "  ${DIM}  - https://www.googleapis.com/auth/admin.directory.user.readonly${CL}"
  echo -e "  ${DIM}  - https://www.googleapis.com/auth/admin.directory.group.member.readonly${CL}"
  echo ""
  read -p "  Enter path to Google Service Account JSON file: " GOOGLE_CREDS_PATH
  read -p "  Enter admin email for domain-wide delegation: " GOOGLE_ADMIN_EMAIL
  echo ""

  # Google OAuth Configuration
  echo -e "${YW}Step 5/8: Google Workspace - OAuth (for user login)${CL}"
  echo -e "  ${DIM}Create OAuth 2.0 Client ID at Google Cloud Console:${CL}"
  echo -e "  ${DIM}  - APIs & Services > Credentials > Create Credentials > OAuth client ID${CL}"
  echo -e "  ${DIM}  - Application type: Web application${CL}"
  echo -e "  ${DIM}  - Authorized redirect URI: http://${ATLAS_DOMAIN}/auth/callback${CL}"
  echo ""
  read -p "  Google OAuth Client ID: " GOOGLE_OAUTH_CLIENT_ID
  read -sp "  Google OAuth Client Secret: " GOOGLE_OAUTH_CLIENT_SECRET
  echo ""
  echo ""

  # Access Control Group
  echo -e "${YW}Step 6/8: Access Control${CL}"
  echo -e "  ${DIM}Create a Google Group to control who can access ATLAS${CL}"
  echo -e "  ${DIM}Only members of this group will be able to sign in${CL}"
  echo ""
  read -p "  Google Group email for access control (e.g., atlas-users@${ALLOWED_DOMAIN}): " REQUIRED_GROUP
  echo ""

  # Meraki Configuration
  echo -e "${YW}Step 7/8: Cisco Meraki Configuration${CL}"
  read -sp "  Enter Meraki API Key: " MERAKI_API_KEY
  echo ""
  read -p "  Enter Meraki Organization ID: " MERAKI_ORG_ID
  echo ""

  # Generate SECRET_KEY
  SECRET_KEY=$(openssl rand -hex 32)

  # Confirmation
  echo -e "${YW}Step 8/8: Review Configuration${CL}"
  echo ""
  echo -e "  ${BOLD}Server:${CL}"
  echo -e "    Domain:        $ATLAS_DOMAIN"
  echo -e "    Email Domain:  $ALLOWED_DOMAIN"
  echo ""
  echo -e "  ${BOLD}Incident IQ:${CL}"
  echo -e "    URL:           $IIQ_BASE_URL"
  echo -e "    Site ID:       $IIQ_SITE_ID"
  echo -e "    Product ID:    $IIQ_PRODUCT_ID"
  echo ""
  echo -e "  ${BOLD}Google Workspace:${CL}"
  echo -e "    Admin Email:   $GOOGLE_ADMIN_EMAIL"
  echo -e "    OAuth Client:  ${GOOGLE_OAUTH_CLIENT_ID:0:20}..."
  echo ""
  echo -e "  ${BOLD}Access Control:${CL}"
  echo -e "    Required Group: $REQUIRED_GROUP"
  echo ""
  echo -e "  ${BOLD}Cisco Meraki:${CL}"
  echo -e "    Org ID:        $MERAKI_ORG_ID"
  echo ""
  read -p "  Proceed with installation? [Y/n]: " CONFIRM

  if [[ "$CONFIRM" =~ ^[Nn] ]]; then
    echo ""
    msg_warn "Installation cancelled by user"
    exit 0
  fi
}

# ============================================================================
# INSTALLATION STEPS
# ============================================================================
install_dependencies() {
  msg_info "Updating package lists"
  apt-get update -qq > /dev/null 2>&1
  msg_ok "Package lists updated"

  msg_info "Installing system dependencies"
  apt-get install -y -qq \
    curl \
    wget \
    git \
    build-essential \
    python3 \
    python3-pip \
    python3-venv \
    postgresql \
    postgresql-contrib \
    nginx \
    certbot \
    python3-certbot-nginx \
    supervisor \
    > /dev/null 2>&1
  msg_ok "System dependencies installed"
}

install_nodejs() {
  msg_info "Installing Node.js $NODE_VERSION"
  if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null 2>&1
  fi
  msg_ok "Node.js $(node --version) installed"
}

setup_database() {
  msg_info "Configuring PostgreSQL database"

  # Start PostgreSQL
  systemctl start postgresql
  systemctl enable postgresql > /dev/null 2>&1

  # Create user and database
  sudo -u postgres psql -c "CREATE USER atlas WITH PASSWORD '$DB_PASSWORD';" > /dev/null 2>&1 || true
  sudo -u postgres psql -c "CREATE DATABASE atlas OWNER atlas;" > /dev/null 2>&1 || true
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE atlas TO atlas;" > /dev/null 2>&1

  msg_ok "PostgreSQL database configured"
}

setup_directories() {
  msg_info "Creating directory structure"

  mkdir -p $ATLAS_DIR/{atlas-backend,atlas-ui,logs,backups,docs}
  mkdir -p $ATLAS_DIR/atlas-backend/{app,scripts}
  mkdir -p $ATLAS_DIR/atlas-backend/app/{routers,services,middleware}
  mkdir -p $ATLAS_DIR/atlas-ui/src

  msg_ok "Directory structure created"
}

download_source() {
  msg_info "Downloading ATLAS source code"

  # Clean up any existing temporary source
  rm -rf /tmp/atlas-source 2>/dev/null || true

  # Clone the repository
  if git clone --depth 1 --branch "$GITHUB_BRANCH" "$GITHUB_REPO" /tmp/atlas-source > /dev/null 2>&1; then
    # Copy backend files
    if [[ -d "/tmp/atlas-source/atlas-backend" ]]; then
      cp -r /tmp/atlas-source/atlas-backend/* $ATLAS_DIR/atlas-backend/
    fi

    # Copy frontend files
    if [[ -d "/tmp/atlas-source/atlas-ui" ]]; then
      cp -r /tmp/atlas-source/atlas-ui/* $ATLAS_DIR/atlas-ui/
    fi

    # Copy docs
    if [[ -d "/tmp/atlas-source/docs" ]]; then
      cp -r /tmp/atlas-source/docs/* $ATLAS_DIR/docs/
    fi

    rm -rf /tmp/atlas-source
    msg_ok "Source code downloaded"
  else
    # Fallback: check if files already exist (local development)
    if [[ -f "$ATLAS_DIR/atlas-backend/app/main.py" ]]; then
      msg_warn "Using existing source files (GitHub clone failed)"
    else
      msg_error "Failed to download source code from GitHub"
      msg_error "Please check the repository URL: $GITHUB_REPO"
      exit 1
    fi
  fi
}

create_config() {
  msg_info "Creating configuration files"

  # Create backend .env file
  cat > $ATLAS_DIR/atlas-backend/.env << EOF
# ATLAS Environment Configuration
# Generated by ATLAS installer on $(date)
# This file contains sensitive credentials - DO NOT commit to git

# =============================================================================
# DATABASE
# =============================================================================
DATABASE_URL=postgresql://atlas:${DB_PASSWORD}@localhost/atlas

# =============================================================================
# INCIDENT IQ (IIQ) API
# =============================================================================
IIQ_URL=${IIQ_BASE_URL}
IIQ_TOKEN=${IIQ_TOKEN}
IIQ_SITE_ID=${IIQ_SITE_ID}
IIQ_PRODUCT_ID=${IIQ_PRODUCT_ID}

# =============================================================================
# GOOGLE WORKSPACE API
# =============================================================================
GOOGLE_CREDS_PATH=/opt/atlas/atlas-backend/google_credentials.json
GOOGLE_ADMIN_EMAIL=${GOOGLE_ADMIN_EMAIL}

# =============================================================================
# CISCO MERAKI API
# =============================================================================
MERAKI_API_KEY=${MERAKI_API_KEY}
MERAKI_ORG_ID=${MERAKI_ORG_ID}

# =============================================================================
# SECURITY & AUTHENTICATION
# =============================================================================
SECRET_KEY=${SECRET_KEY}
ALLOWED_DOMAIN=${ALLOWED_DOMAIN}
REQUIRED_GROUP=${REQUIRED_GROUP}

# =============================================================================
# GOOGLE OAUTH
# =============================================================================
GOOGLE_OAUTH_CLIENT_ID=${GOOGLE_OAUTH_CLIENT_ID}
GOOGLE_OAUTH_CLIENT_SECRET=${GOOGLE_OAUTH_CLIENT_SECRET}

# =============================================================================
# CORS
# =============================================================================
ALLOWED_ORIGINS=http://${ATLAS_DOMAIN},https://${ATLAS_DOMAIN},http://localhost:5173
EOF

  # Set secure permissions on backend .env
  chmod 600 $ATLAS_DIR/atlas-backend/.env

  # Create frontend .env file (for Vite build-time variables)
  cat > $ATLAS_DIR/atlas-ui/.env << EOF
# ATLAS Frontend Configuration
# Generated by ATLAS installer on $(date)

# IIQ domain for direct linking in Device 360
VITE_IIQ_URL=${IIQ_BASE_URL}
EOF

  # Copy Google credentials if provided
  if [[ -f "$GOOGLE_CREDS_PATH" ]]; then
    cp "$GOOGLE_CREDS_PATH" $ATLAS_DIR/atlas-backend/google_credentials.json
    chmod 600 $ATLAS_DIR/atlas-backend/google_credentials.json
    msg_ok "Google credentials copied"
  else
    msg_warn "Google credentials file not found at $GOOGLE_CREDS_PATH"
    msg_warn "You'll need to manually copy your service account JSON to:"
    msg_warn "  $ATLAS_DIR/atlas-backend/google_credentials.json"
  fi

  msg_ok "Configuration files created"
}

setup_python_env() {
  msg_info "Setting up Python virtual environment"

  python3 -m venv $VENV_DIR
  source $VENV_DIR/bin/activate

  pip install --upgrade pip -q
  pip install -q \
    fastapi \
    uvicorn[standard] \
    sqlalchemy \
    psycopg2-binary \
    python-dotenv \
    httpx \
    google-api-python-client \
    google-auth \
    python-multipart \
    aiofiles \
    authlib \
    itsdangerous \
    slowapi \
    requests

  msg_ok "Python environment configured"
}

setup_nodejs_env() {
  msg_info "Installing Node.js dependencies and building frontend"

  cd $ATLAS_DIR/atlas-ui

  npm install --silent 2>/dev/null
  npm run build --silent 2>/dev/null || true

  msg_ok "Frontend built"
}

create_systemd_services() {
  msg_info "Creating systemd services"

  # Backend API service
  cat > /etc/systemd/system/atlas.service << EOF
[Unit]
Description=ATLAS API Service
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=$ATLAS_DIR/atlas-backend
Environment="PATH=$VENV_DIR/bin"
EnvironmentFile=$ATLAS_DIR/atlas-backend/.env
ExecStart=$VENV_DIR/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload

  msg_ok "Systemd services created"
}

configure_nginx() {
  msg_info "Configuring Nginx"

  cat > /etc/nginx/sites-available/atlas << EOF
server {
    listen 80;
    server_name $ATLAS_DOMAIN;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Frontend (Vite build output)
    location / {
        root $ATLAS_DIR/atlas-ui/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API proxy
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Authentication endpoints (Google OAuth)
    location /auth {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        root $ATLAS_DIR/atlas-ui/dist;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

  # Enable site
  ln -sf /etc/nginx/sites-available/atlas /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

  # Test and reload
  nginx -t > /dev/null 2>&1
  systemctl reload nginx

  msg_ok "Nginx configured"
}

setup_cron_jobs() {
  msg_info "Setting up sync cron jobs"

  cat > /etc/cron.d/atlas << EOF
# ATLAS Sync Jobs
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Google sync at 2 AM
0 2 * * * root $VENV_DIR/bin/python $ATLAS_DIR/atlas-backend/scripts/google_bulk_sync.py >> $ATLAS_DIR/logs/google_sync.log 2>&1

# IIQ sync at 3 AM
0 3 * * * root $VENV_DIR/bin/python $ATLAS_DIR/atlas-backend/scripts/iiq_bulk_sync.py >> $ATLAS_DIR/logs/iiq_sync.log 2>&1
EOF

  chmod 644 /etc/cron.d/atlas

  msg_ok "Cron jobs configured"
}

initialize_database() {
  msg_info "Initializing database tables"

  # Create a simple initialization script
  cat > /tmp/init_db.py << 'PYEOF'
import sys
sys.path.insert(0, '/opt/atlas/atlas-backend')

from app.database import engine, Base
from app.models import *

print("Creating database tables...")
Base.metadata.create_all(bind=engine)
print("Done!")
PYEOF

  source $VENV_DIR/bin/activate
  cd $ATLAS_DIR/atlas-backend
  python /tmp/init_db.py 2>/dev/null || true
  rm /tmp/init_db.py

  msg_ok "Database initialized"
}

start_services() {
  msg_info "Starting ATLAS services"

  systemctl enable atlas > /dev/null 2>&1
  systemctl enable nginx > /dev/null 2>&1
  systemctl enable postgresql > /dev/null 2>&1

  systemctl start atlas
  systemctl restart nginx

  # Wait a moment for the service to start
  sleep 2

  # Check if backend is running
  if systemctl is-active --quiet atlas; then
    msg_ok "Services started successfully"
  else
    msg_warn "Backend service may need attention - check: journalctl -u atlas"
  fi
}

print_summary() {
  echo ""
  echo -e "${GN}--------------------------------------------------------------------${CL}"
  echo -e "${GN}                    INSTALLATION COMPLETE!                          ${CL}"
  echo -e "${GN}--------------------------------------------------------------------${CL}"
  echo ""
  echo -e "${BOLD}Access ATLAS:${CL}"
  echo -e "  URL: ${BL}http://$ATLAS_DOMAIN${CL}"
  echo ""
  echo -e "${BOLD}Authentication:${CL}"
  echo -e "  Users must sign in with @${ALLOWED_DOMAIN} Google accounts"
  echo -e "  Users must be members of: ${REQUIRED_GROUP}"
  echo ""
  echo -e "${BOLD}Service Commands:${CL}"
  echo -e "  ${DIM}Backend:${CL}  systemctl {start|stop|restart|status} atlas"
  echo ""
  echo -e "${BOLD}Log Files:${CL}"
  echo -e "  ${DIM}Backend:${CL}  journalctl -u atlas -f"
  echo -e "  ${DIM}Syncs:${CL}    $ATLAS_DIR/logs/"
  echo ""
  echo -e "${BOLD}Configuration:${CL}"
  echo -e "  ${DIM}Environment:${CL} $ATLAS_DIR/atlas-backend/.env"
  echo -e "  ${DIM}Nginx:${CL}       /etc/nginx/sites-available/atlas"
  echo ""
  echo -e "${BOLD}Next Steps:${CL}"
  echo -e "  1. Run initial IIQ sync:"
  echo -e "     ${YW}$VENV_DIR/bin/python $ATLAS_DIR/atlas-backend/scripts/iiq_bulk_sync.py${CL}"
  echo ""
  echo -e "  2. Run initial Google sync:"
  echo -e "     ${YW}$VENV_DIR/bin/python $ATLAS_DIR/atlas-backend/scripts/google_bulk_sync.py${CL}"
  echo ""
  echo -e "  3. (Recommended) Enable HTTPS with Let's Encrypt:"
  echo -e "     ${YW}certbot --nginx -d $ATLAS_DOMAIN${CL}"
  echo -e "     Then update Google OAuth redirect URI to use https://"
  echo ""
  echo -e "${BOLD}Sync Schedule (Cron):${CL}"
  echo -e "  ${DIM}2:00 AM${CL}  Google devices sync"
  echo -e "  ${DIM}3:00 AM${CL}  IIQ assets + users sync"
  echo ""
  echo -e "${DIM}Installation completed at $(date)${CL}"
  echo ""
}

# ============================================================================
# MAIN INSTALLATION FLOW
# ============================================================================
main() {
  header_info
  check_root
  check_os

  echo ""
  collect_credentials

  echo ""
  echo -e "${BOLD}${BL}+-------------------------------------------------------------------+${CL}"
  echo -e "${BOLD}${BL}|                    INSTALLING ATLAS                              |${CL}"
  echo -e "${BOLD}${BL}+-------------------------------------------------------------------+${CL}"
  echo ""

  install_dependencies
  install_nodejs
  setup_database
  setup_directories
  download_source
  create_config
  setup_python_env
  setup_nodejs_env
  create_systemd_services
  configure_nginx
  setup_cron_jobs
  initialize_database
  start_services

  print_summary
}

# Run main function
main "$@"
