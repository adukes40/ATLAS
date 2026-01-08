# ATLAS - Asset, Telemetry, Location, & Analytics System

## Project Overview
ATLAS is an IT operations platform for Caesar Rodney School District that provides a unified view of Chromebook devices by aggregating data from multiple sources. The platform enables IT staff to quickly look up any device and see consolidated information from IIQ, Google Admin, and Meraki in one place.

## Core Architecture Principle
**Data stays separate at ingestion, linked at query time.**

Each data source maintains its own table. Relationships are built through:
- **Serial Number**: Links IIQ assets to Google devices
- **MAC Address**: Links devices to network location data
- **Email Address**: Links assets to users

This design allows independent sync schedules and prevents data coupling issues.

---

## Tech Stack
- **Backend**: FastAPI + SQLAlchemy + PostgreSQL
- **Frontend**: React 18 + Vite + Tailwind CSS
- **Charts**: Recharts
- **Icons**: Lucide React

---

## Project Structure

### Backend (`/opt/atlas/atlas-backend/`)
```
.env                   # Environment variables (secrets - DO NOT commit)
.env.example           # Template for .env (safe to commit)
google_credentials.json # Google service account (DO NOT commit)

/app
  main.py              # FastAPI app entry point
  auth.py              # Dual auth (local + OAuth) + session management
  config.py            # Config from database with .env fallback
  crypto.py            # Fernet encryption for secrets
  database.py          # PostgreSQL connection via SQLAlchemy
  models.py            # All database models
  schemas.py           # Pydantic response schemas
  /routers
    auth.py            # Auth endpoints (local login + OAuth)
    devices.py         # Device 360 API (/api/device/{query})
    dashboards.py      # Dashboard aggregate APIs
    reports.py         # Reports API (5 pre-canned + custom builder)
    settings.py        # Admin settings + user management API
  /services
    iiq_sync.py        # IIQ API connector + bulk sync
    google_sync.py     # Google Admin API connector
    meraki_sync.py     # Meraki API connector
    local_auth.py      # Local user authentication (bcrypt)
    settings_service.py # Encrypted settings storage

/scripts
  google_bulk_sync.py  # Nightly Google sync (2 AM)
  iiq_bulk_sync.py     # Nightly IIQ sync (3 AM)
```

### Frontend (`/opt/atlas/atlas-ui/`)
```
/src
  App.jsx              # Router + layout wrapper (responsive width)
  main.jsx             # React entry point
  /context
    AuthContext.jsx    # Auth state management + useAuth hook (local + OAuth)
  /components
    Sidebar.jsx        # Collapsible navigation sidebar
    ReportTable.jsx    # Reusable report table with filters/sort/pagination
    PasswordChangeModal.jsx  # Force password change on first login
    SyncPanel.jsx      # Sync controls + history (used in Settings pages)
  /pages
    Login.jsx          # Dual auth login (local + Google OAuth)
    Device360.jsx      # Device lookup (primary feature)
    /Dashboards
      index.jsx        # Dashboard landing with cards
      GoogleDashboard.jsx
      IIQDashboard.jsx
      MerakiDashboard.jsx
    /Reports
      index.jsx        # Report selection cards
      DeviceInventory.jsx
      AueReport.jsx
      FeeBalances.jsx
      NoChromebook.jsx
      MultipleDevices.jsx
      CustomBuilder.jsx
    /Settings          # Admin-only settings pages
      index.jsx        # Settings layout with sub-navigation
      IIQSettings.jsx  # IIQ API config + sync controls
      GoogleSettings.jsx # Google Admin config + sync controls
      MerakiSettings.jsx # Meraki API config + sync controls
      OAuthSettings.jsx  # Google OAuth toggle + config
      UsersSettings.jsx  # Local user management
    /Utilities
      index.jsx        # Placeholder (sync controls moved to Settings)
```

---

## Database Schema

### `iiq_assets` - IIQ Asset Data
| Column | Type | Description |
|--------|------|-------------|
| serial_number | PK | Device serial (links to google_devices) |
| iiq_id | UUID | IIQ internal asset ID |
| asset_tag | String | District asset tag |
| model | String | Device model name |
| model_category | String | "Chromebooks", "Laptops", etc. |
| status | String | "In Service", "In Storage", "Broken", etc. |
| assigned_user_email | String | Owner's email (links to iiq_users) |
| assigned_user_name | String | Owner's full name |
| assigned_user_role | String | "Student", "Faculty", etc. |
| assigned_user_grade | String | Grade level |
| location | String | Asset's physical location |
| owner_iiq_id | UUID | IIQ user ID of owner (links to iiq_users.user_id) |
| mac_address | String | Device MAC address |
| ticket_count | Integer | Open ticket count |
| last_updated | Timestamp | Last sync time |

### `iiq_users` - IIQ User Data
| Column | Type | Description |
|--------|------|-------------|
| user_id | PK | IIQ user UUID |
| school_id_number | String | SIS ID |
| email | String | User's email (links to iiq_assets) |
| full_name | String | Display name |
| role_name | String | "Student", "Faculty", "Staff" |
| grade | String | Grade level (students only) |
| location_name | String | Building assignment |
| homeroom | String | Homeroom assignment |
| fee_balance | Decimal | Outstanding fee balance |
| fee_past_due | Decimal | Past due fees |
| is_active | Boolean | Active status |
| is_deleted | Boolean | Soft delete flag |
| last_updated | Timestamp | Last sync time |

### `google_devices` - Google Admin Telemetry
| Column | Type | Description |
|--------|------|-------------|
| serial_number | PK | Links to iiq_assets |
| google_id | String | Google device ID |
| status | String | ACTIVE, DISABLED, DEPROVISIONED |
| aue_date | String | Auto Update Expiration date (YYYY-MM-DD) |
| os_version | String | ChromeOS version |
| model | String | Hardware model |
| org_unit_path | String | Google Admin OU path |
| annotated_user | String | User annotation in Google Admin |
| annotated_asset_id | String | Asset ID annotation |
| battery_health_percent | Integer | Battery health % |
| cpu_temp_avg | Float | Average CPU temperature |
| disk_free_gb | Float | Free disk space in GB |
| lan_ip / wan_ip | String | Last known IPs |
| mac_address | String | WiFi MAC address |
| last_sync | Timestamp | Last Google sync |

### `google_users` - Google Workspace User Data
| Column | Type | Description |
|--------|------|-------------|
| google_id | PK | Google user ID |
| email | String | User's email |
| full_name | String | Display name |
| sis_id | String | Student ID from SIS |
| role | String | User role |
| school | String | School assignment |
| org_unit_path | String | Google OU path |
| is_suspended | Boolean | Account suspended |
| is_admin | Boolean | Admin privileges |
| last_login | Timestamp | Last login time |
| last_updated | Timestamp | Last sync time |

### `network_cache` - Meraki Network Data (Legacy/On-Demand)
| Column | Type | Description |
|--------|------|-------------|
| mac_address | PK | Device MAC (links via iiq_assets.mac_address) |
| ip_address | String | Current IP |
| last_ap_name | String | Connected AP name |
| last_ap_mac | String | AP MAC address |
| ssid | String | Connected SSID |
| vlan | Integer | VLAN ID |
| last_seen | Timestamp | Last seen on network |

### `meraki_networks` - Meraki Network Reference Data
| Column | Type | Description |
|--------|------|-------------|
| network_id | PK | Meraki network ID |
| name | String | Network name (e.g., "Fifer-wireless") |
| product_types | JSON | Array of product types |
| tags | JSON | Network tags |
| time_zone | String | Network timezone |
| last_updated | Timestamp | Last sync time |

### `meraki_devices` - Meraki APs and Switches
| Column | Type | Description |
|--------|------|-------------|
| serial | PK | Device serial number |
| name | String | Device name |
| model | String | Hardware model (MR42, MS225-48FP, etc.) |
| mac | String | Device MAC address |
| network_id | FK | Links to meraki_networks |
| product_type | String | "wireless" or "switch" |
| firmware | String | Current firmware version |
| status | String | online/dormant/offline |
| address | String | Physical address |
| lat/lng | Float | GPS coordinates |
| lan_ip | String | Management IP |
| last_updated | Timestamp | Last sync time |

### `meraki_ssids` - Meraki SSID Configuration
| Column | Type | Description |
|--------|------|-------------|
| id | PK | Auto-increment |
| network_id | FK | Links to meraki_networks |
| ssid_number | Integer | SSID number (0-14) |
| name | String | SSID name (e.g., "CR-PSK") |
| enabled | Boolean | SSID enabled |
| auth_mode | String | Authentication mode |
| last_updated | Timestamp | Last sync time |

### `meraki_clients` - Meraki Wireless Clients (24h)
| Column | Type | Description |
|--------|------|-------------|
| mac | PK | Client MAC address |
| manufacturer | String | Device manufacturer |
| os | String | Operating system |
| last_ssid | String | Most recent SSID |
| last_ap_serial | FK | Links to meraki_devices |
| last_ap_name | String | AP name (denormalized) |
| first_seen | Timestamp | First seen on network |
| last_seen | Timestamp | Last seen on network |
| usage_sent/recv | BigInt | Bytes sent/received |
| psk_group | String | iPSK group name |
| last_updated | Timestamp | Last sync time |

### `cached_stats` - Dashboard Statistics Cache
| Column | Type | Description |
|--------|------|-------------|
| stat_key | PK | "iiq_ticket_stats", "iiq_user_stats" |
| stat_value | JSON | Cached statistics |
| last_updated | Timestamp | Cache timestamp |

### `location_cache` - IIQ Location Name Cache
| Column | Type | Description |
|--------|------|-------------|
| location_id | PK | IIQ location UUID |
| name | String | Human-readable location name |

### `local_users` - Local Authentication Users
| Column | Type | Description |
|--------|------|-------------|
| id | PK | UUID |
| username | String | Unique username (case-insensitive) |
| email | String | Optional email |
| password_hash | String | bcrypt hash |
| role | String | "admin" or "readonly" |
| is_active | Boolean | Account active status |
| must_change_password | Boolean | Force password change on login |
| created_at | Timestamp | Account creation time |
| created_by | String | Creator user ID |
| last_login | Timestamp | Last successful login |

### `app_settings` - Application Configuration
| Column | Type | Description |
|--------|------|-------------|
| key | PK | Setting key (e.g., "iiq_url", "meraki_api_key") |
| value | String | Setting value (encrypted if is_secret=true) |
| is_secret | Boolean | Whether value is encrypted |
| updated_at | Timestamp | Last update time |
| updated_by | String | User who last updated |

---

## API Endpoints

### Authentication (No auth required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/local/login` | Local username/password login |
| POST | `/auth/change-password` | Change password (requires auth) |
| GET | `/auth/login` | Initiates Google OAuth flow |
| GET | `/auth/callback` | Handles OAuth callback |
| GET | `/auth/logout` | Clears session cookie |
| GET | `/auth/me` | Returns current user info + OAuth status |

### Settings (Admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get all settings (secrets masked) |
| POST | `/api/settings` | Update settings |
| POST | `/api/settings/test/{service}` | Test connection (iiq/google/meraki) |
| GET | `/api/settings/users` | List all local users |
| POST | `/api/settings/users` | Create new user |
| PUT | `/api/settings/users/{id}` | Update user |
| DELETE | `/api/settings/users/{id}` | Deactivate user |
| POST | `/api/settings/users/{id}/reset-password` | Admin password reset |

### Device 360 (Protected)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/device/{query}` | Lookup by serial or asset tag |

### Dashboards (Protected)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboards/overview` | Cross-source summary stats |
| GET | `/api/dashboards/google` | Google Admin statistics |
| GET | `/api/dashboards/iiq` | IIQ asset/user statistics |
| GET | `/api/dashboards/iiq/tickets` | Cached ticket stats |
| GET | `/api/dashboards/meraki` | Network cache statistics |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/summaries` | Summary stats for report cards |
| GET | `/api/reports/filters/options` | Filter dropdown options (locations, grades, statuses, models, AUE years) |
| GET | `/api/reports/device-inventory` | All devices with assignment info |
| GET | `/api/reports/device-inventory/export/csv` | CSV export |
| GET | `/api/reports/aue-eol` | Chromebooks by AUE date |
| GET | `/api/reports/aue-eol/export/csv` | CSV export |
| GET | `/api/reports/fee-balances` | Users with outstanding fees |
| GET | `/api/reports/fee-balances/export/csv` | CSV export |
| GET | `/api/reports/no-chromebook` | Students without device assignment |
| GET | `/api/reports/no-chromebook/export/csv` | CSV export |
| GET | `/api/reports/multiple-devices` | Users with multiple devices |
| GET | `/api/reports/multiple-devices/export/csv` | CSV export |
| GET | `/api/reports/custom/columns/{source}` | Available columns for custom builder |
| GET | `/api/reports/custom/{source}` | Run custom report query |
| GET | `/api/reports/custom/{source}/export/csv` | CSV export |

### Report Query Parameters
All report endpoints support:
- `page` (int): Page number (0-indexed)
- `limit` (int): Results per page (25, 50, 100, 200)
- `sort` (string): Column key to sort by
- `order` (string): "asc" or "desc"
- Filter-specific params with multi-value support (comma-separated)
- `{filter}_exclude` (string): Set to "true" for exclude mode

---

## Reports Module

### Pre-Canned Reports

#### 1. Device Inventory
- **Data**: IIQ assets joined with Google devices
- **Columns**: Asset Tag, Serial, Model, IIQ Status, Google Status, Location, Assigned User, Grade, AUE Date
- **Filters**: IIQ Status, Google Status, Location, Model, Grade
- **Search**: Serial, asset tag, user name/email

#### 2. AUE/End-of-Life Report
- **Data**: Google devices with AUE dates
- **Columns**: Serial, Model, AUE Date (with color coding), IIQ Status, Google Status, OS Version, Assigned User, OU
- **Filters**: AUE Year, IIQ Status, Google Status, Model
- **Highlights**: Expired (red), Expiring within 6 months (amber), Active (green)

#### 3. Fee Balances
- **Data**: IIQ users with fee_balance > 0
- **Columns**: Name, School ID, Email, Grade, Location, Balance, Past Due
- **Filters**: Location, Grade, Min Balance
- **Default Sort**: Fee balance descending

#### 4. Students Without Chromebook
- **Data**: Active students with role=Student and no device assignment
- **Columns**: Name, School ID, Email, Grade, Location, Homeroom
- **Filters**: Location, Grade
- **Search**: Name, email, school ID

#### 5. Multiple Devices
- **Data**: Users with COUNT(devices) > 1
- **Columns**: Name, Email, Grade, Location, Device Count, Serial Numbers
- **Filters**: Location, Min Device Count (2-10)
- **Default Sort**: Device count descending

### Custom Report Builder
- **Data Sources**: IIQ Assets, IIQ Users, Google Devices, Google Users, Network Cache
- **Features**: Column selection, dynamic filtering, search, export

### ReportTable Component Features
- **Multi-select filters** with Include/Exclude toggle
- **Server-side pagination** with per-page selector (25, 50, 100, 200)
- **Server-side sorting** on all columns
- **Sticky table headers** - headers stay visible while scrolling
- **Fixed filter bar** - filters stay at top
- **CSV export** with current filters applied
- **Responsive full-width layout** on report pages

### Filter Logic
- **Within a filter (OR)**: Selecting multiple values = match ANY (e.g., Location = "School A" OR "School B")
- **Between filters (AND)**: Multiple filters = match ALL (e.g., Location = "School A" AND Grade = "10")
- **Exclude mode (NOT IN)**: Exclude selected values (e.g., Location NOT IN "Unassigned")

---

## Sync Schedule (Cron)

| Time | Script | Description |
|------|--------|-------------|
| 2:00 AM | `google_bulk_sync.py` | Sync all Google devices (~26K) |
| 3:00 AM | `iiq_bulk_sync.py` | Sync IIQ assets (~27K) + users (~24K) + cache stats |
| 4:00 AM | `meraki_bulk_sync.py` | Sync Meraki networks, devices (~1K), SSIDs, clients (~8K) |

### IIQ API Notes
- **Assets**: Use POST with JSON body for pagination
- **Users**: Use GET with query params (`?$p=0&$s=100`) - POST ignores PageSize!
- Pagination: `PageIndex` (0-based), `PageSize` (100 recommended)

---

## Frontend Routes

| Path | Component | Width | Description |
|------|-----------|-------|-------------|
| `/` | Device360 | Constrained | Device lookup (home/primary) |
| `/dashboards` | DashboardsIndex | Constrained | Dashboard landing page |
| `/dashboards/google` | GoogleDashboard | Constrained | AUE, OS versions, status |
| `/dashboards/iiq` | IIQDashboard | Constrained | Assets, assignments, students |
| `/dashboards/meraki` | MerakiDashboard | Constrained | Network/AP stats |
| `/reports` | ReportsIndex | Constrained | Report selection cards |
| `/reports/device-inventory` | DeviceInventory | **Full Width** | Device inventory report |
| `/reports/aue-eol` | AueReport | **Full Width** | AUE/EOL report |
| `/reports/fee-balances` | FeeBalances | **Full Width** | Fee balances report |
| `/reports/no-chromebook` | NoChromebook | **Full Width** | Students without device |
| `/reports/multiple-devices` | MultipleDevices | **Full Width** | Multiple devices report |
| `/reports/custom` | CustomBuilder | **Full Width** | Custom report builder |
| `/settings` | SettingsIndex | Constrained | Settings hub (admin only) |
| `/settings/iiq` | IIQSettings | Constrained | IIQ API configuration |
| `/settings/google` | GoogleSettings | Constrained | Google Admin configuration |
| `/settings/meraki` | MerakiSettings | Constrained | Meraki API configuration |
| `/settings/auth` | OAuthSettings | Constrained | Google OAuth toggle + config |
| `/settings/users` | UsersSettings | Constrained | Local user management |
| `/utilities` | UtilitiesIndex | Constrained | Placeholder (future utilities) |

### Responsive Layout
- **Constrained pages**: `max-w-6xl` (1152px) centered
- **Report pages**: Full viewport width with padding
- Layout adjusts dynamically based on route (no page reload)

---

## Authentication

### Dual Authentication System
ATLAS supports two authentication methods:
1. **Local Authentication** (default) - Username/password stored in database
2. **Google OAuth** (optional) - Toggle-able via Settings > Authentication

### Roles
| Role | Permissions |
|------|-------------|
| `admin` | Full access including Settings pages |
| `readonly` | View-only access to dashboards, reports, device lookup |

### Local Authentication Flow
1. User enters username/password on login page
2. Backend verifies against bcrypt hash in `local_users` table
3. Session token created with user data
4. If `must_change_password=true`, modal forces password change

### Google OAuth Flow (when enabled)
1. User clicks "Sign in with Google"
2. Redirects to Google consent screen
3. Callback validates domain restriction
4. Checks group membership for admin/user role
5. Session token created with Google user data

### First-Time Setup
The installer creates an admin user during setup. Additional users can be:
- Created via Settings > Users (admin only)
- Imported via Google OAuth (if enabled)

---

## Key Metrics

### Current Data Volumes (as of Jan 2026)
- IIQ Assets: ~27,000
- IIQ Users: ~24,500 (8,400 students)
- Google Devices: ~26,000
- Network Cache: On-demand (populated via Device 360 lookups)

### Dashboard Calculations
- **Students without Chromebook**: `iiq_users(role=Student, is_active=true) NOT IN iiq_assets(owner_iiq_id)`
- **AUE Expired**: Devices with `aue_date < today`
- **AUE Expiring Soon**: Devices with `aue_date` within 6 months

---

## Development Guidelines

### Device 360 is the Hero Feature
- Protect its clean UX - it's the primary daily tool
- Live sync on each lookup (IIQ + Google + Meraki)
- Fast response time is critical

### Adding New Reports
1. Add endpoint in `/app/routers/reports.py`
2. Create page component in `/src/pages/Reports/`
3. Use `ReportTable` component for consistent UX
4. Add route in `Reports/index.jsx`
5. Ensure column keys in frontend match sort_map keys in backend

### Filter Implementation Pattern
```python
# Backend: Parse comma-separated multi-values
filter_list = parse_multi_filter(filter_param)
if filter_list:
    if filter_exclude == 'true':
        query = query.filter(~Model.column.in_(filter_list))
    else:
        query = query.filter(Model.column.in_(filter_list))
```

```jsx
// Frontend: appendFilter helper
const appendFilter = (params, key, value) => {
  if (value?.values?.length > 0) {
    params.append(key, value.values.join(','))
    if (value.exclude) params.append(`${key}_exclude`, 'true')
  }
}
```

### Sorting Implementation
- Backend `sort_map` keys MUST match frontend column `key` values
- Example: Frontend `{ key: 'location' }` requires backend `sort_map["location"]`

### District-Specific Notes
- WAN IPs starting with `167.x.x.x` = on state network
- Meraki: Only use networks with "Wireless" in name (AP data only)
- District colors: Blue `#000098`, Gold `#FCBE14`

---

## Key URLs

| Resource | URL |
|----------|-----|
| Frontend | http://atlas.cr.k12.de.us |
| Backend API | http://atlas.cr.k12.de.us/api |
| IIQ Instance | https://crsd.incidentiq.com |

---

## Status Mappings

### IIQ Asset Statuses
- In Service, In Storage, Broken, Loaner, Retired, Scrap, etc.

### Google Device Statuses
- ACTIVE, DISABLED, DEPROVISIONED

---

## Completed Features
- [x] Device 360 lookup with live sync
- [x] Collapsible sidebar navigation
- [x] Google Dashboard (AUE, status, OS versions)
- [x] IIQ Dashboard (assets, assignments, student counts)
- [x] Meraki Dashboard (network cache stats)
- [x] IIQ Users table (accurate student counts)
- [x] Nightly bulk sync for Google + IIQ
- [x] Dark mode support
- [x] Reports module with 5 pre-canned reports
- [x] Multi-select filters with Include/Exclude mode
- [x] Server-side pagination and sorting
- [x] CSV export for all reports
- [x] Custom report builder
- [x] Sticky table headers
- [x] Responsive full-width layout for reports
- [x] Per-page row count selector (25, 50, 100, 200)
- [x] Sync controls integrated into Settings pages (IIQ, Google, Meraki)
- [x] Rate limiting on all API endpoints
- [x] Security headers middleware (CSP, X-Frame-Options, etc.)
- [x] Non-root service user (`atlas`)
- [x] Systemd hardening (ProtectSystem, PrivateTmp, etc.)
- [x] **Local authentication** (username/password as default)
- [x] **Web-based settings** (configure IIQ/Google/Meraki via UI)
- [x] **Role-based access** (admin/readonly roles)
- [x] **Google OAuth as optional** (toggle in settings)
- [x] **Encrypted credential storage** (Fernet encryption in database)
- [x] **Simplified installer** (only domain, db password, admin creds)
- [x] **Password change enforcement** (first login prompt)
- [x] **Test connection buttons** (verify API credentials in settings)

## Security Hardening Status
- [x] **Phase 1: Credential Management** - Secrets in database (encrypted) with .env fallback
- [x] **Phase 2: Authentication** - Local auth default + optional Google OAuth
- [x] **Phase 3: Frontend Auth Flow** - Login page, AuthContext, protected routes
- [x] **Phase 4: Rate Limiting** - Per-user/IP rate limits on all API endpoints
- [x] **Phase 5: System Hardening** - Non-root user, security headers, systemd hardening
- [ ] **Phase 6: Credential Rotation** - Rotate all exposed credentials

## Planned Features
- [ ] PDF export for reports
- [ ] Saved report filters/presets
- [ ] User lookup (find all devices for a user)
- [ ] Email alerts for sync failures
- [ ] Scheduled report delivery

---

## Configuration

### Dual Configuration System
ATLAS uses a hybrid configuration approach:
1. **Database settings** (preferred) - Configured via web UI, encrypted in `app_settings` table
2. **Environment fallback** - `.env` file used during migration or if database settings not configured

### Bootstrap Variables (.env - Required)
These must be in `.env` as they're needed before database access:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | Session signing key |
| `ENCRYPTION_KEY` | Fernet key for encrypting secrets in database |

### Service Credentials (Database or .env)
These can be configured via Settings UI or fall back to .env:

| Setting Key | .env Fallback | Description |
|-------------|---------------|-------------|
| `iiq_url` | `IIQ_URL` | IIQ instance URL |
| `iiq_token` | `IIQ_TOKEN` | IIQ API token |
| `iiq_site_id` | `IIQ_SITE_ID` | IIQ site identifier |
| `iiq_product_id` | `IIQ_PRODUCT_ID` | IIQ product ID |
| `google_admin_email` | `GOOGLE_ADMIN_EMAIL` | Admin email for delegation |
| `google_credentials_json` | (file) | Service account JSON (stored in DB) |
| `meraki_api_key` | `MERAKI_API_KEY` | Meraki Dashboard API key |
| `meraki_org_id` | `MERAKI_ORG_ID` | Meraki organization ID |
| `oauth_enabled` | - | Enable Google OAuth (true/false) |
| `oauth_client_id` | `GOOGLE_OAUTH_CLIENT_ID` | OAuth 2.0 client ID |
| `oauth_client_secret` | `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth 2.0 client secret |
| `oauth_allowed_domain` | `ALLOWED_DOMAIN` | Allowed email domain |
| `oauth_admin_group` | - | Google Group for admin role |
| `oauth_user_group` | - | Google Group for user role |

### File Permissions
```bash
chmod 600 /opt/atlas/atlas-backend/.env
chmod 600 /opt/atlas/atlas-backend/google_credentials.json  # if using file
```

### Generating Encryption Key
```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### Rate Limits
Rate limits are enforced per-user (identified by email) or per-IP for unauthenticated requests.

| Endpoint Type | Limit | Purpose |
|--------------|-------|---------|
| Device 360 | 60/minute | Device lookups |
| Dashboards | 30/minute | Dashboard statistics |
| Reports | 20/minute | Report queries |
| CSV Exports | 10/minute | Data exports |
| Sync Triggers | 5/hour | Manual IIQ syncs |
| Filter Options | 30/minute | Dropdown data |

When rate limit is exceeded, user receives `429 Too Many Requests` with a message explaining the limit.
