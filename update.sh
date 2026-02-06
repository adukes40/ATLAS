#!/bin/bash
#
# ATLAS Update Script
# Usage:
#   sudo ./update.sh            # Interactive mode
#   sudo ./update.sh [branch]   # Non-interactive mode (for systemd)
#

set -e  # Exit on error

# 1. Capture CLI argument for branch immediately
CLI_BRANCH=$1

# Determine if running interactively or via systemd
# If branch is provided, assume non-interactive (systemd trigger)
if [ -n "$CLI_BRANCH" ]; then
    INTERACTIVE=false
else
    INTERACTIVE=true
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
ATLAS_ROOT="/opt/atlas"
BACKEND_DIR="$ATLAS_ROOT/atlas-backend"
FRONTEND_DIR="$ATLAS_ROOT/atlas-ui"
VENV_DIR="$BACKEND_DIR/venv"
TRIGGER_FILE="$ATLAS_ROOT/logs/trigger-update"

# Capture all output for UpdateLog write-back
UPDATE_OUTPUT=""
capture() { UPDATE_OUTPUT+="$1"$'\n'; echo -e "$1"; }

# Read log_id from trigger file (written by system.py)
LOG_ID=""
if [ -f "$TRIGGER_FILE" ]; then
    LOG_ID=$(grep -oP 'Log ID: \K\d+' "$TRIGGER_FILE" 2>/dev/null || true)
fi

# Function to write update result back to database
write_update_log() {
    local status="$1"
    local to_version="$2"
    local to_commit="$3"

    if [ -z "$LOG_ID" ]; then
        return 0
    fi

    "$VENV_DIR/bin/python3" -c "
import sys
sys.path.insert(0, '$BACKEND_DIR')
from app.database import SessionLocal
from app.models import UpdateLog
from datetime import datetime

db = SessionLocal()
try:
    log = db.query(UpdateLog).filter(UpdateLog.id == $LOG_ID).first()
    if log:
        log.status = '$status'
        log.to_version = '$to_version' if '$to_version' else None
        log.to_commit = '$to_commit' if '$to_commit' else None
        log.completed_at = datetime.utcnow()
        log.output = '''$UPDATE_OUTPUT'''
        db.commit()
finally:
    db.close()
" 2>/dev/null || true
}

capture "${BLUE}========================================${NC}"
capture "${BLUE}        ATLAS Update Script${NC}"
capture "${BLUE}========================================${NC}"
capture ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    capture "${RED}Error: Please run as root (sudo ./update.sh)${NC}"
    exit 1
fi

# Check if ATLAS directory exists
if [ ! -d "$ATLAS_ROOT" ]; then
    capture "${RED}Error: ATLAS directory not found at $ATLAS_ROOT${NC}"
    exit 1
fi

cd "$ATLAS_ROOT"

# Show current version
capture "${YELLOW}Current version:${NC}"
capture "  $(git log -1 --format='%h %s (%cr)')"
capture ""

# Auto-detect repo from git remote
TARGET_REPO=$(git remote get-url origin 2>/dev/null || echo "https://github.com/adukes40/ATLAS.git")
capture "${GREEN}Repository: $TARGET_REPO${NC}"

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    capture "${YELLOW}Warning: You have uncommitted local changes:${NC}"
    capture "$(git status --short)"
    capture ""
    if [ "$INTERACTIVE" = true ]; then
        echo -n "Continue anyway? (y/N) "
        read -r CONFIRM < /dev/tty
        echo ""
        if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
            capture "${RED}Update cancelled${NC}"
            write_update_log "failed" "" ""
            exit 1
        fi
    else
        capture "${YELLOW}Non-interactive mode: Proceeding despite local changes${NC}"
    fi
fi

# ---------------------------------------------------------
# 1. Select Branch
# ---------------------------------------------------------
if [ -n "$CLI_BRANCH" ]; then
    BRANCH_NAME="$CLI_BRANCH"
    capture "${GREEN}Using branch from command line: $BRANCH_NAME${NC}"
else
    capture "${YELLOW}Fetching available branches...${NC}"
    git fetch origin --prune

    capture ""
    capture "${YELLOW}Select Branch:${NC}"
    echo -n "Enter branch name [main]: "
    read -r BRANCH_INPUT < /dev/tty
    BRANCH_NAME=${BRANCH_INPUT:-main}
fi

# Validate branch existence on remote
capture "${YELLOW}Verifying branch '$BRANCH_NAME'...${NC}"
git fetch origin "$BRANCH_NAME" > /dev/null 2>&1 || true

if ! git show-ref --verify --quiet "refs/remotes/origin/$BRANCH_NAME"; then
    capture ""
    capture "${RED}Error: Branch '$BRANCH_NAME' does not exist on the remote.${NC}"
    capture "${YELLOW}Available remote branches:${NC}"
    capture "$(git branch -r | grep 'origin/' | sed 's/origin\///' | sed 's/^/  - /')"
    write_update_log "failed" "" ""
    exit 1
fi

capture "${GREEN}Proceeding with branch: $BRANCH_NAME${NC}"
capture ""

# ---------------------------------------------------------
# 2. Switch Branch & Update
# ---------------------------------------------------------

# Switch branch if needed
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "$BRANCH_NAME" ]; then
    capture "${BLUE}Switching from $CURRENT_BRANCH to $BRANCH_NAME...${NC}"
    if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
        git checkout "$BRANCH_NAME"
    else
        git checkout -b "$BRANCH_NAME" "origin/$BRANCH_NAME"
    fi
fi

# Compare Local vs Remote
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH_NAME")

if [ "$LOCAL" = "$REMOTE" ]; then
    capture "${GREEN}Already up to date!${NC}"
    capture ""
    if [ "$INTERACTIVE" = true ]; then
        echo -n "Continue with rebuild anyway? (y/N) "
        read -r CONFIRM < /dev/tty
        echo ""
        if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
            capture "${BLUE}Nothing to do. Exiting.${NC}"
            write_update_log "success" "" ""
            exit 0
        fi
    else
        capture "${BLUE}Non-interactive mode: Already up to date, exiting.${NC}"
        write_update_log "success" "" ""
        exit 0
    fi
else
    capture "${YELLOW}Changes to be applied:${NC}"
    capture "$(git log --oneline 'HEAD..origin/'$BRANCH_NAME)"
    capture ""
    if [ "$INTERACTIVE" = true ]; then
        echo -n "Apply these updates? (y/N) "
        read -r CONFIRM < /dev/tty
        echo ""
        if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
            capture "${RED}Update cancelled${NC}"
            write_update_log "failed" "" ""
            exit 1
        fi
    else
        capture "${GREEN}Non-interactive mode: Applying updates automatically${NC}"
    fi
fi

# Pull updates
capture ""
capture "${BLUE}[1/9] Pulling latest code...${NC}"
git pull origin "$BRANCH_NAME"
capture "${GREEN}Done${NC}"

# Fix script permissions
capture ""
capture "${BLUE}[2/9] Fixing script permissions...${NC}"
chown root:atlas "$BACKEND_DIR/scripts/"*.py 2>/dev/null || true
chmod 750 "$BACKEND_DIR/scripts/"*.py 2>/dev/null || true
capture "${GREEN}Done${NC}"

# Ensure logs directory exists
capture ""
capture "${BLUE}[3/9] Ensuring logs directory exists...${NC}"
if [ ! -d "$ATLAS_ROOT/logs" ]; then
    mkdir -p "$ATLAS_ROOT/logs"
    capture "${YELLOW}Created $ATLAS_ROOT/logs${NC}"
fi
chown atlas:atlas "$ATLAS_ROOT/logs"
chmod 755 "$ATLAS_ROOT/logs"
capture "${GREEN}Done${NC}"

# Regenerate systemd service files
capture ""
capture "${BLUE}[4/9] Updating systemd service files...${NC}"

# Write atlas.service from template
cat > /etc/systemd/system/atlas.service << 'SVCEOF'
[Unit]
Description=ATLAS API Service (Asset, Telemetry, Location, & Analytics System)
After=network.target postgresql.service

[Service]
Type=simple
User=atlas
Group=atlas
WorkingDirectory=/opt/atlas/atlas-backend
Environment="PATH=/opt/atlas/atlas-backend/venv/bin:/usr/bin:/bin"
EnvironmentFile=/opt/atlas/atlas-backend/.env
ExecStart=/opt/atlas/atlas-backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
ReadWritePaths=/opt/atlas/atlas-backend /opt/atlas/logs

[Install]
WantedBy=multi-user.target
SVCEOF

# Write atlas-update.service
cat > /etc/systemd/system/atlas-update.service << 'SVCEOF'
[Unit]
Description=ATLAS Update Service
After=network.target

[Service]
Type=oneshot
WorkingDirectory=/opt/atlas
ExecStart=/opt/atlas/update.sh main
ExecStartPost=/bin/rm -f /opt/atlas/logs/trigger-update
User=root
StandardOutput=append:/opt/atlas/logs/update.log
StandardError=append:/opt/atlas/logs/update.log
SVCEOF

# Write atlas-update.path
cat > /etc/systemd/system/atlas-update.path << 'SVCEOF'
[Unit]
Description=Watch for ATLAS update trigger

[Path]
PathExists=/opt/atlas/logs/trigger-update
Unit=atlas-update.service

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable atlas-update.path > /dev/null 2>&1 || true
systemctl start atlas-update.path > /dev/null 2>&1 || true

# Remove legacy atlas-ui.service if present
if [ -f /etc/systemd/system/atlas-ui.service ]; then
    systemctl stop atlas-ui.service 2>/dev/null || true
    systemctl disable atlas-ui.service 2>/dev/null || true
    rm -f /etc/systemd/system/atlas-ui.service
    systemctl daemon-reload
    capture "${YELLOW}Removed legacy atlas-ui.service${NC}"
fi

capture "${GREEN}Done${NC}"

# Update Python dependencies
capture ""
capture "${BLUE}[5/9] Checking Python dependencies...${NC}"
if [ -f "$BACKEND_DIR/requirements.txt" ]; then
    cd "$BACKEND_DIR"
    source venv/bin/activate
    pip install -q -r requirements.txt
    deactivate
    capture "${GREEN}Done${NC}"
else
    capture "${YELLOW}No requirements.txt found, skipping${NC}"
fi

# Update npm dependencies
capture ""
capture "${BLUE}[6/9] Checking npm dependencies...${NC}"
cd "$FRONTEND_DIR"
if [ -f "package.json" ]; then
    npm install --silent
    capture "${GREEN}Done${NC}"
else
    capture "${YELLOW}No package.json found, skipping${NC}"
fi

# Rebuild frontend
capture ""
capture "${BLUE}[7/9] Rebuilding frontend...${NC}"
npm run build --silent
capture "${GREEN}Done${NC}"

# Run database migrations
capture ""
capture "${BLUE}[8/9] Running database migrations...${NC}"
cd "$BACKEND_DIR"
source venv/bin/activate
python3 -c "
import sys
sys.path.insert(0, '$BACKEND_DIR')
from app.database import engine, Base
from app.models import *
Base.metadata.create_all(bind=engine)
print('Database tables verified')
" 2>/dev/null || capture "${YELLOW}Warning: Could not verify database tables${NC}"
deactivate
capture "${GREEN}Done${NC}"

# Restart service
capture ""
capture "${BLUE}[9/9] Restarting ATLAS service...${NC}"
if systemctl is-active --quiet atlas.service; then
    systemctl restart atlas.service
    sleep 2
    if systemctl is-active --quiet atlas.service; then
        capture "${GREEN}Service restarted successfully${NC}"
    else
        capture "${RED}Warning: Service failed to start!${NC}"
        capture "Check logs with: journalctl -u atlas.service -n 50"
        # Get new version info for log even on failure
        NEW_VERSION=$(cat "$ATLAS_ROOT/VERSION" 2>/dev/null || echo "unknown")
        NEW_COMMIT=$(cd "$ATLAS_ROOT" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
        write_update_log "failed" "$NEW_VERSION" "$NEW_COMMIT"
        exit 1
    fi
else
    capture "${YELLOW}Service was not running, starting it...${NC}"
    systemctl start atlas.service
    sleep 2
    if systemctl is-active --quiet atlas.service; then
        capture "${GREEN}Service started successfully${NC}"
    else
        capture "${RED}Warning: Service failed to start!${NC}"
        capture "Check logs with: journalctl -u atlas.service -n 50"
        NEW_VERSION=$(cat "$ATLAS_ROOT/VERSION" 2>/dev/null || echo "unknown")
        NEW_COMMIT=$(cd "$ATLAS_ROOT" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
        write_update_log "failed" "$NEW_VERSION" "$NEW_COMMIT"
        exit 1
    fi
fi

# Get new version info
NEW_VERSION=$(cat "$ATLAS_ROOT/VERSION" 2>/dev/null || echo "unknown")
NEW_COMMIT=$(cd "$ATLAS_ROOT" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Show new version
capture ""
capture "${BLUE}========================================${NC}"
capture "${GREEN}Update complete!${NC}"
capture "${BLUE}========================================${NC}"
capture ""
capture "${YELLOW}New version:${NC}"
capture "  $(cd "$ATLAS_ROOT" && git log -1 --format='%h %s (%cr)')"
capture ""
capture "${YELLOW}Service status:${NC}"
capture "$(systemctl status atlas.service --no-pager | head -5)"
capture ""

# Write success back to UpdateLog
write_update_log "success" "$NEW_VERSION" "$NEW_COMMIT"
