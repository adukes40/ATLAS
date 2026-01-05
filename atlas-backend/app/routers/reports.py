"""
Reports Router - Pre-canned and custom report generation with export capabilities.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, desc, asc, cast, Float, literal_column
from datetime import datetime
from typing import Optional, List
import csv
import io
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models import IIQAsset, IIQUser, GoogleDevice, GoogleUser, NetworkCache
from app.auth import get_current_user


def get_user_identifier(request: Request) -> str:
    """Get rate limit key from user email or IP."""
    user = get_current_user(request)
    if user and user.get("email"):
        return user.get("email")
    return get_remote_address(request)


limiter = Limiter(key_func=get_user_identifier)

router = APIRouter(prefix="/api/reports", tags=["reports"])


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def apply_sorting(query, model, sort_by: str, order: str):
    """Apply sorting to a query based on column name and direction."""
    if not sort_by:
        return query

    column = getattr(model, sort_by, None)
    if column is None:
        return query

    if order.lower() == "desc":
        return query.order_by(desc(column))
    return query.order_by(asc(column))


def paginate(query, page: int, limit: int):
    """Apply pagination to a query."""
    offset = page * limit
    return query.offset(offset).limit(limit)


def parse_multi_filter(value: Optional[str]) -> Optional[List[str]]:
    """Parse comma-separated filter values into a list."""
    if not value:
        return None
    values = [v.strip() for v in value.split(',') if v.strip()]
    return values if values else None


def stream_csv(data: List[dict], columns: List[str], filename: str):
    """Generate a CSV streaming response."""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction='ignore')
    writer.writeheader()

    for row in data:
        # Convert datetime objects to strings
        clean_row = {}
        for k, v in row.items():
            if isinstance(v, datetime):
                clean_row[k] = v.strftime("%Y-%m-%d %H:%M:%S")
            elif v is None:
                clean_row[k] = ""
            else:
                clean_row[k] = v
        writer.writerow(clean_row)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# =============================================================================
# FILTER OPTIONS METADATA
# =============================================================================

@router.get("/filters/options")
@limiter.limit("30/minute")
def get_filter_options(request: Request, db: Session = Depends(get_db)):
    """
    Returns available filter options for dropdowns.
    Cached values for locations, grades, statuses, models.
    """
    # Get unique locations from IIQ assets
    locations = db.query(IIQAsset.location).filter(
        IIQAsset.location.isnot(None),
        IIQAsset.location != ""
    ).distinct().all()
    locations = sorted([loc[0] for loc in locations if loc[0]])

    # Get unique grades from IIQ users
    grades = db.query(IIQUser.grade).filter(
        IIQUser.grade.isnot(None),
        IIQUser.grade != ""
    ).distinct().all()
    grades = sorted([g[0] for g in grades if g[0]], key=lambda x: (not x.isdigit(), int(x) if x.isdigit() else x))

    # Get unique statuses from IIQ assets
    iiq_statuses = db.query(IIQAsset.status).filter(
        IIQAsset.status.isnot(None)
    ).distinct().all()
    iiq_statuses = sorted([s[0] for s in iiq_statuses if s[0]])

    # Get unique statuses from Google devices
    google_statuses = db.query(GoogleDevice.status).filter(
        GoogleDevice.status.isnot(None)
    ).distinct().all()
    google_statuses = sorted([s[0] for s in google_statuses if s[0]])

    # Get unique models from IIQ assets
    models = db.query(IIQAsset.model).filter(
        IIQAsset.model.isnot(None),
        IIQAsset.model != ""
    ).distinct().all()
    models = sorted([m[0] for m in models if m[0]])

    # Get unique AUE years from Google devices
    aue_years = db.query(func.substr(GoogleDevice.aue_date, 1, 4)).filter(
        GoogleDevice.aue_date.isnot(None)
    ).distinct().all()
    aue_years = sorted([y[0] for y in aue_years if y[0]])

    # Get unique user locations
    user_locations = db.query(IIQUser.location_name).filter(
        IIQUser.location_name.isnot(None),
        IIQUser.location_name != ""
    ).distinct().all()
    user_locations = sorted([loc[0] for loc in user_locations if loc[0]])

    return {
        "locations": locations,
        "user_locations": user_locations,
        "grades": grades,
        "statuses": iiq_statuses,  # Keep for backward compatibility
        "iiq_statuses": iiq_statuses,
        "google_statuses": google_statuses,
        "models": models,
        "aue_years": aue_years
    }


# =============================================================================
# REPORT SUMMARIES (for cards on index page)
# =============================================================================

@router.get("/summaries")
@limiter.limit("30/minute")
def get_report_summaries(request: Request, db: Session = Depends(get_db)):
    """
    Returns summary statistics for each pre-canned report.
    Used to populate the report cards on the index page.
    """
    # Device Inventory - total devices
    device_count = db.query(func.count(IIQAsset.serial_number)).scalar() or 0

    # AUE/EOL - devices expired or expiring within 6 months
    today = datetime.now().strftime("%Y-%m-%d")
    six_months = datetime(datetime.now().year, datetime.now().month + 6 if datetime.now().month <= 6 else (datetime.now().month + 6 - 12), 1).strftime("%Y-%m-%d")

    expired_count = db.query(func.count(GoogleDevice.serial_number)).filter(
        GoogleDevice.aue_date.isnot(None),
        GoogleDevice.aue_date <= today
    ).scalar() or 0

    expiring_soon_count = db.query(func.count(GoogleDevice.serial_number)).filter(
        GoogleDevice.aue_date.isnot(None),
        GoogleDevice.aue_date > today,
        GoogleDevice.aue_date <= six_months
    ).scalar() or 0

    # Fee Balances - total outstanding
    fee_result = db.query(func.sum(cast(IIQUser.fee_balance, Float))).filter(
        IIQUser.fee_balance.isnot(None),
        cast(IIQUser.fee_balance, Float) > 0
    ).scalar() or 0

    users_with_fees = db.query(func.count(IIQUser.user_id)).filter(
        IIQUser.fee_balance.isnot(None),
        cast(IIQUser.fee_balance, Float) > 0
    ).scalar() or 0

    # Students without Chromebook
    # Students who are active but have no device assignment
    students_without = db.query(func.count(IIQUser.user_id)).filter(
        IIQUser.role_name == "Student",
        IIQUser.is_active == True,
        ~IIQUser.user_id.in_(
            db.query(IIQAsset.owner_iiq_id).filter(IIQAsset.owner_iiq_id.isnot(None))
        )
    ).scalar() or 0

    # Students with multiple devices
    multiple_devices = db.query(
        IIQAsset.owner_iiq_id,
        func.count(IIQAsset.serial_number).label("device_count")
    ).filter(
        IIQAsset.owner_iiq_id.isnot(None)
    ).group_by(IIQAsset.owner_iiq_id).having(
        func.count(IIQAsset.serial_number) > 1
    ).count()

    return {
        "device_inventory": {
            "count": device_count,
            "label": f"{device_count:,} devices"
        },
        "aue_eol": {
            "expired": expired_count,
            "expiring_soon": expiring_soon_count,
            "label": f"{expired_count:,} expired, {expiring_soon_count:,} expiring"
        },
        "fee_balances": {
            "total": round(fee_result, 2),
            "users": users_with_fees,
            "label": f"${fee_result:,.2f} ({users_with_fees:,} users)"
        },
        "no_chromebook": {
            "count": students_without,
            "label": f"{students_without:,} students"
        },
        "multiple_devices": {
            "count": multiple_devices,
            "label": f"{multiple_devices:,} users"
        }
    }


# =============================================================================
# REPORT 1: DEVICE INVENTORY
# =============================================================================

@router.get("/device-inventory")
@limiter.limit("20/minute")
def get_device_inventory(
    request: Request,
    iiq_status: Optional[str] = None,
    iiq_status_exclude: Optional[str] = None,
    google_status: Optional[str] = None,
    google_status_exclude: Optional[str] = None,
    location: Optional[str] = None,
    location_exclude: Optional[str] = None,
    model: Optional[str] = None,
    model_exclude: Optional[str] = None,
    grade: Optional[str] = None,
    grade_exclude: Optional[str] = None,
    search: Optional[str] = None,
    sort: str = "asset_tag",
    order: str = "asc",
    page: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Device Inventory Report - All devices with assigned user info.
    Joins IIQ Assets with Google Devices for AUE date and Google status.
    """
    # Base query with outerjoin to get AUE and status from Google
    query = db.query(
        IIQAsset.asset_tag,
        IIQAsset.serial_number,
        IIQAsset.model,
        IIQAsset.status.label('iiq_status'),
        GoogleDevice.status.label('google_status'),
        IIQAsset.location,
        IIQAsset.assigned_user_name,
        IIQAsset.assigned_user_email,
        IIQAsset.assigned_user_grade,
        GoogleDevice.aue_date
    ).outerjoin(
        GoogleDevice, IIQAsset.serial_number == GoogleDevice.serial_number
    )

    # Apply filters (support comma-separated multi-values and exclude mode)
    iiq_status_list = parse_multi_filter(iiq_status)
    if iiq_status_list:
        if iiq_status_exclude == 'true':
            query = query.filter(~IIQAsset.status.in_(iiq_status_list))
        else:
            query = query.filter(IIQAsset.status.in_(iiq_status_list))

    google_status_list = parse_multi_filter(google_status)
    if google_status_list:
        if google_status_exclude == 'true':
            query = query.filter(~GoogleDevice.status.in_(google_status_list))
        else:
            query = query.filter(GoogleDevice.status.in_(google_status_list))

    location_list = parse_multi_filter(location)
    if location_list:
        if location_exclude == 'true':
            query = query.filter(~IIQAsset.location.in_(location_list))
        else:
            query = query.filter(IIQAsset.location.in_(location_list))

    model_list = parse_multi_filter(model)
    if model_list:
        if model_exclude == 'true':
            query = query.filter(~IIQAsset.model.in_(model_list))
        else:
            query = query.filter(IIQAsset.model.in_(model_list))

    grade_list = parse_multi_filter(grade)
    if grade_list:
        if grade_exclude == 'true':
            query = query.filter(~IIQAsset.assigned_user_grade.in_(grade_list))
        else:
            query = query.filter(IIQAsset.assigned_user_grade.in_(grade_list))

    if search:
        search_term = f"%{search}%"
        query = query.filter(or_(
            IIQAsset.serial_number.ilike(search_term),
            IIQAsset.asset_tag.ilike(search_term),
            IIQAsset.assigned_user_name.ilike(search_term),
            IIQAsset.assigned_user_email.ilike(search_term)
        ))

    # Get total count before pagination
    total = query.count()

    # Apply sorting - keys match frontend column keys
    sort_map = {
        "asset_tag": IIQAsset.asset_tag,
        "serial_number": IIQAsset.serial_number,
        "model": IIQAsset.model,
        "iiq_status": IIQAsset.status,
        "google_status": GoogleDevice.status,
        "location": IIQAsset.location,
        "assigned_user": IIQAsset.assigned_user_name,
        "grade": IIQAsset.assigned_user_grade,
        "aue_date": GoogleDevice.aue_date
    }
    sort_col = sort_map.get(sort, IIQAsset.asset_tag)
    if order.lower() == "desc":
        query = query.order_by(desc(sort_col))
    else:
        query = query.order_by(asc(sort_col))

    # Paginate
    results = query.offset(page * limit).limit(limit).all()

    # Format response
    data = [{
        "asset_tag": r.asset_tag,
        "serial_number": r.serial_number,
        "model": r.model,
        "iiq_status": r.iiq_status,
        "google_status": r.google_status,
        "location": r.location,
        "assigned_user": r.assigned_user_name or r.assigned_user_email or "Unassigned",
        "grade": r.assigned_user_grade,
        "aue_date": r.aue_date
    } for r in results]

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
        "data": data
    }


@router.get("/device-inventory/export/csv")
@limiter.limit("10/minute")
def export_device_inventory_csv(
    request: Request,
    iiq_status: Optional[str] = None,
    iiq_status_exclude: Optional[str] = None,
    google_status: Optional[str] = None,
    google_status_exclude: Optional[str] = None,
    location: Optional[str] = None,
    location_exclude: Optional[str] = None,
    model: Optional[str] = None,
    model_exclude: Optional[str] = None,
    grade: Optional[str] = None,
    grade_exclude: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Export Device Inventory report to CSV (no pagination - full dataset)."""
    query = db.query(
        IIQAsset.asset_tag,
        IIQAsset.serial_number,
        IIQAsset.model,
        IIQAsset.status.label('iiq_status'),
        GoogleDevice.status.label('google_status'),
        IIQAsset.location,
        IIQAsset.assigned_user_name,
        IIQAsset.assigned_user_email,
        IIQAsset.assigned_user_grade,
        GoogleDevice.aue_date
    ).outerjoin(
        GoogleDevice, IIQAsset.serial_number == GoogleDevice.serial_number
    )

    # Apply filters (support comma-separated multi-values and exclude mode)
    iiq_status_list = parse_multi_filter(iiq_status)
    if iiq_status_list:
        if iiq_status_exclude == 'true':
            query = query.filter(~IIQAsset.status.in_(iiq_status_list))
        else:
            query = query.filter(IIQAsset.status.in_(iiq_status_list))

    google_status_list = parse_multi_filter(google_status)
    if google_status_list:
        if google_status_exclude == 'true':
            query = query.filter(~GoogleDevice.status.in_(google_status_list))
        else:
            query = query.filter(GoogleDevice.status.in_(google_status_list))

    location_list = parse_multi_filter(location)
    if location_list:
        if location_exclude == 'true':
            query = query.filter(~IIQAsset.location.in_(location_list))
        else:
            query = query.filter(IIQAsset.location.in_(location_list))

    model_list = parse_multi_filter(model)
    if model_list:
        if model_exclude == 'true':
            query = query.filter(~IIQAsset.model.in_(model_list))
        else:
            query = query.filter(IIQAsset.model.in_(model_list))

    grade_list = parse_multi_filter(grade)
    if grade_list:
        if grade_exclude == 'true':
            query = query.filter(~IIQAsset.assigned_user_grade.in_(grade_list))
        else:
            query = query.filter(IIQAsset.assigned_user_grade.in_(grade_list))

    if search:
        search_term = f"%{search}%"
        query = query.filter(or_(
            IIQAsset.serial_number.ilike(search_term),
            IIQAsset.asset_tag.ilike(search_term),
            IIQAsset.assigned_user_name.ilike(search_term)
        ))

    results = query.order_by(IIQAsset.asset_tag).all()

    data = [{
        "Asset Tag": r.asset_tag,
        "Serial Number": r.serial_number,
        "Model": r.model,
        "IIQ Status": r.iiq_status,
        "Google Status": r.google_status,
        "Location": r.location,
        "Assigned User": r.assigned_user_name or r.assigned_user_email or "Unassigned",
        "Grade": r.assigned_user_grade,
        "AUE Date": r.aue_date
    } for r in results]

    columns = ["Asset Tag", "Serial Number", "Model", "IIQ Status", "Google Status", "Location", "Assigned User", "Grade", "AUE Date"]
    return stream_csv(data, columns, f"device_inventory_{datetime.now().strftime('%Y%m%d')}.csv")


# =============================================================================
# REPORT 2: AUE/END-OF-LIFE
# =============================================================================

@router.get("/aue-eol")
@limiter.limit("20/minute")
def get_aue_eol_report(
    request: Request,
    aue_year: Optional[str] = None,
    aue_year_exclude: Optional[str] = None,
    iiq_status: Optional[str] = None,
    iiq_status_exclude: Optional[str] = None,
    google_status: Optional[str] = None,
    google_status_exclude: Optional[str] = None,
    model: Optional[str] = None,
    model_exclude: Optional[str] = None,
    expired_only: bool = False,
    sort: str = "aue_date",
    order: str = "asc",
    page: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    AUE/End-of-Life Report - Chromebooks by auto-update expiration date.
    """
    today = datetime.now().strftime("%Y-%m-%d")

    query = db.query(
        GoogleDevice.serial_number,
        GoogleDevice.model,
        GoogleDevice.aue_date,
        IIQAsset.status.label('iiq_status'),
        GoogleDevice.status.label('google_status'),
        GoogleDevice.os_version,
        GoogleDevice.org_unit_path,
        IIQAsset.assigned_user_name,
        IIQAsset.assigned_user_email
    ).outerjoin(
        IIQAsset, GoogleDevice.serial_number == IIQAsset.serial_number
    ).filter(
        GoogleDevice.aue_date.isnot(None)
    )

    # Apply filters (support comma-separated multi-values and exclude mode)
    aue_year_list = parse_multi_filter(aue_year)
    if aue_year_list:
        if aue_year_exclude == 'true':
            query = query.filter(~func.substr(GoogleDevice.aue_date, 1, 4).in_(aue_year_list))
        else:
            query = query.filter(func.substr(GoogleDevice.aue_date, 1, 4).in_(aue_year_list))

    iiq_status_list = parse_multi_filter(iiq_status)
    if iiq_status_list:
        if iiq_status_exclude == 'true':
            query = query.filter(~IIQAsset.status.in_(iiq_status_list))
        else:
            query = query.filter(IIQAsset.status.in_(iiq_status_list))

    google_status_list = parse_multi_filter(google_status)
    if google_status_list:
        if google_status_exclude == 'true':
            query = query.filter(~GoogleDevice.status.in_(google_status_list))
        else:
            query = query.filter(GoogleDevice.status.in_(google_status_list))

    model_list = parse_multi_filter(model)
    if model_list:
        if model_exclude == 'true':
            query = query.filter(~GoogleDevice.model.in_(model_list))
        else:
            query = query.filter(GoogleDevice.model.in_(model_list))

    if expired_only:
        query = query.filter(GoogleDevice.aue_date <= today)

    total = query.count()

    # Apply sorting - keys match frontend column keys
    sort_map = {
        "serial_number": GoogleDevice.serial_number,
        "model": GoogleDevice.model,
        "aue_date": GoogleDevice.aue_date,
        "iiq_status": IIQAsset.status,
        "google_status": GoogleDevice.status,
        "os_version": GoogleDevice.os_version,
        "assigned_user": IIQAsset.assigned_user_name,
        "org_unit_path": GoogleDevice.org_unit_path
    }
    sort_col = sort_map.get(sort, GoogleDevice.aue_date)
    if order.lower() == "desc":
        query = query.order_by(desc(sort_col))
    else:
        query = query.order_by(asc(sort_col))

    results = query.offset(page * limit).limit(limit).all()

    data = []
    for r in results:
        # Determine expiration status
        exp_status = "active"
        if r.aue_date:
            if r.aue_date <= today:
                exp_status = "expired"
            elif r.aue_date <= (datetime.now().replace(month=datetime.now().month + 6 if datetime.now().month <= 6 else 1)).strftime("%Y-%m-%d"):
                exp_status = "expiring_soon"

        data.append({
            "serial_number": r.serial_number,
            "model": r.model,
            "aue_date": r.aue_date,
            "iiq_status": r.iiq_status,
            "google_status": r.google_status,
            "os_version": r.os_version,
            "assigned_user": r.assigned_user_name or r.assigned_user_email or "Unassigned",
            "org_unit_path": r.org_unit_path,
            "expiration_status": exp_status
        })

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
        "data": data
    }


@router.get("/aue-eol/export/csv")
@limiter.limit("10/minute")
def export_aue_eol_csv(
    request: Request,
    aue_year: Optional[str] = None,
    aue_year_exclude: Optional[str] = None,
    iiq_status: Optional[str] = None,
    iiq_status_exclude: Optional[str] = None,
    google_status: Optional[str] = None,
    google_status_exclude: Optional[str] = None,
    model: Optional[str] = None,
    model_exclude: Optional[str] = None,
    expired_only: bool = False,
    db: Session = Depends(get_db)
):
    """Export AUE/EOL report to CSV."""
    today = datetime.now().strftime("%Y-%m-%d")

    query = db.query(
        GoogleDevice.serial_number,
        GoogleDevice.model,
        GoogleDevice.aue_date,
        IIQAsset.status.label('iiq_status'),
        GoogleDevice.status.label('google_status'),
        GoogleDevice.os_version,
        GoogleDevice.org_unit_path,
        IIQAsset.assigned_user_name,
        IIQAsset.assigned_user_email
    ).outerjoin(
        IIQAsset, GoogleDevice.serial_number == IIQAsset.serial_number
    ).filter(
        GoogleDevice.aue_date.isnot(None)
    )

    # Apply filters (support comma-separated multi-values and exclude mode)
    aue_year_list = parse_multi_filter(aue_year)
    if aue_year_list:
        if aue_year_exclude == 'true':
            query = query.filter(~func.substr(GoogleDevice.aue_date, 1, 4).in_(aue_year_list))
        else:
            query = query.filter(func.substr(GoogleDevice.aue_date, 1, 4).in_(aue_year_list))

    iiq_status_list = parse_multi_filter(iiq_status)
    if iiq_status_list:
        if iiq_status_exclude == 'true':
            query = query.filter(~IIQAsset.status.in_(iiq_status_list))
        else:
            query = query.filter(IIQAsset.status.in_(iiq_status_list))

    google_status_list = parse_multi_filter(google_status)
    if google_status_list:
        if google_status_exclude == 'true':
            query = query.filter(~GoogleDevice.status.in_(google_status_list))
        else:
            query = query.filter(GoogleDevice.status.in_(google_status_list))

    model_list = parse_multi_filter(model)
    if model_list:
        if model_exclude == 'true':
            query = query.filter(~GoogleDevice.model.in_(model_list))
        else:
            query = query.filter(GoogleDevice.model.in_(model_list))
    if expired_only:
        query = query.filter(GoogleDevice.aue_date <= today)

    results = query.order_by(GoogleDevice.aue_date).all()

    data = [{
        "Serial Number": r.serial_number,
        "Model": r.model,
        "AUE Date": r.aue_date,
        "IIQ Status": r.iiq_status,
        "Google Status": r.google_status,
        "OS Version": r.os_version,
        "Assigned User": r.assigned_user_name or r.assigned_user_email or "Unassigned",
        "OU": r.org_unit_path
    } for r in results]

    columns = ["Serial Number", "Model", "AUE Date", "IIQ Status", "Google Status", "OS Version", "Assigned User", "OU"]
    return stream_csv(data, columns, f"aue_eol_report_{datetime.now().strftime('%Y%m%d')}.csv")


# =============================================================================
# REPORT 3: FEE BALANCES
# =============================================================================

@router.get("/fee-balances")
@limiter.limit("20/minute")
def get_fee_balances_report(
    request: Request,
    location: Optional[str] = None,
    location_exclude: Optional[str] = None,
    grade: Optional[str] = None,
    grade_exclude: Optional[str] = None,
    min_balance: Optional[float] = None,
    search: Optional[str] = None,
    sort: str = "fee_balance",
    order: str = "desc",
    page: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Fee Balances Report - Users with outstanding fees.
    """
    query = db.query(
        IIQUser.full_name,
        IIQUser.school_id_number,
        IIQUser.email,
        IIQUser.grade,
        IIQUser.location_name,
        IIQUser.fee_balance,
        IIQUser.fee_past_due
    ).filter(
        IIQUser.fee_balance.isnot(None),
        cast(IIQUser.fee_balance, Float) > 0
    )

    # Apply filters (support comma-separated multi-values and exclude mode)
    location_list = parse_multi_filter(location)
    if location_list:
        if location_exclude == 'true':
            query = query.filter(~IIQUser.location_name.in_(location_list))
        else:
            query = query.filter(IIQUser.location_name.in_(location_list))

    grade_list = parse_multi_filter(grade)
    if grade_list:
        if grade_exclude == 'true':
            query = query.filter(~IIQUser.grade.in_(grade_list))
        else:
            query = query.filter(IIQUser.grade.in_(grade_list))

    if min_balance:
        query = query.filter(cast(IIQUser.fee_balance, Float) >= min_balance)
    if search:
        search_term = f"%{search}%"
        query = query.filter(or_(
            IIQUser.full_name.ilike(search_term),
            IIQUser.email.ilike(search_term),
            IIQUser.school_id_number.ilike(search_term)
        ))

    total = query.count()

    # Apply sorting - keys match frontend column keys
    sort_map = {
        "full_name": IIQUser.full_name,
        "school_id": IIQUser.school_id_number,
        "email": IIQUser.email,
        "grade": IIQUser.grade,
        "location": IIQUser.location_name,
        "fee_balance": cast(IIQUser.fee_balance, Float),
        "fee_past_due": cast(IIQUser.fee_past_due, Float)
    }
    sort_col = sort_map.get(sort, cast(IIQUser.fee_balance, Float))
    if order.lower() == "desc":
        query = query.order_by(desc(sort_col))
    else:
        query = query.order_by(asc(sort_col))

    results = query.offset(page * limit).limit(limit).all()

    data = [{
        "full_name": r.full_name,
        "school_id": r.school_id_number,
        "email": r.email,
        "grade": r.grade,
        "location": r.location_name,
        "fee_balance": float(r.fee_balance) if r.fee_balance else 0,
        "fee_past_due": float(r.fee_past_due) if r.fee_past_due else 0
    } for r in results]

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
        "data": data
    }


@router.get("/fee-balances/export/csv")
@limiter.limit("10/minute")
def export_fee_balances_csv(
    request: Request,
    location: Optional[str] = None,
    location_exclude: Optional[str] = None,
    grade: Optional[str] = None,
    grade_exclude: Optional[str] = None,
    min_balance: Optional[float] = None,
    db: Session = Depends(get_db)
):
    """Export Fee Balances report to CSV."""
    query = db.query(
        IIQUser.full_name,
        IIQUser.school_id_number,
        IIQUser.email,
        IIQUser.grade,
        IIQUser.location_name,
        IIQUser.fee_balance,
        IIQUser.fee_past_due
    ).filter(
        IIQUser.fee_balance.isnot(None),
        cast(IIQUser.fee_balance, Float) > 0
    )

    # Apply filters (support comma-separated multi-values and exclude mode)
    location_list = parse_multi_filter(location)
    if location_list:
        if location_exclude == 'true':
            query = query.filter(~IIQUser.location_name.in_(location_list))
        else:
            query = query.filter(IIQUser.location_name.in_(location_list))

    grade_list = parse_multi_filter(grade)
    if grade_list:
        if grade_exclude == 'true':
            query = query.filter(~IIQUser.grade.in_(grade_list))
        else:
            query = query.filter(IIQUser.grade.in_(grade_list))

    if min_balance:
        query = query.filter(cast(IIQUser.fee_balance, Float) >= min_balance)

    results = query.order_by(desc(cast(IIQUser.fee_balance, Float))).all()

    data = [{
        "Full Name": r.full_name,
        "School ID": r.school_id_number,
        "Email": r.email,
        "Grade": r.grade,
        "Location": r.location_name,
        "Fee Balance": float(r.fee_balance) if r.fee_balance else 0,
        "Past Due": float(r.fee_past_due) if r.fee_past_due else 0
    } for r in results]

    columns = ["Full Name", "School ID", "Email", "Grade", "Location", "Fee Balance", "Past Due"]
    return stream_csv(data, columns, f"fee_balances_{datetime.now().strftime('%Y%m%d')}.csv")


# =============================================================================
# REPORT 4: STUDENTS WITHOUT CHROMEBOOK
# =============================================================================

@router.get("/no-chromebook")
@limiter.limit("20/minute")
def get_no_chromebook_report(
    request: Request,
    location: Optional[str] = None,
    location_exclude: Optional[str] = None,
    grade: Optional[str] = None,
    grade_exclude: Optional[str] = None,
    search: Optional[str] = None,
    sort: str = "full_name",
    order: str = "asc",
    page: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Students Without Chromebook - Active students without a device assignment.
    """
    # Subquery for users who have devices
    users_with_devices = db.query(IIQAsset.owner_iiq_id).filter(
        IIQAsset.owner_iiq_id.isnot(None)
    ).subquery()

    query = db.query(
        IIQUser.full_name,
        IIQUser.school_id_number,
        IIQUser.email,
        IIQUser.grade,
        IIQUser.location_name,
        IIQUser.homeroom
    ).filter(
        IIQUser.role_name == "Student",
        IIQUser.is_active == True,
        ~IIQUser.user_id.in_(db.query(users_with_devices.c.owner_iiq_id))
    )

    # Apply filters (support comma-separated multi-values and exclude mode)
    location_list = parse_multi_filter(location)
    if location_list:
        if location_exclude == 'true':
            query = query.filter(~IIQUser.location_name.in_(location_list))
        else:
            query = query.filter(IIQUser.location_name.in_(location_list))

    grade_list = parse_multi_filter(grade)
    if grade_list:
        if grade_exclude == 'true':
            query = query.filter(~IIQUser.grade.in_(grade_list))
        else:
            query = query.filter(IIQUser.grade.in_(grade_list))

    if search:
        search_term = f"%{search}%"
        query = query.filter(or_(
            IIQUser.full_name.ilike(search_term),
            IIQUser.email.ilike(search_term),
            IIQUser.school_id_number.ilike(search_term)
        ))

    total = query.count()

    # Apply sorting - keys match frontend column keys
    sort_map = {
        "full_name": IIQUser.full_name,
        "school_id": IIQUser.school_id_number,
        "email": IIQUser.email,
        "grade": IIQUser.grade,
        "location": IIQUser.location_name,
        "homeroom": IIQUser.homeroom
    }
    sort_col = sort_map.get(sort, IIQUser.full_name)
    if order.lower() == "desc":
        query = query.order_by(desc(sort_col))
    else:
        query = query.order_by(asc(sort_col))

    results = query.offset(page * limit).limit(limit).all()

    data = [{
        "full_name": r.full_name,
        "school_id": r.school_id_number,
        "email": r.email,
        "grade": r.grade,
        "location": r.location_name,
        "homeroom": r.homeroom
    } for r in results]

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
        "data": data
    }


@router.get("/no-chromebook/export/csv")
@limiter.limit("10/minute")
def export_no_chromebook_csv(
    request: Request,
    location: Optional[str] = None,
    location_exclude: Optional[str] = None,
    grade: Optional[str] = None,
    grade_exclude: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Export Students Without Chromebook report to CSV."""
    users_with_devices = db.query(IIQAsset.owner_iiq_id).filter(
        IIQAsset.owner_iiq_id.isnot(None)
    ).subquery()

    query = db.query(
        IIQUser.full_name,
        IIQUser.school_id_number,
        IIQUser.email,
        IIQUser.grade,
        IIQUser.location_name,
        IIQUser.homeroom
    ).filter(
        IIQUser.role_name == "Student",
        IIQUser.is_active == True,
        ~IIQUser.user_id.in_(db.query(users_with_devices.c.owner_iiq_id))
    )

    # Apply filters (support comma-separated multi-values and exclude mode)
    location_list = parse_multi_filter(location)
    if location_list:
        if location_exclude == 'true':
            query = query.filter(~IIQUser.location_name.in_(location_list))
        else:
            query = query.filter(IIQUser.location_name.in_(location_list))

    grade_list = parse_multi_filter(grade)
    if grade_list:
        if grade_exclude == 'true':
            query = query.filter(~IIQUser.grade.in_(grade_list))
        else:
            query = query.filter(IIQUser.grade.in_(grade_list))

    results = query.order_by(IIQUser.full_name).all()

    data = [{
        "Full Name": r.full_name,
        "School ID": r.school_id_number,
        "Email": r.email,
        "Grade": r.grade,
        "Location": r.location_name,
        "Homeroom": r.homeroom
    } for r in results]

    columns = ["Full Name", "School ID", "Email", "Grade", "Location", "Homeroom"]
    return stream_csv(data, columns, f"students_no_chromebook_{datetime.now().strftime('%Y%m%d')}.csv")


# =============================================================================
# REPORT 5: MULTIPLE DEVICES
# =============================================================================

@router.get("/multiple-devices")
@limiter.limit("20/minute")
def get_multiple_devices_report(
    request: Request,
    location: Optional[str] = None,
    location_exclude: Optional[str] = None,
    min_count: int = 2,
    search: Optional[str] = None,
    sort: str = "device_count",
    order: str = "desc",
    page: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Multiple Devices Report - Users with more than one device assigned.
    """
    # Subquery to count devices per user (PostgreSQL uses string_agg instead of group_concat)
    device_counts = db.query(
        IIQAsset.owner_iiq_id,
        func.count(IIQAsset.serial_number).label("device_count"),
        func.string_agg(IIQAsset.serial_number, literal_column("','")).label("devices")
    ).filter(
        IIQAsset.owner_iiq_id.isnot(None)
    ).group_by(IIQAsset.owner_iiq_id).having(
        func.count(IIQAsset.serial_number) >= min_count
    ).subquery()

    query = db.query(
        IIQUser.full_name,
        IIQUser.email,
        IIQUser.grade,
        IIQUser.location_name,
        device_counts.c.device_count,
        device_counts.c.devices
    ).join(
        device_counts, IIQUser.user_id == device_counts.c.owner_iiq_id
    )

    # Apply filters (support comma-separated multi-values and exclude mode)
    location_list = parse_multi_filter(location)
    if location_list:
        if location_exclude == 'true':
            query = query.filter(~IIQUser.location_name.in_(location_list))
        else:
            query = query.filter(IIQUser.location_name.in_(location_list))

    if search:
        search_term = f"%{search}%"
        query = query.filter(or_(
            IIQUser.full_name.ilike(search_term),
            IIQUser.email.ilike(search_term)
        ))

    total = query.count()

    # Apply sorting - keys match frontend column keys
    sort_map = {
        "full_name": IIQUser.full_name,
        "email": IIQUser.email,
        "grade": IIQUser.grade,
        "location": IIQUser.location_name,
        "device_count": device_counts.c.device_count
    }
    sort_col = sort_map.get(sort, device_counts.c.device_count)
    if order.lower() == "desc":
        query = query.order_by(desc(sort_col))
    else:
        query = query.order_by(asc(sort_col))

    results = query.offset(page * limit).limit(limit).all()

    data = [{
        "full_name": r.full_name,
        "email": r.email,
        "grade": r.grade,
        "location": r.location_name,
        "device_count": r.device_count,
        "devices": r.devices.split(",") if r.devices else []
    } for r in results]

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
        "data": data
    }


@router.get("/multiple-devices/export/csv")
@limiter.limit("10/minute")
def export_multiple_devices_csv(
    request: Request,
    location: Optional[str] = None,
    location_exclude: Optional[str] = None,
    min_count: int = 2,
    db: Session = Depends(get_db)
):
    """Export Multiple Devices report to CSV."""
    device_counts = db.query(
        IIQAsset.owner_iiq_id,
        func.count(IIQAsset.serial_number).label("device_count"),
        func.string_agg(IIQAsset.serial_number, literal_column("','")).label("devices")
    ).filter(
        IIQAsset.owner_iiq_id.isnot(None)
    ).group_by(IIQAsset.owner_iiq_id).having(
        func.count(IIQAsset.serial_number) >= min_count
    ).subquery()

    query = db.query(
        IIQUser.full_name,
        IIQUser.email,
        IIQUser.grade,
        IIQUser.location_name,
        device_counts.c.device_count,
        device_counts.c.devices
    ).join(
        device_counts, IIQUser.user_id == device_counts.c.owner_iiq_id
    )

    # Apply filters (support comma-separated multi-values and exclude mode)
    location_list = parse_multi_filter(location)
    if location_list:
        if location_exclude == 'true':
            query = query.filter(~IIQUser.location_name.in_(location_list))
        else:
            query = query.filter(IIQUser.location_name.in_(location_list))

    results = query.order_by(desc(device_counts.c.device_count)).all()

    data = [{
        "Full Name": r.full_name,
        "Email": r.email,
        "Grade": r.grade,
        "Location": r.location_name,
        "Device Count": r.device_count,
        "Devices (Serials)": r.devices
    } for r in results]

    columns = ["Full Name", "Email", "Grade", "Location", "Device Count", "Devices (Serials)"]
    return stream_csv(data, columns, f"multiple_devices_{datetime.now().strftime('%Y%m%d')}.csv")


# =============================================================================
# CUSTOM REPORT BUILDER
# =============================================================================

# Column definitions for each data source
CUSTOM_REPORT_COLUMNS = {
    "iiq_assets": {
        "model": IIQAsset,
        "columns": {
            "serial_number": {"label": "Serial Number", "type": "string"},
            "asset_tag": {"label": "Asset Tag", "type": "string"},
            "model": {"label": "Model", "type": "string"},
            "model_category": {"label": "Category", "type": "string"},
            "status": {"label": "Status", "type": "string"},
            "location": {"label": "Location", "type": "string"},
            "assigned_user_name": {"label": "Assigned User", "type": "string"},
            "assigned_user_email": {"label": "User Email", "type": "string"},
            "assigned_user_grade": {"label": "Grade", "type": "string"},
            "assigned_user_homeroom": {"label": "Homeroom", "type": "string"},
            "mac_address": {"label": "MAC Address", "type": "string"},
            "ticket_count": {"label": "Tickets", "type": "number"},
            "last_updated": {"label": "Last Updated", "type": "datetime"}
        }
    },
    "iiq_users": {
        "model": IIQUser,
        "columns": {
            "full_name": {"label": "Full Name", "type": "string"},
            "email": {"label": "Email", "type": "string"},
            "school_id_number": {"label": "School ID", "type": "string"},
            "role_name": {"label": "Role", "type": "string"},
            "grade": {"label": "Grade", "type": "string"},
            "location_name": {"label": "Location", "type": "string"},
            "homeroom": {"label": "Homeroom", "type": "string"},
            "fee_balance": {"label": "Fee Balance", "type": "number"},
            "fee_past_due": {"label": "Past Due", "type": "number"},
            "is_active": {"label": "Active", "type": "boolean"},
            "last_updated": {"label": "Last Updated", "type": "datetime"}
        }
    },
    "google_devices": {
        "model": GoogleDevice,
        "columns": {
            "serial_number": {"label": "Serial Number", "type": "string"},
            "model": {"label": "Model", "type": "string"},
            "status": {"label": "Status", "type": "string"},
            "aue_date": {"label": "AUE Date", "type": "string"},
            "os_version": {"label": "OS Version", "type": "string"},
            "org_unit_path": {"label": "OU Path", "type": "string"},
            "annotated_asset_id": {"label": "Asset ID", "type": "string"},
            "annotated_user": {"label": "Annotated User", "type": "string"},
            "battery_health_percent": {"label": "Battery Health %", "type": "number"},
            "cpu_temp_avg": {"label": "CPU Temp", "type": "number"},
            "disk_free_gb": {"label": "Disk Free GB", "type": "number"},
            "lan_ip": {"label": "LAN IP", "type": "string"},
            "mac_address": {"label": "MAC Address", "type": "string"},
            "last_sync": {"label": "Last Sync", "type": "datetime"}
        }
    },
    "google_users": {
        "model": GoogleUser,
        "columns": {
            "email": {"label": "Email", "type": "string"},
            "full_name": {"label": "Full Name", "type": "string"},
            "sis_id": {"label": "SIS ID", "type": "string"},
            "role": {"label": "Role", "type": "string"},
            "school": {"label": "School", "type": "string"},
            "org_unit_path": {"label": "OU Path", "type": "string"},
            "is_suspended": {"label": "Suspended", "type": "boolean"},
            "is_admin": {"label": "Admin", "type": "boolean"},
            "last_login": {"label": "Last Login", "type": "datetime"},
            "last_updated": {"label": "Last Updated", "type": "datetime"}
        }
    },
    "network_cache": {
        "model": NetworkCache,
        "columns": {
            "mac_address": {"label": "MAC Address", "type": "string"},
            "ip_address": {"label": "IP Address", "type": "string"},
            "last_ap_name": {"label": "AP Name", "type": "string"},
            "last_ap_mac": {"label": "AP MAC", "type": "string"},
            "ssid": {"label": "SSID", "type": "string"},
            "vlan": {"label": "VLAN", "type": "number"},
            "last_seen": {"label": "Last Seen", "type": "datetime"}
        }
    }
}


@router.get("/custom/columns/{source}")
@limiter.limit("30/minute")
def get_custom_columns(request: Request, source: str):
    """Returns available columns for the custom report builder."""
    if source not in CUSTOM_REPORT_COLUMNS:
        raise HTTPException(status_code=400, detail=f"Unknown source: {source}")

    config = CUSTOM_REPORT_COLUMNS[source]
    return {
        "source": source,
        "columns": [
            {"key": key, **val}
            for key, val in config["columns"].items()
        ]
    }


@router.get("/custom/{source}")
@limiter.limit("20/minute")
def run_custom_report(
    request: Request,
    source: str,
    columns: str = Query(default="", description="Comma-separated column names"),
    search: Optional[str] = None,
    sort: Optional[str] = None,
    order: str = "asc",
    page: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Custom Report - Select columns and filters from any data source.
    """
    if source not in CUSTOM_REPORT_COLUMNS:
        raise HTTPException(status_code=400, detail=f"Unknown source: {source}")

    config = CUSTOM_REPORT_COLUMNS[source]
    model = config["model"]
    available_columns = config["columns"]

    # Parse requested columns
    requested_cols = [c.strip() for c in columns.split(",") if c.strip()] if columns else list(available_columns.keys())[:5]

    # Validate columns
    valid_cols = [c for c in requested_cols if c in available_columns]
    if not valid_cols:
        valid_cols = list(available_columns.keys())[:5]

    # Build query with selected columns
    query_cols = [getattr(model, col) for col in valid_cols if hasattr(model, col)]
    query = db.query(*query_cols)

    # Apply search filter (search across string columns)
    if search:
        search_term = f"%{search}%"
        search_filters = []
        for col in valid_cols:
            if available_columns[col]["type"] == "string" and hasattr(model, col):
                search_filters.append(getattr(model, col).ilike(search_term))
        if search_filters:
            query = query.filter(or_(*search_filters))

    total = query.count()

    # Apply sorting
    if sort and sort in valid_cols and hasattr(model, sort):
        sort_col = getattr(model, sort)
        if order.lower() == "desc":
            query = query.order_by(desc(sort_col))
        else:
            query = query.order_by(asc(sort_col))

    results = query.offset(page * limit).limit(limit).all()

    # Format response
    data = []
    for row in results:
        row_dict = {}
        for i, col in enumerate(valid_cols):
            if i < len(row):
                val = row[i]
                if isinstance(val, datetime):
                    val = val.isoformat()
                row_dict[col] = val
        data.append(row_dict)

    return {
        "source": source,
        "columns": valid_cols,
        "column_labels": {col: available_columns[col]["label"] for col in valid_cols},
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
        "data": data
    }


@router.get("/custom/{source}/export/csv")
@limiter.limit("10/minute")
def export_custom_report_csv(
    request: Request,
    source: str,
    columns: str = Query(default="", description="Comma-separated column names"),
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Export custom report to CSV."""
    if source not in CUSTOM_REPORT_COLUMNS:
        raise HTTPException(status_code=400, detail=f"Unknown source: {source}")

    config = CUSTOM_REPORT_COLUMNS[source]
    model = config["model"]
    available_columns = config["columns"]

    requested_cols = [c.strip() for c in columns.split(",") if c.strip()] if columns else list(available_columns.keys())
    valid_cols = [c for c in requested_cols if c in available_columns]
    if not valid_cols:
        valid_cols = list(available_columns.keys())

    query_cols = [getattr(model, col) for col in valid_cols if hasattr(model, col)]
    query = db.query(*query_cols)

    if search:
        search_term = f"%{search}%"
        search_filters = []
        for col in valid_cols:
            if available_columns[col]["type"] == "string" and hasattr(model, col):
                search_filters.append(getattr(model, col).ilike(search_term))
        if search_filters:
            query = query.filter(or_(*search_filters))

    results = query.all()

    # Create column labels for CSV headers
    csv_columns = [available_columns[col]["label"] for col in valid_cols]

    data = []
    for row in results:
        row_dict = {}
        for i, col in enumerate(valid_cols):
            if i < len(row):
                val = row[i]
                if isinstance(val, datetime):
                    val = val.strftime("%Y-%m-%d %H:%M:%S")
                row_dict[available_columns[col]["label"]] = val
        data.append(row_dict)

    return stream_csv(data, csv_columns, f"custom_{source}_{datetime.now().strftime('%Y%m%d')}.csv")
