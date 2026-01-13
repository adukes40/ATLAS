#!/bin/bash
#
# ATLAS Uninstall Script
# Completely removes ATLAS from the system
#
# Usage: sudo ./uninstall.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Paths
ATLAS_ROOT="/opt/atlas"
ATLAS_USER="atlas"

echo -e "${RED}========================================"
echo -e "        ATLAS Uninstaller"
echo -e "========================================${NC}"
echo ""
echo -e "${YELLOW}${BOLD}WARNING: This will completely remove ATLAS from this system!${NC}"
echo ""
echo "The following will be removed:"
echo "  - ATLAS service (systemd)"
echo "  - ATLAS files ($ATLAS_ROOT)"
echo "  - ATLAS user account ($ATLAS_USER)"
echo "  - Nginx configuration"
echo "  - Cron jobs"
echo "  - PostgreSQL database and user (optional)"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Please run as root (sudo ./uninstall.sh)${NC}"
    exit 1
fi

# Confirmation
echo -n -e "${RED}${BOLD}Are you sure you want to uninstall ATLAS? (type 'yes' to confirm): ${NC}"
read -r CONFIRM < /dev/tty
if [ "$CONFIRM" != "yes" ]; then
    echo -e "${BLUE}Uninstall cancelled${NC}"
    exit 0
fi

echo ""

# ---------------------------------------------------------
# 1. Stop and disable ATLAS service
# ---------------------------------------------------------
echo -e "${BLUE}[1/7] Stopping ATLAS service...${NC}"
if systemctl is-active --quiet atlas.service 2>/dev/null; then
    systemctl stop atlas.service
    echo -e "${GREEN}Service stopped${NC}"
else
    echo -e "${YELLOW}Service not running${NC}"
fi

if systemctl is-enabled --quiet atlas.service 2>/dev/null; then
    systemctl disable atlas.service 2>/dev/null || true
    echo -e "${GREEN}Service disabled${NC}"
fi

# ---------------------------------------------------------
# 2. Remove systemd service file
# ---------------------------------------------------------
echo ""
echo -e "${BLUE}[2/7] Removing systemd service...${NC}"
if [ -f /etc/systemd/system/atlas.service ]; then
    rm -f /etc/systemd/system/atlas.service
    systemctl daemon-reload
    echo -e "${GREEN}Systemd service removed${NC}"
else
    echo -e "${YELLOW}Systemd service not found${NC}"
fi

# ---------------------------------------------------------
# 3. Remove nginx configuration
# ---------------------------------------------------------
echo ""
echo -e "${BLUE}[3/7] Removing Nginx configuration...${NC}"
if [ -f /etc/nginx/sites-enabled/atlas ]; then
    rm -f /etc/nginx/sites-enabled/atlas
    echo -e "${GREEN}Removed sites-enabled/atlas${NC}"
fi
if [ -f /etc/nginx/sites-available/atlas ]; then
    rm -f /etc/nginx/sites-available/atlas
    echo -e "${GREEN}Removed sites-available/atlas${NC}"
fi

# Restore default nginx site if nothing else is configured
if [ -z "$(ls -A /etc/nginx/sites-enabled/ 2>/dev/null)" ]; then
    if [ -f /etc/nginx/sites-available/default ]; then
        ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
        echo -e "${YELLOW}Restored default nginx site${NC}"
    fi
fi

# Reload nginx if running
if systemctl is-active --quiet nginx 2>/dev/null; then
    nginx -t > /dev/null 2>&1 && systemctl reload nginx
    echo -e "${GREEN}Nginx reloaded${NC}"
fi

# ---------------------------------------------------------
# 4. Remove cron jobs
# ---------------------------------------------------------
echo ""
echo -e "${BLUE}[4/7] Removing cron jobs...${NC}"
if [ -f /etc/cron.d/atlas ]; then
    rm -f /etc/cron.d/atlas
    echo -e "${GREEN}Cron jobs removed${NC}"
else
    echo -e "${YELLOW}Cron jobs not found${NC}"
fi

# ---------------------------------------------------------
# 5. Remove ATLAS directory
# ---------------------------------------------------------
echo ""
echo -e "${BLUE}[5/7] Removing ATLAS files...${NC}"
if [ -d "$ATLAS_ROOT" ]; then
    rm -rf "$ATLAS_ROOT"
    echo -e "${GREEN}Removed $ATLAS_ROOT${NC}"
else
    echo -e "${YELLOW}$ATLAS_ROOT not found${NC}"
fi

# ---------------------------------------------------------
# 6. Remove ATLAS user
# ---------------------------------------------------------
echo ""
echo -e "${BLUE}[6/7] Removing ATLAS user...${NC}"
if id "$ATLAS_USER" &>/dev/null; then
    userdel "$ATLAS_USER" 2>/dev/null || true
    echo -e "${GREEN}User '$ATLAS_USER' removed${NC}"
else
    echo -e "${YELLOW}User '$ATLAS_USER' not found${NC}"
fi

# ---------------------------------------------------------
# 7. Database removal (optional)
# ---------------------------------------------------------
echo ""
echo -e "${BLUE}[7/7] Database cleanup...${NC}"
echo ""
echo -e "${YELLOW}Do you want to remove the PostgreSQL database and user?${NC}"
echo "  - Database: atlas_db"
echo "  - User: atlas_admin"
echo ""
echo -n -e "Remove database? (y/N): "
read -r DROP_DB < /dev/tty

if [[ "$DROP_DB" =~ ^[Yy]$ ]]; then
    if command -v psql &> /dev/null; then
        # Drop database
        if su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='atlas_db'\"" 2>/dev/null | grep -q "1"; then
            su - postgres -c "psql -c 'DROP DATABASE atlas_db;'" 2>/dev/null || true
            echo -e "${GREEN}Database 'atlas_db' dropped${NC}"
        else
            echo -e "${YELLOW}Database 'atlas_db' not found${NC}"
        fi

        # Drop user
        if su - postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='atlas_admin'\"" 2>/dev/null | grep -q "1"; then
            su - postgres -c "psql -c 'DROP USER atlas_admin;'" 2>/dev/null || true
            echo -e "${GREEN}User 'atlas_admin' dropped${NC}"
        else
            echo -e "${YELLOW}User 'atlas_admin' not found${NC}"
        fi
    else
        echo -e "${YELLOW}PostgreSQL not found, skipping database cleanup${NC}"
    fi
else
    echo -e "${BLUE}Database preserved${NC}"
fi

# ---------------------------------------------------------
# Summary
# ---------------------------------------------------------
echo ""
echo -e "${GREEN}========================================"
echo -e "        Uninstall Complete!"
echo -e "========================================${NC}"
echo ""
echo "ATLAS has been removed from this system."
echo ""
echo -e "${YELLOW}The following were NOT removed (if installed):${NC}"
echo "  - PostgreSQL server (apt package)"
echo "  - Node.js (apt package)"
echo "  - Nginx (apt package)"
echo "  - Python/pip (apt package)"
echo ""
echo "To remove these, run:"
echo "  apt remove --purge postgresql* nodejs nginx"
echo ""
