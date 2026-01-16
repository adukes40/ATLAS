#!/bin/bash
#
# ATLAS Update Script
# Usage: 
#   sudo ./update.sh            # Interactive mode
#   sudo ./update.sh [branch]   # Specify branch (e.g., sudo ./update.sh dev)
#

set -e  # Exit on error

# 1. Capture CLI argument for branch immediately
CLI_BRANCH=$1

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

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}        ATLAS Update Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Please run as root (sudo ./update.sh)${NC}"
    exit 1
fi

# Check if ATLAS directory exists
if [ ! -d "$ATLAS_ROOT" ]; then
    echo -e "${RED}Error: ATLAS directory not found at $ATLAS_ROOT${NC}"
    exit 1
fi

cd "$ATLAS_ROOT"

# Show current version
echo -e "${YELLOW}Current version:${NC}"
git log -1 --format="  %h %s (%cr)"
echo ""

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}Warning: You have uncommitted local changes:${NC}"
    git status --short
    echo ""
    # FIXED: Used standard read to prevent input skipping
    echo -n "Continue anyway? (y/N) "
    read -r CONFIRM < /dev/tty
    echo ""
    if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
        echo -e "${RED}Update cancelled${NC}"
        exit 1
    fi
fi

# ---------------------------------------------------------
# 1. Select Update Source
# ---------------------------------------------------------
echo -e "${YELLOW}Select Update Source:${NC}"
echo "  1) Production (Stable) - https://github.com/adukes40/ATLAS.git"
echo "  2) Development (Testing) - https://github.com/hankscafe/ATLAS.git"
echo ""

# FIXED: Explicitly reading from tty to ensure prompt works
echo -n "Enter selection [1]: "
read -r REPO_SELECT < /dev/tty

if [[ "$REPO_SELECT" == "2" ]]; then
    TARGET_REPO="https://github.com/hankscafe/ATLAS.git"
    echo -e "${GREEN}Selected: Development${NC}"
else
    TARGET_REPO="https://github.com/adukes40/ATLAS.git"
    echo -e "${GREEN}Selected: Production${NC}"
fi
echo ""

# Update remote origin immediately
git remote set-url origin "$TARGET_REPO"

# ---------------------------------------------------------
# 2. Select Branch
# ---------------------------------------------------------

# Logic: If CLI argument was provided, use it. Otherwise, prompt user.
if [ -n "$CLI_BRANCH" ]; then
    BRANCH_NAME="$CLI_BRANCH"
    echo -e "${GREEN}Using branch from command line: $BRANCH_NAME${NC}"
else
    echo -e "${YELLOW}Fetching available branches...${NC}"
    git fetch origin --prune
    
    echo ""
    echo -e "${YELLOW}Select Branch:${NC}"
    echo -n "Enter branch name [main]: "
    read -r BRANCH_INPUT < /dev/tty
    BRANCH_NAME=${BRANCH_INPUT:-main}
fi

# Validate branch existence on remote
echo -e "${YELLOW}Verifying branch '$BRANCH_NAME'...${NC}"
git fetch origin "$BRANCH_NAME" > /dev/null 2>&1 || true

if ! git show-ref --verify --quiet "refs/remotes/origin/$BRANCH_NAME"; then
    echo ""
    echo -e "${RED}Error: Branch '$BRANCH_NAME' does not exist on the selected remote.${NC}"
    echo -e "${YELLOW}Available remote branches:${NC}"
    git branch -r | grep "origin/" | sed 's/origin\///' | sed 's/^/  - /'
    exit 1
fi

echo -e "${GREEN}Proceeding with branch: $BRANCH_NAME${NC}"
echo ""

# ---------------------------------------------------------
# 3. Switch Branch & Update
# ---------------------------------------------------------

# Switch branch if needed
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "$BRANCH_NAME" ]; then
    echo -e "${BLUE}Switching from $CURRENT_BRANCH to $BRANCH_NAME...${NC}"
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
    echo -e "${GREEN}Already up to date!${NC}"
    echo ""
    echo -n "Continue with rebuild anyway? (y/N) "
    read -r CONFIRM < /dev/tty
    echo ""
    if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}Nothing to do. Exiting.${NC}"
        exit 0
    fi
else
    echo -e "${YELLOW}Changes to be applied:${NC}"
    git log --oneline "HEAD..origin/$BRANCH_NAME"
    echo ""
    echo -n "Apply these updates? (y/N) "
    read -r CONFIRM < /dev/tty
    echo ""
    if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
        echo -e "${RED}Update cancelled${NC}"
        exit 1
    fi
fi

# Pull updates
echo ""
echo -e "${BLUE}[1/9] Pulling latest code...${NC}"
git pull origin "$BRANCH_NAME"
echo -e "${GREEN}Done${NC}"

# Fix script permissions
echo ""
echo -e "${BLUE}[2/9] Fixing script permissions...${NC}"
chown root:atlas "$BACKEND_DIR/scripts/"*.py 2>/dev/null || true
chmod 750 "$BACKEND_DIR/scripts/"*.py 2>/dev/null || true
echo -e "${GREEN}Done${NC}"

# Ensure logs directory exists
echo ""
echo -e "${BLUE}[3/9] Ensuring logs directory exists...${NC}"
if [ ! -d "$ATLAS_ROOT/logs" ]; then
    mkdir -p "$ATLAS_ROOT/logs"
    echo -e "${YELLOW}Created $ATLAS_ROOT/logs${NC}"
fi
chown atlas:atlas "$ATLAS_ROOT/logs"
chmod 755 "$ATLAS_ROOT/logs"
echo -e "${GREEN}Done${NC}"

# Fix systemd service if needed (ensure proper ReadWritePaths)
echo ""
echo -e "${BLUE}[4/9] Checking systemd service configuration...${NC}"
SYSTEMD_FILE="/etc/systemd/system/atlas.service"
if [ -f "$SYSTEMD_FILE" ]; then
    # Check if ReadWritePaths includes both required paths
    if grep -q "ReadWritePaths=" "$SYSTEMD_FILE"; then
        CURRENT_PATHS=$(grep "ReadWritePaths=" "$SYSTEMD_FILE")
        if [[ ! "$CURRENT_PATHS" =~ "atlas-backend" ]] || [[ ! "$CURRENT_PATHS" =~ "logs" ]]; then
            echo -e "${YELLOW}Updating ReadWritePaths in systemd service...${NC}"
            sed -i 's|ReadWritePaths=.*|ReadWritePaths=/opt/atlas/atlas-backend /opt/atlas/logs|' "$SYSTEMD_FILE"
            systemctl daemon-reload
            echo -e "${GREEN}Systemd service updated${NC}"
        else
            echo -e "${GREEN}Systemd configuration OK${NC}"
        fi
    else
        echo -e "${YELLOW}Adding ReadWritePaths to systemd service...${NC}"
        sed -i '/\[Service\]/a ReadWritePaths=/opt/atlas/atlas-backend /opt/atlas/logs' "$SYSTEMD_FILE"
        systemctl daemon-reload
        echo -e "${GREEN}Systemd service updated${NC}"
    fi

    # Check if PATH includes /usr/bin (needed for git)
    if grep -q 'Environment="PATH=' "$SYSTEMD_FILE"; then
        CURRENT_ENV_PATH=$(grep 'Environment="PATH=' "$SYSTEMD_FILE")
        if [[ ! "$CURRENT_ENV_PATH" =~ "/usr/bin" ]]; then
            echo -e "${YELLOW}Updating PATH in systemd service (adding /usr/bin for git)...${NC}"
            sed -i 's|Environment="PATH=/opt/atlas/atlas-backend/venv/bin"|Environment="PATH=/opt/atlas/atlas-backend/venv/bin:/usr/bin:/bin"|' "$SYSTEMD_FILE"
            systemctl daemon-reload
            echo -e "${GREEN}PATH updated${NC}"
        fi
    fi
else
    echo -e "${YELLOW}Systemd service file not found, skipping${NC}"
fi

# Update Python dependencies
echo ""
echo -e "${BLUE}[5/9] Checking Python dependencies...${NC}"
if [ -f "$BACKEND_DIR/requirements.txt" ]; then
    cd "$BACKEND_DIR"
    source venv/bin/activate
    pip install -q -r requirements.txt
    deactivate
    echo -e "${GREEN}Done${NC}"
else
    echo -e "${YELLOW}No requirements.txt found, skipping${NC}"
fi

# Update npm dependencies
echo ""
echo -e "${BLUE}[6/9] Checking npm dependencies...${NC}"
cd "$FRONTEND_DIR"
if [ -f "package.json" ]; then
    npm install --silent
    echo -e "${GREEN}Done${NC}"
else
    echo -e "${YELLOW}No package.json found, skipping${NC}"
fi

# Rebuild frontend
echo ""
echo -e "${BLUE}[7/9] Rebuilding frontend...${NC}"
npm run build --silent
echo -e "${GREEN}Done${NC}"

# Run database migrations
echo ""
echo -e "${BLUE}[8/9] Running database migrations...${NC}"
cd "$BACKEND_DIR"
source venv/bin/activate
python3 -c "
import sys
sys.path.insert(0, '$BACKEND_DIR')
from app.database import engine, Base
from app.models import *
Base.metadata.create_all(bind=engine)
print('Database tables verified')
" 2>/dev/null || echo -e "${YELLOW}Warning: Could not verify database tables${NC}"
deactivate
echo -e "${GREEN}Done${NC}"

# Restart service
echo ""
echo -e "${BLUE}[9/9] Restarting ATLAS service...${NC}"
if systemctl is-active --quiet atlas.service; then
    systemctl restart atlas.service
    sleep 2
    if systemctl is-active --quiet atlas.service; then
        echo -e "${GREEN}Service restarted successfully${NC}"
    else
        echo -e "${RED}Warning: Service failed to start!${NC}"
        echo "Check logs with: journalctl -u atlas.service -n 50"
        exit 1
    fi
else
    echo -e "${YELLOW}Service was not running, starting it...${NC}"
    systemctl start atlas.service
    sleep 2
    if systemctl is-active --quiet atlas.service; then
        echo -e "${GREEN}Service started successfully${NC}"
    else
        echo -e "${RED}Warning: Service failed to start!${NC}"
        echo "Check logs with: journalctl -u atlas.service -n 50"
        exit 1
    fi
fi

# Show new version
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Update complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}New version:${NC}"
git log -1 --format="  %h %s (%cr)"
echo ""
echo -e "${YELLOW}Service status:${NC}"
systemctl status atlas.service --no-pager | head -5
echo ""