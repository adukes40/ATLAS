# ATLAS

**Asset, Telemetry, Location, & Analytics System**

A unified IT operations platform for K-12 school districts.

---

## The Problem

School district IT departments manage thousands of Chromebooks across multiple buildings, but device data is scattered across different systems:

- **Incident IQ** knows who owns the device and its repair history
- **Google Admin** knows the device health and OS status
- **Cisco Meraki** knows where the device is on the network right now

When a teacher reports a missing Chromebook or a student claims their device was stolen, IT staff must log into three different dashboards, cross-reference serial numbers, and piece together the story manually.

---

## The Solution

ATLAS consolidates all device data into a single search interface. Type a serial number or asset tag, and within seconds you see everything: who owns it, where it is on the network, its battery health, outstanding fees, and more.

No more dashboard hopping. No more copying serial numbers between tabs. Just answers.

---

## Key Features

### Device 360 View
Search by serial number or asset tag and get a complete device profile in under 3 seconds:
- Device owner and contact information
- Current status (In Service, Broken, Loaner, etc.)
- Physical location assignment
- Network location (which access point, which building)
- Hardware health (battery, storage, CPU temperature)
- Outstanding fees and repair history
- Direct links to source systems (IIQ, Google Admin, Meraki)

### Fleet Dashboards
Monitor your entire device fleet from high-level dashboards:
- Google Dashboard: Device status, OS versions, AUE tracking
- IIQ Dashboard: Asset status, assignments, student device counts
- Meraki Dashboard: Network infrastructure and AP stats

### Pre-Built Reports
Export-ready reports for common IT tasks:
- Device Inventory Report
- AUE/End-of-Life Report
- Fee Balance Report
- Students Without Chromebook
- Multiple Device Report
- Custom Report Builder

### Secure Access
- Google OAuth authentication
- Group-based authorization
- Per-user rate limiting
- Domain restriction

---

## Quick Start

### One-Line Install

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/adukes40/ATLAS/main/installer/install.sh)"
```

The installer will guide you through configuration and set up everything automatically.

### Requirements

| Resource | Minimum |
|----------|---------|
| RAM | 2 GB |
| CPU | 2 cores |
| Disk | 20 GB |
| OS | Ubuntu 22.04 LTS or Debian 12 |

### API Credentials Needed

Before installation, gather:
- **Incident IQ**: API token, Site ID, Product ID (from Admin > Developer Tools)
- **Google Workspace**: Service account JSON with Admin SDK access
- **Google OAuth**: Client ID and secret for user authentication
- **Cisco Meraki**: API key and Organization ID

See the [Installation Guide](installer/INSTALL.md) for detailed instructions.

---

## Architecture

| Component | Technology |
|-----------|-----------|
| Backend | FastAPI + SQLAlchemy + PostgreSQL |
| Frontend | React 18 + Vite + Tailwind CSS |
| Charts | Recharts |
| Icons | Lucide React |
| Reverse Proxy | Nginx |
| Process Manager | systemd |

---

## Data Sources

ATLAS aggregates data from three systems:

| Source | Data |
|--------|------|
| Incident IQ | Asset ownership, repair history, fees, tickets |
| Google Admin | Device telemetry, OS versions, hardware health |
| Cisco Meraki | Network location, AP connections, last seen |

Data stays separate at ingestion, linked at query time using serial numbers and MAC addresses.

---

## Sync Schedule

| Time | Sync |
|------|------|
| 2:00 AM | Google devices |
| 3:00 AM | IIQ assets and users |
| On demand | Meraki network data |

---

## Documentation

- [Installation Guide](installer/INSTALL.md)
- [Technical Overview](docs/ATLAS-Technical-Overview.md)
- [Feature Guide](docs/ATLAS-Features.md)

---

## License

All Rights Reserved. This software is proprietary and confidential.

---

**ATLAS: See everything. Find anything. Fix it faster.**
