"""Authentication utilities for JWT and password hashing."""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import jwt
import bcrypt
import secrets
import os
from fastapi import HTTPException, status

# JWT configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", secrets.token_urlsafe(32))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours
REFRESH_TOKEN_EXPIRE_DAYS = 30


def hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    hash_bytes = bcrypt.hashpw(password_bytes, salt)
    # Return as string for database storage
    return hash_bytes.decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Verify password against hash."""
    try:
        if not password or not hashed:
            return False
        
        # Ensure both are bytes for bcrypt
        password_bytes = password.encode("utf-8")
        
        # Check if hash is already bytes or needs encoding
        if isinstance(hashed, bytes):
            hash_bytes = hashed
        else:
            hash_bytes = hashed.encode("utf-8")
        
        return bcrypt.checkpw(password_bytes, hash_bytes)
    except Exception as e:
        # Log the exception for debugging (but don't expose it to user)
        import traceback
        print(f"[DEBUG] Password verification error: {e}")
        print(f"[DEBUG] Hash type: {type(hashed)}, Hash length: {len(hashed) if hashed else 0}")
        traceback.print_exc()
        return False


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: Dict[str, Any]) -> str:
    """Create JWT refresh token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str, token_type: str = "access") -> Dict[str, Any]:
    """Verify and decode JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != token_type:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )

