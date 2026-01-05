import requests
from sqlalchemy.orm import Session
from app.models import NetworkCache
from datetime import datetime

class MerakiConnector:
    def __init__(self, api_key: str, org_id: str):
        self.api_key = api_key
        self.org_id = org_id
        self.base_url = "https://api.meraki.com/api/v1"
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        self._wireless_network_ids = None
        self._ap_name_cache = {}

    def _get_ap_name(self, network_id: str, ap_mac: str) -> str | None:
        """
        Looks up the friendly name of an AP by its MAC address.
        """
        if not network_id or not ap_mac:
            return None

        cache_key = f"{network_id}:{ap_mac}"
        if cache_key in self._ap_name_cache:
            return self._ap_name_cache[cache_key]

        try:
            url = f"{self.base_url}/networks/{network_id}/devices"
            resp = requests.get(url, headers=self.headers, timeout=10)
            resp.raise_for_status()

            devices = resp.json()
            for device in devices:
                if device.get("mac", "").lower() == ap_mac.lower():
                    name = device.get("name") or device.get("model", "Unknown AP")
                    self._ap_name_cache[cache_key] = name
                    return name

            return None
        except Exception as e:
            print(f"[Meraki] AP lookup error: {e}")
            return None

    def _get_wireless_network_ids(self) -> list:
        """
        Fetches and caches network IDs where name contains 'Wireless'.
        This filters out switch networks to ensure only AP data is returned.
        """
        if self._wireless_network_ids is not None:
            return self._wireless_network_ids

        try:
            url = f"{self.base_url}/organizations/{self.org_id}/networks"
            resp = requests.get(url, headers=self.headers, timeout=10)
            resp.raise_for_status()

            networks = resp.json()
            # Check for both "Wireless" and "wireless" in network names
            self._wireless_network_ids = [
                n["id"] for n in networks
                if "Wireless" in n.get("name", "") or "wireless" in n.get("name", "")
            ]
            print(f"[Meraki] Cached {len(self._wireless_network_ids)} wireless networks")
            return self._wireless_network_ids
        except Exception as e:
            print(f"[Meraki] Failed to fetch networks: {e}")
            return []

    def fetch_client_by_mac(self, mac: str) -> dict | None:
        """
        Fetches client info by MAC address from wireless networks only.
        Returns the most recent AP connection data.
        """
        if not mac:
            return None

        # Clean and format MAC address
        clean_mac = mac.strip().lower().replace(":", "").replace("-", "")
        if len(clean_mac) != 12:
            print(f"[Meraki] Invalid MAC format: {mac}")
            return None

        # Format as colon-separated for Meraki API
        formatted_mac = ":".join(clean_mac[i:i+2] for i in range(0, 12, 2))

        wireless_ids = self._get_wireless_network_ids()
        if not wireless_ids:
            print("[Meraki] No wireless networks found")
            return None

        try:
            url = f"{self.base_url}/organizations/{self.org_id}/clients/search"
            params = {"mac": formatted_mac}
            resp = requests.get(url, headers=self.headers, params=params, timeout=10)

            if resp.status_code == 200:
                data = resp.json()
                records = data.get("records", [])

                # Filter to wireless networks only (AP data)
                # and find the most recent one
                # Network ID is nested in record["network"]["id"]
                wireless_records = [
                    r for r in records
                    if r.get("network", {}).get("id") in wireless_ids
                ]

                if wireless_records:
                    # Sort by lastSeen to get most recent
                    wireless_records.sort(
                        key=lambda x: x.get("lastSeen", 0),
                        reverse=True
                    )
                    record = wireless_records[0]

                    # Get AP name - try looking up by recentDeviceMac first
                    ap_name = None
                    network_id = record.get("network", {}).get("id")
                    ap_mac = record.get("recentDeviceMac")

                    if ap_mac and network_id:
                        ap_name = self._get_ap_name(network_id, ap_mac)

                    # Fallback to network name if AP lookup fails
                    if not ap_name:
                        ap_name = record.get("network", {}).get("name", "Unknown")

                    return {
                        "ap_name": ap_name,
                        "last_seen": record.get("lastSeen"),
                        "ssid": record.get("ssid"),
                        "ip_address": record.get("ip"),
                        "vlan": record.get("vlan"),
                        "network_id": record.get("network", {}).get("id")
                    }
            elif resp.status_code == 404:
                print(f"[Meraki] MAC {formatted_mac} not found")
            else:
                print(f"[Meraki] API returned {resp.status_code}")

            return None
        except Exception as e:
            print(f"[Meraki] API Error: {e}")
            return None

    def sync_record(self, db: Session, mac: str) -> dict:
        """
        Syncs Meraki data for a device by MAC address to NetworkCache.
        """
        raw_data = self.fetch_client_by_mac(mac)

        if not raw_data:
            return {"status": "error", "message": "Device not found in Meraki wireless networks"}

        # Parse last_seen timestamp
        last_seen = None
        if raw_data.get("last_seen"):
            try:
                # Meraki returns ISO format timestamps
                last_seen = datetime.fromisoformat(
                    raw_data["last_seen"].replace("Z", "+00:00")
                )
            except:
                last_seen = datetime.utcnow()
        else:
            last_seen = datetime.utcnow()

        # Normalize MAC for storage
        clean_mac = mac.strip().lower().replace(":", "").replace("-", "")

        cache_entry = NetworkCache(
            mac_address=clean_mac,
            last_ap_name=raw_data.get("ap_name"),
            ip_address=raw_data.get("ip_address"),
            ssid=raw_data.get("ssid"),
            vlan=raw_data.get("vlan"),
            last_seen=last_seen
        )

        try:
            db.merge(cache_entry)
            db.commit()
            return {"status": "success", "mac": mac, "ap_name": raw_data.get("ap_name")}
        except Exception as e:
            db.rollback()
            return {"status": "error", "detail": str(e)}
