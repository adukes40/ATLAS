# ATLAS Installation Guide

ATLAS (Asset, Telemetry, Location, & Analytics System) is an IT operations platform for K-12 school districts that provides a unified view of Chromebook devices by aggregating data from Incident IQ, Google Admin, and Cisco Meraki.

## System Requirements

| Resource | Minimum | Comfortable | Tested On |
|----------|---------|-------------|-----------|
| **RAM** | 2 GB | 4 GB | 4 GB |
| **CPU** | 1 vCPU | 2 vCPUs | 2 vCPUs |
| **Disk** | 10 GB | 15 GB | 20 GB |
| **OS** | Ubuntu 22.04 LTS / Debian 12 | | Ubuntu 22.04 LTS |

> **Note:** These specs apply to both LXC containers and VMs. During nightly syncs, memory usage spikes to ~1.5 GB temporarily.

---

## Deployment Recommendation

**It is recommended to run ATLAS in an isolated container or VM** to avoid conflicts with existing services (especially web servers on port 80).

---

## Option 1: Proxmox LXC Container (Recommended)

LXC containers are lightweight and get their own IP address - no port conflicts with existing services.

> **Already have an Ubuntu/Debian LXC?** Skip to [Step 4: Run the ATLAS installer](#step-4-run-the-atlas-installer).

### Step 1: Download a container template

On your Proxmox host, download the Ubuntu 22.04 template:
```bash
pveam update
pveam download local ubuntu-22.04-standard_22.04-1_amd64.tar.zst
```

### Step 2: Create the container

Run this on your Proxmox host (adjust VMID, storage, and network as needed):
```bash
pct create 101 local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst \
  --hostname atlas \
  --memory 2048 \
  --cores 2 \
  --rootfs local-lvm:20 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 \
  --features nesting=1

# Start the container
pct start 101
```

### Step 3: Enter the container
```bash
pct enter 101
```

### Step 4: Run the ATLAS installer

Update the system and run the installer:
```bash
apt update && apt upgrade -y && apt install -y git && git clone https://github.com/adukes40/atlas.git /opt/atlas && cd /opt/atlas/installer && chmod +x install.sh && ./install.sh
```

### Step 5: Complete the wizard
The installer will guide you through:
- Selecting data sources (IIQ, Google, Meraki)
- Entering API credentials
- Configuring authentication

> **Tip:** Hidden password fields will show `[•••••]` to confirm your input was received. If the installer fails partway through, just re-run it - your configuration will be saved and you can resume.

### Step 6: Access ATLAS
Find your container's IP: `ip addr show eth0`
Open in browser: `http://<container-ip>/`

---

## Option 2: Ubuntu VM (VMware ESXi, Hyper-V, etc.)

For VMware ESXi, Hyper-V, or other hypervisors, create a dedicated Ubuntu VM.

### Step 1: Create Ubuntu 22.04 VM
| Setting | Recommended |
|---------|-------------|
| Guest OS | Ubuntu 64-bit |
| vCPUs | 2 |
| RAM | 2-4 GB |
| Disk | 20 GB (thin provisioned) |
| Network | Same VLAN as management network |

Download Ubuntu 22.04 LTS Server ISO from: https://ubuntu.com/download/server

### Step 2: Install Ubuntu
- Boot from ISO
- Choose "Ubuntu Server (minimized)" for smallest footprint
- Complete installation with default settings
- Create your admin user

### Step 3: Enable SSH for remote access (Recommended)

Hypervisor consoles often have issues with copy/paste. Enable SSH so you can use PuTTY or another terminal that supports proper copy/paste:

```bash
sudo apt update && sudo apt install -y openssh-server && sudo systemctl enable --now ssh
```

Then find your IP address:
```bash
ip addr show | grep "inet "
```

Connect via PuTTY or your preferred SSH client to continue the installation with full copy/paste support.

### Step 4: Run the ATLAS installer

Clone and run the installer:
```bash
sudo apt install -y git && sudo git clone https://github.com/adukes40/atlas.git /opt/atlas && cd /opt/atlas/installer && sudo chmod +x install.sh && sudo ./install.sh
```

### Step 5: Complete the wizard
The installer will guide you through:
- Selecting data sources (IIQ, Google, Meraki)
- Entering API credentials
- Configuring authentication

> **Tip:** Hidden password fields will show `[•••••]` to confirm your input was received. If the installer fails partway through, just re-run it - your configuration will be saved and you can resume.

### Step 6: Access ATLAS
Find your VM's IP: `ip addr`
Open in browser: `http://<vm-ip>/`

---

## API Credentials Required
Before installation, gather the following credentials:

#### 1. Incident IQ (IIQ)
All IIQ credentials are found at **Admin > Developer Tools**:
- **Instance ID**: The subdomain from your IIQ URL (e.g., if your URL is `https://mydistrict.incidentiq.com`, enter `mydistrict`)
- **Site ID**: Displayed on the Developer Tools page
- **API Token**: Click "Create Token" on the Developer Tools page
- **Product ID**: Listed on the Developer Tools page

#### 2. Google Workspace - Service Account (for data sync)
Create a service account for syncing device and user data:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable **Admin SDK API**: APIs & Services > Enable APIs > Search "Admin SDK" > Enable
4. Create Service Account: IAM & Admin > Service Accounts > Create
5. Download JSON key file
6. Enable Domain-Wide Delegation:
   - Go to [Google Admin Console](https://admin.google.com) > Security > API Controls > Domain-wide delegation
   - Add new API client with the service account's Client ID
   - Add scopes:
     ```
     https://www.googleapis.com/auth/admin.directory.device.chromeos.readonly
     https://www.googleapis.com/auth/admin.directory.user.readonly
     https://www.googleapis.com/auth/admin.directory.group.member.readonly
     ```
- **Admin Email**: A super admin email for delegation (e.g., `admin@yourdistrict.org`)

> **Important:** When entering credentials during installation, use the **base64 method** (option 1) to avoid JSON corruption. Raw paste can break the private key due to line breaks. To encode your credentials:
> ```bash
> base64 -w0 google_credentials.json && echo
> ```
> Then paste the single-line output during installation.

#### 3. Google Workspace - OAuth Client (for user authentication)
Create OAuth credentials for user login:

1. In Google Cloud Console > APIs & Services > Credentials
2. Create OAuth 2.0 Client ID (Web application type)
3. Add authorized redirect URIs:
   - `http://atlas.yourdistrict.org/auth/callback`
   - `https://atlas.yourdistrict.org/auth/callback`
4. Note the **Client ID** and **Client Secret**
5. Configure OAuth consent screen:
   - User type: Internal (restricts to your domain)
   - Add your domain to authorized domains

#### 4. Cisco Meraki
- **API Key**: Generate in Meraki Dashboard > Organization > Settings > API Access
- **Organization ID**: Found in the Meraki Dashboard URL or API

#### 5. Create Access Control Group
Create a Google Group to control who can access ATLAS:
1. Go to Google Admin Console > Groups
2. Create a group (e.g., `atlas-users@yourdistrict.org`)
3. Add IT staff who should have access
4. Use this group email in `REQUIRED_GROUP` environment variable

---

## Manual Installation

If you prefer manual installation or need to customize the process:

### Step 1: Install System Dependencies
```bash
apt update && apt install -y \
  curl wget git build-essential \
  python3 python3-pip python3-venv \
  postgresql postgresql-contrib \
  nginx certbot python3-certbot-nginx
```

### Step 2: Install Node.js 20
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

### Step 3: Create Directory Structure
```bash
mkdir -p /opt/atlas/{atlas-backend,atlas-ui,logs,backups}
mkdir -p /opt/atlas/atlas-backend/{app,scripts,credentials}
```

### Step 4: Clone the Repository
```bash
git clone https://github.com/adukes40/ATLAS.git /tmp/atlas-source
cp -r /tmp/atlas-source/atlas-backend/* /opt/atlas/atlas-backend/
cp -r /tmp/atlas-source/atlas-ui/* /opt/atlas/atlas-ui/
rm -rf /tmp/atlas-source
```

### Step 5: Set Up PostgreSQL
```bash
systemctl start postgresql
systemctl enable postgresql

# Create database and user
# Note: On LXC containers without sudo, use: su - postgres -c "psql -c '...'"
sudo -u postgres psql -c "CREATE USER atlas_admin WITH PASSWORD 'your_secure_password';"
sudo -u postgres psql -c "CREATE DATABASE atlas_db OWNER atlas_admin;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE atlas_db TO atlas_admin;"

# Enable password authentication for localhost
echo "host    all    all    127.0.0.1/32    md5" >> /etc/postgresql/*/main/pg_hba.conf
echo "host    all    all    ::1/128         md5" >> /etc/postgresql/*/main/pg_hba.conf
systemctl reload postgresql
```

### Step 6: Create Environment File
```bash
cat > /opt/atlas/atlas-backend/.env << EOF
# =============================================================================
# DATABASE
# =============================================================================
DATABASE_URL=postgresql://atlas_admin:your_secure_password@localhost/atlas_db

# =============================================================================
# INCIDENT IQ (IIQ) API
# Get these from: IIQ Admin > Developer Tools
# =============================================================================
IIQ_URL=https://<your-instance-id>.incidentiq.com
IIQ_TOKEN=your_api_token
IIQ_SITE_ID=your_site_id
IIQ_PRODUCT_ID=your_product_id

# =============================================================================
# GOOGLE WORKSPACE API
# =============================================================================
GOOGLE_CREDS_PATH=/opt/atlas/atlas-backend/google_credentials.json
GOOGLE_ADMIN_EMAIL=admin@yourdistrict.org

# =============================================================================
# CISCO MERAKI API
# =============================================================================
MERAKI_API_KEY=your_meraki_key
MERAKI_ORG_ID=your_org_id

# =============================================================================
# SECURITY & AUTHENTICATION
# =============================================================================
# Generate with: python -c "import secrets; print(secrets.token_urlsafe(32))"
SECRET_KEY=your_generated_secret_key

# Domain restriction for Google OAuth
ALLOWED_DOMAIN=yourdistrict.org

# Google Group that grants access to ATLAS (users must be members)
REQUIRED_GROUP=atlas-users@yourdistrict.org

# =============================================================================
# GOOGLE OAUTH (Get from Google Cloud Console)
# =============================================================================
GOOGLE_OAUTH_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret
EOF

# Set secure permissions
chmod 600 /opt/atlas/atlas-backend/.env
```

### Step 7: Copy Google Service Account Credentials

**Option A: Copy from local file**
```bash
cp /path/to/your/service-account.json /opt/atlas/atlas-backend/google_credentials.json
chmod 600 /opt/atlas/atlas-backend/google_credentials.json
```

**Option B: Transfer via base64 (recommended for remote transfers)**

On the source machine:
```bash
base64 -w0 service-account.json && echo
```

On the ATLAS server:
```bash
echo "PASTE_BASE64_HERE" | base64 -d > /opt/atlas/atlas-backend/google_credentials.json
chmod 600 /opt/atlas/atlas-backend/google_credentials.json

# Verify it's valid JSON
python3 -c "import json; json.load(open('/opt/atlas/atlas-backend/google_credentials.json')); print('JSON OK')"
```

### Step 8: Set Up Python Virtual Environment
```bash
cd /opt/atlas/atlas-backend
python3 -m venv venv
source venv/bin/activate

pip install --upgrade pip
pip install fastapi uvicorn[standard] sqlalchemy psycopg2-binary \
  python-dotenv httpx google-api-python-client google-auth meraki \
  python-multipart aiofiles authlib itsdangerous slowapi
```

### Step 9: Build the Frontend
```bash
cd /opt/atlas/atlas-ui
npm install
npm run build
```

### Step 10: Create Systemd Service
```bash
cat > /etc/systemd/system/atlas.service << EOF
[Unit]
Description=ATLAS API Service
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/atlas/atlas-backend
Environment="PATH=/opt/atlas/atlas-backend/venv/bin"
EnvironmentFile=/opt/atlas/atlas-backend/.env
ExecStart=/opt/atlas/atlas-backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable atlas
systemctl start atlas
```

### Step 11: Configure Nginx
```bash
cat > /etc/nginx/sites-available/atlas << 'EOF'
server {
    listen 80;
    server_name atlas.yourdistrict.org;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Frontend (static files)
    location / {
        root /opt/atlas/atlas-ui/dist;
        try_files $uri $uri/ /index.html;
    }

    # API endpoints
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    # Authentication endpoints (Google OAuth)
    location /auth {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/atlas /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

### Step 12: Set Up Cron Jobs
```bash
cat > /etc/cron.d/atlas << EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Google sync at 2 AM
0 2 * * * root /opt/atlas/atlas-backend/venv/bin/python /opt/atlas/atlas-backend/scripts/google_bulk_sync.py >> /opt/atlas/logs/google_sync.log 2>&1

# IIQ sync at 3 AM
0 3 * * * root /opt/atlas/atlas-backend/venv/bin/python /opt/atlas/atlas-backend/scripts/iiq_bulk_sync.py >> /opt/atlas/logs/iiq_sync.log 2>&1
EOF

chmod 644 /etc/cron.d/atlas
```

---

## Post-Installation

### Run Initial Data Sync

After installation, run the initial sync to populate your database:

```bash
# Sync IIQ assets and users
/opt/atlas/atlas-backend/venv/bin/python /opt/atlas/atlas-backend/scripts/iiq_bulk_sync.py

# Sync Google devices
/opt/atlas/atlas-backend/venv/bin/python /opt/atlas/atlas-backend/scripts/google_bulk_sync.py
```

### Enable HTTPS (Recommended)

```bash
certbot --nginx -d atlas.yourdistrict.org
```

After enabling HTTPS, update your `.env` file:
- Change `GOOGLE_OAUTH_CLIENT_ID` redirect URI to use `https://`
- Update the OAuth credentials in Google Cloud Console to include the HTTPS callback URL

### Verify Installation

1. Access ATLAS at `http://atlas.yourdistrict.org`
2. Search for a device by serial number or asset tag
3. Check the Dashboards for data aggregates
4. Review the Reports section

---

## Troubleshooting

### Check Service Status
```bash
systemctl status atlas
systemctl status nginx
systemctl status postgresql
```

### View Logs
```bash
# Backend API logs
journalctl -u atlas -f

# Sync logs
tail -f /opt/atlas/logs/iiq_sync.log
tail -f /opt/atlas/logs/google_sync.log

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### Common Issues

#### Backend won't start
1. Check `.env` file exists and has correct values
2. Verify PostgreSQL is running: `systemctl status postgresql`
3. Check database connection: `psql -h localhost -U atlas -d atlas`

#### No data after sync
1. Verify API credentials in `.env`
2. Check sync logs for errors: `tail -100 /opt/atlas/logs/iiq_sync.log`
3. Manually run sync script to see output

#### Nginx 502 Bad Gateway
1. Verify backend is running: `systemctl status atlas`
2. Check if port 8000 is listening: `netstat -tlnp | grep 8000`
3. Review nginx error log: `tail /var/log/nginx/error.log`

#### Authentication Issues
1. Verify OAuth credentials in `.env` are correct
2. Check redirect URI matches Google Cloud Console exactly
3. Ensure user is a member of the `REQUIRED_GROUP`
4. Verify service account has group membership scope

---

## Security Configuration

### File Permissions
Ensure sensitive files are protected:
```bash
chmod 600 /opt/atlas/atlas-backend/.env
chmod 600 /opt/atlas/atlas-backend/google_credentials.json
```

### Secret Files
The following files contain sensitive credentials and should NEVER be committed to git:
- `.env` - API keys, tokens, database credentials
- `google_credentials.json` - Google service account private key

### Authentication Flow
ATLAS uses Google OAuth 2.0 with group-based authorization:
1. User clicks "Sign in with Google"
2. Google authenticates the user (must be from your domain)
3. Backend verifies user is a member of the required Google Group
4. If authorized, a session is created

### Rotating Credentials
If you suspect credentials have been compromised:
1. **IIQ Token**: Generate new token at IIQ Admin > Developer Tools
2. **Meraki API Key**: Generate new key in Meraki Dashboard
3. **Database Password**: Change in PostgreSQL and update `.env`
4. **Google Service Account**: Create new key in Google Cloud Console
5. **SECRET_KEY**: Generate new value with `python -c "import secrets; print(secrets.token_urlsafe(32))"`

After rotating, restart the service: `systemctl restart atlas`

---

## Updating ATLAS

To update to the latest version:

```bash
cd /opt/atlas

# Backup current installation
cp -r atlas-backend atlas-backend.bak
cp -r atlas-ui atlas-ui.bak

# Pull latest code
git clone --depth 1 https://github.com/adukes40/ATLAS.git /tmp/atlas-update
cp -r /tmp/atlas-update/atlas-backend/* atlas-backend/
cp -r /tmp/atlas-update/atlas-ui/* atlas-ui/
rm -rf /tmp/atlas-update

# Rebuild frontend
cd atlas-ui
npm install
npm run build

# Restart services
systemctl restart atlas
systemctl reload nginx
```

---

## Uninstallation

To completely remove ATLAS:

```bash
# Stop and disable services
systemctl stop atlas
systemctl disable atlas
rm /etc/systemd/system/atlas.service

# Remove nginx config
rm /etc/nginx/sites-enabled/atlas
rm /etc/nginx/sites-available/atlas
systemctl reload nginx

# Remove cron jobs
rm /etc/cron.d/atlas

# Remove database
sudo -u postgres psql -c "DROP DATABASE atlas_db;"
sudo -u postgres psql -c "DROP USER atlas_admin;"

# Remove files
rm -rf /opt/atlas

systemctl daemon-reload
```

---

## Support

For issues and feature requests, please visit the GitHub repository:
https://github.com/adukes40/ATLAS

---

## License

All Rights Reserved. This software is proprietary and confidential.
