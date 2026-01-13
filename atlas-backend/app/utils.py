"""
Shared utility functions for ATLAS backend.
Extracted from routers to eliminate code duplication.
"""
from fastapi import Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Query
from sqlalchemy import desc, asc
from slowapi.util import get_remote_address
from datetime import datetime
from typing import Optional, List
import csv
import io

from app.auth import get_current_user


def get_user_identifier(request: Request) -> str:
    """
    Get rate limit key from user email or IP.
    Used by slowapi Limiter for per-user rate limiting.
    """
    user = get_current_user(request)
    if user and user.get("email"):
        return user.get("email")
    return get_remote_address(request)


def parse_multi_filter(value: Optional[str]) -> Optional[List[str]]:
    """
    Parse comma-separated filter values into a list.
    Returns None if input is empty or contains only whitespace.

    Example:
        parse_multi_filter("Active,Disabled") -> ["Active", "Disabled"]
        parse_multi_filter("") -> None
    """
    if not value:
        return None
    values = [v.strip() for v in value.split(',') if v.strip()]
    return values if values else None


def apply_filter(query: Query, column, values: Optional[List[str]], exclude: bool = False) -> Query:
    """
    Apply an IN or NOT IN filter to a query.

    Args:
        query: SQLAlchemy query object
        column: Model column to filter on
        values: List of values to filter (or None to skip)
        exclude: If True, use NOT IN instead of IN

    Returns:
        Modified query with filter applied (or original if values is None)
    """
    if not values:
        return query
    if exclude:
        return query.filter(~column.in_(values))
    return query.filter(column.in_(values))


def apply_sorting(query: Query, sort_map: dict, sort_by: str, order: str) -> Query:
    """
    Apply sorting to a query based on column name and direction.

    Args:
        query: SQLAlchemy query object
        sort_map: Dict mapping sort key names to model columns
        sort_by: Column key to sort by
        order: "asc" or "desc"

    Returns:
        Query with ORDER BY applied
    """
    if not sort_by or sort_by not in sort_map:
        return query

    column = sort_map[sort_by]
    if order.lower() == "desc":
        return query.order_by(desc(column))
    return query.order_by(asc(column))


def paginate(query: Query, page: int, limit: int) -> Query:
    """
    Apply pagination to a query.

    Args:
        query: SQLAlchemy query object
        page: Zero-indexed page number
        limit: Number of results per page

    Returns:
        Query with OFFSET and LIMIT applied
    """
    offset = page * limit
    return query.offset(offset).limit(limit)


def calculate_pages(total: int, limit: int) -> int:
    """Calculate total number of pages for pagination."""
    return (total + limit - 1) // limit


def stream_csv(data: List[dict], columns: List[str], filename: str) -> StreamingResponse:
    """
    Generate a CSV streaming response from a list of dictionaries.

    Args:
        data: List of row dictionaries
        columns: Column names to include (in order)
        filename: Name for the downloaded file

    Returns:
        FastAPI StreamingResponse with CSV content
    """
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction='ignore')
    writer.writeheader()

    for row in data:
        # Convert datetime objects to strings and handle None values
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
