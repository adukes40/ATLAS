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

### Step 1: Create the container
Run this on your Proxmox host (adjust storage and network as needed):
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

### Step 2: Enter the container
```bash
pct enter 101
```

### Step 3: Update and install curl
```bash
apt update && apt upgrade -y
apt install -y curl
```

### Step 4: Run the ATLAS installer
```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/adukes40/ATLAS/main/installer/install.sh)"
```

### Step 5: Complete the wizard
Follow the prompts to enter your IIQ, Google, and Meraki credentials.

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

### Step 3: Update and install curl
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl
```

### Step 4: Run the ATLAS installer
```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/adukes40/ATLAS/main/installer/install.sh)"
```

### Step 5: Complete the wizard
Follow the prompts to enter your IIQ, Google, and Meraki credentials.

### Step 6: Access ATLAS
Find your VM's IP: `ip addr`
Open in browser: `http://<vm-ip>/`

---

## API Credentials Required
Before installation, gather the following credentials:

#### 1. Incident IQ (IIQ)
All IIQ credentials are found at **Admin > Developer Tools**:
- **Instance URL**: Your IIQ URL (e.g., `https://yourdistrict.incidentiq.com`)
- **Site ID**: Displayed on the Developer Tools page
- **API Token**: Click "Create Token" on the Developer Tools page
- **Product ID**: Listed on the Developer Tools page
  - Default for Chromebooks: `88df910c-91aa-e711-80c2-0004ffa00050`
- **Fee Field ID** (optional): Custom field UUID for fee tracking
  - Find at Admin > Custom Fields > click Fee Tracker field > copy ID from browser URL

#### 2. Google Workspace
- **Service Account JSON**: Create in Google Cloud Console
  - Enable the Admin SDK Directory API
  - Create a Service Account with domain-wide delegation
  - Download the JSON key file
- **Admin Email**: A super admin email for delegation (e.g., `admin@yourdistrict.org`)

#### 3. Cisco Meraki
- **API Key**: Generate in Meraki Dashboard > Organization > Settings > API Access
- **Organization ID**: Found in the Meraki Dashboard URL or API

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
sudo -u postgres psql << EOF
CREATE USER atlas WITH PASSWORD 'your_secure_password';
CREATE DATABASE atlas OWNER atlas;
GRANT ALL PRIVILEGES ON DATABASE atlas TO atlas;
EOF
```

### Step 6: Create Environment File
```bash
cat > /opt/atlas/atlas-backend/.env << EOF
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=atlas
DB_USER=atlas
DB_PASSWORD=your_secure_password

# IIQ API
IIQ_BASE_URL=https://yourdistrict.incidentiq.com
IIQ_SITE_ID=your_site_id
IIQ_TOKEN=your_api_token
IIQ_PRODUCT_ID=88df910c-91aa-e711-80c2-0004ffa00050
IIQ_FEE_FIELD_ID=your_fee_field_id_or_leave_empty

# Google API
GOOGLE_CREDENTIALS_FILE=/opt/atlas/atlas-backend/credentials/google-service-account.json
GOOGLE_ADMIN_EMAIL=admin@yourdistrict.org

# Meraki API
MERAKI_API_KEY=your_meraki_key
MERAKI_ORG_ID=your_org_id

# Server
ATLAS_DOMAIN=atlas.yourdistrict.org
ALLOWED_ORIGINS=http://atlas.yourdistrict.org,https://atlas.yourdistrict.org
ENVIRONMENT=production
EOF
```

### Step 7: Copy Google Service Account Credentials
```bash
cp /path/to/your/service-account.json /opt/atlas/atlas-backend/credentials/google-service-account.json
chmod 600 /opt/atlas/atlas-backend/credentials/google-service-account.json
```

### Step 8: Set Up Python Virtual Environment
```bash
cd /opt/atlas/atlas-backend
python3 -m venv venv
source venv/bin/activate

pip install --upgrade pip
pip install fastapi uvicorn[standard] sqlalchemy psycopg2-binary \
  python-dotenv httpx google-api-python-client google-auth meraki \
  python-multipart aiofiles
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

    location / {
        root /opt/atlas/atlas-ui/dist;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
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
sudo -u postgres psql -c "DROP DATABASE atlas;"
sudo -u postgres psql -c "DROP USER atlas;"

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

MIT License - See LICENSE file for details.
