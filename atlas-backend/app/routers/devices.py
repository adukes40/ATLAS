from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models import IIQAsset, GoogleDevice, NetworkCache, IIQUser, MerakiClient, MerakiNetwork
from app.schemas import DeviceResponse
from app.services.iiq_sync import IIQConnector
from app.services.google_sync import GoogleConnector
from app.services.meraki_sync import MerakiConnector
from app.config import get_iiq_config, get_google_config, get_meraki_config
from app.auth import get_current_user


def get_user_identifier(request: Request) -> str:
    """Get rate limit key from user email or IP."""
    user = get_current_user(request)
    if user and user.get("email"):
        return user.get("email")
    return get_remote_address(request)


limiter = Limiter(key_func=get_user_identifier)

def detect_conflicts(iiq_record, google_record) -> list:
    """
    Analyzes IIQ and Google records to detect data integrity conflicts.
    Returns a list of ConflictItem-compatible dictionaries.
    """
    conflicts = []

    # Conflict 1: Asset Tag = Serial Number
    if iiq_record and iiq_record.asset_tag and iiq_record.serial_number:
        if iiq_record.asset_tag.strip().lower() == iiq_record.serial_number.strip().lower():
            conflicts.append({
                "id": "asset_tag_serial_match",
                "title": "Asset Tag Misconfiguration",
                "description": f"The asset tag '{iiq_record.asset_tag}' is identical to the serial number. Asset tags should be unique identifiers separate from serial numbers.",
                "remediation": "Update the asset tag in IIQ to a proper value (typically a district-assigned tag number).",
                "severity": "warning"
            })

    # Conflict 2: Owner Mismatch
    if iiq_record and google_record:
        iiq_email = (iiq_record.assigned_user_email or "").strip().lower()
        google_users = google_record.recent_users or []

        if iiq_email and google_users and len(google_users) > 0:
            google_recent_user = (google_users[0] or "").strip().lower()

            if google_recent_user and iiq_email != google_recent_user:
                conflicts.append({
                    "id": "owner_mismatch",
                    "title": "Owner Mismatch Detected",
                    "description": f"IIQ shows this device assigned to '{iiq_record.assigned_user_email}', but Google Admin shows the most recent user as '{google_users[0]}'.",
                    "remediation": "Either update the owner in IIQ to reflect the current user, or investigate why a different user logged into this device.",
                    "severity": "warning"
                })

    return conflicts

router = APIRouter(prefix="/api/device", tags=["devices"])

@router.get("/{query}", response_model=DeviceResponse)
@limiter.limit("60/minute")
def get_device_360(request: Request, query: str, db: Session = Depends(get_db)):
    """
    Fetches a 360-degree view of a device by Serial Number or Asset Tag.
    ALWAYS performs a live sync from IIQ & Google Admin first.
    """
    print(f">> Processing Query: {query}")
    
    # 1. ALWAYS Try Live Sync First (IIQ)
    try:
        iiq_cfg = get_iiq_config()
        iiq_connector = IIQConnector(
            iiq_cfg["url"], iiq_cfg["token"],
            site_id=iiq_cfg.get("site_id"), product_id=iiq_cfg.get("product_id")
        )
        sync_result = iiq_connector.sync_record(db, query)
        
        if sync_result.get("status") == "success":
            print(f"   >> IIQ Sync Success: {sync_result.get('serial')}")
            query = sync_result.get("serial")
        else:
            print(f"   !! IIQ Sync Warning: {sync_result.get('message')}")
    except Exception as e:
        print(f"   !! IIQ Sync Error: {e}")

    # 2. ALWAYS Try Live Sync (Google Admin) - Use Serial from query
    try:
        google_cfg = get_google_config()
        google_connector = GoogleConnector(
            credentials_path=google_cfg.get("credentials_path"),
            admin_email=google_cfg["admin_email"],
            credentials_json=google_cfg.get("credentials_json")
        )
        g_sync_result = google_connector.sync_record(db, query)
        if g_sync_result.get("status") == "success":
             print(f"   >> Google Sync Success: {query}")
        else:
             print(f"   !! Google Sync Warning: {g_sync_result.get('message')}")
    except Exception as e:
        print(f"   !! Google Sync Error: {e}")

    # 3. Fetch from Database (Now populated/updated)
    iiq_record = db.query(IIQAsset).filter(IIQAsset.serial_number == query).first()
    if not iiq_record:
        iiq_record = db.query(IIQAsset).filter(IIQAsset.asset_tag == query).first()

    # Determine the master serial number for cross-referencing
    target_serial = iiq_record.serial_number if iiq_record else query
    
    # 4. Fetch Supporting Pillar Data
    google_record = db.query(GoogleDevice).filter(GoogleDevice.serial_number == target_serial).first()
    
    # 3. Resolve Network Connectivity (via MAC Address)
    target_mac = None
    if iiq_record and iiq_record.mac_address:
        target_mac = iiq_record.mac_address
    elif google_record and google_record.mac_address:
        target_mac = google_record.mac_address
    elif google_record and google_record.ethernet_mac_address:
        target_mac = google_record.ethernet_mac_address

    # 3.5 ALWAYS Try Live Sync (Meraki) - Use MAC from IIQ/Google
    if target_mac:
        try:
            meraki_cfg = get_meraki_config()
            meraki_connector = MerakiConnector(meraki_cfg["api_key"], meraki_cfg["org_id"])
            m_sync_result = meraki_connector.sync_record(db, target_mac)
            if m_sync_result.get("status") == "success":
                print(f"   >> Meraki Sync Success: {m_sync_result.get('ap_name')}")
            else:
                print(f"   !! Meraki Sync Warning: {m_sync_result.get('message')}")
        except Exception as e:
            print(f"   !! Meraki Sync Error: {e}")

    # Normalize MAC for DB lookup
    network_record = None
    if target_mac:
        clean_mac = target_mac.strip().lower().replace(":", "").replace("-", "")
        network_record = db.query(NetworkCache).filter(NetworkCache.mac_address == clean_mac).first()

    # 4. Construct the Data Response
    iiq_data = None
    user_display_name = "Unassigned"

    if iiq_record:
        # Look up fee data from user record (fees are tied to users, not assets)
        user_fee_balance = None
        user_fee_past_due = None
        if iiq_record.owner_iiq_id:
            user_record = db.query(IIQUser).filter(IIQUser.user_id == iiq_record.owner_iiq_id).first()
            if user_record:
                user_fee_balance = float(user_record.fee_balance) if user_record.fee_balance else None
                user_fee_past_due = float(user_record.fee_past_due) if user_record.fee_past_due else None

        iiq_data = {
            "status": iiq_record.status,
            "tag": iiq_record.asset_tag,
            "asset_id": iiq_record.iiq_id,  # The UUID for linking to the Asset Profile
            "model": f"{iiq_record.model or ''} ({iiq_record.model_category or 'Device'})".strip(),
            "model_category": iiq_record.model_category,
            "location": iiq_record.location or "Unknown",

            # User/Owner Details
            "assigned_user_email": iiq_record.assigned_user_email,
            "assigned_grade": iiq_record.assigned_user_grade,
            "assigned_homeroom": iiq_record.assigned_user_homeroom,
            "assigned_school_id": iiq_record.assigned_user_id,
            "owner_iiq_id": iiq_record.owner_iiq_id,
            "owner_location": iiq_record.owner_location,

            # Fee Data (from user record, not asset)
            "fee_balance": user_fee_balance,
            "fee_past_due": user_fee_past_due,

            "ticket_count": iiq_record.ticket_count or 0
        }

        # Priority for display name: Full Name -> Email -> "Unassigned"
        if iiq_record.assigned_user_name:
            user_display_name = iiq_record.assigned_user_name
        elif iiq_record.assigned_user_email:
            user_display_name = iiq_record.assigned_user_email

    google_data = None
    if google_record:
        google_data = {
            "google_id": google_record.google_id,
            "os_version": google_record.os_version,
            "recent_users": google_record.recent_users,
            "org_unit_path": google_record.org_unit_path,
            "annotated_tag": google_record.annotated_asset_id,
            "annotated_user": google_record.annotated_user,
            "annotated_location": google_record.annotated_location,
            "status": google_record.status,
            "aue_date": google_record.aue_date,
            "os_compliance": google_record.os_compliance,
            "boot_mode": google_record.boot_mode,
            "cpu_temp": google_record.cpu_temp_avg,
            "ram_total": google_record.ram_total_gb,
            "ram_free": google_record.ram_free_gb,
            "disk_total": google_record.disk_total_gb,
            "disk_free": google_record.disk_free_gb,
            "battery_health": google_record.battery_health_percent,
            "lan_ip": google_record.lan_ip,
            "wan_ip": google_record.wan_ip,
            "last_sync": google_record.last_sync,
            "raw_reports": google_record.raw_reports
        }

    meraki_data = None
    if target_mac:
        # Normalize MAC for queries and display
        clean_mac = target_mac.strip().lower().replace(":", "").replace("-", "")
        # Format MAC with colons for display (e.g., 64:6e:e0:17:0f:a7)
        formatted_mac = ":".join(clean_mac[i:i+2] for i in range(0, 12, 2)) if len(clean_mac) == 12 else target_mac

        # Query enriched data from meraki_clients (bulk sync data)
        meraki_client = db.query(MerakiClient).filter(MerakiClient.mac == clean_mac).first()

        # Build response - prefer live lookup for AP location, use bulk sync for enriched data
        if network_record or meraki_client:
            # Get network URL for direct dashboard linking
            net_id = network_record.network_id if network_record else (meraki_client.last_network_id if meraki_client else None)
            network_url = None
            if net_id:
                meraki_network = db.query(MerakiNetwork).filter(MerakiNetwork.network_id == net_id).first()
                if meraki_network and meraki_network.url:
                    network_url = meraki_network.url

            meraki_data = {
                # MAC address for display and linking
                "mac_address": formatted_mac,
                # Meraki identifiers for direct dashboard linking
                "client_id": network_record.client_id if network_record else None,
                "network_id": net_id,
                "network_url": network_url,
                # Live lookup data (current location)
                "ap_name": network_record.last_ap_name if network_record else (meraki_client.last_ap_name if meraki_client else None),
                "ip_address": network_record.ip_address if network_record else None,
                "ssid": network_record.ssid if network_record else (meraki_client.last_ssid if meraki_client else None),
                # Use last_seen from meraki_clients (source timestamp from Meraki API)
                "last_seen": meraki_client.last_seen if meraki_client else (network_record.last_seen if network_record else None),
                # Enriched data from bulk sync
                "group_policy": meraki_client.psk_group if meraki_client else None,
                "rssi": meraki_client.rssi if meraki_client else None,
            }

    # 5. Detect Conflicts
    detected_conflicts = detect_conflicts(iiq_record, google_record)

    # 6. Assemble final 360 Object
    return {
        "serial": target_serial,
        "identity": {
            "serial": target_serial,
            "assigned_user": user_display_name
        },
        "sources": {
            "iiq": iiq_data,
            "google": google_data,
            "meraki": meraki_data
        },
        "conflicts": detected_conflicts
    }
