"""
ATLAS Local Authentication Service
Handles local user authentication, password hashing, and user management.
"""
import uuid
import bcrypt
from typing import Optional, Tuple
from datetime import datetime
from sqlalchemy.orm import Session

from app.models import LocalUser


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode(), salt).decode()


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def authenticate_user(db: Session, username: str, password: str) -> Tuple[Optional[LocalUser], str]:
    """
    Authenticate a local user.
    Returns (user, error_message). User is None if auth fails.
    Username comparison is case-insensitive.
    """
    from sqlalchemy import func
    user = db.query(LocalUser).filter(
        func.lower(LocalUser.username) == func.lower(username),
        LocalUser.is_active == True
    ).first()

    if not user:
        return None, "Invalid username or password"

    if not verify_password(password, user.password_hash):
        return None, "Invalid username or password"

    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()

    return user, ""


def create_user(
    db: Session,
    username: str,
    password: str,
    role: str = "readonly",
    email: Optional[str] = None,
    must_change_password: bool = True,
    created_by: Optional[str] = None
) -> Tuple[Optional[LocalUser], str]:
    """
    Create a new local user.
    Returns (user, error_message). User is None if creation fails.
    """
    # Check if username already exists
    existing = db.query(LocalUser).filter(LocalUser.username == username).first()
    if existing:
        return None, "Username already exists"

    # Validate role
    if role not in ("admin", "readonly"):
        return None, "Invalid role. Must be 'admin' or 'readonly'"

    # Validate password length
    if len(password) < 12:
        return None, "Password must be at least 12 characters"

    user = LocalUser(
        id=str(uuid.uuid4()),
        username=username,
        email=email,
        password_hash=hash_password(password),
        role=role,
        must_change_password=must_change_password,
        is_active=True,
        created_at=datetime.utcnow(),
        created_by=created_by
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user, ""


def change_password(db: Session, user_id: str, current_password: str, new_password: str) -> Tuple[bool, str]:
    """
    Change a user's password.
    Returns (success, error_message).
    """
    user = db.query(LocalUser).filter(LocalUser.id == user_id).first()
    if not user:
        return False, "User not found"

    if not verify_password(current_password, user.password_hash):
        return False, "Current password is incorrect"

    if len(new_password) < 12:
        return False, "New password must be at least 12 characters"

    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    db.commit()

    return True, ""


def reset_password(db: Session, user_id: str, new_password: str, admin_user_id: str) -> Tuple[bool, str]:
    """
    Admin reset of user password.
    Returns (success, error_message).
    """
    user = db.query(LocalUser).filter(LocalUser.id == user_id).first()
    if not user:
        return False, "User not found"

    if len(new_password) < 12:
        return False, "Password must be at least 12 characters"

    user.password_hash = hash_password(new_password)
    user.must_change_password = True  # Force change on next login
    db.commit()

    return True, ""


def get_user_by_id(db: Session, user_id: str) -> Optional[LocalUser]:
    """Get a user by their ID."""
    return db.query(LocalUser).filter(LocalUser.id == user_id).first()


def get_all_users(db: Session) -> list:
    """Get all local users."""
    return db.query(LocalUser).order_by(LocalUser.created_at.desc()).all()


def update_user(
    db: Session,
    user_id: str,
    email: Optional[str] = None,
    role: Optional[str] = None,
    is_active: Optional[bool] = None
) -> Tuple[bool, str]:
    """Update user properties."""
    user = db.query(LocalUser).filter(LocalUser.id == user_id).first()
    if not user:
        return False, "User not found"

    if email is not None:
        user.email = email
    if role is not None:
        if role not in ("admin", "readonly"):
            return False, "Invalid role"
        user.role = role
    if is_active is not None:
        user.is_active = is_active

    db.commit()
    return True, ""


def delete_user(db: Session, user_id: str) -> Tuple[bool, str]:
    """Soft delete a user (set is_active = False)."""
    user = db.query(LocalUser).filter(LocalUser.id == user_id).first()
    if not user:
        return False, "User not found"

    user.is_active = False
    db.commit()
    return True, ""
