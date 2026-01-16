"""
System management endpoints for ATLAS.
Handles version info, update checking, and update application.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from datetime import datetime, timedelta
from typing import Optional
import subprocess
import os
import httpx

from app.database import get_db, SessionLocal
from app.models import UpdateLog
from app.auth import require_admin, require_auth
from app.utils import get_user_identifier

router = APIRouter(prefix="/api/system", tags=["system"])
limiter = Limiter(key_func=get_user_identifier)

# Cache for GitHub API responses
_update_cache = {
    "last_check": None,
    "data": None
}
CACHE_DURATION = timedelta(hours=1)

# GitHub repo info
GITHUB_OWNER = "adukes40"
GITHUB_REPO = "ATLAS"
GITHUB_BRANCH = "main"


def read_version_file() -> str:
    """Read version from VERSION file."""
    version_path = "/opt/atlas/VERSION"
    try:
        with open(version_path, "r") as f:
            return f.read().strip()
    except Exception:
        return "unknown"


def get_local_git_commit() -> str:
    """Get the current local git commit hash."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd="/opt/atlas",
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return "unknown"


def get_local_git_commit_short() -> str:
    """Get short version of local git commit."""
    full = get_local_git_commit()
    return full[:7] if full != "unknown" else "unknown"


async def fetch_github_commits(since_commit: str = None) -> dict:
    """
    Fetch latest commits from GitHub API.
    Returns dict with latest_commit and changelog.
    """
    try:
        async with httpx.AsyncClient() as client:
            # Get latest commits on main branch
            url = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/commits"
            params = {"sha": GITHUB_BRANCH, "per_page": 20}

            response = await client.get(url, params=params, timeout=10.0)

            if response.status_code != 200:
                return {"error": f"GitHub API returned {response.status_code}"}

            commits = response.json()

            if not commits:
                return {"error": "No commits found"}

            latest_commit = commits[0]["sha"]

            # Build changelog - commits since local version
            changelog = []
            for commit in commits:
                if since_commit and commit["sha"].startswith(since_commit[:7]):
                    break
                changelog.append({
                    "sha": commit["sha"][:7],
                    "message": commit["commit"]["message"].split("\n")[0],  # First line only
                    "date": commit["commit"]["author"]["date"],
                    "author": commit["commit"]["author"]["name"]
                })

            return {
                "latest_commit": latest_commit,
                "changelog": changelog
            }
    except httpx.TimeoutException:
        return {"error": "GitHub API timeout"}
    except Exception as e:
        return {"error": str(e)}


@router.get("/version")
async def get_version():
    """
    Get current ATLAS version and git commit.
    """
    return {
        "version": read_version_file(),
        "commit": get_local_git_commit_short(),
        "commit_full": get_local_git_commit()
    }


@router.get("/updates/check")
@limiter.limit("30/minute")
async def check_for_updates(
    request: Request,
    force: bool = False,
    current_user: dict = Depends(require_auth)
):
    """
    Check if updates are available from GitHub.
    Results are cached for 1 hour unless force=True.
    """
    global _update_cache

    # Check cache unless force refresh
    if not force and _update_cache["last_check"]:
        cache_age = datetime.utcnow() - _update_cache["last_check"]
        if cache_age < CACHE_DURATION and _update_cache["data"]:
            return _update_cache["data"]

    # Get local version info
    current_version = read_version_file()
    local_commit = get_local_git_commit()
    local_commit_short = local_commit[:7] if local_commit != "unknown" else "unknown"

    # Fetch from GitHub
    github_data = await fetch_github_commits(local_commit)

    if "error" in github_data:
        return {
            "update_available": False,
            "current_version": current_version,
            "current_commit": local_commit_short,
            "error": github_data["error"]
        }

    latest_commit = github_data["latest_commit"]
    latest_commit_short = latest_commit[:7]

    # Check if update available
    update_available = local_commit != "unknown" and not latest_commit.startswith(local_commit[:7])

    result = {
        "update_available": update_available,
        "current_version": current_version,
        "current_commit": local_commit_short,
        "latest_commit": latest_commit_short,
        "changelog": github_data.get("changelog", []) if update_available else [],
        "checked_at": datetime.utcnow().isoformat()
    }

    # Update cache
    _update_cache["last_check"] = datetime.utcnow()
    _update_cache["data"] = result

    return result


@router.post("/updates/apply")
@limiter.limit("2/hour")
async def apply_update(
    request: Request,
    current_user: dict = Depends(require_admin)
):
    """
    Apply pending updates by running update.sh.
    Admin only. Rate limited to 2 per hour.
    """
    # Get current version info before update
    from_version = read_version_file()
    from_commit = get_local_git_commit_short()

    # Create update log entry
    db = SessionLocal()
    try:
        update_log = UpdateLog(
            from_version=from_version,
            from_commit=from_commit,
            status="running",
            started_at=datetime.utcnow(),
            triggered_by=current_user.get("email", "unknown")
        )
        db.add(update_log)
        db.commit()
        db.refresh(update_log)
        log_id = update_log.id
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create update log: {str(e)}")
    finally:
        db.close()

    # Run update.sh
    try:
        result = subprocess.run(
            ["sudo", "/opt/atlas/update.sh", GITHUB_BRANCH],
            cwd="/opt/atlas",
            capture_output=True,
            text=True,
            timeout=600  # 10 minute timeout
        )

        output = result.stdout + "\n" + result.stderr
        success = result.returncode == 0

        # Get new version info after update
        to_version = read_version_file()
        to_commit = get_local_git_commit_short()

    except subprocess.TimeoutExpired:
        output = "Update timed out after 10 minutes"
        success = False
        to_version = from_version
        to_commit = from_commit
    except Exception as e:
        output = f"Update failed: {str(e)}"
        success = False
        to_version = from_version
        to_commit = from_commit

    # Update log entry
    db = SessionLocal()
    try:
        update_log = db.query(UpdateLog).filter(UpdateLog.id == log_id).first()
        if update_log:
            update_log.status = "success" if success else "failed"
            update_log.to_version = to_version
            update_log.to_commit = to_commit
            update_log.completed_at = datetime.utcnow()
            update_log.output = output[-10000:]  # Limit output size
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()

    # Clear update cache
    global _update_cache
    _update_cache["last_check"] = None
    _update_cache["data"] = None

    return {
        "status": "success" if success else "failed",
        "from_version": from_version,
        "to_version": to_version,
        "output": output
    }


@router.get("/updates/log")
@limiter.limit("30/minute")
async def get_update_log(
    request: Request,
    limit: int = 10,
    current_user: dict = Depends(require_auth)
):
    """
    Get recent update history.
    """
    db = SessionLocal()
    try:
        logs = db.query(UpdateLog)\
            .order_by(UpdateLog.started_at.desc())\
            .limit(limit)\
            .all()

        return [
            {
                "id": log.id,
                "from_version": log.from_version,
                "to_version": log.to_version,
                "from_commit": log.from_commit,
                "to_commit": log.to_commit,
                "status": log.status,
                "started_at": log.started_at.isoformat() if log.started_at else None,
                "completed_at": log.completed_at.isoformat() if log.completed_at else None,
                "triggered_by": log.triggered_by
            }
            for log in logs
        ]
    finally:
        db.close()


@router.get("/updates/log/{log_id}")
@limiter.limit("30/minute")
async def get_update_log_detail(
    request: Request,
    log_id: int,
    current_user: dict = Depends(require_admin)
):
    """
    Get detailed update log including output.
    Admin only.
    """
    db = SessionLocal()
    try:
        log = db.query(UpdateLog).filter(UpdateLog.id == log_id).first()

        if not log:
            raise HTTPException(status_code=404, detail="Update log not found")

        return {
            "id": log.id,
            "from_version": log.from_version,
            "to_version": log.to_version,
            "from_commit": log.from_commit,
            "to_commit": log.to_commit,
            "status": log.status,
            "started_at": log.started_at.isoformat() if log.started_at else None,
            "completed_at": log.completed_at.isoformat() if log.completed_at else None,
            "triggered_by": log.triggered_by,
            "output": log.output
        }
    finally:
        db.close()
