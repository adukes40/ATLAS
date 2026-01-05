# Meraki Integration Design

**Date:** 2026-01-05
**Status:** Approved
**Author:** Claude + User brainstorm session

## Overview

Expand Meraki integration from on-demand client lookups to comprehensive infrastructure data, enabling dashboards, reports, and anomaly detection.

### Current State
- On-demand MAC lookups via Device 360
- Single `network_cache` table (MAC, IP, AP name, SSID, last seen)
- No bulk sync, no infrastructure data

### Target State
- Nightly bulk sync of APs, switches, SSIDs, and clients
- Infrastructure health dashboard
- Anomaly detection (wrong device on wrong network)
- Reports for inventory, firmware compliance, and capacity planning
- Future: iPSK guest network management

---

## Environment

- **Organization ID:** 668784544664519004
- **761 APs:** MR42 (532), MR46 (197), MR56 (23), MR84 (7), MR74 (2)
- **239 Switches:** MS225-48FP (198), MS225-24P (33), MS350-48FP (8)
- **32 Networks** (22 wireless, 14 sites)
- **License Expiration:** April 23, 2027 (co-term)
- **~10,000 client devices** (8,500 students + 1,000 staff)

### SSID Structure
| SSID | Auth Mode | Purpose |
|------|-----------|---------|
| CR-PSK | iPSK without RADIUS | Chromebooks |
| CR-WLAN | 802.1x RADIUS | Staff/managed devices |
| CR-Guest | Meraki auth portal | Guest access |
| CR-SPD | 802.1x RADIUS | Special purpose |
| iPad | PSK | Dedicated iPad network |
| Bookfair | PSK | Event network |

---

## Data Model

### New Tables

Following the existing pattern: **data stays separate, linked at query time**.

#### `meraki_devices`
All APs and switches in one table.

| Column | Type | Description |
|--------|------|-------------|
| serial | PK | Device serial number |
| name | String | Device name (e.g., "CRHS-AP-101") |
| model | String | Model (MR42, MS225-48FP, etc.) |
| mac | String | Device MAC address |
| network_id | String | FK to meraki_networks |
| product_type | String | "wireless" or "switch" |
| firmware | String | Current firmware version |
| firmware_compliant | Boolean | Running expected version |
| address | String | Physical address |
| lat | Float | Latitude |
| lng | Float | Longitude |
| lan_ip | String | Management IP |
| status | String | online/dormant/offline |
| tags | JSON | Device tags array |
| last_updated | Timestamp | Last sync time |

#### `meraki_networks`
Network reference data.

| Column | Type | Description |
|--------|------|-------------|
| network_id | PK | Meraki network ID |
| name | String | Network name (e.g., "Fifer-wireless") |
| product_types | JSON | Array of product types |
| tags | JSON | Network tags |
| last_updated | Timestamp | Last sync time |

#### `meraki_ssids`
SSID configuration per network.

| Column | Type | Description |
|--------|------|-------------|
| network_id | PK (composite) | FK to meraki_networks |
| ssid_number | PK (composite) | SSID number (0-14) |
| name | String | SSID name (e.g., "CR-PSK") |
| enabled | Boolean | SSID enabled |
| auth_mode | String | Authentication mode |
| ipsk_enabled | Boolean | iPSK configured |
| expected_manufacturers | JSON | For anomaly detection |
| last_updated | Timestamp | Last sync time |

#### `meraki_clients`
Client devices seen on wireless networks.

| Column | Type | Description |
|--------|------|-------------|
| mac | PK | Client MAC address |
| description | String | Client description/hostname |
| manufacturer | String | Device manufacturer |
| os | String | Operating system |
| first_seen | Timestamp | First seen on network |
| last_seen | Timestamp | Last seen on network |
| status | String | Online/Offline |
| last_ssid | String | Most recent SSID |
| last_vlan | Integer | Most recent VLAN |
| last_ap_serial | String | FK to meraki_devices |
| last_ap_name | String | AP name (denormalized) |
| usage_sent | BigInt | Bytes sent (24h) |
| usage_recv | BigInt | Bytes received (24h) |
| psk_group | String | iPSK group (if applicable) |
| last_updated | Timestamp | Last sync time |

#### `meraki_anomaly_rules`
Configurable anomaly detection rules.

| Column | Type | Description |
|--------|------|-------------|
| rule_id | PK | Auto-increment ID |
| name | String | Rule name |
| ssid_pattern | String | SSID to match (supports wildcards) |
| condition_type | String | manufacturer/os/other |
| condition_value | String | Value to match |
| severity | String | warning/critical |
| enabled | Boolean | Rule active |
| created_at | Timestamp | Rule creation time |

#### `meraki_anomalies`
Detected anomalies (populated by detection engine).

| Column | Type | Description |
|--------|------|-------------|
| anomaly_id | PK | Auto-increment ID |
| rule_id | FK | Rule that triggered |
| client_mac | FK | Client MAC |
| ssid | String | SSID where detected |
| manufacturer | String | Client manufacturer |
| detected_at | Timestamp | Detection time |
| resolved | Boolean | Manually resolved |
| resolved_at | Timestamp | Resolution time |
| notes | String | Admin notes |

### Linking Strategy

```
Device 360 Lookup:
  iiq_assets.mac_address ──→ meraki_clients.mac
                              └──→ meraki_devices.serial (via last_ap_serial)

Infrastructure View:
  meraki_networks.network_id ──→ meraki_devices.network_id
                             ──→ meraki_ssids.network_id
```

---

## Sync Strategy

### Nightly Bulk Sync (4 AM)

Runs after IIQ (3 AM) and Google (2 AM) syncs complete.

| Endpoint | Data | API Calls | Notes |
|----------|------|-----------|-------|
| `GET /organizations/{org}/devices` | All devices | 1 | APs + switches |
| `GET /organizations/{org}/devices/statuses` | Status + firmware | 1 | Online/dormant |
| `GET /organizations/{org}/networks` | Networks | 1 | Reference data |
| `GET /networks/{id}/wireless/ssids` | SSIDs | 22 | Per wireless network |
| `GET /networks/{id}/clients?timespan=86400` | Clients | 22 | 24h window |
| `GET /organizations/{org}/licenses/overview` | License info | 1 | Expiration date |

**Total: ~48 API calls** (well under 10/sec rate limit)

### Live API (Device 360)

Keep existing on-demand lookup for real-time location:
- Current AP name and location
- Current client count on that AP

### Anomaly Detection

Runs after client sync completes:
1. Load enabled rules from `meraki_anomaly_rules`
2. Query `meraki_clients` matching each rule
3. Insert new records into `meraki_anomalies`
4. Log summary to `cached_stats` for dashboard

---

## Dashboard Design

### Enhanced Meraki Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE HEALTH                                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────────┐  │
│  │   761    │ │   239    │ │   984    │ │   License: OK      │  │
│  │   APs    │ │ Switches │ │  Online  │ │   Exp: Apr 2027    │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────────┘  │
│                                                                  │
│  ⚠️ 16 Dormant Devices  |  ⚠️ 15 Firmware Mismatch              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  CLIENT DISTRIBUTION BY SSID                      [Pie Chart]    │
│                                                                  │
│  CR-PSK: 352 clients (67%)                                       │
│  CR-WLAN: 141 clients (27%)                                      │
│  CR-Guest: 6 clients (1%)                                        │
│  Other: 25 clients (5%)                                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  ANOMALIES DETECTED                                        [!]   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 🔴 3 Apple devices on CR-PSK (Chromebook network)         │  │
│  │ 🟡 2 Unknown manufacturers on CR-WLAN                     │  │
│  │                                          [View All →]     │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE BY SITE                           [Bar Chart]    │
│                                                                  │
│  CRHS         ████████████████████  156 APs, 52 switches        │
│  Fifer        ██████████           89 APs, 24 switches          │
│  Postlethwait ████████             72 APs, 18 switches          │
│  ...                                                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  FIRMWARE VERSIONS                                [Donut Chart]  │
│                                                                  │
│  Wireless:                    Switches:                          │
│  - 30-7-1: 540 (71%)         - 17-2-1: 134 (56%)                │
│  - 31-1-7: 210 (28%)         - 17-2-2: 62 (26%)                 │
│  - Other: 11 (1%)            - Other: 43 (18%)                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Reports

### New Meraki Reports

#### 1. Infrastructure Inventory
All APs and switches for lifecycle planning.

| Column | Description |
|--------|-------------|
| Name | Device name |
| Model | Hardware model |
| Serial | Serial number |
| Site | Network/location |
| Firmware | Current version |
| Status | Online/dormant/offline |
| IP | Management IP |
| Last Updated | Sync timestamp |

**Filters:** Site, Model, Status, Product Type (AP/Switch)

#### 2. Firmware Compliance
Track devices needing upgrades.

| Column | Description |
|--------|-------------|
| Name | Device name |
| Model | Hardware model |
| Current FW | Running firmware |
| Expected FW | Target firmware |
| Compliant | Yes/No |
| Site | Network/location |

**Filters:** Compliant (Y/N), Model, Site

#### 3. Client Anomalies
Devices on wrong networks.

| Column | Description |
|--------|-------------|
| MAC | Client MAC |
| Manufacturer | Device manufacturer |
| OS | Operating system |
| SSID | Connected SSID |
| Rule | Anomaly rule triggered |
| Last AP | Access point |
| Last Seen | Timestamp |
| Status | Active/Resolved |

**Filters:** Rule, SSID, Resolved status

#### 4. AP Utilization (Future)
Capacity planning by AP.

| Column | Description |
|--------|-------------|
| AP Name | Access point |
| Site | Location |
| Avg Clients (24h) | Average client count |
| Peak Clients | Maximum clients |
| Status | Online/dormant |

---

## Anomaly Detection Rules

### Default Rules

| Rule | SSID | Condition | Severity |
|------|------|-----------|----------|
| Apple on Chromebook Net | CR-PSK | manufacturer LIKE '%Apple%' | Warning |
| Android on Chromebook Net | CR-PSK | os LIKE '%Android%' | Warning |
| Unknown on Staff Net | CR-WLAN | manufacturer = 'Unknown' | Warning |
| Gaming Device | * | manufacturer IN ('Sony', 'Microsoft', 'Nintendo') | Critical |

### Rule Engine Logic

```python
def detect_anomalies(db: Session):
    rules = db.query(MerakiAnomalyRule).filter(enabled=True).all()

    for rule in rules:
        # Build query based on rule
        clients = db.query(MerakiClient).filter(
            MerakiClient.last_ssid.like(rule.ssid_pattern),
            # Apply condition based on type
        ).all()

        for client in clients:
            # Check if already flagged
            existing = db.query(MerakiAnomaly).filter(
                client_mac=client.mac,
                rule_id=rule.rule_id,
                resolved=False
            ).first()

            if not existing:
                db.add(MerakiAnomaly(...))
```

---

## Implementation Phases

### Phase 1: Data Foundation
- [ ] Create database tables (models.py)
- [ ] Build `meraki_bulk_sync.py` service
- [ ] Create sync script for cron (`/scripts/meraki_bulk_sync.py`)
- [ ] Add cron job (4 AM)
- [ ] Test sync with production data

### Phase 2: Enhanced Dashboard
- [ ] Update `/api/dashboards/meraki` endpoint
- [ ] Infrastructure health cards
- [ ] Client distribution chart
- [ ] Devices by site chart
- [ ] Firmware version chart
- [ ] Update `MerakiDashboard.jsx`

### Phase 3: Anomaly Detection
- [ ] Create anomaly rules table
- [ ] Create anomalies table
- [ ] Build detection engine
- [ ] Add to post-sync process
- [ ] Dashboard anomaly panel
- [ ] Flag in Device 360

### Phase 4: Reports
- [ ] Infrastructure Inventory report + CSV
- [ ] Firmware Compliance report + CSV
- [ ] Client Anomalies report + CSV
- [ ] Add to Reports index

### Phase 5: iPSK Management (Future)
- [ ] View existing iPSK identities
- [ ] Create guest iPSK with expiration
- [ ] Delete/revoke identities
- [ ] Audit logging

---

## File Structure

```
/opt/atlas/atlas-backend/
├── app/
│   ├── models.py                    # Add new Meraki tables
│   ├── services/
│   │   ├── meraki_sync.py           # Existing (live lookups)
│   │   ├── meraki_bulk_sync.py      # NEW - bulk sync service
│   │   └── meraki_anomaly.py        # NEW - anomaly detection
│   └── routers/
│       ├── dashboards.py            # Enhance /api/dashboards/meraki
│       └── reports.py               # Add Meraki reports
├── scripts/
│   └── meraki_bulk_sync.py          # Cron entry point

/opt/atlas/atlas-ui/
└── src/pages/
    ├── Dashboards/
    │   └── MerakiDashboard.jsx      # Enhanced dashboard
    └── Reports/
        ├── InfrastructureInventory.jsx
        ├── FirmwareCompliance.jsx
        └── ClientAnomalies.jsx
```

---

## API Endpoints

### New/Modified Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboards/meraki` | Enhanced with infrastructure data |
| GET | `/api/reports/infrastructure-inventory` | AP/switch inventory |
| GET | `/api/reports/infrastructure-inventory/export/csv` | CSV export |
| GET | `/api/reports/firmware-compliance` | Firmware status |
| GET | `/api/reports/firmware-compliance/export/csv` | CSV export |
| GET | `/api/reports/client-anomalies` | Detected anomalies |
| GET | `/api/reports/client-anomalies/export/csv` | CSV export |
| GET | `/api/meraki/anomaly-rules` | List anomaly rules |
| POST | `/api/meraki/anomaly-rules` | Create rule |
| DELETE | `/api/meraki/anomaly-rules/{id}` | Delete rule |

---

## Verification Checklist

After implementation:
- [ ] Bulk sync completes without errors
- [ ] All tables populated with expected counts
- [ ] Dashboard shows accurate device counts
- [ ] Anomaly detection flags test cases correctly
- [ ] Reports load and export properly
- [ ] Device 360 still shows real-time AP data
- [ ] Cron job runs at 4 AM successfully
- [ ] API rate limits not exceeded during sync

---

## Notes

- Meraki API rate limit: ~10 requests/second
- License is co-term (org-wide expiration, not per-device)
- Port-level data excluded from nightly sync (11,382 ports = excessive)
- iPSK management deferred to Phase 5
