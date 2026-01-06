# ATLAS Troubleshooting Guide

Common issues and solutions when installing or running ATLAS.

---

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [Database Issues](#database-issues)
3. [Service Issues](#service-issues)
4. [Authentication Issues](#authentication-issues)
5. [Frontend Issues](#frontend-issues)
6. [Diagnostic Commands](#diagnostic-commands)

---

## Installation Issues

### Installer exits silently with no error

**Symptom:** Installer runs through prompts but drops to shell without completion message.

**Cause:** The installer uses `set -e` which exits on any error. Common causes:
- GitHub clone failed (private repo, network issue)
- Missing dependencies
- PostgreSQL setup failed

**Solution:**
```bash
# Check if source was downloaded
ls -la /opt/atlas/atlas-backend/app/main.py

# If missing, clone manually with a token for private repos:
git clone https://YOUR_TOKEN@github.com/adukes40/ATLAS.git /opt/atlas

# Then re-run installer (it will detect existing files)
```

### "sudo: command not found" on LXC containers

**Symptom:** PostgreSQL setup fails because `sudo` isn't installed.

**Cause:** Minimal Debian/Ubuntu LXC containers don't include `sudo` by default.

**Solution:** The latest installer handles this automatically using `su - postgres -c` as fallback. If using an older installer:
```bash
# Option 1: Install sudo
apt install sudo

# Option 2: Run PostgreSQL commands directly
su - postgres -c "psql -c \"CREATE USER atlas_admin WITH PASSWORD 'yourpass';\""
```

---

## Database Issues

### "role 'atlas_admin' does not exist"

**Symptom:** Service fails to start with error about missing PostgreSQL role.

**Cause:** The PostgreSQL user was never created (installer failed partway through).

**Solution:**
```bash
# Create the user and database manually
su - postgres -c "psql" << 'EOF'
CREATE USER atlas_admin WITH PASSWORD 'YourSecurePassword';
CREATE DATABASE atlas_db OWNER atlas_admin;
GRANT ALL PRIVILEGES ON DATABASE atlas_db TO atlas_admin;
EOF

# Update .env with matching password
nano /opt/atlas/atlas-backend/.env
# Change: DATABASE_URL=postgresql://atlas_admin:YourSecurePassword@localhost/atlas_db

# Restart service
systemctl restart atlas
```

### "password authentication failed for user 'atlas_admin'"

**Symptom:** Service fails with FATAL password authentication error in logs.

**Cause:** Password in `.env` doesn't match what's set in PostgreSQL.

**Solution:**
```bash
# Check what password is in .env
grep DATABASE_URL /opt/atlas/atlas-backend/.env

# Update PostgreSQL to match (replace YOUR_PASSWORD)
su - postgres -c "psql -c \"ALTER USER atlas_admin WITH PASSWORD 'YOUR_PASSWORD';\""

# Or update .env to match PostgreSQL
nano /opt/atlas/atlas-backend/.env

# Restart
systemctl restart atlas
```

### "database 'atlas_db' does not exist"

**Symptom:** Service fails because database wasn't created.

**Solution:**
```bash
su - postgres -c "psql -c \"CREATE DATABASE atlas_db OWNER atlas_admin;\""
systemctl restart atlas
```

### PostgreSQL won't start

**Symptom:** `systemctl start postgresql` fails.

**Solution:**
```bash
# Check status
systemctl status postgresql

# On fresh installs, cluster may need creation
PG_VERSION=$(ls /usr/lib/postgresql/ | sort -V | tail -1)
pg_createcluster $PG_VERSION main --start

# Check it's running
pg_lsclusters
```

### PostgreSQL password authentication fails even with correct password

**Symptom:** Service logs show password auth failed, but the password is correct.

**Cause:** `pg_hba.conf` doesn't allow password (md5) authentication for localhost TCP connections.

**Solution:**
```bash
# Add password auth for localhost
echo "host    all    all    127.0.0.1/32    md5" >> /etc/postgresql/*/main/pg_hba.conf
echo "host    all    all    ::1/128         md5" >> /etc/postgresql/*/main/pg_hba.conf

# Reload PostgreSQL
systemctl reload postgresql

# Restart atlas
systemctl restart atlas
```

### Installer verification passes but service still fails

**Symptom:** Installer says "PostgreSQL database configured" but service won't start.

**Cause:** The installer verification used a fallback method. Look for this warning:
```
[WARN] Note: Password auth may need manual pg_hba.conf configuration
```

**Solution:** Manually configure pg_hba.conf (see above) and verify the user/database exist:
```bash
# Check if user exists
su - postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='atlas_admin'\""

# Check if database exists
su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='atlas_db'\""

# If either returns empty, create them:
su - postgres -c "psql -c \"CREATE USER atlas_admin WITH PASSWORD 'YOUR_PASSWORD';\""
su - postgres -c "psql -c \"CREATE DATABASE atlas_db OWNER atlas_admin;\""
su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE atlas_db TO atlas_admin;\""
```

---

## Service Issues

### 502 Bad Gateway

**Symptom:** Browser shows "502 Bad Gateway" when accessing ATLAS.

**Cause:** Nginx is running but can't reach the backend on port 8000.

**Solution:**
```bash
# Check if backend is running
systemctl status atlas

# If not running, check why
journalctl -u atlas -n 50

# Common fixes:
# - Database connection issue (see Database Issues above)
# - Python dependency missing
# - Syntax error in code

# Restart after fixing
systemctl restart atlas
```

### Service keeps restarting (crash loop)

**Symptom:** `systemctl status atlas` shows "activating (auto-restart)".

**Solution:**
```bash
# Check the actual error
journalctl -u atlas -n 100 --no-pager

# Look for:
# - Database connection errors → see Database Issues
# - Import errors → missing Python package
# - JSON decode errors → corrupted credentials file
```

### "Connection refused" on port 8000

**Symptom:** Backend isn't listening on port 8000.

**Solution:**
```bash
# Check if something is listening
ss -tlnp | grep 8000

# If nothing, start the service
systemctl start atlas

# Test locally
curl http://127.0.0.1:8000/
```

### Wrong service name

**Note:** The service is always named `atlas` regardless of your domain name.

```bash
# Correct
systemctl restart atlas

# Wrong (domain doesn't affect service name)
systemctl restart atlastest  # This won't work
```

---

## Authentication Issues

### "Invalid control character" JSON error

**Symptom:** Login fails with JSON parsing error in logs:
```
[Auth] Unexpected error checking group membership: Invalid control character at: line 5 column 1003 (char 1139)
```

**Cause:** The `google_credentials.json` file was corrupted during paste. The private key contains `\n` characters that get converted to actual line breaks, breaking the JSON structure.

**Why this happens:** When pasting multiline JSON in a terminal, line breaks can be introduced in the middle of the private key string. For example:
```
...TwKBg
  QDDbU...   <-- Line break in the middle of the key!
```

**Solution - Use base64 encoding (only reliable method):**

On the source machine (where credentials work):
```bash
base64 -w0 /opt/atlas/atlas-backend/google_credentials.json && echo
```

On the ATLAS server:
```bash
echo "PASTE_THE_ENTIRE_BASE64_STRING_HERE" | base64 -d > /opt/atlas/atlas-backend/google_credentials.json
chmod 600 /opt/atlas/atlas-backend/google_credentials.json

# Verify it's valid JSON
python3 -c "import json; json.load(open('/opt/atlas/atlas-backend/google_credentials.json')); print('JSON OK')"

# Restart
systemctl restart atlas
```

**Alternative - SCP from another machine:**
```bash
scp user@source:/path/to/google_credentials.json /opt/atlas/atlas-backend/
chmod 600 /opt/atlas/atlas-backend/google_credentials.json
systemctl restart atlas
```

> **Tip:** The installer now offers base64 as option 1 (recommended) to avoid this issue.

### "Access restricted to members of [group]"

**Symptom:** User can authenticate with Google but gets access denied.

**Cause:** User is not a member of the required Google Group.

**Solution:**
1. Add user to the Google Group in Google Admin Console
2. Or change `REQUIRED_GROUP` in `.env` to a different group
3. Restart service after changing `.env`

### Google OAuth redirect error

**Symptom:** "redirect_uri_mismatch" error from Google.

**Cause:** The redirect URI in Google Cloud Console doesn't match your domain.

**Solution:**
1. Go to Google Cloud Console > APIs & Services > Credentials
2. Edit your OAuth 2.0 Client ID
3. Add authorized redirect URIs:
   - `http://your-domain.com/auth/callback`
   - `https://your-domain.com/auth/callback` (if using HTTPS)
4. Save and wait a few minutes for propagation

### Session/cookie issues

**Symptom:** Login works but immediately logs out, or session doesn't persist.

**Solution:**
```bash
# Check SECRET_KEY is set
grep SECRET_KEY /opt/atlas/atlas-backend/.env

# If empty, generate one:
python3 -c "import secrets; print(secrets.token_hex(32))"

# Add to .env:
SECRET_KEY=your_generated_key_here

systemctl restart atlas
```

---

## Frontend Issues

### Blank page / React app won't load

**Symptom:** Browser shows blank page or "Loading..." forever.

**Solution:**
```bash
# Check if frontend was built
ls -la /opt/atlas/atlas-ui/dist/

# If empty or missing, rebuild:
cd /opt/atlas/atlas-ui
npm install
npm run build

# Restart nginx
systemctl restart nginx
```

### Static assets returning 404

**Symptom:** CSS/JS files not loading, page looks broken.

**Solution:**
```bash
# Check nginx config
nginx -t

# Verify dist directory
ls /opt/atlas/atlas-ui/dist/assets/

# Check nginx is pointing to right directory
grep "root" /etc/nginx/sites-available/atlas
```

### API calls failing (CORS errors)

**Symptom:** Browser console shows CORS errors.

**Solution:**
```bash
# Check ALLOWED_ORIGINS in .env
grep ALLOWED_ORIGINS /opt/atlas/atlas-backend/.env

# Should include your domain:
ALLOWED_ORIGINS=http://your-domain.com,https://your-domain.com,http://localhost:5173

systemctl restart atlas
```

---

## Diagnostic Commands

### Quick Health Check

```bash
# All-in-one status check
echo "=== PostgreSQL ===" && systemctl is-active postgresql
echo "=== ATLAS Backend ===" && systemctl is-active atlas
echo "=== Nginx ===" && systemctl is-active nginx
echo "=== Port 8000 ===" && ss -tlnp | grep 8000 || echo "Not listening"
echo "=== Port 80 ===" && ss -tlnp | grep :80 || echo "Not listening"
```

### View Logs

```bash
# Backend logs (live)
journalctl -u atlas -f

# Backend logs (last 100 lines)
journalctl -u atlas -n 100 --no-pager

# Nginx error log
tail -50 /var/log/nginx/error.log

# Sync logs
tail -50 /opt/atlas/logs/iiq_sync.log
tail -50 /opt/atlas/logs/google_sync.log
```

### Test Database Connection

```bash
# Test as postgres user
su - postgres -c "psql -c 'SELECT version();'"

# Test as atlas_admin (will prompt for password)
psql -h localhost -U atlas_admin -d atlas_db -c "SELECT 1;"

# Test with connection string from .env
source /opt/atlas/atlas-backend/.env
python3 -c "
from sqlalchemy import create_engine
engine = create_engine('$DATABASE_URL')
with engine.connect() as conn:
    print('Database connection OK')
"
```

### Test Backend API

```bash
# Health check
curl -s http://127.0.0.1:8000/ | head

# Through nginx
curl -s http://localhost/api/ | head
```

### Verify Google Credentials

```bash
# Check file exists and is readable
ls -la /opt/atlas/atlas-backend/google_credentials.json

# Validate JSON syntax
python3 -c "import json; json.load(open('/opt/atlas/atlas-backend/google_credentials.json')); print('JSON is valid')"

# Check it has required fields
python3 -c "
import json
creds = json.load(open('/opt/atlas/atlas-backend/google_credentials.json'))
required = ['type', 'project_id', 'private_key', 'client_email']
missing = [f for f in required if f not in creds]
if missing:
    print(f'Missing fields: {missing}')
else:
    print('All required fields present')
    print(f'Service account: {creds[\"client_email\"]}')
"
```

### Full System Reset

If all else fails, clean slate:

```bash
# Stop services
systemctl stop atlas nginx

# Remove ATLAS installation
rm -rf /opt/atlas

# Remove PostgreSQL database (keeps PostgreSQL installed)
su - postgres -c "psql -c 'DROP DATABASE IF EXISTS atlas_db;'"
su - postgres -c "psql -c 'DROP USER IF EXISTS atlas_admin;'"

# Remove nginx config
rm -f /etc/nginx/sites-enabled/atlas
rm -f /etc/nginx/sites-available/atlas

# Remove systemd service
rm -f /etc/systemd/system/atlas.service
systemctl daemon-reload

# Remove cron
rm -f /etc/cron.d/atlas

# Clean temp files
rm -f /tmp/atlas-install-config

# Now run installer fresh
bash <(curl -fsSL https://raw.githubusercontent.com/adukes40/ATLAS/main/installer/install.sh)
```

---

## Getting Help

If you're still stuck:

1. Gather diagnostic info:
   ```bash
   journalctl -u atlas -n 200 --no-pager > atlas-logs.txt
   cat /opt/atlas/atlas-backend/.env | grep -v PASSWORD | grep -v SECRET | grep -v TOKEN > atlas-config.txt
   ```

2. Check for similar issues in the repository

3. Open an issue with:
   - What you were trying to do
   - The error message
   - Your OS version (`cat /etc/os-release`)
   - The diagnostic output
