"""
Reports Router - Pre-canned and custom report generation with export capabilities.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, desc, asc, cast, Float, String as SAString, literal_column
from datetime import datetime
from typing import Optional, List, Literal
import math
from slowapi import Limiter

from app.database import get_db
from pydantic import BaseModel, field_validator
from app.auth import require_auth
from app.models import IIQAsset, IIQUser, GoogleDevice, GoogleUser, NetworkCache, MerakiDevice, MerakiNetwork, MerakiSSID, SavedReport
from app.utils import (
    get_user_identifier,
    parse_multi_filter,
    apply_filter,
    apply_sorting,
    paginate,
    calculate_pages,
    stream_csv
)


limiter = Limiter(key_func=get_user_identifier)

router = APIRouter(prefix="/api/reports", tags=["reports"])


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


# =============================================================================
# MULTI-SOURCE CUSTOM REPORT QUERY ENGINE
# =============================================================================

# Multi-source column whitelist with compatibility info
MULTI_SOURCE_COLUMNS = {
    "iiq_assets": {
        "label": "IIQ Assets",
        "join_key": "serial_number",
        "compatible_with": ["google_devices", "iiq_users"],
        "columns": {
            "serial_number": {"label": "Serial Number", "type": "string"},
            "iiq_id": {"label": "IIQ ID", "type": "string"},
            "asset_tag": {"label": "Asset Tag", "type": "string"},
            "model": {"label": "Model", "type": "string"},
            "model_category": {"label": "Category", "type": "string"},
            "status": {"label": "Status", "type": "string"},
            "mac_address": {"label": "MAC Address", "type": "string"},
            "assigned_user_email": {"label": "User Email", "type": "string"},
            "assigned_user_id": {"label": "User SIS ID", "type": "string"},
            "owner_iiq_id": {"label": "Owner IIQ ID", "type": "string"},
            "assigned_user_name": {"label": "Assigned User", "type": "string"},
            "assigned_user_role": {"label": "User Role", "type": "string"},
            "assigned_user_grade": {"label": "Grade", "type": "string"},
            "assigned_user_homeroom": {"label": "Homeroom", "type": "string"},
            "owner_location": {"label": "Owner Location", "type": "string"},
            "location": {"label": "Location", "type": "string"},
            "ticket_count": {"label": "Tickets", "type": "number"},
            "fee_balance": {"label": "Fee Balance", "type": "string"},
            "fee_past_due": {"label": "Fee Past Due", "type": "string"},
            "last_updated": {"label": "Last Updated", "type": "datetime"},
        },
    },
    "iiq_users": {
        "label": "IIQ Users",
        "join_key": "user_id",
        "compatible_with": ["iiq_assets"],
        "columns": {
            "user_id": {"label": "User ID", "type": "string"},
            "school_id_number": {"label": "School ID", "type": "string"},
            "email": {"label": "Email", "type": "string"},
            "full_name": {"label": "Full Name", "type": "string"},
            "first_name": {"label": "First Name", "type": "string"},
            "last_name": {"label": "Last Name", "type": "string"},
            "role_name": {"label": "Role", "type": "string"},
            "grade": {"label": "Grade", "type": "string"},
            "location_name": {"label": "Location", "type": "string"},
            "location_id": {"label": "Location ID", "type": "string"},
            "homeroom": {"label": "Homeroom", "type": "string"},
            "fee_balance": {"label": "Fee Balance", "type": "string"},
            "fee_past_due": {"label": "Past Due", "type": "string"},
            "is_active": {"label": "Active", "type": "boolean"},
            "is_deleted": {"label": "Deleted", "type": "boolean"},
            "last_updated": {"label": "Last Updated", "type": "datetime"},
        },
    },
    "google_devices": {
        "label": "Google Devices",
        "join_key": "serial_number",
        "compatible_with": ["iiq_assets"],
        "columns": {
            "serial_number": {"label": "Serial Number", "type": "string"},
            "google_id": {"label": "Google ID", "type": "string"},
            "org_unit_path": {"label": "OU Path", "type": "string"},
            "annotated_asset_id": {"label": "Asset ID", "type": "string"},
            "annotated_user": {"label": "Annotated User", "type": "string"},
            "annotated_location": {"label": "Annotated Location", "type": "string"},
            "model": {"label": "Model", "type": "string"},
            "status": {"label": "Status", "type": "string"},
            "aue_date": {"label": "AUE Date", "type": "string"},
            "os_compliance": {"label": "OS Compliance", "type": "string"},
            "boot_mode": {"label": "Boot Mode", "type": "string"},
            "cpu_temp_avg": {"label": "CPU Temp", "type": "number"},
            "ram_total_gb": {"label": "RAM Total GB", "type": "string"},
            "ram_free_gb": {"label": "RAM Free GB", "type": "string"},
            "disk_total_gb": {"label": "Disk Total GB", "type": "string"},
            "disk_free_gb": {"label": "Disk Free GB", "type": "string"},
            "battery_health_percent": {"label": "Battery Health %", "type": "number"},
            "lan_ip": {"label": "LAN IP", "type": "string"},
            "wan_ip": {"label": "WAN IP", "type": "string"},
            "os_version": {"label": "OS Version", "type": "string"},
            "last_sync": {"label": "Last Sync", "type": "datetime"},
            "ethernet_mac_address": {"label": "Ethernet MAC", "type": "string"},
            "mac_address": {"label": "MAC Address", "type": "string"},
            "last_updated": {"label": "Last Updated", "type": "datetime"},
        },
    },
    "meraki_devices": {
        "label": "Meraki Devices",
        "join_key": "serial",
        "compatible_with": ["meraki_networks"],
        "columns": {
            "serial": {"label": "Serial", "type": "string"},
            "name": {"label": "Name", "type": "string"},
            "model": {"label": "Model", "type": "string"},
            "mac": {"label": "MAC Address", "type": "string"},
            "network_id": {"label": "Network ID", "type": "string"},
            "product_type": {"label": "Product Type", "type": "string"},
            "firmware": {"label": "Firmware", "type": "string"},
            "address": {"label": "Address", "type": "string"},
            "lat": {"label": "Latitude", "type": "string"},
            "lng": {"label": "Longitude", "type": "string"},
            "lan_ip": {"label": "LAN IP", "type": "string"},
            "status": {"label": "Status", "type": "string"},
            "last_updated": {"label": "Last Updated", "type": "datetime"},
        },
    },
    "meraki_networks": {
        "label": "Meraki Networks",
        "join_key": "network_id",
        "compatible_with": ["meraki_devices"],
        "columns": {
            "network_id": {"label": "Network ID", "type": "string"},
            "name": {"label": "Name", "type": "string"},
            "url": {"label": "Dashboard URL", "type": "string"},
            "time_zone": {"label": "Time Zone", "type": "string"},
            "last_updated": {"label": "Last Updated", "type": "datetime"},
        },
    },
}

# Source name to SQLAlchemy model mapping
SOURCE_MODELS = {
    "iiq_assets": IIQAsset,
    "iiq_users": IIQUser,
    "google_devices": GoogleDevice,
    "meraki_devices": MerakiDevice,
    "meraki_networks": MerakiNetwork,
}

# Join paths between compatible sources
JOIN_PATHS = {
    frozenset(["iiq_assets", "google_devices"]): {
        "left": "iiq_assets",
        "right": "google_devices",
        "left_key": "serial_number",
        "right_key": "serial_number",
    },
    frozenset(["iiq_assets", "iiq_users"]): {
        "left": "iiq_assets",
        "right": "iiq_users",
        "left_key": "owner_iiq_id",
        "right_key": "user_id",
    },
    frozenset(["meraki_devices", "meraki_networks"]): {
        "left": "meraki_devices",
        "right": "meraki_networks",
        "left_key": "network_id",
        "right_key": "network_id",
    },
}


# --- Pydantic request models for multi-source query ---

class MultiSourceColumn(BaseModel):
    source: str
    field: str


class MultiSourceFilter(BaseModel):
    source: str
    field: str
    values: List[str] = []
    exclude: bool = False


class MultiSourceSort(BaseModel):
    source: str
    field: str
    direction: Literal["asc", "desc"] = "asc"


class MultiSourceQueryRequest(BaseModel):
    columns: List[MultiSourceColumn]
    filters: List[MultiSourceFilter] = []
    sort: List[MultiSourceSort] = []
    page: int = 1
    limit: int = 25
    search: str = ""

    @field_validator("page")
    @classmethod
    def validate_page(cls, v: int) -> int:
        if v < 1:
            return 1
        return v

    @field_validator("limit")
    @classmethod
    def validate_limit(cls, v: int) -> int:
        if v < 1:
            return 1
        if v > 250:
            return 250
        return v


# --- Helper: build multi-source query ---

def _build_custom_query(db: Session, columns: List[MultiSourceColumn], filters: List[MultiSourceFilter], sort_rules: List[MultiSourceSort], search: str):
    """
    Build a SQLAlchemy query that selects columns across multiple sources,
    applies outer joins, filters, search, and sorting.

    Returns (query, select_labels, all_sources) where select_labels is a list
    of "{source}__{field}" label strings in column order.
    """
    # 1. Validate columns against whitelist
    select_labels = []
    select_cols = []
    all_sources = set()

    for col in columns:
        if col.source not in MULTI_SOURCE_COLUMNS:
            raise HTTPException(status_code=400, detail=f"Unknown source: {col.source}")
        source_cfg = MULTI_SOURCE_COLUMNS[col.source]
        if col.field not in source_cfg["columns"]:
            raise HTTPException(status_code=400, detail=f"Unknown field '{col.field}' in source '{col.source}'")
        all_sources.add(col.source)
        model = SOURCE_MODELS[col.source]
        label = f"{col.source}__{col.field}"
        select_labels.append(label)
        select_cols.append(getattr(model, col.field).label(label))

    if not select_cols:
        raise HTTPException(status_code=400, detail="No valid columns selected")

    # 2. Validate source compatibility - all sources must be reachable via join paths
    if len(all_sources) > 1:
        # Build adjacency from JOIN_PATHS
        reachable = {list(all_sources)[0]}
        changed = True
        while changed:
            changed = False
            for src in list(all_sources - reachable):
                for reached in list(reachable):
                    if frozenset([src, reached]) in JOIN_PATHS:
                        reachable.add(src)
                        changed = True
                        break
        unreachable = all_sources - reachable
        if unreachable:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot combine sources: {', '.join(unreachable)} cannot be joined with {', '.join(reachable)}"
            )

    # 3. Build base query — start with first source, join others
    # Determine a primary source (the one appearing first in columns)
    ordered_sources = []
    for col in columns:
        if col.source not in ordered_sources:
            ordered_sources.append(col.source)

    # Also include sources referenced only in filters/sort
    for f in filters:
        if f.source not in ordered_sources:
            if f.source not in MULTI_SOURCE_COLUMNS:
                raise HTTPException(status_code=400, detail=f"Unknown source in filter: {f.source}")
            ordered_sources.append(f.source)
            all_sources.add(f.source)
    for s in sort_rules:
        if s.source not in ordered_sources:
            if s.source not in MULTI_SOURCE_COLUMNS:
                raise HTTPException(status_code=400, detail=f"Unknown source in sort: {s.source}")
            ordered_sources.append(s.source)
            all_sources.add(s.source)

    primary_source = ordered_sources[0]
    primary_model = SOURCE_MODELS[primary_source]

    query = db.query(*select_cols).select_from(primary_model)

    # Apply outer joins for additional sources
    joined_sources = {primary_source}
    for src in ordered_sources[1:]:
        if src in joined_sources:
            continue
        # Find a join path from any already-joined source to this new source
        join_found = False
        for joined_src in list(joined_sources):
            pair = frozenset([joined_src, src])
            if pair in JOIN_PATHS:
                jp = JOIN_PATHS[pair]
                left_model = SOURCE_MODELS[jp["left"]]
                right_model = SOURCE_MODELS[jp["right"]]
                left_col = getattr(left_model, jp["left_key"])
                right_col = getattr(right_model, jp["right_key"])
                # Determine which side is the new one to join
                if jp["right"] == src:
                    query = query.outerjoin(right_model, left_col == right_col)
                else:
                    query = query.outerjoin(left_model, right_col == left_col)
                joined_sources.add(src)
                join_found = True
                break
        if not join_found:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot find join path to source '{src}'"
            )

    # 4. Apply filters
    for f in filters:
        if f.source not in MULTI_SOURCE_COLUMNS:
            raise HTTPException(status_code=400, detail=f"Unknown source in filter: {f.source}")
        source_cfg = MULTI_SOURCE_COLUMNS[f.source]
        if f.field not in source_cfg["columns"]:
            raise HTTPException(status_code=400, detail=f"Unknown filter field '{f.field}' in source '{f.source}'")
        model = SOURCE_MODELS[f.source]
        col_attr = getattr(model, f.field)
        if f.values:
            if f.exclude:
                query = query.filter(~col_attr.in_(f.values))
            else:
                query = query.filter(col_attr.in_(f.values))

    # 5. Apply search across string columns
    if search:
        search_term = f"%{search}%"
        search_filters = []
        for col in columns:
            col_cfg = MULTI_SOURCE_COLUMNS[col.source]["columns"][col.field]
            if col_cfg["type"] == "string":
                model = SOURCE_MODELS[col.source]
                search_filters.append(getattr(model, col.field).ilike(search_term))
        if search_filters:
            query = query.filter(or_(*search_filters))

    # 6. Apply sorting
    for s in sort_rules:
        if s.source not in MULTI_SOURCE_COLUMNS:
            raise HTTPException(status_code=400, detail=f"Unknown sort source: {s.source}")
        source_cfg = MULTI_SOURCE_COLUMNS[s.source]
        if s.field not in source_cfg["columns"]:
            raise HTTPException(status_code=400, detail=f"Unknown sort field: {s.field} in source {s.source}")
        model = SOURCE_MODELS[s.source]
        sort_col = getattr(model, s.field)
        if s.direction.lower() == "desc":
            query = query.order_by(desc(sort_col))
        else:
            query = query.order_by(asc(sort_col))

    return query, select_labels, all_sources


# --- Endpoint: GET all columns from all sources ---

@router.get("/custom/columns")
@limiter.limit("30/minute")
def get_all_custom_columns(request: Request, user: dict = Depends(require_auth)):
    """Returns all available columns from all sources with compatibility info."""
    result = {}
    for source_key, source_cfg in MULTI_SOURCE_COLUMNS.items():
        result[source_key] = {
            "label": source_cfg["label"],
            "join_key": source_cfg["join_key"],
            "compatible_with": source_cfg["compatible_with"],
            "columns": [
                {"key": key, **val}
                for key, val in source_cfg["columns"].items()
            ],
        }
    return {"sources": result}


# --- Endpoint: POST multi-source query ---

@router.post("/custom/query")
@limiter.limit("10/minute")
def run_multi_source_query(
    request: Request,
    body: MultiSourceQueryRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_auth),
):
    """
    Multi-source custom report query with automatic joins, filters,
    search, multi-sort, and pagination.
    """
    query, select_labels, all_sources = _build_custom_query(
        db, body.columns, body.filters, body.sort, body.search
    )

    # Pagination
    total = query.count()
    page = body.page
    limit = body.limit
    pages = math.ceil(total / limit) if limit else 1
    offset = (page - 1) * limit

    results = query.offset(offset).limit(limit).all()

    # Format response rows
    data = []
    for row in results:
        row_dict = {}
        for i, label in enumerate(select_labels):
            val = row[i] if i < len(row) else None
            if isinstance(val, datetime):
                val = val.isoformat()
            row_dict[label] = val
        data.append(row_dict)

    return {
        "data": data,
        "columns": select_labels,
        "page": page,
        "limit": limit,
        "total": total,
        "pages": pages,
    }


# --- Endpoint: POST multi-source query CSV export ---

@router.post("/custom/query/export/csv")
@limiter.limit("10/minute")
def export_multi_source_csv(
    request: Request,
    body: MultiSourceQueryRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_auth),
):
    """
    Export multi-source custom report query results as CSV (no pagination).
    """
    query, select_labels, all_sources = _build_custom_query(
        db, body.columns, body.filters, body.sort, body.search
    )

    MAX_EXPORT_ROWS = 50000
    results = query.limit(MAX_EXPORT_ROWS).all()

    # Build column display labels: "Source > Field Label"
    csv_headers = []
    for label in select_labels:
        source, field = label.split("__", 1)
        source_cfg = MULTI_SOURCE_COLUMNS[source]
        field_label = source_cfg["columns"][field]["label"]
        csv_headers.append(f"{source_cfg['label']} > {field_label}")

    data = []
    for row in results:
        row_dict = {}
        for i, label in enumerate(select_labels):
            source, field = label.split("__", 1)
            source_cfg = MULTI_SOURCE_COLUMNS[source]
            field_label = source_cfg["columns"][field]["label"]
            header = f"{source_cfg['label']} > {field_label}"
            val = row[i] if i < len(row) else None
            if isinstance(val, datetime):
                val = val.strftime("%Y-%m-%d %H:%M:%S")
            row_dict[header] = val
        data.append(row_dict)

    sources_str = "_".join(sorted(all_sources))
    return stream_csv(data, csv_headers, f"custom_multi_{sources_str}_{datetime.now().strftime('%Y%m%d')}.csv")


# --- Legacy single-source endpoints (backward compatibility) ---

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


# =============================================================================
# SAVED REPORTS CRUD
# =============================================================================


class SavedReportCreate(BaseModel):
    name: str
    folder: Optional[str] = None
    config: dict

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Report name must not be empty")
        if len(v) > 255:
            raise ValueError("Report name must be 255 characters or fewer")
        return v

    @field_validator("folder")
    @classmethod
    def folder_clean(cls, v):
        if v is not None:
            v = v.strip()[:255]
            return v if v else None
        return None

    @field_validator("config")
    @classmethod
    def validate_config(cls, v: dict) -> dict:
        columns = v.get("columns")
        if not columns or not isinstance(columns, list) or len(columns) == 0:
            raise ValueError("Config must contain a non-empty 'columns' array")
        return v


class SavedReportUpdate(BaseModel):
    name: Optional[str] = None
    folder: Optional[str] = None
    config: Optional[dict] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Report name must not be empty")
        if len(v) > 255:
            raise ValueError("Report name must be 255 characters or fewer")
        return v

    @field_validator("config")
    @classmethod
    def validate_config(cls, v: Optional[dict]) -> Optional[dict]:
        if v is None:
            return v
        columns = v.get("columns")
        if not columns or not isinstance(columns, list) or len(columns) == 0:
            raise ValueError("Config must contain a non-empty 'columns' array")
        return v


@router.get("/saved/folders/list")
@limiter.limit("30/minute")
def list_saved_report_folders(
    request: Request,
    db: Session = Depends(get_db),
    user: dict = Depends(require_auth),
):
    """List unique non-null folder names, ordered alphabetically."""
    folders = (
        db.query(SavedReport.folder)
        .filter(SavedReport.folder.isnot(None), SavedReport.folder != "")
        .distinct()
        .order_by(SavedReport.folder)
        .all()
    )
    return [f[0] for f in folders]


@router.get("/saved")
@limiter.limit("30/minute")
def list_saved_reports(
    request: Request,
    db: Session = Depends(get_db),
    user: dict = Depends(require_auth),
):
    """List all saved reports without config (ordered by folder then name)."""
    reports = (
        db.query(SavedReport)
        .order_by(SavedReport.folder, SavedReport.name)
        .all()
    )
    return [
        {
            "id": r.id,
            "name": r.name,
            "folder": r.folder,
            "created_by": r.created_by,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in reports
    ]


@router.get("/saved/{report_id}")
@limiter.limit("20/minute")
def get_saved_report(
    request: Request,
    report_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_auth),
):
    """Get a single saved report with its config."""
    report = db.query(SavedReport).filter(SavedReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Saved report not found")
    return {
        "id": report.id,
        "name": report.name,
        "folder": report.folder,
        "config": report.config,
        "created_by": report.created_by,
        "created_at": report.created_at.isoformat() if report.created_at else None,
        "updated_at": report.updated_at.isoformat() if report.updated_at else None,
    }


@router.post("/saved")
@limiter.limit("10/minute")
def create_saved_report(
    request: Request,
    body: SavedReportCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_auth),
):
    """Create a new saved report."""
    report = SavedReport(
        name=body.name,
        folder=body.folder,
        config=body.config,
        created_by=user.get("email", "unknown"),
    )
    db.add(report)
    try:
        db.commit()
        db.refresh(report)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    return {
        "id": report.id,
        "name": report.name,
        "folder": report.folder,
        "created_by": report.created_by,
        "created_at": report.created_at.isoformat() if report.created_at else None,
    }


@router.put("/saved/{report_id}")
@limiter.limit("10/minute")
def update_saved_report(
    request: Request,
    report_id: int,
    body: SavedReportUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_auth),
):
    """Update an existing saved report. Only the creator or an admin can update."""
    report = db.query(SavedReport).filter(SavedReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Saved report not found")
    if report.created_by != user.get("email") and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to update this report")
    if body.name is not None:
        report.name = body.name
    if body.folder is not None:
        report.folder = body.folder.strip() if body.folder else None
    if body.config is not None:
        report.config = body.config
    try:
        db.commit()
        db.refresh(report)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    return {
        "id": report.id,
        "name": report.name,
        "folder": report.folder,
        "config": report.config,
        "created_by": report.created_by,
        "created_at": report.created_at.isoformat() if report.created_at else None,
        "updated_at": report.updated_at.isoformat() if report.updated_at else None,
    }


@router.delete("/saved/{report_id}")
@limiter.limit("10/minute")
def delete_saved_report(
    request: Request,
    report_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_auth),
):
    """Delete a saved report. Only the creator or an admin can delete."""
    report = db.query(SavedReport).filter(SavedReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Saved report not found")
    if report.created_by != user.get("email") and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this report")
    report_id_val = report.id
    db.delete(report)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    return {"status": "deleted", "id": report_id_val}


# =============================================================================
# REPORT 6: MERAKI INFRASTRUCTURE INVENTORY
# =============================================================================

@router.get("/infrastructure-inventory")
@limiter.limit("20/minute")
def get_infrastructure_inventory(
    request: Request,
    product_type: Optional[str] = None,
    product_type_exclude: Optional[str] = None,
    network: Optional[str] = None,
    network_exclude: Optional[str] = None,
    status: Optional[str] = None,
    status_exclude: Optional[str] = None,
    model: Optional[str] = None,
    model_exclude: Optional[str] = None,
    search: Optional[str] = None,
    sort: str = "name",
    order: str = "asc",
    page: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Infrastructure Inventory Report - All Meraki network devices (APs, switches).
    """
    query = db.query(
        MerakiDevice.serial,
        MerakiDevice.name,
        MerakiDevice.model,
        MerakiDevice.product_type,
        MerakiDevice.status,
        MerakiDevice.mac,
        MerakiDevice.lan_ip,
        MerakiDevice.firmware,
        MerakiDevice.tags,
        MerakiNetwork.name.label('network_name'),
        MerakiDevice.last_updated
    ).outerjoin(
        MerakiNetwork, MerakiDevice.network_id == MerakiNetwork.network_id
    )

    # Apply filters
    product_type_list = parse_multi_filter(product_type)
    if product_type_list:
        if product_type_exclude == 'true':
            query = query.filter(~MerakiDevice.product_type.in_(product_type_list))
        else:
            query = query.filter(MerakiDevice.product_type.in_(product_type_list))

    network_list = parse_multi_filter(network)
    if network_list:
        if network_exclude == 'true':
            query = query.filter(~MerakiNetwork.name.in_(network_list))
        else:
            query = query.filter(MerakiNetwork.name.in_(network_list))

    status_list = parse_multi_filter(status)
    if status_list:
        if status_exclude == 'true':
            query = query.filter(~MerakiDevice.status.in_(status_list))
        else:
            query = query.filter(MerakiDevice.status.in_(status_list))

    model_list = parse_multi_filter(model)
    if model_list:
        if model_exclude == 'true':
            query = query.filter(~MerakiDevice.model.in_(model_list))
        else:
            query = query.filter(MerakiDevice.model.in_(model_list))

    if search:
        search_term = f"%{search}%"
        query = query.filter(or_(
            MerakiDevice.serial.ilike(search_term),
            MerakiDevice.name.ilike(search_term),
            MerakiDevice.model.ilike(search_term),
            MerakiDevice.mac.ilike(search_term)
        ))

    total = query.count()

    # Apply sorting
    sort_map = {
        "serial": MerakiDevice.serial,
        "name": MerakiDevice.name,
        "model": MerakiDevice.model,
        "product_type": MerakiDevice.product_type,
        "status": MerakiDevice.status,
        "mac": MerakiDevice.mac,
        "lan_ip": MerakiDevice.lan_ip,
        "firmware": MerakiDevice.firmware,
        "network_name": MerakiNetwork.name,
        "last_updated": MerakiDevice.last_updated
    }
    sort_col = sort_map.get(sort, MerakiDevice.name)
    if order.lower() == "desc":
        query = query.order_by(desc(sort_col))
    else:
        query = query.order_by(asc(sort_col))

    results = query.offset(page * limit).limit(limit).all()

    data = [{
        "serial": r.serial,
        "name": r.name or r.serial,
        "model": r.model,
        "product_type": r.product_type,
        "status": r.status,
        "mac": r.mac,
        "lan_ip": r.lan_ip,
        "firmware": r.firmware,
        "tags": r.tags,
        "network_name": r.network_name,
        "last_updated": r.last_updated.isoformat() if r.last_updated else None
    } for r in results]

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
        "data": data
    }


@router.get("/infrastructure-inventory/export/csv")
@limiter.limit("10/minute")
def export_infrastructure_inventory_csv(
    request: Request,
    product_type: Optional[str] = None,
    product_type_exclude: Optional[str] = None,
    network: Optional[str] = None,
    network_exclude: Optional[str] = None,
    status: Optional[str] = None,
    status_exclude: Optional[str] = None,
    model: Optional[str] = None,
    model_exclude: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Export Infrastructure Inventory report to CSV."""
    query = db.query(
        MerakiDevice.serial,
        MerakiDevice.name,
        MerakiDevice.model,
        MerakiDevice.product_type,
        MerakiDevice.status,
        MerakiDevice.mac,
        MerakiDevice.lan_ip,
        MerakiDevice.firmware,
        MerakiDevice.tags,
        MerakiNetwork.name.label('network_name'),
        MerakiDevice.last_updated
    ).outerjoin(
        MerakiNetwork, MerakiDevice.network_id == MerakiNetwork.network_id
    )

    # Apply filters
    product_type_list = parse_multi_filter(product_type)
    if product_type_list:
        if product_type_exclude == 'true':
            query = query.filter(~MerakiDevice.product_type.in_(product_type_list))
        else:
            query = query.filter(MerakiDevice.product_type.in_(product_type_list))

    network_list = parse_multi_filter(network)
    if network_list:
        if network_exclude == 'true':
            query = query.filter(~MerakiNetwork.name.in_(network_list))
        else:
            query = query.filter(MerakiNetwork.name.in_(network_list))

    status_list = parse_multi_filter(status)
    if status_list:
        if status_exclude == 'true':
            query = query.filter(~MerakiDevice.status.in_(status_list))
        else:
            query = query.filter(MerakiDevice.status.in_(status_list))

    model_list = parse_multi_filter(model)
    if model_list:
        if model_exclude == 'true':
            query = query.filter(~MerakiDevice.model.in_(model_list))
        else:
            query = query.filter(MerakiDevice.model.in_(model_list))

    if search:
        search_term = f"%{search}%"
        query = query.filter(or_(
            MerakiDevice.serial.ilike(search_term),
            MerakiDevice.name.ilike(search_term),
            MerakiDevice.model.ilike(search_term)
        ))

    results = query.order_by(MerakiDevice.name).all()

    data = [{
        "Serial": r.serial,
        "Name": r.name or r.serial,
        "Model": r.model,
        "Type": r.product_type,
        "Status": r.status,
        "MAC": r.mac,
        "LAN IP": r.lan_ip,
        "Firmware": r.firmware,
        "Tags": r.tags,
        "Network": r.network_name,
        "Last Updated": r.last_updated.strftime("%Y-%m-%d %H:%M:%S") if r.last_updated else ""
    } for r in results]

    columns = ["Serial", "Name", "Model", "Type", "Status", "MAC", "LAN IP", "Firmware", "Tags", "Network", "Last Updated"]
    return stream_csv(data, columns, f"infrastructure_inventory_{datetime.now().strftime('%Y%m%d')}.csv")


# =============================================================================
# REPORT 7: FIRMWARE COMPLIANCE
# =============================================================================

@router.get("/firmware-compliance")
@limiter.limit("20/minute")
def get_firmware_compliance(
    request: Request,
    product_type: Optional[str] = None,
    product_type_exclude: Optional[str] = None,
    model: Optional[str] = None,
    model_exclude: Optional[str] = None,
    firmware: Optional[str] = None,
    firmware_exclude: Optional[str] = None,
    network: Optional[str] = None,
    network_exclude: Optional[str] = None,
    search: Optional[str] = None,
    sort: str = "model",
    order: str = "asc",
    page: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Firmware Compliance Report - Devices grouped by model and firmware version.
    Shows which devices are on what firmware to identify update needs.
    """
    query = db.query(
        MerakiDevice.serial,
        MerakiDevice.name,
        MerakiDevice.model,
        MerakiDevice.product_type,
        MerakiDevice.firmware,
        MerakiDevice.status,
        MerakiNetwork.name.label('network_name'),
        MerakiDevice.last_updated
    ).outerjoin(
        MerakiNetwork, MerakiDevice.network_id == MerakiNetwork.network_id
    )

    # Apply filters
    product_type_list = parse_multi_filter(product_type)
    if product_type_list:
        if product_type_exclude == 'true':
            query = query.filter(~MerakiDevice.product_type.in_(product_type_list))
        else:
            query = query.filter(MerakiDevice.product_type.in_(product_type_list))

    model_list = parse_multi_filter(model)
    if model_list:
        if model_exclude == 'true':
            query = query.filter(~MerakiDevice.model.in_(model_list))
        else:
            query = query.filter(MerakiDevice.model.in_(model_list))

    firmware_list = parse_multi_filter(firmware)
    if firmware_list:
        if firmware_exclude == 'true':
            query = query.filter(~MerakiDevice.firmware.in_(firmware_list))
        else:
            query = query.filter(MerakiDevice.firmware.in_(firmware_list))

    network_list = parse_multi_filter(network)
    if network_list:
        if network_exclude == 'true':
            query = query.filter(~MerakiNetwork.name.in_(network_list))
        else:
            query = query.filter(MerakiNetwork.name.in_(network_list))

    if search:
        search_term = f"%{search}%"
        query = query.filter(or_(
            MerakiDevice.serial.ilike(search_term),
            MerakiDevice.name.ilike(search_term),
            MerakiDevice.model.ilike(search_term),
            MerakiDevice.firmware.ilike(search_term)
        ))

    total = query.count()

    # Apply sorting
    sort_map = {
        "serial": MerakiDevice.serial,
        "name": MerakiDevice.name,
        "model": MerakiDevice.model,
        "product_type": MerakiDevice.product_type,
        "firmware": MerakiDevice.firmware,
        "status": MerakiDevice.status,
        "network_name": MerakiNetwork.name,
        "last_updated": MerakiDevice.last_updated
    }
    sort_col = sort_map.get(sort, MerakiDevice.model)
    if order.lower() == "desc":
        query = query.order_by(desc(sort_col))
    else:
        query = query.order_by(asc(sort_col))

    results = query.offset(page * limit).limit(limit).all()

    data = [{
        "serial": r.serial,
        "name": r.name or r.serial,
        "model": r.model,
        "product_type": r.product_type,
        "firmware": r.firmware,
        "status": r.status,
        "network_name": r.network_name,
        "last_updated": r.last_updated.isoformat() if r.last_updated else None
    } for r in results]

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
        "data": data
    }


@router.get("/firmware-compliance/export/csv")
@limiter.limit("10/minute")
def export_firmware_compliance_csv(
    request: Request,
    product_type: Optional[str] = None,
    product_type_exclude: Optional[str] = None,
    model: Optional[str] = None,
    model_exclude: Optional[str] = None,
    firmware: Optional[str] = None,
    firmware_exclude: Optional[str] = None,
    network: Optional[str] = None,
    network_exclude: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Export Firmware Compliance report to CSV."""
    query = db.query(
        MerakiDevice.serial,
        MerakiDevice.name,
        MerakiDevice.model,
        MerakiDevice.product_type,
        MerakiDevice.firmware,
        MerakiDevice.status,
        MerakiNetwork.name.label('network_name'),
        MerakiDevice.last_updated
    ).outerjoin(
        MerakiNetwork, MerakiDevice.network_id == MerakiNetwork.network_id
    )

    # Apply filters
    product_type_list = parse_multi_filter(product_type)
    if product_type_list:
        if product_type_exclude == 'true':
            query = query.filter(~MerakiDevice.product_type.in_(product_type_list))
        else:
            query = query.filter(MerakiDevice.product_type.in_(product_type_list))

    model_list = parse_multi_filter(model)
    if model_list:
        if model_exclude == 'true':
            query = query.filter(~MerakiDevice.model.in_(model_list))
        else:
            query = query.filter(MerakiDevice.model.in_(model_list))

    firmware_list = parse_multi_filter(firmware)
    if firmware_list:
        if firmware_exclude == 'true':
            query = query.filter(~MerakiDevice.firmware.in_(firmware_list))
        else:
            query = query.filter(MerakiDevice.firmware.in_(firmware_list))

    network_list = parse_multi_filter(network)
    if network_list:
        if network_exclude == 'true':
            query = query.filter(~MerakiNetwork.name.in_(network_list))
        else:
            query = query.filter(MerakiNetwork.name.in_(network_list))

    if search:
        search_term = f"%{search}%"
        query = query.filter(or_(
            MerakiDevice.serial.ilike(search_term),
            MerakiDevice.name.ilike(search_term),
            MerakiDevice.model.ilike(search_term),
            MerakiDevice.firmware.ilike(search_term)
        ))

    results = query.order_by(MerakiDevice.model, MerakiDevice.firmware).all()

    data = [{
        "Serial": r.serial,
        "Name": r.name or r.serial,
        "Model": r.model,
        "Type": r.product_type,
        "Firmware": r.firmware,
        "Status": r.status,
        "Network": r.network_name,
        "Last Updated": r.last_updated.strftime("%Y-%m-%d %H:%M:%S") if r.last_updated else ""
    } for r in results]

    columns = ["Serial", "Name", "Model", "Type", "Firmware", "Status", "Network", "Last Updated"]
    return stream_csv(data, columns, f"firmware_compliance_{datetime.now().strftime('%Y%m%d')}.csv")


# =============================================================================
# MERAKI FILTER OPTIONS
# =============================================================================

@router.get("/filters/meraki-options")
@limiter.limit("30/minute")
def get_meraki_filter_options(request: Request, db: Session = Depends(get_db)):
    """
    Returns available filter options for Meraki reports.
    """
    # Get unique product types
    product_types = db.query(MerakiDevice.product_type).filter(
        MerakiDevice.product_type.isnot(None)
    ).distinct().all()
    product_types = sorted([pt[0] for pt in product_types if pt[0]])

    # Get unique networks
    networks = db.query(MerakiNetwork.name).filter(
        MerakiNetwork.name.isnot(None)
    ).distinct().all()
    networks = sorted([n[0] for n in networks if n[0]])

    # Get unique device statuses
    statuses = db.query(MerakiDevice.status).filter(
        MerakiDevice.status.isnot(None)
    ).distinct().all()
    statuses = sorted([s[0] for s in statuses if s[0]])

    # Get unique models
    models = db.query(MerakiDevice.model).filter(
        MerakiDevice.model.isnot(None)
    ).distinct().all()
    models = sorted([m[0] for m in models if m[0]])

    # Get unique firmware versions
    firmwares = db.query(MerakiDevice.firmware).filter(
        MerakiDevice.firmware.isnot(None)
    ).distinct().all()
    firmwares = sorted([f[0] for f in firmwares if f[0]])

    return {
        "product_types": product_types,
        "networks": networks,
        "statuses": statuses,
        "models": models,
        "firmwares": firmwares
    }
