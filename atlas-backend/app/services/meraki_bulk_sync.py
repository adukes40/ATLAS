"""
Meraki Bulk Sync Service

Handles nightly bulk synchronization of Meraki data:
- Networks (reference data)
- Devices (APs + switches)
- SSIDs (wireless config)
- Clients (24h rolling window)

Usage:
    from app.services.meraki_bulk_sync import MerakiBulkSync

    sync = MerakiBulkSync(api_key, org_id)
    result = sync.bulk_sync(db)
"""

import requests
from datetime import datetime
from sqlalchemy.orm import Session
from typing import Optional

from app.models import MerakiNetwork, MerakiDevice, MerakiSSID, MerakiClient


class MerakiBulkSync:
    """Bulk sync service for Meraki data."""

    def __init__(self, api_key: str, org_id: str):
        self.api_key = api_key
        self.org_id = org_id
        self.base_url = "https://api.meraki.com/api/v1"
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        self.timeout = 30
        self.error_details = []  # Collect detailed errors for logging

    def _get(self, endpoint: str, params: dict = None) -> Optional[list | dict]:
        """Make GET request to Meraki API. Returns None on error, empty list on 404."""
        url = f"{self.base_url}{endpoint}"
        try:
            resp = requests.get(url, headers=self.headers, params=params, timeout=self.timeout)
            if resp.status_code == 404:
                # 404 is expected for some networks without wireless clients - not an error
                return []
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.RequestException as e:
            print(f"[Meraki API Error] {endpoint}: {e}")
            return None

    def sync_networks(self, db: Session) -> dict:
        """
        Sync all networks from Meraki to meraki_networks table.
        Returns: {"success": int, "errors": int}
        """
        print("[Networks] Fetching from Meraki API...")
        networks = self._get(f"/organizations/{self.org_id}/networks")

        if networks is None:
            return {"success": 0, "errors": 1, "message": "API request failed"}

        success = 0
        errors = 0

        for net in networks:
            try:
                record = MerakiNetwork(
                    network_id=net["id"],
                    name=net.get("name", ""),
                    url=net.get("url"),
                    product_types=net.get("productTypes", []),
                    tags=net.get("tags", []),
                    time_zone=net.get("timeZone"),
                    last_updated=datetime.utcnow()
                )
                db.merge(record)
                success += 1
            except Exception as e:
                print(f"[Networks] Error processing {net.get('id')}: {e}")
                self.error_details.append({
                    "identifier": f"network:{net.get('id', 'unknown')}",
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat()
                })
                errors += 1

        db.commit()
        print(f"[Networks] Synced {success} networks, {errors} errors")
        return {"success": success, "errors": errors}

    def sync_devices(self, db: Session) -> dict:
        """
        Sync all devices (APs + switches) from Meraki to meraki_devices table.
        Also fetches device statuses for online/offline state.
        Returns: {"success": int, "errors": int, "aps": int, "switches": int}
        """
        print("[Devices] Fetching devices from Meraki API...")
        devices = self._get(f"/organizations/{self.org_id}/devices")

        if devices is None:
            return {"success": 0, "errors": 1, "message": "API request failed"}

        # Fetch statuses separately for online/offline info
        print("[Devices] Fetching device statuses...")
        statuses_list = self._get(f"/organizations/{self.org_id}/devices/statuses")
        statuses = {}
        if statuses_list:
            statuses = {s["serial"]: s.get("status", "unknown") for s in statuses_list}

        success = 0
        errors = 0
        aps = 0
        switches = 0

        for dev in devices:
            try:
                serial = dev["serial"]
                product_type = dev.get("productType", "unknown")

                record = MerakiDevice(
                    serial=serial,
                    name=dev.get("name"),
                    model=dev.get("model", "Unknown"),
                    mac=dev.get("mac", ""),
                    network_id=dev.get("networkId", ""),
                    product_type=product_type,
                    firmware=dev.get("firmware"),
                    address=dev.get("address"),
                    lat=dev.get("lat"),
                    lng=dev.get("lng"),
                    lan_ip=dev.get("lanIp"),
                    status=statuses.get(serial, "unknown"),
                    tags=dev.get("tags", []),
                    last_updated=datetime.utcnow()
                )
                db.merge(record)
                success += 1

                if product_type == "wireless":
                    aps += 1
                elif product_type == "switch":
                    switches += 1

            except Exception as e:
                print(f"[Devices] Error processing {dev.get('serial')}: {e}")
                self.error_details.append({
                    "identifier": f"device:{dev.get('serial', 'unknown')}",
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat()
                })
                errors += 1

        db.commit()
        print(f"[Devices] Synced {success} devices ({aps} APs, {switches} switches), {errors} errors")
        return {"success": success, "errors": errors, "aps": aps, "switches": switches}

    def sync_ssids(self, db: Session) -> dict:
        """
        Sync SSIDs from all wireless networks to meraki_ssids table.
        Returns: {"success": int, "errors": int, "networks_processed": int}
        """
        print("[SSIDs] Fetching networks for SSID sync...")

        # Get all networks and filter in Python (JSON contains queries are tricky in PostgreSQL)
        all_networks = db.query(MerakiNetwork).all()
        networks = [n for n in all_networks if "wireless" in (n.product_types or [])]

        print(f"[SSIDs] Found {len(networks)} wireless networks")

        success = 0
        errors = 0
        networks_processed = 0

        for network in networks:
            try:
                ssids = self._get(f"/networks/{network.network_id}/wireless/ssids")

                if ssids is None:
                    errors += 1
                    continue

                networks_processed += 1

                for ssid in ssids:
                    try:
                        # Delete existing SSIDs for this network+number to handle updates
                        db.query(MerakiSSID).filter(
                            MerakiSSID.network_id == network.network_id,
                            MerakiSSID.ssid_number == ssid["number"]
                        ).delete()

                        record = MerakiSSID(
                            network_id=network.network_id,
                            ssid_number=ssid["number"],
                            name=ssid.get("name", f"SSID {ssid['number']}"),
                            enabled=ssid.get("enabled", False),
                            auth_mode=ssid.get("authMode"),
                            encryption_mode=ssid.get("encryptionMode"),
                            last_updated=datetime.utcnow()
                        )
                        db.add(record)
                        success += 1
                    except Exception as e:
                        print(f"[SSIDs] Error processing SSID {ssid.get('number')} in {network.name}: {e}")
                        self.error_details.append({
                            "identifier": f"ssid:{network.name}:{ssid.get('number')}",
                            "error": str(e),
                            "timestamp": datetime.utcnow().isoformat()
                        })
                        errors += 1

            except Exception as e:
                print(f"[SSIDs] Error processing network {network.name}: {e}")
                self.error_details.append({
                    "identifier": f"ssid-network:{network.name}",
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat()
                })
                errors += 1

        db.commit()
        print(f"[SSIDs] Synced {success} SSIDs from {networks_processed} networks, {errors} errors")
        return {"success": success, "errors": errors, "networks_processed": networks_processed}

    def sync_clients(self, db: Session) -> dict:
        """
        Sync clients from all wireless networks (24h window) to meraki_clients table.
        Returns: {"success": int, "errors": int, "networks_processed": int}
        """
        print("[Clients] Fetching networks for client sync...")

        # Get wireless networks
        all_networks = db.query(MerakiNetwork).all()
        networks = [n for n in all_networks if "wireless" in (n.product_types or [])]

        print(f"[Clients] Found {len(networks)} wireless networks")

        success = 0
        errors = 0
        networks_processed = 0
        seen_macs = set()  # Track MACs to handle clients on multiple networks

        for network in networks:
            try:
                # Get wireless clients from last 24 hours (includes rssi)
                clients = self._get(
                    f"/networks/{network.network_id}/wireless/clients",
                    params={"timespan": 86400, "perPage": 1000}
                )

                if clients is None:
                    errors += 1
                    continue

                networks_processed += 1
                print(f"[Clients] {network.name}: {len(clients)} clients")

                for client in clients:
                    try:
                        mac = client.get("mac", "").lower().replace(":", "")
                        if not mac:
                            continue

                        # Parse timestamps - handle both Unix epoch and ISO format
                        def parse_meraki_timestamp(ts):
                            if not ts:
                                return None
                            try:
                                if isinstance(ts, (int, float)):
                                    return datetime.utcfromtimestamp(ts)
                                elif isinstance(ts, str):
                                    if ts.isdigit():
                                        return datetime.utcfromtimestamp(int(ts))
                                    else:
                                        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
                            except:
                                return None

                        first_seen = parse_meraki_timestamp(client.get("firstSeen"))
                        last_seen = parse_meraki_timestamp(client.get("lastSeen"))

                        # Get usage stats
                        usage = client.get("usage", {})

                        # Skip if we've already processed this MAC in this sync
                        # (client may appear on multiple networks - first one wins)
                        if mac in seen_macs:
                            continue

                        seen_macs.add(mac)

                        record = MerakiClient(
                            mac=mac,
                            description=client.get("description"),
                            manufacturer=client.get("manufacturer"),
                            os=client.get("os"),
                            first_seen=first_seen,
                            last_seen=last_seen,
                            status=client.get("status"),
                            last_ssid=client.get("ssid"),
                            last_vlan=int(client["vlan"]) if client.get("vlan") and str(client["vlan"]).strip() else None,
                            last_ap_serial=client.get("recentDeviceSerial"),
                            last_ap_name=client.get("recentDeviceName"),
                            last_network_id=network.network_id,
                            usage_sent=usage.get("sent"),
                            usage_recv=usage.get("recv"),
                            psk_group=client.get("pskGroup"),
                            rssi=client.get("rssi"),
                            last_updated=datetime.utcnow()
                        )
                        db.merge(record)
                        success += 1

                    except Exception as e:
                        print(f"[Clients] Error processing client {client.get('mac')}: {e}")
                        self.error_details.append({
                            "identifier": client.get('mac', 'unknown'),
                            "error": str(e),
                            "timestamp": datetime.utcnow().isoformat()
                        })
                        errors += 1

            except Exception as e:
                print(f"[Clients] Error processing network {network.name}: {e}")
                self.error_details.append({
                    "identifier": f"network:{network.name}",
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat()
                })
                errors += 1

        db.commit()
        print(f"[Clients] Synced {success} unique clients from {networks_processed} networks, {errors} errors")
        return {"success": success, "errors": errors, "networks_processed": networks_processed}

    def bulk_sync(self, db: Session) -> dict:
        """
        Run full bulk sync of all Meraki data.
        Order: Networks → Devices → SSIDs → Clients

        Returns summary of all sync operations.
        """
        print("=" * 60)
        print("MERAKI BULK SYNC")
        print(f"Organization: {self.org_id}")
        print(f"Started: {datetime.utcnow().isoformat()}")
        print("=" * 60)
        print()

        results = {
            "networks": {"success": 0, "errors": 0},
            "devices": {"success": 0, "errors": 0},
            "ssids": {"success": 0, "errors": 0},
            "clients": {"success": 0, "errors": 0}
        }

        # Phase 1: Networks (reference data needed by other syncs)
        print("-" * 40)
        print("Phase 1: Networks")
        print("-" * 40)
        results["networks"] = self.sync_networks(db)
        print()

        # Phase 2: Devices (APs + switches)
        print("-" * 40)
        print("Phase 2: Devices (APs + Switches)")
        print("-" * 40)
        results["devices"] = self.sync_devices(db)
        print()

        # Phase 3: SSIDs
        print("-" * 40)
        print("Phase 3: SSIDs")
        print("-" * 40)
        results["ssids"] = self.sync_ssids(db)
        print()

        # Phase 4: Clients
        print("-" * 40)
        print("Phase 4: Clients (24h window)")
        print("-" * 40)
        results["clients"] = self.sync_clients(db)
        print()

        # Summary
        total_success = sum(r.get("success", 0) for r in results.values())
        total_errors = sum(r.get("errors", 0) for r in results.values())

        print("=" * 60)
        print("SYNC COMPLETE")
        print(f"Networks: {results['networks']['success']} synced")
        print(f"Devices: {results['devices']['success']} synced ({results['devices'].get('aps', 0)} APs, {results['devices'].get('switches', 0)} switches)")
        print(f"SSIDs: {results['ssids']['success']} synced")
        print(f"Clients: {results['clients']['success']} synced")
        print(f"Total: {total_success} records, {total_errors} errors")
        print("=" * 60)

        return {
            "status": "success" if total_errors == 0 else "partial",
            "total_success": total_success,
            "total_errors": total_errors,
            "details": results,
            "error_details": self.error_details
        }
