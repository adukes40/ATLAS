# ATLAS - Asset, Telemetry, Location, & Analytics System

**Version:** 1.1.8

## Project Overview
ATLAS is an IT operations platform for Caesar Rodney School District that provides a unified view of Chromebook devices by aggregating data from multiple sources. The platform enables IT staff to quickly look up any device and see consolidated information from IIQ, Google Admin, and Meraki in one place. It also provides device management write-back capabilities through a unified Action Panel.

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
- **HTTP Client**: Axios

---

## Project Structure

### Backend (`/opt/atlas/atlas-backend/`)
```
.env                   # Environment variables (secrets - DO NOT commit)
.env.example           # Template for .env (safe to commit)
google_credentials.json # Google service account (DO NOT commit)

/app
  main.py              # FastAPI app entry point (v1.1.8)
  auth.py              # Dual auth (local + OAuth) + session management
  config.py            # Config from database with .env fallback
  crypto.py            # Fernet encryption for secrets
  database.py          # PostgreSQL connection via SQLAlchemy
  models.py            # All database models
  schemas.py           # Pydantic response schemas
  utils.py             # Shared utilities (get_user_identifier, etc.)
  /routers
    auth.py            # Auth endpoints (local login + OAuth)
    devices.py         # Device 360 API (/api/device/{query})
    dashboards.py      # Dashboard aggregate APIs
    reports.py         # Reports API (7 pre-canned + custom builder)
    settings.py        # Admin settings + user management API
    config.py          # Integration config endpoint
    google_actions.py  # Google device actions (enable, disable, deprovision, move OU)
    bulk_actions.py    # Bulk Google actions (enable, disable, move OU, deprovision)
    iiq_actions.py     # IIQ write-back actions (status, location, tag, user) single + bulk
    iiq_sources.py     # IIQ data source endpoints
    system.py          # System info, version, updates
    utilities.py       # MAC lookup, subnet calculator, etc.
  /services
    iiq_sync.py        # IIQ API connector + bulk sync + write-back methods
    google_sync.py     # Google Admin API connector + device actions
    meraki_sync.py     # Meraki API connector
    local_auth.py      # Local user authentication (bcrypt)
    settings_service.py # Encrypted settings storage

/scripts
  google_bulk_sync.py  # Nightly Google sync (2 AM)
  iiq_bulk_sync.py     # Nightly IIQ sync (3 AM)
  meraki_bulk_sync.py  # Nightly Meraki sync (4 AM)
```

### Frontend (`/opt/atlas/atlas-ui/`)
```
.env                   # Vite env vars (VITE_IIQ_URL - baked at build time)
/src
  App.jsx              # Router + layout wrapper (responsive width)
  main.jsx             # React entry point
  /context
    AuthContext.jsx     # Auth state management + useAuth hook (local + OAuth)
    IntegrationsContext.jsx  # Integration toggles { google, iiq, meraki }
  /hooks
    useUnifiedReport.js # Hook for unified report view (columns, filters, sort, pagination, save)
    useServiceSettings.js # Hook for service settings
  /components
    Sidebar.jsx         # Collapsible navigation sidebar
    ReportTable.jsx     # Reusable report table with filters/sort/pagination/checkbox selection
    ActionPanel.jsx     # Slide-out device management panel (Google + IIQ actions)
    BulkActionBar.jsx   # Floating bulk selection bar for reports
    ColumnPickerPanel.jsx # Slide-out column picker for unified report builder
    DateRangePicker.jsx # Custom calendar popover date range picker component
    Footer.jsx          # App footer
    NotificationBell.jsx # Notification icon
    PasswordChangeModal.jsx  # Force password change on first login
    SyncPanel.jsx       # Sync controls + history (used in Settings pages)
    UpdateBadge.jsx     # Version update indicator
  /pages
    Login.jsx           # Dual auth login (local + Google OAuth)
    Device360.jsx       # Device lookup (primary feature) + "Manage Device" button
    /Dashboards
      index.jsx         # Dashboard landing with cards
      GoogleDashboard.jsx
      IIQDashboard.jsx
      MerakiDashboard.jsx
    /Reports
      index.jsx         # Report routing (overview + unified report views)
      Overview.jsx      # Reports overview with Google/IIQ/Meraki tabs, KPI cards, charts
      UnifiedReportView.jsx # Unified report builder (replaces individual report pages)
    /Settings           # Admin-only settings pages
      index.jsx         # Settings layout with sub-navigation
      IIQSettings.jsx   # IIQ API config + sync controls
      GoogleSettings.jsx # Google Admin config + sync controls
      MerakiSettings.jsx # Meraki API config + sync controls
      OAuthSettings.jsx  # Google OAuth toggle + config
      UsersSettings.jsx  # Local user management
      BrandingSettings.jsx # UI branding/customization
      DisplaySettings.jsx  # Display preferences
      DistrictSettings.jsx # District info configuration
      SystemSettings.jsx   # System-level settings
    /Utilities
      index.jsx         # Utilities hub
      BulkDeviceLookup.jsx # Bulk device lookup tool
      MacAddressLookup.jsx # MAC address lookup tool
      SubnetCalculator.jsx # Subnet calculator tool
```

---

## Action Panel (v1.1.8)

Unified slide-out panel for all device write-back operations. Replaces per-page action buttons with a single reusable component.

### How It Works
- **Device 360**: "Manage Device" button opens panel for single device
- **Reports**: Row click opens panel for single device; checkbox selection + floating BulkActionBar opens panel for multiple devices
- Panel has **Google** and **IIQ** tabs (only shows tabs for enabled integrations)
- Actions use accordion-style expansion (one at a time)
- Results displayed inline (success/partial/error with expandable error list for bulk)

### Google Actions (single + bulk)
| Action | Input | Endpoint |
|--------|-------|----------|
| Enable | One-click | `POST /api/device/{serial}/google/enable` |
| Disable | One-click | `POST /api/device/{serial}/google/disable` |
| Move OU | Autocomplete OU search | `POST /api/device/{serial}/google/move-ou` |
| Deprovision | Reason dropdown + type serial/CONFIRM | `POST /api/device/{serial}/google/deprovision` |

### IIQ Actions (single + bulk unless noted)
| Action | Input | Endpoint |
|--------|-------|----------|
| Update Status | Status dropdown | `POST /api/device/{serial}/iiq/update-status` |
| Update Location | Text input | `POST /api/device/{serial}/iiq/update-location` |
| Update Asset Tag | Text input (single only) | `POST /api/device/{serial}/iiq/update-asset-tag` |
| Update Assigned User | Email search (single only) | `POST /api/device/{serial}/iiq/update-assigned-user` |

### Bulk Endpoints
All bulk endpoints accept `{ "serials": [...] }` and return `{ "success": N, "failed": N, "errors": [...] }`.

| Endpoint | Body |
|----------|------|
| `POST /api/bulk/google/enable` | `{ serials }` |
| `POST /api/bulk/google/disable` | `{ serials }` |
| `POST /api/bulk/google/move-ou` | `{ serials, target_ou }` |
| `POST /api/bulk/google/deprovision` | `{ serials, deprovision_reason }` |
| `POST /api/bulk/iiq/update-status` | `{ serials, value }` |
| `POST /api/bulk/iiq/update-location` | `{ serials, value }` |

### Important Notes
- Actions do NOT auto-refresh the page. Toast says "Click Force Refresh to see updated values."
- Google Admin SDK scopes required: `admin.directory.device.chromeos`, `admin.directory.user`, `admin.directory.orgunit`, `chrome.management.telemetry.readonly`
- OU list is cached 5 minutes server-side
- Deprovision valid reasons: `same_model_replacement`, `different_model_replacement`, `retiring_device`

### Router Registration Order (main.py)
Google actions, bulk actions, and IIQ actions routers MUST be registered BEFORE the devices router to avoid route conflicts with the catch-all `GET /api/device/{query}`.

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

### `iiq_tickets` - IIQ Ticket Data
| Column | Type | Description |
|--------|------|-------------|
| ticket_id | PK | IIQ ticket UUID |
| ticket_number | Integer | Human-readable ticket number |
| subject | String | Ticket subject line |
| description | Text | Issue description |
| status | String | Workflow step name (e.g., "Open", "In Progress") |
| is_closed | Boolean | Whether ticket is closed |
| priority | String | Mapped: "Urgent", "High", "Normal" |
| is_urgent | Boolean | Urgent flag |
| category | String | Issue name (leaf level) |
| issue_category | String | Issue category name (top level) |
| source | String | "Portal", "Email", "Walk-in" |
| created_date | DateTime | When ticket was created |
| modified_date | DateTime | Last modification |
| closed_date | DateTime | When ticket was closed |
| close_reason | String | Reason for closing |
| owner_name | String | Requester name (who submitted) |
| owner_email | String | Requester email |
| for_name | String | Submitted-for person name |
| for_email | String | Submitted-for person email |
| for_location | String | Requester's building (from For.LocationName) |
| for_role | String | Requester's role (Student/Faculty) |
| assignee_name | String | Agent name (assigned tech) |
| assignee_email | String | Agent email |
| team_name | String | Assigned team name |
| location_name | String | Ticket location |
| meta_data | JSON | Additional raw ticket data |
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

### Google Device Actions (Protected)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/device/{serial}/google/enable` | Enable a disabled device |
| POST | `/api/device/{serial}/google/disable` | Disable an active device |
| POST | `/api/device/{serial}/google/deprovision` | Deprovision device (requires reason) |
| POST | `/api/device/{serial}/google/move-ou` | Move device to different OU |
| GET | `/api/google/org-units` | List all org units (cached 5 min) |

### IIQ Device Actions (Protected)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/device/{serial}/iiq/update-status` | Update asset status |
| POST | `/api/device/{serial}/iiq/update-location` | Update asset location |
| POST | `/api/device/{serial}/iiq/update-asset-tag` | Update asset tag |
| POST | `/api/device/{serial}/iiq/update-assigned-user` | Update assigned user |

### Bulk Actions (Protected)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/bulk/google/enable` | Bulk enable devices |
| POST | `/api/bulk/google/disable` | Bulk disable devices |
| POST | `/api/bulk/google/move-ou` | Bulk move devices to OU |
| POST | `/api/bulk/google/deprovision` | Bulk deprovision devices |
| POST | `/api/bulk/iiq/update-status` | Bulk update IIQ status |
| POST | `/api/bulk/iiq/update-location` | Bulk update IIQ location |

### Dashboards (Protected)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboards/overview` | Cross-source summary stats |
| GET | `/api/dashboards/google` | Google Admin statistics |
| GET | `/api/dashboards/iiq` | IIQ asset/user statistics |
| GET | `/api/dashboards/iiq/tickets` | Cached ticket stats |
| GET | `/api/dashboards/meraki` | Network cache statistics |

### Reports - Pre-Canned (Protected)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/summaries` | Summary stats for report cards |
| GET | `/api/reports/filters/options` | Filter dropdown options |
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

### Reports - Unified Query Engine (Protected)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/custom/columns` | All available columns from all sources |
| POST | `/api/reports/custom/filter-options` | Distinct values for a column (for dropdowns) |
| POST | `/api/reports/execute` | Run multi-source query (30/min) |
| POST | `/api/reports/execute/export/csv` | CSV export of multi-source query (20/min) |

### Reports - Saved Reports (Protected)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/saved` | List all saved reports |
| POST | `/api/reports/saved` | Create saved report |
| GET | `/api/reports/saved/{id}` | Get saved report by ID |
| PUT | `/api/reports/saved/{id}` | Update saved report config |
| DELETE | `/api/reports/saved/{id}` | Delete saved report |
| GET | `/api/reports/saved/by-slug/{slug}` | Get system report by slug |
| GET | `/api/reports/saved/folders/list` | List report folders |

### Report Query Parameters
Pre-canned report endpoints support:
- `page` (int): Page number (0-indexed)
- `limit` (int): Results per page (25, 50, 100, 200)
- `sort` (string): Column key to sort by
- `order` (string): "asc" or "desc"
- Filter-specific params with multi-value support (comma-separated)
- `{filter}_exclude` (string): Set to "true" for exclude mode

Unified query engine (POST `/api/reports/execute`) accepts JSON body:
```json
{
  "columns": [{"source": "iiq_tickets", "field": "ticket_number"}, ...],
  "filters": [{"source": "iiq_tickets", "field": "for_location", "values": ["Caesar Rodney High School"], "exclude": false, "date_from": "2025-01-01", "date_to": "2025-12-31"}],
  "sort": [{"source": "iiq_tickets", "field": "created_date", "direction": "desc"}],
  "page": 1, "limit": 100, "search": ""
}
```

---

## Reports Module

### Architecture
Reports are served through two systems:
1. **Pre-canned reports** — Dedicated endpoints with optimized queries (device inventory, AUE, fees, etc.)
2. **Unified report engine** — Multi-source query builder that can join any combination of data sources

Both are accessed through the **Reports Overview** page which has tabbed sections (Google, IIQ, Meraki) with KPI cards and charts. Individual reports use the **UnifiedReportView** component.

### Pre-Canned Reports (System Templates)
These are saved as system reports with slugs and have specialized backend queries:

| Slug | Description | Key Filters |
|------|-------------|-------------|
| `device-inventory` | All devices with assignment info | IIQ/Google Status, Location, Model, Grade |
| `aue-eol` | Chromebooks by AUE date (color-coded) | AUE Year, Status, Model |
| `fee-balances` | Users with outstanding fees | Location, Grade, Min Balance |
| `no-chromebook` | Students without device assignment | Location, Grade |
| `multiple-devices` | Users with multiple devices | Location, Min Device Count |
| `firmware-compliance` | Meraki firmware status | Network, Model, Compliance |
| `infrastructure` | Meraki APs and switches | Network, Model, Product Type |

### Unified Report Builder (UnifiedReportView)
- **Data Sources**: IIQ Assets, IIQ Users, IIQ Tickets, Google Devices, Google Users, Meraki Devices, Meraki Networks, Meraki Clients, Network Cache
- **Multi-source joins**: Automatically joins sources via serial number, email, MAC address, etc.
- **Column picker**: Slide-out panel to select columns from any source
- **Dynamic filters**: Auto-generated for string columns in the table
- **Date range filters**: Calendar popover picker for datetime columns (DateRangePicker component)
- **Filter picker**: "+ Filter" button to filter on columns NOT in the table (e.g., filter by Agent without showing Agent column)
- **Saved reports**: Save/load report configurations with folders
- **CSV export**: Export current query with all filters applied

### IIQ Tickets as a Data Source
The `iiq_tickets` source provides rich ticket data for custom reports:
- **Key columns**: Ticket #, Subject, Status, Priority, Category, Source
- **People**: Requester (owner), Submitted For (for), Agent (assignee), Team
- **Requester Building**: `for_location` field — the submitter's school building (differs from ticket location ~36% of the time)
- **Dates**: Created Date, Closed Date (support date range filtering)
- **IIQ terminology**: Owner = Requester, For = Submitted For, AssignedToUser = Agent

### Filter Features
- **Multi-select dropdowns** with Include/Exclude toggle
- **Date range pickers** with custom calendar popover (auto-appear for datetime columns)
- **Extra filter picker** — filter on any column from active sources without adding to table
- **Filter wrapping** — filters wrap to second row when they exceed width
- **Filter logic**: Within a filter = OR, Between filters = AND, Exclude mode = NOT IN
- **Server-side filtering** — all filtering happens in SQL, not client-side

### ReportTable Component Features
- **Multi-select filters** with Include/Exclude toggle
- **Server-side pagination** with per-page selector (25, 50, 100, 200)
- **Server-side sorting** on all columns
- **Sticky table headers** - headers stay visible while scrolling
- **CSV export** with current filters applied
- **Checkbox row selection** for bulk operations
- **Row click** opens ActionPanel for single device

---

## Sync Schedule (Cron)

| Time | Script | Description |
|------|--------|-------------|
| 2:00 AM | `google_bulk_sync.py` | Sync all Google devices (~26K) |
| 3:00 AM | `iiq_bulk_sync.py` | Sync IIQ assets (~27K) + users (~24K) + tickets (~17K) + cache stats |
| 4:00 AM | `meraki_bulk_sync.py` | Sync Meraki networks, devices (~1K), SSIDs, clients (~8K) |

### IIQ API Notes
- **Assets**: Use POST with JSON body for pagination (`PageIndex`, `PageSize` in body)
- **Users**: Use GET with query params (`?$p=0&$s=100`) — POST ignores PageSize!
- **Tickets**: Use POST but pagination MUST be via URL query params (`?$p=0&$s=100`) — JSON body `Paging` object is IGNORED. `Filters` in JSON body also ignored (causes 500 errors). Filter client-side instead.
- **Ticket fields**: `WorkflowStep.StepName` = status, `AssignedToTeam.TeamName` = team, `For.LocationName` = requester building, `PriorityId` mapping: 1=Urgent, 51=High, 100=Normal, `SourceId` mapping: 1=Portal, 2=Email, 3=Walk-in
- **Write-backs**: PUT to `/api/v1.0/assets/{asset_id}` with JSON body
- **Search**: GET `/api/v1.0/users?$s={query}&$take=10` and `/api/v1.0/locations?$s={query}&$take=20`

---

## Frontend Routes

| Path | Component | Width | Description |
|------|-----------|-------|-------------|
| `/` | Device360 | Constrained | Device lookup (home/primary) |
| `/dashboards` | DashboardsIndex | Constrained | Dashboard landing page |
| `/dashboards/google` | GoogleDashboard | Constrained | AUE, OS versions, status |
| `/dashboards/iiq` | IIQDashboard | Constrained | Assets, assignments, students |
| `/dashboards/meraki` | MerakiDashboard | Constrained | Network/AP stats |
| `/reports` | Overview | Constrained | Reports overview (Google/IIQ/Meraki tabs) |
| `/reports/view/:slug` | UnifiedReportView | **Full Width** | System report by slug |
| `/reports/view/id/:id` | UnifiedReportView | **Full Width** | Saved report by ID |
| `/reports/new` | UnifiedReportView | **Full Width** | New custom report builder |
| `/settings` | SettingsIndex | Constrained | Settings hub (admin only) |
| `/settings/iiq` | IIQSettings | Constrained | IIQ API configuration |
| `/settings/google` | GoogleSettings | Constrained | Google Admin configuration |
| `/settings/meraki` | MerakiSettings | Constrained | Meraki API configuration |
| `/settings/auth` | OAuthSettings | Constrained | Google OAuth toggle + config |
| `/settings/users` | UsersSettings | Constrained | Local user management |
| `/settings/branding` | BrandingSettings | Constrained | UI branding/customization |
| `/settings/display` | DisplaySettings | Constrained | Display preferences |
| `/settings/district` | DistrictSettings | Constrained | District info config |
| `/settings/system` | SystemSettings | Constrained | System-level settings |
| `/utilities` | UtilitiesIndex | Constrained | Utilities hub |
| `/utilities/bulk-lookup` | BulkDeviceLookup | Constrained | Bulk device lookup |
| `/utilities/mac-lookup` | MacAddressLookup | Constrained | MAC address lookup |
| `/utilities/subnet-calc` | SubnetCalculator | Constrained | Subnet calculator |

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
| `admin` | Full access including Settings pages and device write-backs |
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

### Current Data Volumes (as of Mar 2026)
- IIQ Assets: ~27,000
- IIQ Users: ~24,500 (8,400 students)
- IIQ Tickets: ~58,400 (~16,600 with enriched fields from Jan 2025+)
- Google Devices: ~26,000
- Meraki Clients: ~8,000
- Meraki Devices: ~1,000

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
- Device management via ActionPanel (not inline buttons)

### Adding New Reports
**System reports** (pre-canned with specialized queries):
1. Add specialized query function in `/app/routers/reports.py` and register in `SPECIALIZED_QUERIES`
2. Create a saved report record with `is_system=true` and a unique `system_slug`
3. The UnifiedReportView will render it automatically via `/reports/view/:slug`

**Custom reports** (using the unified query engine):
1. Users create these via the UI — no code changes needed
2. Select columns from any source, add filters, save with a name/folder
3. All available sources/columns are defined in `MULTI_SOURCE_COLUMNS` dict in `reports.py`

**Adding a new data source to the query engine**:
1. Add column definitions to `MULTI_SOURCE_COLUMNS` in `reports.py`
2. Add the model to `SOURCE_MODELS` mapping
3. Add join paths to `JOIN_PATHS` for cross-source linking

### Filter Implementation Pattern
```python
# Backend (pre-canned): Parse comma-separated multi-values
filter_list = parse_multi_filter(filter_param)
if filter_list:
    if filter_exclude == 'true':
        query = query.filter(~Model.column.in_(filter_list))
    else:
        query = query.filter(Model.column.in_(filter_list))

# Backend (unified): MultiSourceFilter supports discrete values AND date ranges
# Filters with date_from/date_to apply >= / <= range comparisons
# Filters with values apply IN / NOT IN discrete matching
# Both can be combined on the same filter
```

```jsx
// Frontend (pre-canned): appendFilter helper
const appendFilter = (params, key, value) => {
  if (value?.values?.length > 0) {
    params.append(key, value.values.join(','))
    if (value.exclude) params.append(`${key}_exclude`, 'true')
  }
}

// Frontend (unified): useUnifiedReport hook
report.setFilter(source, field, values, exclude)     // discrete filter
report.setDateRange(source, field, dateFrom, dateTo)  // date range filter
```

### Sorting Implementation
- Backend `sort_map` keys MUST match frontend column `key` values
- Example: Frontend `{ key: 'location' }` requires backend `sort_map["location"]`

### Vite Environment Variables
- Frontend env vars use `VITE_` prefix and are baked at build time
- `.env` file at `/opt/atlas/atlas-ui/.env` (currently has `VITE_IIQ_URL=https://crsd.incidentiq.com`)
- Must rebuild frontend after changing env vars: `cd /opt/atlas/atlas-ui && npx vite build`

### Service Management
```bash
# Backend
systemctl restart atlas.service
systemctl status atlas.service
journalctl -u atlas.service -f

# Frontend (rebuild static files served by nginx)
cd /opt/atlas/atlas-ui && npx vite build
```

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
- Deployed, In Stock, In Repair, Retired, Lost/Stolen, etc.

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
- [x] Nightly bulk sync for Google + IIQ + Meraki
- [x] Dark mode support
- [x] Reports module with 7 pre-canned reports + custom builder
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
- [x] Local authentication (username/password as default)
- [x] Web-based settings (configure IIQ/Google/Meraki via UI)
- [x] Role-based access (admin/readonly roles)
- [x] Google OAuth as optional (toggle in settings)
- [x] Encrypted credential storage (Fernet encryption in database)
- [x] Simplified installer (only domain, db password, admin creds)
- [x] Password change enforcement (first login prompt)
- [x] Test connection buttons (verify API credentials in settings)
- [x] **Google device actions** (enable, disable, deprovision, move OU)
- [x] **IIQ write-back actions** (status, location, asset tag, assigned user)
- [x] **Unified Action Panel** (slide-out panel for all device management)
- [x] **Bulk device actions** (Google + IIQ operations on multiple devices)
- [x] **Report table row selection** (checkbox column + floating BulkActionBar)
- [x] **Utilities** (bulk device lookup, MAC lookup, subnet calculator)
- [x] **Branding/display settings**
- [x] **Integration toggles** (enable/disable Google, IIQ, Meraki per-instance)
- [x] **Firmware compliance report** (Meraki)
- [x] **Infrastructure inventory report** (Meraki)
- [x] **Unified report query engine** (multi-source joins, any column combination)
- [x] **Saved reports** (save/load report configs with folders)
- [x] **IIQ ticket sync** (enriched with requester building, category, source, agent, etc.)
- [x] **Date range filtering** (custom calendar popover picker for datetime columns)
- [x] **Filter picker** (filter on columns not in the table view)
- [x] **Reports Overview redesign** (IIQ tab with richer KPI cards and charts)

## Planned Features
- [ ] PDF export for reports
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
| Reports (pre-canned) | 20/minute | Report queries |
| Reports (unified query) | 30/minute | Custom report queries |
| CSV Exports | 10-20/minute | Data exports |
| Sync Triggers | 5/hour | Manual IIQ syncs |
| Filter Options | 30/minute | Dropdown data |
| Google Actions | 10/minute | Enable/disable/move OU |
| Deprovision | 5/minute | Single device deprovision |
| Bulk Google Actions | 5/minute | Bulk enable/disable/move |
| Bulk Deprovision | 3/minute | Bulk deprovision |
| IIQ Actions | 10/minute | Single device IIQ updates |
| Bulk IIQ Actions | 5/minute | Bulk IIQ updates |
| Org Units | 30/minute | OU list fetch |

When rate limit is exceeded, user receives `429 Too Many Requests` with a message explaining the limit.
