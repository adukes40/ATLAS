from sqlalchemy import String, Integer, BigInteger, DateTime, JSON, Boolean, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from datetime import datetime
from typing import Optional

# --- BASE SETUP ---
class Base(DeclarativeBase):
    pass

# --- CACHE VAULT (NEW) ---
class LocationCache(Base):
    """
    Stores static IIQ Location Names to minimize API calls.
    Example: 'a1b2-c3d4' -> 'North High School'
    """
    __tablename__ = "location_cache"
    
    location_id: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String)
    last_fetched: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

# --- PILLAR 1: INCIDENT IQ (ASSET & OWNER) ---
class IIQAsset(Base):
    __tablename__ = "iiq_assets"

    # Core Identifiers
    serial_number: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    iiq_id: Mapped[str] = mapped_column(String, unique=True, index=True) # UUID
    asset_tag: Mapped[Optional[str]] = mapped_column(String, index=True)
    
    # Device Details
    model: Mapped[Optional[str]] = mapped_column(String)
    model_category: Mapped[Optional[str]] = mapped_column(String) # e.g. "Chromebook"
    status: Mapped[Optional[str]] = mapped_column(String)         # e.g. "Deployed"
    mac_address: Mapped[Optional[str]] = mapped_column(String)
    
    # Expanded Owner Data
    assigned_user_email: Mapped[Optional[str]] = mapped_column(String, index=True)
    assigned_user_id: Mapped[Optional[str]] = mapped_column(String)       # SchoolIdNumber (SIS ID)
    owner_iiq_id: Mapped[Optional[str]] = mapped_column(String)           # Internal User UUID
    assigned_user_name: Mapped[Optional[str]] = mapped_column(String)     # Full Name
    assigned_user_role: Mapped[Optional[str]] = mapped_column(String)     # Role Name
    assigned_user_grade: Mapped[Optional[str]] = mapped_column(String)    # Grade Level
    assigned_user_homeroom: Mapped[Optional[str]] = mapped_column(String) # Homeroom
    owner_location: Mapped[Optional[str]] = mapped_column(String)         # Resolved Building Name
    
    # Location & Health
    location: Mapped[Optional[str]] = mapped_column(String)               # Asset Location Name
    ticket_count: Mapped[int] = mapped_column(Integer, default=0)         # Open Tickets

    # Fee Data (from IIQ Fee Tracker custom field)
    fee_balance: Mapped[Optional[float]] = mapped_column(String)          # Total outstanding balance
    fee_past_due: Mapped[Optional[float]] = mapped_column(String)         # Amount past due

    # Metadata
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    meta_data: Mapped[dict] = mapped_column(JSON, default={})


# --- IIQ USERS (Synced independently from assets) ---
class IIQUser(Base):
    """
    Synced from IIQ /api/v1.0/users endpoint.
    Captures ALL users (students, faculty, staff) regardless of asset ownership.
    Linked to iiq_assets via email address.
    """
    __tablename__ = "iiq_users"

    # Identifiers
    user_id: Mapped[str] = mapped_column(String, primary_key=True, index=True)  # IIQ UUID
    school_id_number: Mapped[Optional[str]] = mapped_column(String, index=True)  # SIS ID
    email: Mapped[Optional[str]] = mapped_column(String, index=True)

    # Personal Info
    full_name: Mapped[Optional[str]] = mapped_column(String)
    first_name: Mapped[Optional[str]] = mapped_column(String)
    last_name: Mapped[Optional[str]] = mapped_column(String)

    # Role & Classification
    role_name: Mapped[Optional[str]] = mapped_column(String, index=True)  # "Student", "Faculty", etc.
    grade: Mapped[Optional[str]] = mapped_column(String, index=True)

    # Location
    location_name: Mapped[Optional[str]] = mapped_column(String)
    location_id: Mapped[Optional[str]] = mapped_column(String)
    homeroom: Mapped[Optional[str]] = mapped_column(String)

    # Fee Data (from IIQ Fee Tracker custom field on USER)
    fee_balance: Mapped[Optional[str]] = mapped_column(String)
    fee_past_due: Mapped[Optional[str]] = mapped_column(String)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    # Metadata
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    meta_data: Mapped[dict] = mapped_column(JSON, default={})


# --- PILLAR 2: GOOGLE ADMIN (TELEMETRY) ---
class GoogleDevice(Base):
    __tablename__ = "google_devices"

    serial_number: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    google_id: Mapped[str] = mapped_column(String, unique=True)
    
    # Identity & Config
    org_unit_path: Mapped[Optional[str]] = mapped_column(String)
    annotated_asset_id: Mapped[Optional[str]] = mapped_column(String)
    annotated_user: Mapped[Optional[str]] = mapped_column(String)
    annotated_location: Mapped[Optional[str]] = mapped_column(String)
    
    # Device Info
    model: Mapped[Optional[str]] = mapped_column(String)          # e.g. "Dell Chromebook 3100"

    # Vital Telemetry
    status: Mapped[Optional[str]] = mapped_column(String)         # ACTIVE, DISABLED, etc.
    aue_date: Mapped[Optional[str]] = mapped_column(String)       # Auto Update Expiration
    os_compliance: Mapped[Optional[str]] = mapped_column(String)  # compliant, non-compliant
    boot_mode: Mapped[Optional[str]] = mapped_column(String)      # Verified, Dev
    
    # Hardware Health (Summaries)
    cpu_temp_avg: Mapped[Optional[int]] = mapped_column(Integer)
    ram_total_gb: Mapped[Optional[float]] = mapped_column(String) # String to handle large numbers if needed, or Float
    ram_free_gb: Mapped[Optional[float]] = mapped_column(String)
    disk_total_gb: Mapped[Optional[float]] = mapped_column(String)
    disk_free_gb: Mapped[Optional[float]] = mapped_column(String)
    battery_health_percent: Mapped[Optional[int]] = mapped_column(Integer)

    # Network IP Addresses (from lastKnownNetwork)
    lan_ip: Mapped[Optional[str]] = mapped_column(String)
    wan_ip: Mapped[Optional[str]] = mapped_column(String)

    # Telemetry Core
    os_version: Mapped[Optional[str]] = mapped_column(String)
    last_sync: Mapped[datetime] = mapped_column(DateTime)
    ethernet_mac_address: Mapped[Optional[str]] = mapped_column(String)
    mac_address: Mapped[Optional[str]] = mapped_column(String)
    
    # Activity & Reports
    recent_users: Mapped[dict] = mapped_column(JSON, default=[]) 
    raw_reports: Mapped[dict] = mapped_column(JSON, default={}) # Store full CPU/RAM/Disk JSON here for deep drill-down
    
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# --- GOOGLE USERS (Synced from Directory API) ---
class GoogleUser(Base):
    """
    Synced from Google Admin Directory API.
    Captures ALL users from Google Workspace.
    Linked to iiq_users and iiq_assets via email address.
    """
    __tablename__ = "google_users"

    # Identifiers
    google_id: Mapped[str] = mapped_column(String, primary_key=True, index=True)  # Google's internal ID
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    sis_id: Mapped[Optional[str]] = mapped_column(String, index=True)  # From externalIds

    # Personal Info
    full_name: Mapped[Optional[str]] = mapped_column(String)
    first_name: Mapped[Optional[str]] = mapped_column(String)
    last_name: Mapped[Optional[str]] = mapped_column(String)

    # Organization
    org_unit_path: Mapped[Optional[str]] = mapped_column(String)
    role: Mapped[Optional[str]] = mapped_column(String, index=True)  # Parsed: Student, Faculty, Staff
    school: Mapped[Optional[str]] = mapped_column(String, index=True)  # Parsed from org unit

    # Status
    is_suspended: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)

    # Activity
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Metadata
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# --- PILLAR 3: MERAKI / NETWORK (LOCATION) ---
class NetworkCache(Base):
    """
    Legacy table for on-demand client lookups from Device 360.
    Populated in real-time when looking up a device by MAC.
    """
    __tablename__ = "network_cache"

    mac_address: Mapped[str] = mapped_column(String, primary_key=True, index=True)

    # Meraki identifiers for direct linking
    client_id: Mapped[Optional[str]] = mapped_column(String)
    network_id: Mapped[Optional[str]] = mapped_column(String)

    # Location Data
    ip_address: Mapped[Optional[str]] = mapped_column(String)
    last_ap_name: Mapped[Optional[str]] = mapped_column(String)
    last_ap_mac: Mapped[Optional[str]] = mapped_column(String)
    ssid: Mapped[Optional[str]] = mapped_column(String)
    vlan: Mapped[Optional[int]] = mapped_column(Integer)

    last_seen: Mapped[datetime] = mapped_column(DateTime)


# --- MERAKI NETWORKS (Reference Data) ---
class MerakiNetwork(Base):
    """
    Meraki network reference data (wireless and switch networks).
    Synced nightly from /organizations/{org}/networks endpoint.
    """
    __tablename__ = "meraki_networks"

    network_id: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String)
    url: Mapped[Optional[str]] = mapped_column(String)  # Dashboard URL for direct linking
    product_types: Mapped[list] = mapped_column(JSON, default=[])
    tags: Mapped[list] = mapped_column(JSON, default=[])
    time_zone: Mapped[Optional[str]] = mapped_column(String)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# --- MERAKI DEVICES (APs + Switches) ---
class MerakiDevice(Base):
    """
    All Meraki infrastructure devices (APs and switches).
    Synced nightly from /organizations/{org}/devices endpoint.
    Links to MerakiNetwork via network_id.
    """
    __tablename__ = "meraki_devices"

    serial: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    name: Mapped[Optional[str]] = mapped_column(String)
    model: Mapped[str] = mapped_column(String, index=True)
    mac: Mapped[str] = mapped_column(String, index=True)
    network_id: Mapped[str] = mapped_column(String, index=True)
    product_type: Mapped[str] = mapped_column(String, index=True)  # wireless/switch
    firmware: Mapped[Optional[str]] = mapped_column(String)
    address: Mapped[Optional[str]] = mapped_column(String)
    lat: Mapped[Optional[float]] = mapped_column(String)
    lng: Mapped[Optional[float]] = mapped_column(String)
    lan_ip: Mapped[Optional[str]] = mapped_column(String)
    status: Mapped[Optional[str]] = mapped_column(String, index=True)  # online/dormant/offline
    tags: Mapped[list] = mapped_column(JSON, default=[])
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# --- MERAKI SSIDS ---
class MerakiSSID(Base):
    """
    SSID configuration per wireless network.
    Synced nightly from /networks/{id}/wireless/ssids endpoint.
    Used for anomaly detection (matching clients to expected SSIDs).
    """
    __tablename__ = "meraki_ssids"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    network_id: Mapped[str] = mapped_column(String, index=True)
    ssid_number: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    auth_mode: Mapped[Optional[str]] = mapped_column(String)
    encryption_mode: Mapped[Optional[str]] = mapped_column(String)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# --- MERAKI CLIENTS ---
class MerakiClient(Base):
    """
    Client devices seen on wireless networks (24h rolling window).
    Synced nightly from /networks/{id}/clients endpoint.
    Links to IIQ/Google via MAC address for Device 360.
    """
    __tablename__ = "meraki_clients"

    mac: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(String)
    manufacturer: Mapped[Optional[str]] = mapped_column(String, index=True)
    os: Mapped[Optional[str]] = mapped_column(String)
    first_seen: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime, index=True)
    status: Mapped[Optional[str]] = mapped_column(String)
    last_ssid: Mapped[Optional[str]] = mapped_column(String, index=True)
    last_vlan: Mapped[Optional[int]] = mapped_column(Integer)
    last_ap_serial: Mapped[Optional[str]] = mapped_column(String, index=True)
    last_ap_name: Mapped[Optional[str]] = mapped_column(String)
    last_network_id: Mapped[Optional[str]] = mapped_column(String)
    usage_sent: Mapped[Optional[int]] = mapped_column(BigInteger)  # bytes
    usage_recv: Mapped[Optional[int]] = mapped_column(BigInteger)  # bytes
    psk_group: Mapped[Optional[str]] = mapped_column(String)
    rssi: Mapped[Optional[int]] = mapped_column(Integer)  # Signal strength in dBm
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CachedStats(Base):
    """
    Stores cached statistics that are expensive to compute or require API calls.
    Updated during nightly sync to avoid live API calls on dashboard load.
    """
    __tablename__ = "cached_stats"

    stat_key: Mapped[str] = mapped_column(String, primary_key=True)
    stat_value: Mapped[str] = mapped_column(String)  # JSON string for complex values
    last_updated: Mapped[datetime] = mapped_column(DateTime)


# --- SYNC LOGS (Utilities Module) ---
class SyncLog(Base):
    """
    Tracks all sync operations for history and monitoring.
    Updated by both cron jobs and manual sync triggers.

    Status values:
    - 'running': Sync in progress
    - 'success': Completed with no failures
    - 'partial': Completed with some failures
    - 'error': Failed completely
    - 'cancelled': Manually cancelled by user
    """
    __tablename__ = "sync_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(50), index=True)  # 'iiq', 'google', 'meraki'
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default='running')  # running/success/partial/error/cancelled
    records_processed: Mapped[int] = mapped_column(Integer, default=0)
    records_failed: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    error_details: Mapped[dict] = mapped_column(JSON, default=[])  # Array of {identifier, error, api_response, timestamp}
    triggered_by: Mapped[str] = mapped_column(String(20), default='manual')  # 'cron', 'manual', 'scheduled'
    pid: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # Process ID for cancellation


# --- LOCAL AUTHENTICATION ---
class LocalUser(Base):
    """
    Local user accounts for ATLAS authentication.
    Separate from Google OAuth - always available.
    """
    __tablename__ = "local_users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID as string
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="readonly")  # 'admin' or 'readonly'
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)  # UUID of creator


class AppSettings(Base):
    """
    Application settings stored in database.
    Secrets are encrypted using SECRET_KEY from .env.
    """
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # Encrypted for secrets
    is_secret: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)  # UUID of updater


# --- SYNC SCHEDULING ---
class SyncSchedule(Base):
    """
    Schedule configuration for each sync source.
    Replaces system cron with in-app scheduling.
    """
    __tablename__ = "sync_schedules"

    source: Mapped[str] = mapped_column(String(20), primary_key=True)  # 'iiq', 'google', 'meraki'
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    hours: Mapped[list] = mapped_column(JSON, default=[])  # Array of hours to run, e.g., [2, 8, 14, 20]
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # Email of updater


class SyncNotification(Base):
    """
    Notifications for sync failures.
    Created automatically when sync completes with status 'error' or 'partial'.
    """
    __tablename__ = "sync_notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sync_log_id: Mapped[int] = mapped_column(Integer, index=True)  # References sync_logs.id
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# --- IIQ DATA SOURCES EXPLORER ---
class IIQSyncConfig(Base):
    """
    Configuration for IIQ data source sync discovery.
    Tracks available IIQ API endpoints and their sync status.
    """
    __tablename__ = "iiq_sync_config"

    source_key: Mapped[str] = mapped_column(String(50), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    api_endpoint: Mapped[str] = mapped_column(String(200), nullable=False)
    api_method: Mapped[str] = mapped_column(String(10), default="GET")
    record_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_synced: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_checked: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    sync_table: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    avg_duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class IIQTicket(Base):
    """
    IIQ ticket data synced from the tickets API.
    Tracks help desk tickets, their status, and associated assets/users.
    """
    __tablename__ = "iiq_tickets"

    ticket_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    ticket_number: Mapped[Optional[int]] = mapped_column(Integer, index=True, nullable=True)
    subject: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(100), index=True, nullable=True)
    priority: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_date: Mapped[Optional[datetime]] = mapped_column(DateTime, index=True, nullable=True)
    modified_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    closed_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    owner_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    owner_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    owner_email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    assignee_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    assignee_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    team_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    team_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    asset_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    asset_tag: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    location_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    location_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    meta_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)


class IIQLocation(Base):
    """
    IIQ location/building data.
    Reference table for locations used across assets, users, and tickets.
    """
    __tablename__ = "iiq_locations"

    location_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    abbreviation: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    zip: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    location_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    parent_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    meta_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)


class IIQTeam(Base):
    """
    IIQ team/support group data.
    Reference table for teams that handle tickets.
    """
    __tablename__ = "iiq_teams"

    team_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    member_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    meta_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)


class IIQManufacturer(Base):
    """
    IIQ manufacturer/vendor data.
    Reference table for device manufacturers.
    """
    __tablename__ = "iiq_manufacturers"

    manufacturer_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    meta_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)


# --- SYSTEM UPDATE LOGS ---
class UpdateLog(Base):
    """
    Tracks system update operations triggered from the UI.
    Stores version info, status, and output from update.sh runs.
    """
    __tablename__ = "update_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    from_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    to_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    from_commit: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    to_commit: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default='running')  # running/success/failed
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    triggered_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # User email
    output: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Update script output


# --- OUI VENDOR DATABASE (Utilities) ---
class OuiVendor(Base):
    """
    IEEE OUI (Organizationally Unique Identifier) database.
    Maps first 6 hex digits of MAC address to manufacturer.
    Updated daily from IEEE public database.
    """
    __tablename__ = "oui_vendors"

    oui: Mapped[str] = mapped_column(String(6), primary_key=True)  # Normalized: "AABBCC"
    vendor_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
