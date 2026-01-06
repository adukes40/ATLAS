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

# Component flags (all enabled by default)
ENABLE_IIQ=true
ENABLE_GOOGLE=true
ENABLE_MERAKI=true

# Config save file for resume capability
CONFIG_SAVE_FILE="/tmp/atlas-install-config"

# ============================================================================
# SAVE/LOAD CONFIG FOR RESUME
# ============================================================================
save_config() {
  cat > "$CONFIG_SAVE_FILE" << EOF
# ATLAS Install Config - saved $(date)
ENABLE_IIQ=$ENABLE_IIQ
ENABLE_GOOGLE=$ENABLE_GOOGLE
ENABLE_MERAKI=$ENABLE_MERAKI
ATLAS_DOMAIN="$ATLAS_DOMAIN"
ALLOWED_DOMAIN="$ALLOWED_DOMAIN"
DB_PASSWORD="$DB_PASSWORD"
IIQ_SUBDOMAIN="$IIQ_SUBDOMAIN"
IIQ_BASE_URL="$IIQ_BASE_URL"
IIQ_SITE_ID="$IIQ_SITE_ID"
IIQ_TOKEN="$IIQ_TOKEN"
IIQ_PRODUCT_ID="$IIQ_PRODUCT_ID"
GOOGLE_CREDS_PATH="$GOOGLE_CREDS_PATH"
GOOGLE_ADMIN_EMAIL="$GOOGLE_ADMIN_EMAIL"
GOOGLE_OAUTH_CLIENT_ID="$GOOGLE_OAUTH_CLIENT_ID"
GOOGLE_OAUTH_CLIENT_SECRET="$GOOGLE_OAUTH_CLIENT_SECRET"
REQUIRED_GROUP="$REQUIRED_GROUP"
MERAKI_API_KEY="$MERAKI_API_KEY"
MERAKI_ORG_ID="$MERAKI_ORG_ID"
SECRET_KEY="$SECRET_KEY"
EOF
  chmod 600 "$CONFIG_SAVE_FILE"
}

load_config() {
  if [[ -f "$CONFIG_SAVE_FILE" ]]; then
    source "$CONFIG_SAVE_FILE"
    return 0
  fi
  return 1
}

check_resume() {
  if [[ -f "$CONFIG_SAVE_FILE" ]]; then
    echo ""
    echo -e "${YW}Previous installation config found!${CL}"
    echo ""
    echo -e "  ${DIM}Saved: $(head -1 "$CONFIG_SAVE_FILE" | sed 's/# ATLAS Install Config - saved //')${CL}"
    echo -e "  ${DIM}Domain: $(grep ATLAS_DOMAIN "$CONFIG_SAVE_FILE" | cut -d'"' -f2)${CL}"
    echo ""
    read -p "  Resume with saved configuration? [Y/n]: " RESUME_CHOICE
    if [[ ! "$RESUME_CHOICE" =~ ^[Nn] ]]; then
      load_config
      echo ""
      msg_ok "Configuration loaded"
      return 0
    else
      rm -f "$CONFIG_SAVE_FILE"
      echo -e "  ${DIM}Starting fresh...${CL}"
    fi
  fi
  return 1
}

cleanup_config() {
  rm -f "$CONFIG_SAVE_FILE" 2>/dev/null || true
}

# ============================================================================
# COMPONENT SELECTION
# ============================================================================
select_components() {
  echo ""
  echo -e "${BOLD}${BL}+-------------------------------------------------------------------+${CL}"
  echo -e "${BOLD}${BL}|                    DATA SOURCE SELECTION                         |${CL}"
  echo -e "${BOLD}${BL}+-------------------------------------------------------------------+${CL}"
  echo ""
  echo -e "  ${DIM}ATLAS can integrate with multiple data sources.${CL}"
  echo -e "  ${DIM}Select which integrations you want to configure:${CL}"
  echo ""

  # IIQ Selection
  echo -e "  ${BOLD}[1] Incident IQ (IIQ)${CL}"
  echo -e "      ${DIM}Asset management, user data, fees, tickets${CL}"
  read -p "      Enable IIQ integration? [Y/n]: " IIQ_CHOICE
  if [[ "$IIQ_CHOICE" =~ ^[Nn] ]]; then
    ENABLE_IIQ=false
    echo -e "      ${YW}IIQ disabled${CL}"
  else
    ENABLE_IIQ=true
    echo -e "      ${GN}IIQ enabled${CL}"
  fi
  echo ""

  # Google Selection
  echo -e "  ${BOLD}[2] Google Workspace${CL}"
  echo -e "      ${DIM}ChromeOS devices, user directory, OAuth login${CL}"
  read -p "      Enable Google integration? [Y/n]: " GOOGLE_CHOICE
  if [[ "$GOOGLE_CHOICE" =~ ^[Nn] ]]; then
    ENABLE_GOOGLE=false
    echo -e "      ${YW}Google disabled${CL}"
    echo ""
    echo -e "      ${RD}WARNING: Google OAuth is required for user authentication.${CL}"
    echo -e "      ${RD}Without it, ATLAS will have no login mechanism.${CL}"
    read -p "      Are you sure you want to disable Google? [y/N]: " GOOGLE_CONFIRM
    if [[ ! "$GOOGLE_CONFIRM" =~ ^[Yy] ]]; then
      ENABLE_GOOGLE=true
      echo -e "      ${GN}Google re-enabled${CL}"
    fi
  else
    ENABLE_GOOGLE=true
    echo -e "      ${GN}Google enabled${CL}"
  fi
  echo ""

  # Meraki Selection
  echo -e "  ${BOLD}[3] Cisco Meraki${CL}"
  echo -e "      ${DIM}Network location, AP connections, client tracking${CL}"
  read -p "      Enable Meraki integration? [Y/n]: " MERAKI_CHOICE
  if [[ "$MERAKI_CHOICE" =~ ^[Nn] ]]; then
    ENABLE_MERAKI=false
    echo -e "      ${YW}Meraki disabled${CL}"
  else
    ENABLE_MERAKI=true
    echo -e "      ${GN}Meraki enabled${CL}"
  fi
  echo ""

  # Summary
  echo -e "  ${BOLD}Selected Components:${CL}"
  [[ "$ENABLE_IIQ" == true ]] && echo -e "    ${GN}[x]${CL} Incident IQ" || echo -e "    ${DIM}[ ]${CL} Incident IQ"
  [[ "$ENABLE_GOOGLE" == true ]] && echo -e "    ${GN}[x]${CL} Google Workspace" || echo -e "    ${DIM}[ ]${CL} Google Workspace"
  [[ "$ENABLE_MERAKI" == true ]] && echo -e "    ${GN}[x]${CL} Cisco Meraki" || echo -e "    ${DIM}[ ]${CL} Cisco Meraki"
  echo ""

  read -p "  Continue with these selections? [Y/n]: " COMPONENT_CONFIRM
  if [[ "$COMPONENT_CONFIRM" =~ ^[Nn] ]]; then
    select_components
  fi
}

# ============================================================================
# INDIVIDUAL CREDENTIAL COLLECTION FUNCTIONS
# ============================================================================
collect_server_config() {
  echo ""
  echo -e "${YW}Server Configuration${CL}"
  read -p "  Enter your domain or hostname (e.g., atlas.yourdistrict.org): " ATLAS_DOMAIN
  if [[ -z "$ATLAS_DOMAIN" ]]; then
    ATLAS_DOMAIN="localhost"
  fi

  # Extract email domain by removing the hostname (first part)
  # atlas.cr.k12.de.us -> cr.k12.de.us
  # atlas.mydistrict.org -> mydistrict.org
  # lookup.example.com -> example.com
  if [[ "$ATLAS_DOMAIN" == *"."*"."* ]]; then
    # Has at least 2 dots - strip the first part (hostname)
    ALLOWED_DOMAIN=$(echo "$ATLAS_DOMAIN" | sed 's/^[^.]*\.//')
    echo -e "  ${GN}Email domain: $ALLOWED_DOMAIN${CL}"
  else
    # Simple domain or can't detect - ask
    read -p "  Enter your email domain (e.g., yourdistrict.org): " ALLOWED_DOMAIN
  fi
}

collect_database_config() {
  echo ""
  echo -e "${YW}Database Configuration${CL}"
  read -sp "  Enter PostgreSQL password for atlas user (leave blank to generate): " DB_PASSWORD
  if [[ -n "$DB_PASSWORD" ]]; then
    echo -e " ${GN}[•••••]${CL}"
  else
    echo ""
    DB_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    echo -e "  ${DIM}Generated secure password${CL}"
  fi
}

collect_iiq_config() {
  echo ""
  echo -e "${YW}Incident IQ (IIQ) Configuration${CL}"
  echo ""
  echo -e "  ${DIM}Where to find these values:${CL}"
  echo -e "  ${DIM}  - Login to IIQ as Admin${CL}"
  echo -e "  ${DIM}  - Go to Admin > Developer Tools${CL}"
  echo ""

  # Smart URL construction from subdomain
  echo -e "  ${DIM}Enter your IIQ instance ID (the part before .incidentiq.com)${CL}"
  echo -e "  ${DIM}Example: If your URL is https://mydistrict.incidentiq.com, enter: mydistrict${CL}"
  read -p "  IIQ Instance ID: " IIQ_SUBDOMAIN

  # Strip any accidental full URL or .incidentiq.com suffix
  IIQ_SUBDOMAIN=$(echo "$IIQ_SUBDOMAIN" | sed 's|https\?://||' | sed 's|\.incidentiq\.com.*||')

  # Construct full URL
  IIQ_BASE_URL="https://${IIQ_SUBDOMAIN}.incidentiq.com"
  echo -e "  ${GN}URL: ${IIQ_BASE_URL}${CL}"
  echo ""

  echo -e "  ${DIM}Site ID: Found at Admin > Developer Tools${CL}"
  read -p "  IIQ Site ID (UUID format): " IIQ_SITE_ID
  echo ""
  echo -e "  ${DIM}API Token: Create at Admin > Developer Tools > Create Token${CL}"
  read -sp "  IIQ API Token: " IIQ_TOKEN
  echo -e " ${GN}[•••••]${CL}"
  echo ""
  echo -e "  ${DIM}Product ID: Found at Admin > Developer Tools${CL}"
  read -p "  IIQ Product ID: " IIQ_PRODUCT_ID
}

collect_google_service_account() {
  echo ""
  echo -e "${YW}Google Workspace - Service Account (for data sync)${CL}"
  echo -e "  ${DIM}You'll need a Service Account JSON file with Admin SDK access${CL}"
  echo -e "  ${DIM}Required scopes (domain-wide delegation):${CL}"
  echo -e "  ${DIM}  - https://www.googleapis.com/auth/admin.directory.device.chromeos.readonly${CL}"
  echo -e "  ${DIM}  - https://www.googleapis.com/auth/admin.directory.user.readonly${CL}"
  echo -e "  ${DIM}  - https://www.googleapis.com/auth/admin.directory.group.member.readonly${CL}"
  echo ""

  echo -e "  ${BOLD}How do you want to provide the credentials?${CL}"
  echo -e "    ${DIM}1) Paste base64-encoded JSON (recommended - most reliable)${CL}"
  echo -e "    ${DIM}2) Paste raw JSON content${CL}"
  echo -e "    ${DIM}3) Specify path to existing file${CL}"
  read -p "  Choice [1/2/3]: " CREDS_CHOICE

  GOOGLE_CREDS_PATH="/opt/atlas/atlas-backend/google_credentials.json"
  mkdir -p /opt/atlas/atlas-backend

  if [[ "$CREDS_CHOICE" == "3" ]]; then
    # Existing file path
    while true; do
      read -p "  Enter path to Google Service Account JSON file: " GOOGLE_CREDS_PATH
      if [[ -f "$GOOGLE_CREDS_PATH" ]]; then
        # Validate JSON
        if python3 -c "import json; json.load(open('$GOOGLE_CREDS_PATH'))" 2>/dev/null; then
          echo -e "  ${GN}Valid JSON file found${CL}"
          break
        else
          echo -e "  ${RD}File exists but is not valid JSON${CL}"
        fi
      else
        echo -e "  ${RD}File not found: $GOOGLE_CREDS_PATH${CL}"
      fi
    done

  elif [[ "$CREDS_CHOICE" == "1" ]]; then
    # Base64 encoded (most reliable)
    echo ""
    echo -e "  ${DIM}On the machine with your credentials file, run:${CL}"
    echo -e "  ${YW}base64 -w0 google_credentials.json && echo${CL}"
    echo ""
    echo -e "  ${DIM}Then paste the output here (single line):${CL}"

    while true; do
      read -p "  Base64 string: " BASE64_CREDS
      if echo "$BASE64_CREDS" | base64 -d > "$GOOGLE_CREDS_PATH" 2>/dev/null; then
        # Validate JSON
        if python3 -c "import json; json.load(open('$GOOGLE_CREDS_PATH'))" 2>/dev/null; then
          chmod 600 "$GOOGLE_CREDS_PATH"
          echo -e "  ${GN}Credentials decoded and validated successfully${CL}"
          break
        else
          echo -e "  ${RD}Decoded content is not valid JSON. Please try again.${CL}"
        fi
      else
        echo -e "  ${RD}Invalid base64 string. Please try again.${CL}"
      fi
    done

  else
    # Raw JSON paste (option 2 or default)
    echo ""
    echo -e "  ${YW}WARNING: Raw paste can corrupt the private key due to line breaks.${CL}"
    echo -e "  ${YW}Base64 method (option 1) is more reliable.${CL}"
    echo ""
    echo -e "  ${DIM}Paste your Google Service Account JSON below.${CL}"
    echo -e "  ${DIM}After pasting, press Enter, then Ctrl+D to finish:${CL}"
    echo ""

    # Read multiline input
    CREDS_CONTENT=$(cat)
    echo "$CREDS_CONTENT" > "$GOOGLE_CREDS_PATH"
    chmod 600 "$GOOGLE_CREDS_PATH"

    # Validate JSON with Python
    if python3 -c "import json; json.load(open('$GOOGLE_CREDS_PATH'))" 2>/dev/null; then
      echo -e "  ${GN}Credentials saved and validated${CL}"
    else
      echo -e "  ${RD}WARNING: JSON validation failed!${CL}"
      echo -e "  ${RD}The private key may have been corrupted during paste.${CL}"
      echo -e "  ${YW}Recommendation: Re-run installer and use base64 method (option 1)${CL}"
      echo ""
      read -p "  Continue anyway? [y/N]: " CONTINUE_ANYWAY
      if [[ ! "$CONTINUE_ANYWAY" =~ ^[Yy] ]]; then
        echo -e "  ${DIM}Restarting credentials collection...${CL}"
        collect_google_service_account
        return
      fi
    fi
  fi

  echo ""
  read -p "  Enter admin email for domain-wide delegation: " GOOGLE_ADMIN_EMAIL
}

collect_google_oauth() {
  echo ""
  echo -e "${YW}Google Workspace - OAuth (for user login)${CL}"
  echo -e "  ${DIM}Create OAuth 2.0 Client ID at Google Cloud Console:${CL}"
  echo -e "  ${DIM}  - APIs & Services > Credentials > Create Credentials > OAuth client ID${CL}"
  echo -e "  ${DIM}  - Application type: Web application${CL}"
  echo -e "  ${DIM}  - Authorized redirect URI: http://<your-atlas-domain>/auth/callback${CL}"
  echo ""
  read -p "  Google OAuth Client ID: " GOOGLE_OAUTH_CLIENT_ID
  read -sp "  Google OAuth Client Secret: " GOOGLE_OAUTH_CLIENT_SECRET
  echo -e " ${GN}[•••••]${CL}"
}

collect_access_control() {
  echo ""
  echo -e "${YW}Access Control${CL}"
  echo -e "  ${DIM}Create a Google Group to control who can access ATLAS${CL}"
  echo -e "  ${DIM}Only members of this group will be able to sign in${CL}"
  echo ""
  read -p "  Google Group email for access control (e.g., atlas-users@yourdomain.org): " REQUIRED_GROUP
}

collect_meraki_config() {
  echo ""
  echo -e "${YW}Cisco Meraki Configuration${CL}"
  read -sp "  Enter Meraki API Key: " MERAKI_API_KEY
  echo -e " ${GN}[•••••]${CL}"
  read -p "  Enter Meraki Organization ID: " MERAKI_ORG_ID
}

# ============================================================================
# CREDENTIAL COLLECTION WIZARD (with edit support)
# ============================================================================
collect_credentials() {
  echo ""
  echo -e "${BOLD}${BL}+-------------------------------------------------------------------+${CL}"
  echo -e "${BOLD}${BL}|                    CONFIGURATION WIZARD                          |${CL}"
  echo -e "${BOLD}${BL}+-------------------------------------------------------------------+${CL}"

  # Track current step for dynamic step numbering
  local current_step=1
  local total_steps=2  # Server + Database always required

  [[ "$ENABLE_IIQ" == true ]] && ((total_steps++))
  [[ "$ENABLE_GOOGLE" == true ]] && ((total_steps+=3))  # Service account + OAuth + Access control
  [[ "$ENABLE_MERAKI" == true ]] && ((total_steps++))
  ((total_steps++))  # Review step

  # Step 1: Server Configuration
  echo ""
  echo -e "${DIM}Step ${current_step}/${total_steps}${CL}"
  collect_server_config
  ((current_step++))
  echo ""

  # Step 2: Database Configuration
  echo -e "${DIM}Step ${current_step}/${total_steps}${CL}"
  collect_database_config
  ((current_step++))
  echo ""

  # Step 3: IIQ Configuration (if enabled)
  if [[ "$ENABLE_IIQ" == true ]]; then
    echo -e "${DIM}Step ${current_step}/${total_steps}${CL}"
    collect_iiq_config
    ((current_step++))
    echo ""
  fi

  # Steps 4-6: Google Configuration (if enabled)
  if [[ "$ENABLE_GOOGLE" == true ]]; then
    echo -e "${DIM}Step ${current_step}/${total_steps}${CL}"
    collect_google_service_account
    ((current_step++))
    echo ""

    echo -e "${DIM}Step ${current_step}/${total_steps}${CL}"
    collect_google_oauth
    ((current_step++))
    echo ""

    echo -e "${DIM}Step ${current_step}/${total_steps}${CL}"
    collect_access_control
    ((current_step++))
    echo ""
  fi

  # Step 7: Meraki Configuration (if enabled)
  if [[ "$ENABLE_MERAKI" == true ]]; then
    echo -e "${DIM}Step ${current_step}/${total_steps}${CL}"
    collect_meraki_config
    ((current_step++))
    echo ""
  fi

  # Generate SECRET_KEY
  SECRET_KEY=$(openssl rand -hex 32)

  # Review and Edit Loop
  review_and_confirm
}

# ============================================================================
# REVIEW AND EDIT SCREEN
# ============================================================================
review_and_confirm() {
  while true; do
    echo ""
    echo -e "${BOLD}${BL}+-------------------------------------------------------------------+${CL}"
    echo -e "${BOLD}${BL}|                    REVIEW CONFIGURATION                          |${CL}"
    echo -e "${BOLD}${BL}+-------------------------------------------------------------------+${CL}"
    echo ""

    echo -e "  ${BOLD}[1] Server${CL}"
    echo -e "      Domain:        $ATLAS_DOMAIN"
    echo -e "      Email Domain:  $ALLOWED_DOMAIN"
    echo ""

    echo -e "  ${BOLD}[2] Database${CL}"
    echo -e "      Password:      ${DB_PASSWORD:0:4}****"
    echo ""

    if [[ "$ENABLE_IIQ" == true ]]; then
      echo -e "  ${BOLD}[3] Incident IQ${CL}"
      echo -e "      Instance ID:   $IIQ_SUBDOMAIN"
      echo -e "      URL:           $IIQ_BASE_URL"
      echo -e "      Site ID:       ${IIQ_SITE_ID:0:8}..."
      echo -e "      Token:         ${IIQ_TOKEN:0:8}..."
      echo ""
    fi

    if [[ "$ENABLE_GOOGLE" == true ]]; then
      echo -e "  ${BOLD}[4] Google Service Account${CL}"
      echo -e "      Creds Path:    $GOOGLE_CREDS_PATH"
      echo -e "      Admin Email:   $GOOGLE_ADMIN_EMAIL"
      echo ""

      echo -e "  ${BOLD}[5] Google OAuth${CL}"
      echo -e "      Client ID:     ${GOOGLE_OAUTH_CLIENT_ID:0:20}..."
      echo ""

      echo -e "  ${BOLD}[6] Access Control${CL}"
      echo -e "      Required Group: $REQUIRED_GROUP"
      echo ""
    fi

    if [[ "$ENABLE_MERAKI" == true ]]; then
      echo -e "  ${BOLD}[7] Cisco Meraki${CL}"
      echo -e "      Org ID:        $MERAKI_ORG_ID"
      echo ""
    fi

    echo -e "${BL}--------------------------------------------------------------------${CL}"
    echo ""
    echo -e "  ${BOLD}Options:${CL}"
    echo -e "    ${GN}Y${CL} - Proceed with installation"
    echo -e "    ${YW}1-7${CL} - Edit that section"
    echo -e "    ${RD}N${CL} - Cancel installation"
    echo ""
    read -p "  Your choice: " REVIEW_CHOICE

    case "$REVIEW_CHOICE" in
      [Yy]|"")
        echo ""
        msg_ok "Configuration confirmed"
        break
        ;;
      [Nn])
        echo ""
        msg_warn "Installation cancelled by user"
        exit 0
        ;;
      1)
        collect_server_config
        ;;
      2)
        collect_database_config
        ;;
      3)
        if [[ "$ENABLE_IIQ" == true ]]; then
          collect_iiq_config
        else
          echo -e "  ${RD}IIQ is not enabled${CL}"
        fi
        ;;
      4)
        if [[ "$ENABLE_GOOGLE" == true ]]; then
          collect_google_service_account
        else
          echo -e "  ${RD}Google is not enabled${CL}"
        fi
        ;;
      5)
        if [[ "$ENABLE_GOOGLE" == true ]]; then
          collect_google_oauth
        else
          echo -e "  ${RD}Google is not enabled${CL}"
        fi
        ;;
      6)
        if [[ "$ENABLE_GOOGLE" == true ]]; then
          collect_access_control
        else
          echo -e "  ${RD}Google is not enabled${CL}"
        fi
        ;;
      7)
        if [[ "$ENABLE_MERAKI" == true ]]; then
          collect_meraki_config
        else
          echo -e "  ${RD}Meraki is not enabled${CL}"
        fi
        ;;
      *)
        echo -e "  ${RD}Invalid choice. Please enter Y, N, or 1-7${CL}"
        ;;
    esac
  done
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

  # Install in groups with progress feedback
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

  # On fresh installs, PostgreSQL cluster may need to be created first
  if ! pg_lsclusters -h 2>/dev/null | grep -q "online"; then
    # Find the installed PostgreSQL version
    PG_VERSION=$(ls /usr/lib/postgresql/ 2>/dev/null | sort -V | tail -1)
    if [[ -n "$PG_VERSION" ]]; then
      echo -e "  ${DIM}Creating PostgreSQL cluster...${CL}"
      pg_createcluster "$PG_VERSION" main --start > /dev/null 2>&1 || true
    fi
  fi

  # Start PostgreSQL (try multiple service name formats)
  systemctl start postgresql > /dev/null 2>&1 || \
    systemctl start postgresql.service > /dev/null 2>&1 || \
    service postgresql start > /dev/null 2>&1 || true

  systemctl enable postgresql > /dev/null 2>&1 || true

  # Wait for PostgreSQL to be ready
  sleep 3

  # Helper function to run psql commands as postgres user
  # Uses heredoc to avoid quote escaping issues with passwords
  run_psql() {
    local sql="$1"
    if command -v sudo &> /dev/null; then
      sudo -u postgres psql -t -A <<< "$sql" 2>&1
    else
      su - postgres -c "psql -t -A" <<< "$sql" 2>&1
    fi
  }

  # Verify PostgreSQL is accessible
  if ! run_psql "SELECT 1;" > /dev/null 2>&1; then
    msg_error "Cannot connect to PostgreSQL"
    msg_error "Check: systemctl status postgresql"
    exit 1
  fi

  # Simple function to run SQL as postgres user (works on LXC without sudo)
  pg_exec() {
    local sql="$1"
    su - postgres -c "psql -c \"$sql\"" 2>&1
  }

  # Create or update the atlas_admin user
  echo -e "  ${DIM}Checking for existing database user...${CL}"
  if su - postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='atlas_admin'\"" 2>/dev/null | grep -q "1"; then
    echo -e "  ${DIM}Updating existing user atlas_admin password...${CL}"
    pg_exec "ALTER USER atlas_admin WITH PASSWORD '$DB_PASSWORD';" > /dev/null 2>&1
  else
    echo -e "  ${DIM}Creating database user atlas_admin...${CL}"
    pg_exec "CREATE USER atlas_admin WITH PASSWORD '$DB_PASSWORD';" > /dev/null 2>&1
  fi

  # Verify user was created
  if ! su - postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='atlas_admin'\"" 2>/dev/null | grep -q "1"; then
    msg_error "Failed to create database user atlas_admin"
    exit 1
  fi

  # Create database if it doesn't exist
  if su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='atlas_db'\"" 2>/dev/null | grep -q "1"; then
    echo -e "  ${DIM}Database atlas_db already exists${CL}"
  else
    echo -e "  ${DIM}Creating database atlas_db...${CL}"
    pg_exec "CREATE DATABASE atlas_db OWNER atlas_admin;" > /dev/null 2>&1
  fi

  # Verify database was created
  if ! su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='atlas_db'\"" 2>/dev/null | grep -q "1"; then
    msg_error "Failed to create database atlas_db"
    exit 1
  fi

  # Grant privileges (idempotent)
  pg_exec "GRANT ALL PRIVILEGES ON DATABASE atlas_db TO atlas_admin;" > /dev/null 2>&1 || true

  # Configure pg_hba.conf to allow password authentication for localhost
  echo -e "  ${DIM}Configuring PostgreSQL authentication...${CL}"
  PG_HBA=$(find /etc/postgresql -name "pg_hba.conf" 2>/dev/null | head -1)
  if [[ -n "$PG_HBA" ]]; then
    # Check if localhost md5 entry already exists
    if ! grep -q "^host.*all.*all.*127.0.0.1/32.*md5" "$PG_HBA" 2>/dev/null; then
      # Add md5 auth for localhost before any existing host entries
      # Backup first
      cp "$PG_HBA" "${PG_HBA}.bak"
      # Add the entry
      echo "# ATLAS: Allow password auth for localhost" >> "$PG_HBA"
      echo "host    all             all             127.0.0.1/32            md5" >> "$PG_HBA"
      echo "host    all             all             ::1/128                 md5" >> "$PG_HBA"
      # Reload PostgreSQL to apply changes
      systemctl reload postgresql > /dev/null 2>&1 || true
      sleep 1
    fi
  fi

  # Verify we can connect with the new credentials
  echo -e "  ${DIM}Verifying database connection...${CL}"
  export PGPASSWORD="$DB_PASSWORD"
  if psql -h 127.0.0.1 -U atlas_admin -d atlas_db -c "SELECT 1;" > /dev/null 2>&1; then
    msg_ok "PostgreSQL database configured (user: atlas_admin, db: atlas_db)"
  else
    # Try peer auth as fallback verification
    if run_sql_file "SELECT 1 FROM pg_database WHERE datname='atlas_db';" > /dev/null 2>&1; then
      msg_ok "PostgreSQL database configured (user: atlas_admin, db: atlas_db)"
      msg_warn "Note: Password auth may need manual pg_hba.conf configuration"
    else
      msg_error "Database created but connection test failed"
      msg_error "Password may not have been set correctly"
      msg_error "Try manually: ALTER USER atlas_admin WITH PASSWORD 'yourpassword';"
      exit 1
    fi
  fi
  unset PGPASSWORD
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
      msg_error ""
      msg_error "If this is a private repo, clone it manually first:"
      msg_error "  git clone https://YOUR_TOKEN@github.com/adukes40/ATLAS.git /opt/atlas"
      msg_error "Then re-run the installer."
      exit 1
    fi
  fi
}

create_config() {
  msg_info "Creating configuration files"

  # Build .env file dynamically based on enabled components
  cat > $ATLAS_DIR/atlas-backend/.env << EOF
# ATLAS Environment Configuration
# Generated by ATLAS installer on $(date)
# This file contains sensitive credentials - DO NOT commit to git

# =============================================================================
# DATABASE
# =============================================================================
DATABASE_URL=postgresql://atlas_admin:${DB_PASSWORD}@localhost/atlas_db
EOF

  # Add IIQ config if enabled
  if [[ "$ENABLE_IIQ" == true ]]; then
    cat >> $ATLAS_DIR/atlas-backend/.env << EOF

# =============================================================================
# INCIDENT IQ (IIQ) API
# =============================================================================
IIQ_URL=${IIQ_BASE_URL}
IIQ_TOKEN=${IIQ_TOKEN}
IIQ_SITE_ID=${IIQ_SITE_ID}
IIQ_PRODUCT_ID=${IIQ_PRODUCT_ID}
EOF
  fi

  # Add Google config if enabled
  if [[ "$ENABLE_GOOGLE" == true ]]; then
    cat >> $ATLAS_DIR/atlas-backend/.env << EOF

# =============================================================================
# GOOGLE WORKSPACE API
# =============================================================================
GOOGLE_CREDS_PATH=/opt/atlas/atlas-backend/google_credentials.json
GOOGLE_ADMIN_EMAIL=${GOOGLE_ADMIN_EMAIL}

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
EOF
  fi

  # Add Meraki config if enabled
  if [[ "$ENABLE_MERAKI" == true ]]; then
    cat >> $ATLAS_DIR/atlas-backend/.env << EOF

# =============================================================================
# CISCO MERAKI API
# =============================================================================
MERAKI_API_KEY=${MERAKI_API_KEY}
MERAKI_ORG_ID=${MERAKI_ORG_ID}
EOF
  fi

  # Add CORS config
  cat >> $ATLAS_DIR/atlas-backend/.env << EOF

# =============================================================================
# CORS
# =============================================================================
ALLOWED_ORIGINS=http://${ATLAS_DOMAIN},https://${ATLAS_DOMAIN},http://localhost:5173

# =============================================================================
# ENABLED COMPONENTS
# =============================================================================
ENABLE_IIQ=${ENABLE_IIQ}
ENABLE_GOOGLE=${ENABLE_GOOGLE}
ENABLE_MERAKI=${ENABLE_MERAKI}
EOF

  # Set secure permissions on backend .env
  chmod 600 $ATLAS_DIR/atlas-backend/.env

  # Create frontend .env file (for Vite build-time variables)
  cat > $ATLAS_DIR/atlas-ui/.env << EOF
# ATLAS Frontend Configuration
# Generated by ATLAS installer on $(date)

# IIQ domain for direct linking in Device 360
VITE_IIQ_URL=${IIQ_BASE_URL:-}
EOF

  # Copy Google credentials if provided and Google is enabled
  if [[ "$ENABLE_GOOGLE" == true && -f "$GOOGLE_CREDS_PATH" ]]; then
    local dest_creds="$ATLAS_DIR/atlas-backend/google_credentials.json"
    # Only copy if source and destination are different files
    if [[ "$(realpath "$GOOGLE_CREDS_PATH" 2>/dev/null)" != "$(realpath "$dest_creds" 2>/dev/null)" ]]; then
      cp "$GOOGLE_CREDS_PATH" "$dest_creds"
      msg_ok "Google credentials copied"
    else
      msg_ok "Google credentials already in place"
    fi
    chmod 600 "$dest_creds"
  elif [[ "$ENABLE_GOOGLE" == true ]]; then
    msg_warn "Google credentials file not found at $GOOGLE_CREDS_PATH"
    msg_warn "You'll need to manually copy your service account JSON to:"
    msg_warn "  $ATLAS_DIR/atlas-backend/google_credentials.json"
  fi

  msg_ok "Configuration files created"
}

setup_python_env() {
  echo -e " ${BL}[INFO]${CL} Setting up Python virtual environment..."
  echo -e "        ${DIM}(This may take 1-2 minutes)${CL}"
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
    > /dev/null 2>&1 &
  spinner $!
  echo -e " ${GN}done${CL}"

  echo ""
  msg_ok "Python environment configured"
}

setup_nodejs_env() {
  echo -e " ${BL}[INFO]${CL} Building frontend..."
  echo -e "        ${DIM}(This may take 1-2 minutes)${CL}"
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

  # Start with header
  cat > /etc/cron.d/atlas << EOF
# ATLAS Sync Jobs
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

EOF

  # Add Google sync if enabled
  if [[ "$ENABLE_GOOGLE" == true ]]; then
    cat >> /etc/cron.d/atlas << EOF
# Google sync at 2 AM
0 2 * * * root $VENV_DIR/bin/python $ATLAS_DIR/atlas-backend/scripts/google_bulk_sync.py >> $ATLAS_DIR/logs/google_sync.log 2>&1

EOF
  fi

  # Add IIQ sync if enabled
  if [[ "$ENABLE_IIQ" == true ]]; then
    cat >> /etc/cron.d/atlas << EOF
# IIQ sync at 3 AM
0 3 * * * root $VENV_DIR/bin/python $ATLAS_DIR/atlas-backend/scripts/iiq_bulk_sync.py >> $ATLAS_DIR/logs/iiq_sync.log 2>&1

EOF
  fi

  # Add Meraki sync if enabled
  if [[ "$ENABLE_MERAKI" == true ]]; then
    cat >> /etc/cron.d/atlas << EOF
# Meraki sync at 4 AM
0 4 * * * root $VENV_DIR/bin/python $ATLAS_DIR/atlas-backend/scripts/meraki_bulk_sync.py >> $ATLAS_DIR/logs/meraki_sync.log 2>&1
EOF
  fi

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

  if [[ "$ENABLE_GOOGLE" == true ]]; then
    echo -e "${BOLD}Authentication:${CL}"
    echo -e "  Users must sign in with @${ALLOWED_DOMAIN} Google accounts"
    echo -e "  Users must be members of: ${REQUIRED_GROUP}"
    echo ""
  fi

  echo -e "${BOLD}Enabled Components:${CL}"
  [[ "$ENABLE_IIQ" == true ]] && echo -e "  ${GN}[x]${CL} Incident IQ"
  [[ "$ENABLE_GOOGLE" == true ]] && echo -e "  ${GN}[x]${CL} Google Workspace"
  [[ "$ENABLE_MERAKI" == true ]] && echo -e "  ${GN}[x]${CL} Cisco Meraki"
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

  if [[ "$ENABLE_IIQ" == true ]]; then
    echo -e "  1. Run initial IIQ sync:"
    echo -e "     ${YW}$VENV_DIR/bin/python $ATLAS_DIR/atlas-backend/scripts/iiq_bulk_sync.py${CL}"
    echo ""
  fi

  if [[ "$ENABLE_GOOGLE" == true ]]; then
    echo -e "  2. Run initial Google sync:"
    echo -e "     ${YW}$VENV_DIR/bin/python $ATLAS_DIR/atlas-backend/scripts/google_bulk_sync.py${CL}"
    echo ""
  fi

  echo -e "  3. (Recommended) Enable HTTPS with Let's Encrypt:"
  echo -e "     ${YW}certbot --nginx -d $ATLAS_DOMAIN${CL}"
  if [[ "$ENABLE_GOOGLE" == true ]]; then
    echo -e "     Then update Google OAuth redirect URI to use https://"
  fi
  echo ""

  echo -e "${BOLD}Sync Schedule (Cron):${CL}"
  [[ "$ENABLE_GOOGLE" == true ]] && echo -e "  ${DIM}2:00 AM${CL}  Google devices sync"
  [[ "$ENABLE_IIQ" == true ]] && echo -e "  ${DIM}3:00 AM${CL}  IIQ assets + users sync"
  [[ "$ENABLE_MERAKI" == true ]] && echo -e "  ${DIM}4:00 AM${CL}  Meraki network sync"
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

  # Check for saved config from previous failed run
  if check_resume; then
    # Config loaded, go straight to review
    echo ""
    review_and_confirm
  else
    # Fresh install - collect all config
    echo ""
    select_components
    collect_credentials
  fi

  # Save config before installation (in case it fails)
  save_config

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

  # Installation successful - clean up saved config
  cleanup_config

  print_summary
}

# Run main function
main "$@"
