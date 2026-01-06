# ATLAS Technical Overview

**Asset, Telemetry, Location, and Analytics System**

Version 1.0 | January 2026

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Technology Stack](#technology-stack)
4. [Data Sources and Integration](#data-sources-and-integration)
5. [Application Screens](#application-screens)
6. [Data Flow](#data-flow)
7. [Security Implementation](#security-implementation)
8. [Database Schema](#database-schema)
9. [API Reference](#api-reference)
10. [Deployment Architecture](#deployment-architecture)

---

## Executive Summary

ATLAS is an IT operations platform designed for K-12 school districts that consolidates device management data from multiple enterprise systems into a single, searchable interface. The platform aggregates information from Incident IQ (asset management), Google Workspace (Chrome OS telemetry), and Cisco Meraki (network location) to provide IT staff with a complete view of any device in seconds.

### Core Design Principles

- **Data Separation at Ingestion, Linking at Query Time**: Each data source maintains its own database table. Relationships are built dynamically through serial numbers, MAC addresses, and email addresses. This prevents data coupling issues and allows independent sync schedules.

- **Live Sync on Lookup**: When a device is searched, ATLAS performs real-time API calls to fetch the latest data before displaying results. This ensures IT staff always see current information.

- **Read-Only Integration**: ATLAS only reads data from source systems. It never writes back, ensuring it cannot corrupt source data.

---

## Architecture Overview

```
                                    +------------------+
                                    |   Web Browser    |
                                    +--------+---------+
                                             |
                                             | HTTPS
                                             v
+-----------------------------------------------------------------------------------+
|                                      NGINX                                         |
|  - Reverse proxy                                                                   |
|  - Static file serving (React build)                                               |
|  - SSL termination                                                                 |
+-----------------------------------------------------------------------------------+
            |                                           |
            | /api/* and /auth/*                        | /* (static files)
            v                                           v
+---------------------------+                 +---------------------------+
|     FastAPI Backend       |                 |    React SPA (Vite)       |
|  - REST API endpoints     |                 |  - Device360 lookup       |
|  - OAuth authentication   |                 |  - Dashboards             |
|  - Rate limiting          |                 |  - Reports                |
|  - Data aggregation       |                 |  - Utilities              |
+---------------------------+                 +---------------------------+
            |
            v
+---------------------------+
|       PostgreSQL          |
|  - iiq_assets             |
|  - iiq_users              |
|  - google_devices         |
|  - google_users           |
|  - network_cache          |
|  - meraki_* tables        |
+---------------------------+

External APIs (Read-Only):
+-------------+  +------------------+  +---------------+
| Incident IQ |  | Google Admin SDK |  | Meraki API    |
+-------------+  +------------------+  +---------------+
```

---

## Technology Stack

### Backend

| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | FastAPI (Python 3.11+) | High-performance async API framework with automatic OpenAPI documentation |
| ORM | SQLAlchemy 2.0 | Database abstraction with type hints and modern Python patterns |
| Database | PostgreSQL 15+ | Reliable RDBMS with JSON support for flexible data storage |
| Authentication | Google OAuth 2.0 + itsdangerous | Secure SSO with session tokens |
| Rate Limiting | slowapi | Per-user rate limiting to prevent API abuse |

**Why FastAPI?**
- Native async support for concurrent API calls to external services
- Automatic request validation with Pydantic schemas
- Built-in OpenAPI documentation
- Strong typing reduces bugs
- Excellent performance for I/O-bound workloads

### Frontend

| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | React 18 | Component-based UI with hooks |
| Build Tool | Vite 5 | Fast development server and optimized production builds |
| Styling | Tailwind CSS 3 | Utility-first CSS for rapid UI development |
| Charts | Recharts | Composable charting library for dashboards |
| Icons | Lucide React | Consistent, lightweight icon set |
| HTTP Client | Axios | Promise-based HTTP client with interceptors |

**Why React + Vite?**
- Vite provides sub-second hot module replacement during development
- React's component model matches the modular nature of the UI
- Tailwind eliminates CSS conflicts and reduces bundle size
- Large ecosystem of compatible libraries

### Infrastructure

| Component | Technology | Purpose |
|-----------|------------|---------|
| Web Server | Nginx | Reverse proxy, static file serving, SSL termination |
| Process Manager | systemd | Service management and automatic restart |
| Scheduler | cron | Nightly data synchronization |
| Container (optional) | LXC/Docker | Isolated deployment environment |

---

## Data Sources and Integration

### Incident IQ (IIQ)

**Purpose**: Asset management, device ownership, ticket history, user fee tracking

**Data Retrieved**:
- Asset records (serial number, asset tag, model, status)
- Owner assignment (user email, name, grade, location)
- Ticket counts per device
- User fee balances

**Integration Method**:
- REST API with Bearer token authentication
- Bulk sync: Paginated POST requests (100 records per page)
- Live sync: Single-record lookup by serial or asset tag
- Sync schedule: Nightly at 3:00 AM

**API Endpoints Used**:
- `POST /api/v1.0/assets/list` (bulk asset retrieval)
- `GET /api/v1.0/users` (user data with pagination)
- `GET /api/v1.0/assets/{query}` (single asset lookup)

### Google Workspace Admin SDK

**Purpose**: Chrome OS device telemetry, hardware health, OS compliance

**Data Retrieved**:
- Device status (Active, Disabled, Deprovisioned)
- Auto Update Expiration (AUE) dates
- OS version and compliance status
- Hardware metrics (CPU temp, RAM, disk, battery health)
- Recent user login history
- Network information (LAN/WAN IP, MAC addresses)
- Organizational Unit path

**Integration Method**:
- Service account with domain-wide delegation
- OAuth 2.0 with offline access
- Bulk sync: Paginated requests (100 devices per page)
- Live sync: Single-device lookup by serial number
- Sync schedule: Nightly at 2:00 AM

**API Scopes Required**:
```
https://www.googleapis.com/auth/admin.directory.device.chromeos.readonly
https://www.googleapis.com/auth/admin.directory.user.readonly
https://www.googleapis.com/auth/admin.directory.group.member.readonly
```

### Cisco Meraki

**Purpose**: Network location tracking, wireless connectivity data

**Data Retrieved**:
- Current access point connection
- Signal strength (RSSI)
- SSID and VLAN
- Last seen timestamp
- Client ID for dashboard linking
- Network infrastructure inventory

**Integration Method**:
- REST API with Bearer token authentication
- Organization-level client search by MAC address
- Network-specific client details for dashboard URLs
- Bulk sync: Networks, devices, SSIDs, clients (24-hour window)

**API Endpoints Used**:
- `GET /organizations/{org}/clients/search` (find client by MAC)
- `GET /networks/{network}/clients/{mac}` (client details and ID)
- `GET /organizations/{org}/networks` (network inventory)
- `GET /networks/{network}/wireless/clients` (wireless client list)

---

## Application Screens

### 1. Login Page (`/login`)

**Purpose**: Secure authentication entry point

**Information Displayed**:
- Google Sign-In button
- District branding
- Error messages for unauthorized access

**Data Source**: Google OAuth 2.0

**How It Works**:
1. User clicks "Sign in with Google"
2. Redirect to Google OAuth consent screen
3. Google authenticates user against district domain
4. Backend receives OAuth callback with user info
5. Backend checks if user email is member of required Google Group
6. If authorized, session cookie is set and user redirected to Device360

### 2. Device 360 (`/` - Home Page)

**Purpose**: Primary device lookup interface for IT staff

**Information Displayed**:

| Section | Data Points | Source |
|---------|-------------|--------|
| Identity | Serial number, assigned user name | IIQ + Google |
| Asset Info | Status, asset tag, model, location | IIQ |
| Owner Details | Name, email, grade, school ID, homeroom | IIQ |
| Fee Information | Balance, past due amount | IIQ (via user record) |
| Ticket History | Open ticket count with link | IIQ |
| Device Telemetry | OS version, AUE date, compliance status | Google |
| Hardware Health | Battery %, CPU temp, disk space, RAM | Google |
| Network Location | Connected AP, signal strength, SSID, last seen | Meraki |
| IP Addresses | LAN IP, WAN IP | Google |
| Conflicts | Data integrity warnings (e.g., owner mismatch) | Computed |

**Data Flow**:
1. User enters serial number or asset tag
2. Frontend sends GET request to `/api/device/{query}`
3. Backend performs live sync to IIQ API
4. Backend performs live sync to Google Admin API
5. Backend resolves MAC address from IIQ or Google record
6. Backend performs live sync to Meraki API using MAC
7. Data aggregated and conflicts detected
8. Combined response returned to frontend
9. Frontend renders organized cards with external links

**External Links Provided**:
- IIQ asset profile (opens in IIQ dashboard)
- Google Admin device page (opens in admin console)
- Meraki client details (opens in Meraki dashboard)
- IIQ user profile (for owner lookup)

### 3. Dashboards

#### Overview Dashboard (`/dashboards`)

**Purpose**: Landing page with navigation cards to specific dashboards

**Information Displayed**: Summary counts and navigation tiles

#### Google Dashboard (`/dashboards/google`)

**Purpose**: Chrome OS fleet health overview

**Information Displayed**:
- Total device count by status (Active, Disabled, Deprovisioned)
- AUE status breakdown (Expired, Expiring Soon, Compliant)
- OS version distribution chart
- AUE timeline chart (devices expiring by year)

**Data Source**: `google_devices` table (aggregated queries)

#### IIQ Dashboard (`/dashboards/iiq`)

**Purpose**: Asset and user management overview

**Information Displayed**:
- Total assets by status (In Service, Broken, Storage, etc.)
- Student device assignment statistics
- Students without Chromebooks count
- Location-based device distribution
- Recent ticket activity summary

**Data Source**: `iiq_assets` and `iiq_users` tables

#### Meraki Dashboard (`/dashboards/meraki`)

**Purpose**: Network infrastructure overview

**Information Displayed**:
- Total networks, access points, switches
- Devices by status (online/offline)
- Client connection statistics
- AP utilization metrics

**Data Source**: `meraki_networks`, `meraki_devices`, `meraki_clients` tables

### 4. Reports

All reports feature:
- Server-side pagination (25, 50, 100, 200 rows per page)
- Server-side sorting on all columns
- Multi-select filters with Include/Exclude modes
- CSV export with current filters applied
- Sticky headers for scrolling

#### Device Inventory (`/reports/device-inventory`)

**Purpose**: Complete device listing with assignment information

**Columns**: Asset Tag, Serial, Model, IIQ Status, Google Status, Location, Assigned User, Grade, AUE Date

**Filters**: Status, Location, Model, Grade

**Data Source**: JOIN of `iiq_assets` and `google_devices` on serial number

#### AUE/End-of-Life Report (`/reports/aue-eol`)

**Purpose**: Track devices approaching or past Auto Update Expiration

**Columns**: Serial, Model, AUE Date, Days Until Expiration, IIQ Status, Google Status, Assigned User

**Visual Indicators**:
- Red: Expired (past AUE date)
- Amber: Expiring within 6 months
- Green: Compliant (more than 6 months remaining)

**Data Source**: `google_devices` with AUE date filtering

#### Fee Balances (`/reports/fee-balances`)

**Purpose**: Identify users with outstanding device fees

**Columns**: Name, School ID, Email, Grade, Location, Balance, Past Due

**Filters**: Location, Grade, Minimum Balance

**Data Source**: `iiq_users` where fee_balance > 0

#### Students Without Chromebook (`/reports/no-chromebook`)

**Purpose**: Identify students who need device assignment

**Columns**: Name, School ID, Email, Grade, Location, Homeroom

**Logic**: Active students in `iiq_users` with role "Student" who have no matching record in `iiq_assets.owner_iiq_id`

#### Multiple Devices (`/reports/multiple-devices`)

**Purpose**: Find users assigned more than one device

**Columns**: Name, Email, Grade, Location, Device Count, Serial Numbers

**Logic**: GROUP BY owner with COUNT(devices) > 1

#### Custom Builder (`/reports/custom`)

**Purpose**: Ad-hoc reporting with column selection

**Features**:
- Select data source (IIQ Assets, IIQ Users, Google Devices, etc.)
- Choose columns to display
- Apply dynamic filters
- Export results

### 5. Utilities (`/utilities`)

**Purpose**: Database administration and sync controls

**Features**:
- Database table browser (view row counts, preview data)
- Manual sync triggers for each data source
- Sync status and last run timestamps
- Error log viewer

---

## Data Flow

### Nightly Bulk Sync

```
[Cron Job - 2:00 AM]
    |
    v
[Google Bulk Sync Script]
    |
    +-- Fetch all Chrome OS devices (paginated)
    +-- Upsert records to google_devices table
    +-- Fetch all Google users (paginated)
    +-- Upsert records to google_users table
    |
    v
[Complete - ~26,000 devices in ~5 minutes]

[Cron Job - 3:00 AM]
    |
    v
[IIQ Bulk Sync Script]
    |
    +-- Fetch all assets (paginated POST requests)
    +-- Upsert records to iiq_assets table
    +-- Fetch all users (paginated GET requests)
    +-- Upsert records to iiq_users table
    +-- Cache ticket statistics
    |
    v
[Complete - ~27,000 assets + ~24,000 users in ~10 minutes]
```

### Live Device Lookup

```
[User searches "7X70YF3"]
    |
    v
[Frontend: GET /api/device/7X70YF3]
    |
    v
[Backend: IIQ Live Sync]
    +-- POST to IIQ API with serial number
    +-- Upsert to iiq_assets
    |
    v
[Backend: Google Live Sync]
    +-- GET from Google Admin API by serial
    +-- Upsert to google_devices
    |
    v
[Backend: Resolve MAC Address]
    +-- Check iiq_assets.mac_address
    +-- Fallback: google_devices.mac_address
    |
    v
[Backend: Meraki Live Sync]
    +-- GET /organizations/{org}/clients/search?mac={mac}
    +-- GET /networks/{network}/clients/{mac} for client ID
    +-- Upsert to network_cache
    |
    v
[Backend: Aggregate Response]
    +-- Combine IIQ, Google, Meraki data
    +-- Detect conflicts (owner mismatch, asset tag issues)
    +-- Lookup network URL for Meraki deep linking
    |
    v
[Frontend: Render Device360 view]
```

---

## Security Implementation

### Authentication

| Layer | Implementation |
|-------|----------------|
| Identity Provider | Google OAuth 2.0 |
| Domain Restriction | Only emails from configured domain accepted |
| Authorization | Google Group membership required |
| Session Management | Signed cookies using itsdangerous |
| Session Duration | 8 hours (configurable) |

### Authorization Flow

```
1. User initiates login
2. Redirect to Google OAuth consent
3. User authenticates with Google
4. Callback received with authorization code
5. Backend exchanges code for tokens
6. Backend extracts user email from ID token
7. Backend calls Google Admin API to check group membership
8. If user is member of REQUIRED_GROUP:
   - Create signed session cookie
   - Redirect to application
9. If user is NOT a member:
   - Display "Access Denied" message
   - Log unauthorized attempt
```

### API Security

| Protection | Implementation |
|------------|----------------|
| Rate Limiting | Per-user limits (identified by email or IP) |
| Request Validation | Pydantic schemas validate all inputs |
| SQL Injection | SQLAlchemy ORM with parameterized queries |
| XSS Prevention | React's default escaping + CSP headers |
| CSRF Protection | Same-site cookies |

### Rate Limits

| Endpoint Type | Limit | Purpose |
|---------------|-------|---------|
| Device 360 | 60/minute | Prevent API hammering |
| Dashboards | 30/minute | Aggregate query protection |
| Reports | 20/minute | Heavy query protection |
| CSV Exports | 10/minute | Prevent data scraping |
| Sync Triggers | 5/hour | Prevent API quota exhaustion |

### Credential Security

| Credential | Storage | Protection |
|------------|---------|------------|
| Database password | .env file | File permissions 600, excluded from git |
| API tokens | .env file | File permissions 600, excluded from git |
| Google service account | JSON file | File permissions 600, excluded from git |
| Session secret | .env file | Randomly generated, 256-bit |
| OAuth client secret | .env file | File permissions 600, excluded from git |

### Network Security

| Layer | Implementation |
|-------|----------------|
| Transport | HTTPS with TLS 1.2+ (via Let's Encrypt) |
| Backend Binding | 127.0.0.1 only (not exposed externally) |
| Nginx Headers | X-Frame-Options, X-Content-Type-Options, X-XSS-Protection |
| CORS | Restricted to configured domain |

---

## Database Schema

### Primary Tables

```
iiq_assets
├── serial_number (PK) ─────────────────┐
├── iiq_id (UUID)                       │
├── asset_tag                           │ Links to
├── model, model_category               │ google_devices
├── status                              │
├── mac_address ─────────────────────┐  │
├── assigned_user_email              │  │
├── assigned_user_name               │  │
├── owner_iiq_id ────────────────┐   │  │
└── location, ticket_count       │   │  │
                                 │   │  │
iiq_users                        │   │  │
├── user_id (PK) <───────────────┘   │  │
├── email                            │  │
├── full_name                        │  │
├── role_name, grade                 │  │
├── location_name                    │  │
├── fee_balance, fee_past_due        │  │
└── is_active                        │  │
                                     │  │
google_devices                       │  │
├── serial_number (PK) <─────────────│──┘
├── google_id                        │
├── status, aue_date                 │
├── os_version                       │
├── mac_address ─────────────────────┤
├── battery_health_percent           │
├── cpu_temp_avg                     │
└── last_sync                        │
                                     │
network_cache                        │
├── mac_address (PK) <───────────────┘
├── client_id, network_id
├── last_ap_name
├── ssid, ip_address
└── last_seen
```

### Meraki Reference Tables

```
meraki_networks          meraki_devices           meraki_clients
├── network_id (PK)      ├── serial (PK)          ├── mac (PK)
├── name                 ├── name                 ├── last_ap_name
├── url                  ├── model                ├── last_ssid
├── product_types        ├── network_id           ├── rssi
└── tags                 ├── status               ├── psk_group
                         └── lan_ip               └── last_seen
```

---

## API Reference

### Authentication Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/login` | Initiate Google OAuth flow |
| GET | `/auth/callback` | Handle OAuth callback |
| GET | `/auth/logout` | Clear session |
| GET | `/auth/me` | Get current user info |

### Device Endpoints

| Method | Path | Description | Rate Limit |
|--------|------|-------------|------------|
| GET | `/api/device/{query}` | 360-degree device lookup | 60/min |

### Dashboard Endpoints

| Method | Path | Description | Rate Limit |
|--------|------|-------------|------------|
| GET | `/api/dashboards/overview` | Cross-source summary | 30/min |
| GET | `/api/dashboards/google` | Google device stats | 30/min |
| GET | `/api/dashboards/iiq` | IIQ asset/user stats | 30/min |
| GET | `/api/dashboards/meraki` | Network stats | 30/min |

### Report Endpoints

| Method | Path | Description | Rate Limit |
|--------|------|-------------|------------|
| GET | `/api/reports/device-inventory` | All devices | 20/min |
| GET | `/api/reports/aue-eol` | AUE status report | 20/min |
| GET | `/api/reports/fee-balances` | Outstanding fees | 20/min |
| GET | `/api/reports/no-chromebook` | Unassigned students | 20/min |
| GET | `/api/reports/multiple-devices` | Multi-device users | 20/min |
| GET | `/api/reports/custom/{source}` | Custom query | 20/min |

All report endpoints support:
- `?page=N` - Page number (0-indexed)
- `?limit=N` - Results per page (25, 50, 100, 200)
- `?sort=column` - Sort column
- `?order=asc|desc` - Sort direction
- Filter parameters vary by report

---

## Deployment Architecture

### Recommended: Isolated Container/VM

```
+------------------------------------------+
|           Host System / Hypervisor        |
|  +------------------------------------+  |
|  |        LXC Container / VM          |  |
|  |                                    |  |
|  |  +------------+  +-------------+   |  |
|  |  |   Nginx    |  |  PostgreSQL |   |  |
|  |  | (port 80)  |  | (port 5432) |   |  |
|  |  +-----+------+  +-------------+   |  |
|  |        |                           |  |
|  |        v                           |  |
|  |  +------------+                    |  |
|  |  |  FastAPI   |                    |  |
|  |  | (port 8000)|                    |  |
|  |  +------------+                    |  |
|  |                                    |  |
|  |  IP: 192.168.1.x                   |  |
|  +------------------------------------+  |
+------------------------------------------+
```

### File System Layout

```
/opt/atlas/
├── atlas-backend/
│   ├── app/
│   │   ├── main.py           # FastAPI application entry
│   │   ├── auth.py           # OAuth + session management
│   │   ├── config.py         # Environment configuration
│   │   ├── database.py       # SQLAlchemy connection
│   │   ├── models.py         # Database models
│   │   ├── schemas.py        # Pydantic schemas
│   │   ├── routers/
│   │   │   ├── auth.py       # Auth endpoints
│   │   │   ├── devices.py    # Device 360 endpoint
│   │   │   ├── dashboards.py # Dashboard endpoints
│   │   │   ├── reports.py    # Report endpoints
│   │   │   └── utilities.py  # Utility endpoints
│   │   └── services/
│   │       ├── iiq_sync.py        # IIQ API connector
│   │       ├── google_sync.py     # Google Admin connector
│   │       ├── meraki_sync.py     # Meraki API connector
│   │       └── meraki_bulk_sync.py
│   ├── scripts/
│   │   ├── iiq_bulk_sync.py      # Nightly IIQ sync
│   │   └── google_bulk_sync.py   # Nightly Google sync
│   ├── venv/                      # Python virtual environment
│   ├── .env                       # Configuration (not in git)
│   └── google_credentials.json   # Service account (not in git)
├── atlas-ui/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   ├── components/
│   │   └── context/
│   ├── dist/                     # Production build output
│   └── package.json
├── logs/
│   ├── iiq_sync.log
│   └── google_sync.log
└── docs/
```

### System Services

```
atlas.service (systemd)
├── Type: simple
├── User: root (Phase 5 will change to 'atlas')
├── WorkingDirectory: /opt/atlas/atlas-backend
├── ExecStart: uvicorn app.main:app --host 127.0.0.1 --port 8000
├── Restart: always
└── After: network.target, postgresql.service
```

---

## Appendix: Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | postgresql://user:pass@localhost/atlas |
| IIQ_URL | Incident IQ instance URL | https://district.incidentiq.com |
| IIQ_TOKEN | IIQ API bearer token | eyJhbG... |
| IIQ_SITE_ID | IIQ site identifier | uuid |
| IIQ_PRODUCT_ID | Product filter (Chromebooks) | uuid |
| GOOGLE_CREDS_PATH | Path to service account JSON | /opt/atlas/.../google_credentials.json |
| GOOGLE_ADMIN_EMAIL | Admin email for delegation | admin@district.org |
| MERAKI_API_KEY | Meraki Dashboard API key | 1e3bc... |
| MERAKI_ORG_ID | Meraki organization ID | 668784... |
| SECRET_KEY | Session signing key | randomly generated |
| ALLOWED_DOMAIN | Allowed email domain | district.org |
| REQUIRED_GROUP | Google Group for access | atlas-users@district.org |
| GOOGLE_OAUTH_CLIENT_ID | OAuth client ID | xxx.apps.googleusercontent.com |
| GOOGLE_OAUTH_CLIENT_SECRET | OAuth client secret | GOCSPX-... |

---

Document Version: 1.0
Last Updated: January 2026
