"""User service for authentication and user management."""

from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import uuid
import json

try:
    # Try relative import first (when running as module)
    from ...database.db import get_db
    from ...infrastructure.auth import hash_password, verify_password, create_access_token, create_refresh_token
except ImportError:
    # Fallback to absolute import (when running directly)
    from database.db import get_db
    from infrastructure.auth import hash_password, verify_password, create_access_token, create_refresh_token
from .models import UserCreate, UserLogin, UserRole


def create_user(user_data: UserCreate) -> Dict[str, Any]:
    """Create new user with email/username validation."""
    user_id = str(uuid.uuid4())
    password_hash = hash_password(user_data.password)
    
    with get_db() as conn:
        # Check if email or username exists
        existing = conn.execute(
            "SELECT id FROM users WHERE email = ? OR username = ?",
            (user_data.email, user_data.username)
        ).fetchone()
        if existing:
            raise ValueError("Email or username already exists")
        
        # Create user
        conn.execute(
            """INSERT INTO users (id, email, username, password_hash, role)
               VALUES (?, ?, ?, ?, ?)""",
            (user_id, user_data.email, user_data.username, password_hash, UserRole.USER.value)
        )
        
        # Initialize credits (100 free credits on signup)
        conn.execute(
            """INSERT INTO user_credits (user_id, credits, total_earned)
               VALUES (?, ?, ?)""",
            (user_id, 100, 100)
        )
        
        # Log initial credit transaction
        transaction_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO credit_transactions (id, user_id, amount, transaction_type, description)
               VALUES (?, ?, ?, ?, ?)""",
            (transaction_id, user_id, 100, "earned", "Welcome bonus")
        )
    
    return {"user_id": user_id, "message": "User created successfully"}


def authenticate_user(login_data: UserLogin) -> Dict[str, Any]:
    """Authenticate user and return tokens."""
    with get_db() as conn:
        user = conn.execute(
            """SELECT id, email, username, password_hash, role, email_verified, is_active
               FROM users WHERE email = ?""",
            (login_data.email,)
        ).fetchone()
        
        if not user or not verify_password(login_data.password, user["password_hash"]):
            raise ValueError("Invalid email or password")
        
        # SQLite stores booleans as integers (0/1), so check explicitly
        if user["is_active"] not in (1, True):
            raise ValueError("Account is deactivated")
        
        # Update last login
        conn.execute(
            "UPDATE users SET last_login = ? WHERE id = ?",
            (datetime.utcnow(), user["id"])
        )
        
        # Create tokens
        access_token = create_access_token({
            "sub": user["id"],
            "email": user["email"],
            "role": user["role"]
        })
        refresh_token = create_refresh_token({"sub": user["id"]})
        
        # Store refresh token
        expires_at = datetime.utcnow() + timedelta(days=30)
        conn.execute(
            """INSERT INTO refresh_tokens (token, user_id, expires_at)
               VALUES (?, ?, ?)""",
            (refresh_token, user["id"], expires_at)
        )
        
        # Get user credits
        credits_row = conn.execute(
            "SELECT credits FROM user_credits WHERE user_id = ?",
            (user["id"],)
        ).fetchone()
        credits = credits_row["credits"] if credits_row else 0
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": {
                "id": user["id"],
                "email": user["email"],
                "username": user["username"],
                "role": user["role"],
                "credits": credits
            }
        }


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    """Get user by ID with credit balance."""
    with get_db() as conn:
        user = conn.execute(
            """SELECT u.*, uc.credits
               FROM users u
               LEFT JOIN user_credits uc ON u.id = uc.user_id
               WHERE u.id = ?""",
            (user_id,)
        ).fetchone()
        if user:
            return dict(user)
        return None


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Get user by email."""
    with get_db() as conn:
        user = conn.execute(
            """SELECT u.*, uc.credits
               FROM users u
               LEFT JOIN user_credits uc ON u.id = uc.user_id
               WHERE u.email = ?""",
            (email,)
        ).fetchone()
        if user:
            return dict(user)
        return None


def get_all_users() -> list[Dict[str, Any]]:
    """Get all users (admin only)."""
    with get_db() as conn:
        users = conn.execute(
            """SELECT u.*, uc.credits
               FROM users u
               LEFT JOIN user_credits uc ON u.id = uc.user_id
               ORDER BY u.created_at DESC"""
        ).fetchall()
        return [dict(user) for user in users]


def update_user_role(user_id: str, role: str) -> None:
    """Update user role (admin only)."""
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET role = ?, updated_at = ? WHERE id = ?",
            (role, datetime.utcnow(), user_id)
        )


def deactivate_user(user_id: str) -> None:
    """Deactivate user account (admin only)."""
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?",
            (datetime.utcnow(), user_id)
        )


def activate_user(user_id: str) -> None:
    """Activate user account (admin only)."""
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET is_active = 1, updated_at = ? WHERE id = ?",
            (datetime.utcnow(), user_id)
        )

