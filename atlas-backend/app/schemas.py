from pydantic import BaseModel
from typing import Optional, Dict, List, Any
from datetime import datetime

# --- IIQ DATA MODEL ---
class IIQData(BaseModel):
    status: Optional[str]
    tag: Optional[str]
    asset_id: Optional[str]
    model: Optional[str]
    model_category: Optional[str] # Added for conditional logic
    location: Optional[str]        # Asset Location

    # User Details
    assigned_user_email: Optional[str]
    assigned_grade: Optional[str]
    assigned_homeroom: Optional[str]
    assigned_school_id: Optional[str]
    owner_iiq_id: Optional[str]
    owner_location: Optional[str]

    # Fee Data (from user record)
    fee_balance: Optional[float]
    fee_past_due: Optional[float]

    ticket_count: int = 0

# --- OTHER PILLARS ---
class GoogleData(BaseModel):
    # Core
    google_id: Optional[str]
    os_version: Optional[str]
    recent_users: Optional[List[str]]
    
    # Identity & Config
    org_unit_path: Optional[str]
    annotated_tag: Optional[str]
    annotated_user: Optional[str]
    annotated_location: Optional[str]
    
    # Vital Telemetry
    status: Optional[str]
    aue_date: Optional[str]
    os_compliance: Optional[str]
    boot_mode: Optional[str]
    
    # Hardware Stats
    cpu_temp: Optional[int]
    ram_total: Optional[str]
    ram_free: Optional[str]
    disk_total: Optional[str]
    disk_free: Optional[str]
    battery_health: Optional[int]

    # Network IPs
    lan_ip: Optional[str]
    wan_ip: Optional[str]

    # Sync timestamp
    last_sync: Optional[datetime]

    # Full data for advanced UI views
    raw_reports: Optional[Dict[str, Any]] = {}

class NetworkData(BaseModel):
    ap_name: Optional[str]
    ip_address: Optional[str]
    last_seen: Optional[datetime]
    ssid: Optional[str]

# --- AGGREGATE RESPONSE ---
class DeviceSources(BaseModel):
    iiq: Optional[IIQData]
    google: Optional[GoogleData]
    meraki: Optional[NetworkData]

class DeviceIdentity(BaseModel):
    assigned_user: Optional[str]
    serial: str

class ConflictItem(BaseModel):
    id: str
    title: str
    description: str
    remediation: str
    severity: str = "warning"

class DeviceResponse(BaseModel):
    serial: str
    identity: DeviceIdentity
    sources: DeviceSources
    conflicts: List[ConflictItem] = []
