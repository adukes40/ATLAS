from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
import json
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models import (
    IIQAsset, IIQUser, GoogleDevice, NetworkCache, CachedStats,
    MerakiNetwork, MerakiDevice, MerakiSSID, MerakiClient
)
from app.auth import get_current_user
from app.config import get_iiq_config, get_google_config, get_meraki_config


def get_user_identifier(request: Request) -> str:
    """Get rate limit key from user email or IP."""
    user = get_current_user(request)
    if user and user.get("email"):
        return user.get("email")
    return get_remote_address(request)


limiter = Limiter(key_func=get_user_identifier)

router = APIRouter(prefix="/api/dashboards", tags=["dashboards"])

# Location abbreviation mapping for cleaner charts
LOCATION_ABBREVIATIONS = {
    "Caesar Rodney High School": "CRHS",
    "Fred Fifer III Middle School": "Fifer MS",
    "F. Niel Postlethwait Middle School": "Postlethwait MS",
    "Allen Frear Elementary School": "Frear ES",
    "Nellie Hughes Stokes Elementary School": "Stokes ES",
    "W. Reily Brown Elementary School": "Brown ES",
    "John S. Charlton School": "Charlton",
    "Magnolia Middle School": "Magnolia MS",
    "David E. Robinson Elementary School": "Robinson ES",
    "W.B. Simpson Elementary School": "Simpson ES",
    "Major George S. Welch Elementary School": "Welch ES",
    "Dover Air Force Base Middle School": "DAFB MS",
    "Star Hill Elementary School": "Star Hill ES",
    "Unassigned": "Unassigned",
    "Unknown": "Unknown",
}

def abbreviate_location(name: str) -> str:
    """Return abbreviated location name for charts."""
    return LOCATION_ABBREVIATIONS.get(name, name[:15] + "..." if len(name) > 15 else name)


@router.get("/overview")
@limiter.limit("30/minute")
def get_overview_stats(request: Request, db: Session = Depends(get_db)):
    """
    Returns aggregate statistics across all data sources for the dashboard overview.
    """
    # IIQ Stats (primary key is serial_number)
    iiq_total = db.query(func.count(IIQAsset.serial_number)).scalar() or 0
    iiq_active = db.query(func.count(IIQAsset.serial_number)).filter(
        IIQAsset.status.ilike('%active%')
    ).scalar() or 0
    iiq_assigned = db.query(func.count(IIQAsset.serial_number)).filter(
        IIQAsset.assigned_user_email.isnot(None),
        IIQAsset.assigned_user_email != ''
    ).scalar() or 0

    # Google Stats (primary key is serial_number)
    google_total = db.query(func.count(GoogleDevice.serial_number)).scalar() or 0
    google_active = db.query(func.count(GoogleDevice.serial_number)).filter(
        GoogleDevice.status.ilike('%active%')
    ).scalar() or 0

    # AUE already expired (devices past end of life)
    google_aue_expired = db.query(func.count(GoogleDevice.serial_number)).filter(
        GoogleDevice.aue_date.ilike('2018%') |
        GoogleDevice.aue_date.ilike('2019%') |
        GoogleDevice.aue_date.ilike('2020%') |
        GoogleDevice.aue_date.ilike('2021%') |
        GoogleDevice.aue_date.ilike('2022%') |
        GoogleDevice.aue_date.ilike('2023%') |
        GoogleDevice.aue_date.ilike('2024%')
    ).scalar() or 0

    # Network Stats (primary key is mac_address)
    network_total = db.query(func.count(NetworkCache.mac_address)).scalar() or 0

    # Check configurations
    iiq_config = get_iiq_config()
    iiq_configured = bool(iiq_config.get("url") and iiq_config.get("token"))

    google_config = get_google_config()
    google_configured = bool(google_config.get("admin_email") and (google_config.get("credentials_json") or google_config.get("credentials_path")))

    meraki_config = get_meraki_config()
    meraki_configured = bool(meraki_config.get("api_key"))

    return {
        "iiq": {
            "configured": iiq_configured,
            "total_assets": iiq_total,
            "active": iiq_active,
            "assigned": iiq_assigned,
            "unassigned": iiq_total - iiq_assigned
        },
        "google": {
            "configured": google_configured,
            "total_devices": google_total,
            "active": google_active,
            "aue_expired": google_aue_expired
        },
        "network": {
            "configured": meraki_configured,
            "cached_clients": network_total
        }
    }


@router.get("/google")
@limiter.limit("30/minute")
def get_google_stats(request: Request, db: Session = Depends(get_db)):
    """
    Returns detailed Google Admin statistics for the Google dashboard.
    """
    total = db.query(func.count(GoogleDevice.serial_number)).scalar() or 0

    # Status breakdown
    active = db.query(func.count(GoogleDevice.serial_number)).filter(
        GoogleDevice.status.ilike('%active%')
    ).scalar() or 0

    disabled = db.query(func.count(GoogleDevice.serial_number)).filter(
        GoogleDevice.status.ilike('%disabled%')
    ).scalar() or 0

    provisioned = db.query(func.count(GoogleDevice.serial_number)).filter(
        GoogleDevice.status.ilike('%provisioned%')
    ).scalar() or 0

    # AUE breakdown by year with model details
    from sqlalchemy import text

    # Get year-by-year counts with model breakdown
    aue_by_year_query = db.execute(text("""
        SELECT
            LEFT(aue_date, 4) as year,
            model,
            COUNT(*) as count
        FROM google_devices
        WHERE aue_date IS NOT NULL
        GROUP BY LEFT(aue_date, 4), model
        ORDER BY LEFT(aue_date, 4), COUNT(*) DESC
    """)).fetchall()

    # Organize by year
    years_data = {}
    for row in aue_by_year_query:
        year = row[0]
        model = row[1] or "Unknown Model"
        count = row[2]

        if year not in years_data:
            years_data[year] = {"total": 0, "models": []}
        years_data[year]["total"] += count
        years_data[year]["models"].append({"model": model, "count": count})

    # Convert to list sorted by year
    aue_by_year = [
        {"year": year, "total": data["total"], "models": data["models"][:5]}  # Top 5 models per year
        for year, data in sorted(years_data.items())
    ]

    # Count devices with no AUE date
    unknown_aue = db.query(func.count(GoogleDevice.serial_number)).filter(
        GoogleDevice.aue_date.is_(None) | (GoogleDevice.aue_date == '')
    ).scalar() or 0

    return {
        "total": total,
        "status": {
            "active": active,
            "disabled": disabled,
            "provisioned": provisioned,
            "other": total - active - disabled - provisioned
        },
        "aue_by_year": aue_by_year,
        "aue_unknown": unknown_aue
    }


@router.get("/iiq")
@limiter.limit("30/minute")
def get_iiq_stats(request: Request, db: Session = Depends(get_db)):
    """
    Returns detailed IIQ statistics for the IIQ dashboard.
    Includes status breakdown, location/model/role distribution, and user fee data.
    """
    from sqlalchemy import text, cast, Numeric

    total = db.query(func.count(IIQAsset.serial_number)).scalar() or 0

    # Assignment breakdown
    assigned = db.query(func.count(IIQAsset.serial_number)).filter(
        IIQAsset.assigned_user_email.isnot(None),
        IIQAsset.assigned_user_email != ''
    ).scalar() or 0

    # Students without Chromebooks
    # Get total student count from iiq_users table (synced nightly)
    total_students = db.query(func.count(IIQUser.user_id)).filter(
        IIQUser.role_name == "Student",
        IIQUser.is_deleted == False
    ).scalar() or 0

    # Count students who have a Chromebook assigned
    students_with_chromebook = db.execute(text("""
        SELECT COUNT(DISTINCT assigned_user_email)
        FROM iiq_assets
        WHERE assigned_user_role = 'Student'
          AND model_category = 'Chromebooks'
          AND assigned_user_email IS NOT NULL
    """)).scalar() or 0

    # Students without Chromebook = Total students - Students with Chromebook
    students_without_chromebook = max(0, total_students - students_with_chromebook)

    # Status breakdown (IIQ uses "In Service", "In Storage", etc.)
    in_service = db.query(func.count(IIQAsset.serial_number)).filter(
        IIQAsset.status == 'In Service'
    ).scalar() or 0

    in_storage = db.query(func.count(IIQAsset.serial_number)).filter(
        IIQAsset.status.ilike('%storage%')
    ).scalar() or 0

    # Tickets
    with_tickets = db.query(func.count(IIQAsset.serial_number)).filter(
        IIQAsset.ticket_count > 0
    ).scalar() or 0

    total_tickets = db.query(func.sum(IIQAsset.ticket_count)).scalar() or 0

    # Location breakdown (ALL locations, not just top 10)
    location_counts = db.query(
        IIQAsset.location,
        func.count(IIQAsset.serial_number).label('count')
    ).filter(
        IIQAsset.location.isnot(None)
    ).group_by(
        IIQAsset.location
    ).order_by(
        func.count(IIQAsset.serial_number).desc()
    ).all()

    locations = [{"name": abbreviate_location(loc or "Unknown"), "fullName": loc or "Unknown", "count": count} for loc, count in location_counts]

    # Model breakdown (top 10)
    model_counts = db.query(
        IIQAsset.model,
        func.count(IIQAsset.serial_number).label('count')
    ).filter(
        IIQAsset.model.isnot(None)
    ).group_by(
        IIQAsset.model
    ).order_by(
        func.count(IIQAsset.serial_number).desc()
    ).limit(10).all()

    models = [{"model": model or "Unknown", "count": count} for model, count in model_counts]

    # Role breakdown
    role_counts = db.query(
        IIQAsset.assigned_user_role,
        func.count(IIQAsset.serial_number).label('count')
    ).filter(
        IIQAsset.assigned_user_role.isnot(None)
    ).group_by(
        IIQAsset.assigned_user_role
    ).order_by(
        func.count(IIQAsset.serial_number).desc()
    ).all()

    roles = [{"role": role or "Unassigned", "count": count} for role, count in role_counts]

    # Fee data by user (aggregated)
    fee_query = db.execute(text("""
        SELECT
            assigned_user_email,
            assigned_user_name,
            assigned_user_role,
            SUM(CAST(COALESCE(fee_balance, '0') AS DECIMAL)) as total_balance
        FROM iiq_assets
        WHERE fee_balance IS NOT NULL
            AND CAST(fee_balance AS DECIMAL) > 0
            AND assigned_user_email IS NOT NULL
        GROUP BY assigned_user_email, assigned_user_name, assigned_user_role
        ORDER BY total_balance DESC
        LIMIT 20
    """)).fetchall()

    users_with_fees = [{
        "email": row[0],
        "name": row[1],
        "role": row[2],
        "balance": float(row[3])
    } for row in fee_query]

    # Total fee stats
    total_fee_balance = db.execute(text("""
        SELECT COALESCE(SUM(CAST(COALESCE(fee_balance, '0') AS DECIMAL)), 0) FROM iiq_assets
    """)).scalar() or 0

    users_with_balance = db.execute(text("""
        SELECT COUNT(DISTINCT assigned_user_email)
        FROM iiq_assets
        WHERE fee_balance IS NOT NULL
            AND CAST(fee_balance AS DECIMAL) > 0
            AND assigned_user_email IS NOT NULL
    """)).scalar() or 0

    return {
        "total": total,
        "status": {
            "in_service": in_service,
            "in_storage": in_storage,
            "other": total - in_service - in_storage
        },
        "assignment": {
            "assigned": assigned,
            "unassigned": total - assigned
        },
        "students": {
            "total": total_students,
            "with_chromebook": students_with_chromebook,
            "without_chromebook": students_without_chromebook
        },
        "tickets": {
            "devices_with_tickets": with_tickets,
            "total_open_tickets": int(total_tickets)
        },
        "by_location": locations,
        "by_model": models,
        "by_role": roles,
        "fees": {
            "total_outstanding": float(total_fee_balance),
            "users_with_balance": users_with_balance,
            "top_users": users_with_fees
        }
    }


@router.get("/iiq/tickets")
@limiter.limit("30/minute")
def get_iiq_ticket_stats(request: Request, db: Session = Depends(get_db)):
    """
    Returns cached ticket statistics from nightly sync.
    Stats are updated during the 3 AM IIQ sync to avoid live API calls.
    """
    try:
        cached = db.query(CachedStats).filter(
            CachedStats.stat_key == "iiq_ticket_stats"
        ).first()

        if cached:
            stats = json.loads(cached.stat_value)
            stats["last_updated"] = cached.last_updated.isoformat()
            return stats
        else:
            return {
                "total_all_time": 0,
                "open_tickets": 0,
                "school_year_tickets": 0,
                "school_year": "2025-2026",
                "message": "No cached stats available. Run IIQ sync to populate."
            }
    except Exception as e:
        return {
            "error": str(e),
            "total_all_time": 0,
            "open_tickets": 0,
            "school_year_tickets": 0
        }


@router.get("/meraki")
@limiter.limit("30/minute")
def get_meraki_stats(request: Request, db: Session = Depends(get_db)):
    """
    Returns comprehensive Meraki infrastructure and client statistics.
    Data is synced nightly from Meraki Dashboard API.
    """
    from sqlalchemy import text

    # ============ INFRASTRUCTURE STATS ============

    # Total devices by product type
    total_aps = db.query(func.count(MerakiDevice.serial)).filter(
        MerakiDevice.product_type == "wireless"
    ).scalar() or 0

    total_switches = db.query(func.count(MerakiDevice.serial)).filter(
        MerakiDevice.product_type == "switch"
    ).scalar() or 0

    # Status breakdown
    devices_online = db.query(func.count(MerakiDevice.serial)).filter(
        MerakiDevice.status == "online"
    ).scalar() or 0

    devices_dormant = db.query(func.count(MerakiDevice.serial)).filter(
        MerakiDevice.status == "dormant"
    ).scalar() or 0

    devices_offline = db.query(func.count(MerakiDevice.serial)).filter(
        MerakiDevice.status == "offline"
    ).scalar() or 0

    # Network count
    total_networks = db.query(func.count(MerakiNetwork.network_id)).scalar() or 0

    # ============ CLIENT STATS ============

    total_clients = db.query(func.count(MerakiClient.mac)).scalar() or 0

    # Clients by SSID
    ssid_counts = db.query(
        MerakiClient.last_ssid,
        func.count(MerakiClient.mac).label('count')
    ).filter(
        MerakiClient.last_ssid.isnot(None)
    ).group_by(
        MerakiClient.last_ssid
    ).order_by(
        func.count(MerakiClient.mac).desc()
    ).all()

    clients_by_ssid = [{"name": ssid or "Unknown", "count": count} for ssid, count in ssid_counts]

    # ============ INFRASTRUCTURE BY SITE ============

    # Get devices per network with network name
    site_query = db.query(
        MerakiNetwork.name,
        MerakiDevice.product_type,
        func.count(MerakiDevice.serial).label('count')
    ).join(
        MerakiDevice, MerakiDevice.network_id == MerakiNetwork.network_id
    ).group_by(
        MerakiNetwork.name,
        MerakiDevice.product_type
    ).order_by(
        MerakiNetwork.name
    ).all()

    # Organize by site
    sites_data = {}
    for name, product_type, count in site_query:
        # Extract site name (remove -wireless, -switch suffixes)
        site_name = name.replace("-wireless", "").replace("-switch", "").replace("-Wireless", "").replace("-Switch", "")
        if site_name not in sites_data:
            sites_data[site_name] = {"aps": 0, "switches": 0}
        if product_type == "wireless":
            sites_data[site_name]["aps"] += count
        elif product_type == "switch":
            sites_data[site_name]["switches"] += count

    # Convert to list and sort by total device count
    infrastructure_by_site = [
        {"name": name, "aps": data["aps"], "switches": data["switches"], "total": data["aps"] + data["switches"]}
        for name, data in sites_data.items()
    ]
    infrastructure_by_site.sort(key=lambda x: x["total"], reverse=True)

    # ============ FIRMWARE VERSIONS ============

    # AP firmware versions
    ap_firmware = db.query(
        MerakiDevice.firmware,
        func.count(MerakiDevice.serial).label('count')
    ).filter(
        MerakiDevice.product_type == "wireless",
        MerakiDevice.firmware.isnot(None)
    ).group_by(
        MerakiDevice.firmware
    ).order_by(
        func.count(MerakiDevice.serial).desc()
    ).limit(5).all()

    ap_firmware_list = [{"version": fw or "Unknown", "count": count} for fw, count in ap_firmware]

    # Switch firmware versions
    switch_firmware = db.query(
        MerakiDevice.firmware,
        func.count(MerakiDevice.serial).label('count')
    ).filter(
        MerakiDevice.product_type == "switch",
        MerakiDevice.firmware.isnot(None)
    ).group_by(
        MerakiDevice.firmware
    ).order_by(
        func.count(MerakiDevice.serial).desc()
    ).limit(5).all()

    switch_firmware_list = [{"version": fw or "Unknown", "count": count} for fw, count in switch_firmware]

    # ============ MODEL BREAKDOWN ============

    # AP models
    ap_models = db.query(
        MerakiDevice.model,
        func.count(MerakiDevice.serial).label('count')
    ).filter(
        MerakiDevice.product_type == "wireless"
    ).group_by(
        MerakiDevice.model
    ).order_by(
        func.count(MerakiDevice.serial).desc()
    ).all()

    ap_models_list = [{"model": model, "count": count} for model, count in ap_models]

    # Switch models
    switch_models = db.query(
        MerakiDevice.model,
        func.count(MerakiDevice.serial).label('count')
    ).filter(
        MerakiDevice.product_type == "switch"
    ).group_by(
        MerakiDevice.model
    ).order_by(
        func.count(MerakiDevice.serial).desc()
    ).all()

    switch_models_list = [{"model": model, "count": count} for model, count in switch_models]

    # ============ CLIENTS BY GROUP POLICY (PSK Group) ============

    group_policy_counts = db.query(
        MerakiClient.psk_group,
        func.count(MerakiClient.mac).label('count')
    ).filter(
        MerakiClient.psk_group.isnot(None)
    ).group_by(
        MerakiClient.psk_group
    ).order_by(
        func.count(MerakiClient.mac).desc()
    ).all()

    clients_by_group = [{"name": group or "Unknown", "count": count} for group, count in group_policy_counts]

    # ============ TOP APs BY CLIENT COUNT ============
    # Filter to only show wireless access points, not switches

    # Get all AP serials first
    ap_serials = db.query(MerakiDevice.serial).filter(
        MerakiDevice.product_type == "wireless"
    ).subquery()

    top_aps_query = db.query(
        MerakiClient.last_ap_name,
        MerakiClient.last_ap_serial,
        func.count(MerakiClient.mac).label('count')
    ).filter(
        MerakiClient.last_ap_name.isnot(None),
        MerakiClient.last_ap_serial.in_(ap_serials)
    ).group_by(
        MerakiClient.last_ap_name,
        MerakiClient.last_ap_serial
    ).order_by(
        func.count(MerakiClient.mac).desc()
    ).limit(10).all()

    top_aps_list = [
        {"name": name, "serial": serial, "count": count}
        for name, serial, count in top_aps_query
    ]

    # ============ LAST SYNC INFO ============

    last_device_update = db.query(func.max(MerakiDevice.last_updated)).scalar()
    last_client_update = db.query(func.max(MerakiClient.last_updated)).scalar()

    return {
        "infrastructure": {
            "total_aps": total_aps,
            "total_switches": total_switches,
            "total_devices": total_aps + total_switches,
            "networks": total_networks,
            "status": {
                "online": devices_online,
                "dormant": devices_dormant,
                "offline": devices_offline
            }
        },
        "clients": {
            "total": total_clients,
            "by_ssid": clients_by_ssid
        },
        "by_site": infrastructure_by_site,
        "firmware": {
            "aps": ap_firmware_list,
            "switches": switch_firmware_list
        },
        "models": {
            "aps": ap_models_list,
            "switches": switch_models_list
        },
        "clients_by_group": clients_by_group,
        "top_aps": top_aps_list,
        "last_sync": {
            "devices": last_device_update.isoformat() if last_device_update else None,
            "clients": last_client_update.isoformat() if last_client_update else None
        }
    }
