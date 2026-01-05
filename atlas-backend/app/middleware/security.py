"""
Security Headers Middleware

Adds HTTP security headers to all responses to protect against common attacks:
- X-Content-Type-Options: Prevents MIME type sniffing
- X-Frame-Options: Prevents clickjacking attacks
- X-XSS-Protection: Legacy XSS protection for older browsers
- Referrer-Policy: Controls referrer information sent with requests
- Cache-Control: Prevents sensitive data caching
- Content-Security-Policy: Restricts resource loading sources
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Middleware that adds security headers to all responses."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Prevent MIME type sniffing - browser must use declared Content-Type
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent page from being embedded in iframes (clickjacking protection)
        response.headers["X-Frame-Options"] = "DENY"

        # Legacy XSS filter for older browsers
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Control referrer information sent with requests
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Prevent caching of API responses (they may contain sensitive data)
        # Only apply to API routes, not static assets
        if request.url.path.startswith("/api") or request.url.path.startswith("/auth"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"

        # Content Security Policy - restrict resource loading
        # 'self' allows resources from same origin only
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' accounts.google.com; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "connect-src 'self' accounts.google.com; "
            "frame-ancestors 'none'; "
            "form-action 'self' accounts.google.com;"
        )

        # Permissions Policy - disable unnecessary browser features
        response.headers["Permissions-Policy"] = (
            "accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
            "magnetometer=(), microphone=(), payment=(), usb=()"
        )

        return response
