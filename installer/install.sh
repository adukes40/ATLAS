#!/usr/bin/env bash

# ATLAS - Asset, Telemetry, Location, & Analytics System
# Simplified installer - credentials configured via web UI
#
# Usage: sudo bash install.sh
#
# This script will:
# - Install all required dependencies (PostgreSQL, Node.js, Python, Nginx)
# - Set up the ATLAS backend (FastAPI) and frontend (React/Vite)
# - Configure systemd services for automatic startup
# - Set up Nginx as a reverse proxy
# - Create the initial admin account
#
# All service credentials (IIQ, Google, Meraki, OAuth) are configured
# through the Settings page after installation.

set -e

# ============================================================================
# COLORS AND FORMATTING
# ============================================================================
RD=$(echo "\033[01;31m")
GN=$(echo "\033[1;92m")
YW=$(echo "\033[33m")
BL=$(echo "\033[36m")
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
# CONFIGURATION COLLECTION (Simplified)
# ============================================================================
collect_config() {
  echo ""
  echo -e "${BOLD}${BL}+-------------------------------------------------------------------+${CL}"
  echo -e "${BOLD}${BL}|                    CONFIGURATION                                  |${CL}"
  echo -e "${BOLD}${BL}+-------------------------------------------------------------------+${CL}"
  echo ""
  echo -e "  ${DIM}Service credentials (IIQ, Google, Meraki) will be configured${CL}"
  echo -e "  ${DIM}through the web interface after installation.${CL}"
  echo ""

  # Repository Selection
  echo -e "${YW}Step 1: Repository Selection${CL}"
  echo "  1) Production (Stable) - https://github.com/adukes40/ATLAS.git"
  echo "  2) Development (Testing) - https://github.com/hankscafe/ATLAS.git"
  read -p "  Select repository [1]: " REPO_CHOICE

  if [[ "$REPO_CHOICE" == "2" ]]; then
    GITHUB_REPO="https://github.com/hankscafe/ATLAS.git"
    echo -e "  ${GN}Selected: Development${CL}"
  else
    GITHUB_REPO="https://github.com/adukes40/ATLAS.git"
    echo -e "  ${GN}Selected: Production${CL}"
  fi
  echo ""

  # Server Configuration
  echo -e "${YW}Step 2: Server Configuration${CL}"
  read -p "  Enter your domain or hostname (e.g., atlas.yourdistrict.org): " ATLAS_DOMAIN
  if [[ -z "$ATLAS_DOMAIN" ]]; then
    ATLAS_DOMAIN="localhost"
  fi
  echo ""

  # Database Configuration
  echo -e "${YW}Step 3: Database Configuration${CL}"
  read -sp "  Enter PostgreSQL password (leave blank to generate): " DB_PASSWORD
  if [[ -n "$DB_PASSWORD" ]]; then
    echo -e " ${GN}[set]${CL}"
  else
    echo ""
    DB_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    echo -e "  ${DIM}Generated secure password${CL}"
  fi
  echo ""

  # Admin Account
  echo -e "${YW}Step 4: Admin Account${CL}"
  echo -e "  ${DIM}Create the first administrator account for ATLAS${CL}"
  echo ""

  read -p "  Admin username: " ADMIN_USERNAME
  while [[ -z "$ADMIN_USERNAME" ]]; do
    echo -e "  ${RD}Username cannot be empty${CL}"
    read -p "  Admin username: " ADMIN_USERNAME
  done

  while true; do
    read -sp "  Admin password (min 12 characters): " ADMIN_PASSWORD
    echo ""
    if [[ ${#ADMIN_PASSWORD} -lt 12 ]]; then
      echo -e "  ${RD}Password must be at least 12 characters${CL}"
      continue
    fi
    read -sp "  Confirm password: " ADMIN_PASSWORD_CONFIRM
    echo ""
    if [[ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_CONFIRM" ]]; then
      echo -e "  ${RD}Passwords do not match${CL}"
      continue
    fi
    break
  done
  echo ""

  # Generate SECRET_KEY and ENCRYPTION_KEY
  SECRET_KEY=$(openssl rand -hex 32)
  ENCRYPTION_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" 2>/dev/null || openssl rand -base64 32)

  # Review
  echo -e "${BOLD}${BL}+-------------------------------------------------------------------+${CL}"
  echo -e "${BOLD}${BL}|                    REVIEW CONFIGURATION                           |${CL}"
  echo -e "${BOLD}${BL}+-------------------------------------------------------------------+${CL}"
  echo ""
  echo -e "  ${BOLD}Repository:${CL} $GITHUB_REPO"
  echo -e "  ${BOLD}Server:${CL}     $ATLAS_DOMAIN"
  echo -e "  ${BOLD}Database:${CL}   atlas_db (user: atlas_admin)"
  echo -e "  ${BOLD}Admin:${CL}      $ADMIN_USERNAME"
  echo ""
  read -p "  Proceed with installation? [Y/n]: " PROCEED
  if [[ "$PROCEED" =~ ^[Nn] ]]; then
    echo ""
    msg_warn "Installation cancelled"
    exit 0
  fi
}

# ============================================================================
# INSTALLATION STEPS
# ============================================================================
install_dependencies() {
  echo -e " ${BL}[INFO]${CL} Updating package lists..."
  apt-get update -qq > /dev/null 2>&1 &
  spinner $!
  msg_ok "Package lists updated"

  echo ""
  echo -e " ${BL}[INFO]${CL} Installing system dependencies..."
  echo -e "        ${DIM}(This may take 2-3 minutes on first install)${CL}"
  echo ""

  local packages=(
    "curl wget git:Core utilities"
    "build-essential:Build tools"
    "python3 python3-pip python3-venv:Python environment"
    "postgresql postgresql-contrib:PostgreSQL database"
    "nginx:Web server"
    "certbot python3-certbot-nginx:SSL certificates"
  )

  for item in "${packages[@]}"; do
    local pkgs="${item%%:*}"
    local desc="${item##*:}"
    echo -ne "        ${DIM}Installing ${desc}...${CL}"
    if apt-get install -y -qq $pkgs > /dev/null 2>&1; then
      echo -e " ${GN}done${CL}"
    else
      echo -e " ${YW}skipped${CL}"
    fi
  done

  echo ""
  msg_ok "System dependencies installed"
}

install_nodejs() {
  if ! command -v node &> /dev/null; then
    echo -e " ${BL}[INFO]${CL} Installing Node.js $NODE_VERSION..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x 2>/dev/null | bash - > /dev/null 2>&1 &
    spinner $!
    apt-get install -y -qq nodejs > /dev/null 2>&1
    msg_ok "Node.js $(node --version) installed"
  else
    msg_ok "Node.js $(node --version) already installed"
  fi
}

setup_database() {
  msg_info "Configuring PostgreSQL database"

  # Create cluster if needed
  if ! pg_lsclusters -h 2>/dev/null | grep -q "online"; then
    PG_VERSION=$(ls /usr/lib/postgresql/ 2>/dev/null | sort -V | tail -1)
    if [[ -n "$PG_VERSION" ]]; then
      pg_createcluster "$PG_VERSION" main --start > /dev/null 2>&1 || true
    fi
  fi

  # Start PostgreSQL
  systemctl start postgresql > /dev/null 2>&1 || true
  systemctl enable postgresql > /dev/null 2>&1 || true
  sleep 3

  # Create user and database
  pg_exec() {
    su - postgres -c "psql -c \"$1\"" 2>&1
  }

  if su - postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='atlas_admin'\"" 2>/dev/null | grep -q "1"; then
    pg_exec "ALTER USER atlas_admin WITH PASSWORD '$DB_PASSWORD';" > /dev/null 2>&1
  else
    pg_exec "CREATE USER atlas_admin WITH PASSWORD '$DB_PASSWORD';" > /dev/null 2>&1
  fi

  if ! su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='atlas_db'\"" 2>/dev/null | grep -q "1"; then
    pg_exec "CREATE DATABASE atlas_db OWNER atlas_admin;" > /dev/null 2>&1
  fi

  pg_exec "GRANT ALL PRIVILEGES ON DATABASE atlas_db TO atlas_admin;" > /dev/null 2>&1 || true

  # Configure pg_hba.conf for password auth
  PG_HBA=$(find /etc/postgresql -name "pg_hba.conf" 2>/dev/null | head -1)
  if [[ -n "$PG_HBA" ]] && ! grep -q "^host.*all.*all.*127.0.0.1/32.*md5" "$PG_HBA" 2>/dev/null; then
    echo "host    all             all             127.0.0.1/32            md5" >> "$PG_HBA"
    echo "host    all             all             ::1/128                 md5" >> "$PG_HBA"
    systemctl reload postgresql > /dev/null 2>&1 || true
  fi

  msg_ok "PostgreSQL configured"
}

setup_directories() {
  msg_info "Creating directory structure"
  mkdir -p $ATLAS_DIR/{atlas-backend,atlas-ui,logs,backups,docs}
  mkdir -p $ATLAS_DIR/atlas-backend/{app,scripts}
  mkdir -p $ATLAS_DIR/atlas-backend/app/{routers,services,middleware}
  msg_ok "Directory structure created"
}

download_source() {
  msg_info "Downloading ATLAS source code"

  # Check if already a git repo (re-install scenario)
  if [[ -d "$ATLAS_DIR/.git" ]]; then
    cd $ATLAS_DIR
    git fetch origin $GITHUB_BRANCH > /dev/null 2>&1
    git reset --hard origin/$GITHUB_BRANCH > /dev/null 2>&1
    msg_ok "Source code updated from git"
    return
  fi

  # Fresh install - clone directly to ATLAS_DIR
  # First backup any existing files
  if [[ -f "$ATLAS_DIR/atlas-backend/.env" ]]; then
    cp $ATLAS_DIR/atlas-backend/.env /tmp/atlas-env-backup 2>/dev/null || true
  fi

  # Clone repo (full clone for update support)
  rm -rf /tmp/atlas-clone 2>/dev/null || true
  if git clone --branch "$GITHUB_BRANCH" "$GITHUB_REPO" /tmp/atlas-clone > /dev/null 2>&1; then
    # Move git repo contents to ATLAS_DIR
    rm -rf $ATLAS_DIR/.git 2>/dev/null || true
    mv /tmp/atlas-clone/.git $ATLAS_DIR/
    cp -r /tmp/atlas-clone/atlas-backend/* $ATLAS_DIR/atlas-backend/ 2>/dev/null || true
    cp -r /tmp/atlas-clone/atlas-ui/* $ATLAS_DIR/atlas-ui/ 2>/dev/null || true
    [[ -d "/tmp/atlas-clone/docs" ]] && cp -r /tmp/atlas-clone/docs/* $ATLAS_DIR/docs/ 2>/dev/null || true
    [[ -f "/tmp/atlas-clone/update.sh" ]] && cp /tmp/atlas-clone/update.sh $ATLAS_DIR/
    [[ -f "/tmp/atlas-clone/CLAUDE.md" ]] && cp /tmp/atlas-clone/CLAUDE.md $ATLAS_DIR/
    rm -rf /tmp/atlas-clone

    # Restore .env if it existed
    if [[ -f /tmp/atlas-env-backup ]]; then
      mv /tmp/atlas-env-backup $ATLAS_DIR/atlas-backend/.env
    fi

    msg_ok "Source code downloaded (git enabled for updates)"
  else
    if [[ -f "$ATLAS_DIR/atlas-backend/app/main.py" ]]; then
      msg_warn "Using existing source files"
    else
      msg_error "Failed to download source code"
      exit 1
    fi
  fi
}

create_config() {
  msg_info "Creating configuration files"

  # Create minimal .env - only database and secret key needed
  # All other credentials configured via web UI
  cat > $ATLAS_DIR/atlas-backend/.env << EOF
# ATLAS Environment Configuration
# Generated by installer on $(date)
#
# Service credentials (IIQ, Google, Meraki, OAuth) are configured
# through the Settings page in the web UI.

# Database
DATABASE_URL=postgresql://atlas_admin:${DB_PASSWORD}@localhost/atlas_db

# Security
SECRET_KEY=${SECRET_KEY}
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# CORS
ALLOWED_ORIGINS=http://${ATLAS_DOMAIN},https://${ATLAS_DOMAIN},http://localhost:5173
EOF

  chmod 600 $ATLAS_DIR/atlas-backend/.env

  # Frontend .env
  cat > $ATLAS_DIR/atlas-ui/.env << EOF
# ATLAS Frontend Configuration
# Generated by installer on $(date)
VITE_IIQ_URL=
EOF

  msg_ok "Configuration files created"
}

setup_python_env() {
  echo -e " ${BL}[INFO]${CL} Setting up Python virtual environment..."
  echo ""

  echo -ne "        ${DIM}Creating virtual environment...${CL}"
  python3 -m venv $VENV_DIR
  source $VENV_DIR/bin/activate
  echo -e " ${GN}done${CL}"

  echo -ne "        ${DIM}Upgrading pip...${CL}"
  pip install --upgrade pip -q > /dev/null 2>&1
  echo -e " ${GN}done${CL}"

  echo -ne "        ${DIM}Installing Python packages...${CL}"
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
    requests \
    bcrypt \
    cryptography \
    > /dev/null 2>&1 &
  spinner $!
  echo -e " ${GN}done${CL}"

  echo ""
  msg_ok "Python environment configured"
}

setup_nodejs_env() {
  echo -e " ${BL}[INFO]${CL} Building frontend..."
  echo ""

  cd $ATLAS_DIR/atlas-ui

  echo -ne "        ${DIM}Installing npm packages...${CL}"
  npm install --silent > /dev/null 2>&1 &
  spinner $!
  echo -e " ${GN}done${CL}"

  echo -ne "        ${DIM}Building React app...${CL}"
  npm run build --silent > /dev/null 2>&1 &
  spinner $!
  echo -e " ${GN}done${CL}"

  echo ""
  msg_ok "Frontend built"
}

create_service_user() {
  msg_info "Creating service user"

  if ! id -u $ATLAS_USER > /dev/null 2>&1; then
    useradd -r -s /bin/false $ATLAS_USER
  fi

  # Set ownership - atlas user owns most files
  chown -R $ATLAS_USER:$ATLAS_USER $ATLAS_DIR

  # Secure the .env file
  chmod 600 $ATLAS_DIR/atlas-backend/.env

  # Scripts: owned by root, readable/executable by atlas group (security hardening)
  # This prevents a compromised service from modifying its own sync scripts
  chown root:$ATLAS_USER $ATLAS_DIR/atlas-backend/scripts/*.py 2>/dev/null || true
  chmod 750 $ATLAS_DIR/atlas-backend/scripts/*.py 2>/dev/null || true

  msg_ok "Service user created"
}

create_systemd_services() {
  msg_info "Creating systemd services"

  cat > /etc/systemd/system/atlas.service << EOF
[Unit]
Description=ATLAS API Service (Asset, Telemetry, Location, & Analytics System)
After=network.target postgresql.service

[Service]
Type=simple
User=$ATLAS_USER
WorkingDirectory=$ATLAS_DIR/atlas-backend
Environment="PATH=$VENV_DIR/bin"
EnvironmentFile=$ATLAS_DIR/atlas-backend/.env
ExecStart=$VENV_DIR/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=$ATLAS_DIR/logs

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

    # Frontend
    location / {
        root $ATLAS_DIR/atlas-ui/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }

    # Authentication
    location /auth {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        root $ATLAS_DIR/atlas-ui/dist;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

  ln -sf /etc/nginx/sites-available/atlas /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
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
0 2 * * * $ATLAS_USER $VENV_DIR/bin/python $ATLAS_DIR/atlas-backend/scripts/google_bulk_sync.py >> $ATLAS_DIR/logs/google_sync.log 2>&1

# IIQ sync at 3 AM
0 3 * * * $ATLAS_USER $VENV_DIR/bin/python $ATLAS_DIR/atlas-backend/scripts/iiq_bulk_sync.py >> $ATLAS_DIR/logs/iiq_sync.log 2>&1

# Meraki sync at 4 AM
0 4 * * * $ATLAS_USER $VENV_DIR/bin/python $ATLAS_DIR/atlas-backend/scripts/meraki_bulk_sync.py >> $ATLAS_DIR/logs/meraki_sync.log 2>&1
EOF

  chmod 644 /etc/cron.d/atlas
  msg_ok "Cron jobs configured"
}

initialize_database() {
  msg_info "Initializing database"

  source $VENV_DIR/bin/activate
  cd $ATLAS_DIR/atlas-backend

  python3 << PYEOF
import sys
sys.path.insert(0, '/opt/atlas/atlas-backend')
from app.database import engine, Base
from app.models import *
Base.metadata.create_all(bind=engine)
print("Tables created")
PYEOF

  msg_ok "Database initialized"
}

create_admin_user() {
  msg_info "Creating admin user"

  source $VENV_DIR/bin/activate
  cd $ATLAS_DIR/atlas-backend

  python3 << PYEOF
import sys
sys.path.insert(0, '/opt/atlas/atlas-backend')
from app.database import SessionLocal
from app.services.local_auth import create_user

db = SessionLocal()
try:
    user, error = create_user(
        db,
        username="$ADMIN_USERNAME",
        password="$ADMIN_PASSWORD",
        role="admin",
        must_change_password=False,
        created_by="installer"
    )
    if user:
        print(f"Admin user '{user.username}' created")
    else:
        print(f"Note: {error}")
finally:
    db.close()
PYEOF

  msg_ok "Admin user created"
}

start_services() {
  msg_info "Starting services"

  systemctl enable atlas > /dev/null 2>&1
  systemctl enable nginx > /dev/null 2>&1
  systemctl enable postgresql > /dev/null 2>&1

  systemctl start atlas
  systemctl restart nginx

  sleep 2

  if systemctl is-active --quiet atlas; then
    msg_ok "Services started"
  else
    msg_warn "Backend may need attention - check: journalctl -u atlas"
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
  echo -e "${BOLD}Login:${CL}"
  echo -e "  Username: ${BL}$ADMIN_USERNAME${CL}"
  echo -e "  Password: (the one you entered during setup)"
  echo ""
  echo -e "${BOLD}Next Steps:${CL}"
  echo -e "  1. Log in to ATLAS"
  echo -e "  2. Go to ${YW}Settings${CL} to configure:"
  echo -e "     - Incident IQ credentials"
  echo -e "     - Google Admin credentials"
  echo -e "     - Meraki API credentials (optional)"
  echo -e "     - Google OAuth for SSO (optional)"
  echo ""
  echo -e "  3. (Recommended) Enable HTTPS:"
  echo -e "     ${YW}certbot --nginx -d $ATLAS_DOMAIN${CL}"
  echo ""
  echo -e "${BOLD}Service Commands:${CL}"
  echo -e "  Status:   systemctl status atlas"
  echo -e "  Logs:     journalctl -u atlas -f"
  echo -e "  Restart:  systemctl restart atlas"
  echo ""
  echo -e "${BOLD}Updates:${CL}"
  echo -e "  To update ATLAS in the future, run:"
  echo -e "     ${YW}cd /opt/atlas && sudo ./update.sh${CL}"
  echo ""
  echo -e "${DIM}Installation completed at $(date)${CL}"
  echo ""
}

# ============================================================================
# MAIN
# ============================================================================
main() {
  header_info
  check_root
  check_os
  collect_config

  echo ""
  echo -e "${BOLD}${BL}+-------------------------------------------------------------------+${CL}"
  echo -e "${BOLD}${BL}|                    INSTALLING ATLAS                               |${CL}"
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
  create_service_user
  create_systemd_services
  configure_nginx
  setup_cron_jobs
  initialize_database
  create_admin_user
  start_services
  print_summary
}

main "$@"
