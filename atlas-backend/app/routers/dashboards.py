from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse


router = APIRouter(prefix="/api/dashboards", tags=["dashboards"])


@router.get("/overview")
def overview_redirect(request: Request):
    """Redirect to new reports overview stats endpoint."""
    return RedirectResponse(url="/api/reports/overview/stats", status_code=307)


@router.get("/google")
def google_redirect(request: Request):
    """Redirect to new reports overview google endpoint."""
    return RedirectResponse(url="/api/reports/overview/google", status_code=307)


@router.get("/iiq")
def iiq_redirect(request: Request):
    """Redirect to new reports overview iiq endpoint."""
    return RedirectResponse(url="/api/reports/overview/iiq", status_code=307)


@router.get("/iiq/tickets")
def iiq_tickets_redirect(request: Request):
    """Redirect to new reports overview iiq tickets endpoint."""
    return RedirectResponse(url="/api/reports/overview/iiq/tickets", status_code=307)


@router.get("/meraki")
def meraki_redirect(request: Request):
    """Redirect to new reports overview meraki endpoint."""
    return RedirectResponse(url="/api/reports/overview/meraki", status_code=307)
