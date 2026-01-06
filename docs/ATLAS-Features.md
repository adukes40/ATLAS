# ATLAS

**Asset, Telemetry, Location, and Analytics System**

A unified IT operations platform for K-12 school districts.

---

## The Problem

School district IT departments manage thousands of Chromebooks across multiple buildings, but the data about these devices is scattered across different systems:

- **Incident IQ** knows who owns the device and its repair history
- **Google Admin** knows the device health and OS status
- **Cisco Meraki** knows where the device is on the network right now

When a teacher reports a missing Chromebook or a student claims their device was stolen, IT staff must log into three different dashboards, cross-reference serial numbers, and piece together the story manually. This takes valuable time and often leads to incomplete information.

---

## The Solution

ATLAS consolidates all device data into a single search interface. Type a serial number or asset tag, and within seconds you see everything: who owns it, where it is on the network, its battery health, outstanding fees, and more.

No more dashboard hopping. No more copying serial numbers between tabs. Just answers.

---

## Key Features

### Instant Device Lookup

Search by serial number or asset tag and get a complete device profile in under 3 seconds. ATLAS performs live API calls to pull the freshest data from all connected systems.

**What you see at a glance:**
- Device owner and contact information
- Current status (In Service, Broken, Loaner, etc.)
- Physical location assignment
- Network location (which access point, which building)
- Hardware health (battery, storage, CPU temperature)
- Outstanding fees and repair history
- Data conflict warnings

### One-Click Access

Every device profile includes direct links to the source systems. Need to disable the device in Google Admin? Click the Google button. Need to open a repair ticket? Click the IIQ button. Need to see network history in Meraki? Click the Meraki button. ATLAS takes you directly to the right record.

### Fleet Dashboards

Monitor your entire device fleet from high-level dashboards:

**Google Dashboard**
- See how many devices are Active, Disabled, or Deprovisioned
- Track Auto Update Expiration (AUE) dates across your fleet
- Identify devices running outdated Chrome OS versions
- Plan hardware refresh cycles with expiration forecasts

**IIQ Dashboard**
- View asset status breakdown
- Track student device assignment rates
- Identify students without assigned devices
- Monitor repair ticket volumes

**Meraki Dashboard**
- See network infrastructure status
- Track client connection patterns
- Monitor access point utilization

### Pre-Built Reports

Export-ready reports for common IT tasks:

**Device Inventory Report**
Complete listing of all devices with assignment information. Filter by location, status, model, or grade level. Export to CSV for import into other systems.

**AUE/End-of-Life Report**
Identify devices that have passed or are approaching their Auto Update Expiration date. Color-coded indicators show expired (red), expiring soon (amber), and compliant (green) devices. Essential for hardware refresh planning.

**Fee Balance Report**
List all students with outstanding device fees. Sort by amount owed, filter by school or grade. Useful for end-of-year collections.

**Students Without Chromebook**
Identify active students who do not have a device assigned. Filter by school and grade to prioritize distribution.

**Multiple Device Report**
Find users who have more than one device assigned. Helps identify assignment errors and recover misallocated devices.

**Custom Report Builder**
Select any data source, choose your columns, apply filters, and export. Build the exact report you need without waiting for IT to write custom queries.

### Smart Conflict Detection

ATLAS automatically identifies data integrity issues:

- **Owner Mismatch**: IIQ says the device is assigned to Student A, but Google shows Student B as the most recent user. Someone may be using the wrong device.

- **Asset Tag Misconfiguration**: The asset tag matches the serial number, indicating the tag was never properly configured.

These warnings appear directly on the device profile, helping you catch problems before they become bigger issues.

### Secure Access Control

ATLAS integrates with Google Workspace for authentication:

- Users sign in with their district Google account
- Access is controlled by Google Group membership
- No separate passwords to manage
- Automatic session expiration
- All actions are rate-limited to prevent abuse

### Network Location Tracking

When a device connects to your Meraki network, ATLAS captures:

- Which access point it connected to (building and room identification)
- Signal strength (helps identify connectivity issues)
- Last seen timestamp
- SSID and VLAN information

This data is invaluable when tracking down "lost" devices. A Chromebook reported missing but connecting to AP "WESTELEM-LIBRARY-01" is probably sitting in the West Elementary library.

### Offline Network Detection

ATLAS identifies when devices are connecting from outside your network. If a device shows a non-district WAN IP, the interface clearly indicates "Not on State Network" so you know the device is being used off-campus.

---

## Technical Requirements

**Server Requirements**
- 2 GB RAM minimum (4 GB recommended)
- 2 CPU cores
- 20 GB storage
- Ubuntu 22.04 LTS or Debian 12

**Required Integrations**
- Incident IQ (API access)
- Google Workspace (Admin SDK with service account)
- Cisco Meraki (Dashboard API access)

**Browser Support**
- Chrome, Edge, Firefox, Safari (latest versions)

---

## Deployment Options

**Proxmox LXC Container (Recommended)**
Lightweight container with dedicated IP address. No conflicts with existing services.

**Virtual Machine**
Standard VM deployment on VMware ESXi, Hyper-V, or other hypervisors.

**Bare Metal**
Direct installation on dedicated Ubuntu/Debian server.

---

## Installation

ATLAS includes a one-line installer that handles all dependencies:

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/yourusername/ATLAS/main/installer/install.sh)"
```

The installer will:
1. Install required system packages
2. Configure PostgreSQL database
3. Set up Python and Node.js environments
4. Configure Nginx reverse proxy
5. Create systemd services
6. Schedule nightly data synchronization

A configuration wizard collects your API credentials during installation.

---

## Data Synchronization

**Nightly Bulk Sync**
- 2:00 AM: Google devices and users
- 3:00 AM: IIQ assets and users

**Live Sync**
- Every device lookup fetches fresh data from all systems
- Network location updated on each search

**Typical Data Volumes**
- Supports 25,000+ devices
- Supports 25,000+ users
- Sync completes in under 15 minutes

---

## Security

- All data encrypted in transit (HTTPS)
- API credentials stored in protected configuration files
- Google OAuth for user authentication
- Group-based access control
- Per-user rate limiting
- Read-only integration (ATLAS never modifies source data)
- Session-based authentication with automatic expiration

---

## Support and Updates

ATLAS is open source software. Updates are applied by pulling the latest code from the repository and restarting services.

Community support is available through GitHub issues.

---

## Screenshots

### Device 360 View
The primary search interface showing consolidated device information from all connected systems.

### Dashboard Overview
High-level fleet statistics with drill-down capability.

### Reports Interface
Filterable, sortable, exportable reports with multi-select filters.

---

## Getting Started

1. Review the technical requirements
2. Gather your API credentials (IIQ, Google, Meraki)
3. Provision a server or container
4. Run the installer
5. Complete the configuration wizard
6. Run initial data sync
7. Access ATLAS at your configured domain

For detailed instructions, see the Installation Guide.

---

## License

MIT License

---

**ATLAS: See everything. Find anything. Fix it faster.**
