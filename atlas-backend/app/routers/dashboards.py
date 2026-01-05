from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
import json
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models import IIQAsset, IIQUser, GoogleDevice, NetworkCache, CachedStats
from app.auth import get_current_user


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

    return {
        "iiq": {
            "total_assets": iiq_total,
            "active": iiq_active,
            "assigned": iiq_assigned,
            "unassigned": iiq_total - iiq_assigned
        },
        "google": {
            "total_devices": google_total,
            "active": google_active,
            "aue_expired": google_aue_expired
        },
        "network": {
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
    Returns Meraki network statistics.
    Note: Network data is populated on-demand from Device 360 lookups,
    not through bulk sync. Shows cached client data from recent searches.
    """
    total = db.query(func.count(NetworkCache.mac_address)).scalar() or 0

    # Unique AP count
    unique_aps = db.query(func.count(func.distinct(NetworkCache.last_ap_name))).filter(
        NetworkCache.last_ap_name.isnot(None)
    ).scalar() or 0

    # Unique SSID count
    unique_ssids = db.query(func.count(func.distinct(NetworkCache.ssid))).filter(
        NetworkCache.ssid.isnot(None)
    ).scalar() or 0

    # AP breakdown (top 10)
    ap_counts = db.query(
        NetworkCache.last_ap_name,
        func.count(NetworkCache.mac_address).label('count')
    ).filter(
        NetworkCache.last_ap_name.isnot(None)
    ).group_by(
        NetworkCache.last_ap_name
    ).order_by(
        func.count(NetworkCache.mac_address).desc()
    ).limit(10).all()

    aps = [{"name": ap or "Unknown", "count": count} for ap, count in ap_counts]

    # SSID breakdown
    ssid_counts = db.query(
        NetworkCache.ssid,
        func.count(NetworkCache.mac_address).label('count')
    ).filter(
        NetworkCache.ssid.isnot(None)
    ).group_by(
        NetworkCache.ssid
    ).order_by(
        func.count(NetworkCache.mac_address).desc()
    ).all()

    ssids = [{"name": ssid or "Unknown", "count": count} for ssid, count in ssid_counts]

    # Recent clients (last 10 seen)
    recent_clients = db.query(NetworkCache).order_by(
        NetworkCache.last_seen.desc()
    ).limit(10).all()

    recent = [{
        "mac_address": client.mac_address,
        "ip_address": client.ip_address,
        "ap_name": client.last_ap_name,
        "ssid": client.ssid,
        "last_seen": client.last_seen.isoformat() if client.last_seen else None
    } for client in recent_clients]

    return {
        "total_cached": total,
        "unique_aps": unique_aps,
        "unique_ssids": unique_ssids,
        "top_aps": aps,
        "ssids": ssids,
        "recent_clients": recent
    }
