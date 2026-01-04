"""Authentication middleware for FastAPI."""

from fastapi import Request, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, Dict, Any

from ...infrastructure.auth import verify_token
from ...domain.user.service import get_user_by_id

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Dict[str, Any]:
    """Get current authenticated user from JWT token."""
    token = credentials.credentials
    payload = verify_token(token)
    user_id = payload.get("sub")
    
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )
    
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    # SQLite stores booleans as integers (0/1), so check explicitly
    # is_active should be 1 (True) for active users, 0 (False) or None for inactive
    # Handle various formats: integer 1, boolean True, string "1", etc.
    is_active = user.get("is_active")
    # Convert to int if it's a string, then check if it's truthy
    try:
        is_active_int = int(is_active) if is_active is not None else 0
    except (ValueError, TypeError):
        is_active_int = 0
    
    if is_active_int != 1 and is_active is not True:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is deactivated (is_active={is_active}, type={type(is_active).__name__})"
        )
    
    return user


def require_role(required_role: str):
    """Dependency factory to require specific role."""
    async def role_checker(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if user.get("role") != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires {required_role} role"
            )
        return user
    return role_checker


async def get_current_user_optional(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))
) -> Optional[Dict[str, Any]]:
    """Get current authenticated user from JWT token, or None if not authenticated."""
    if not credentials:
        return None
    
    try:
        token = credentials.credentials
        payload = verify_token(token)
        user_id = payload.get("sub")
        
        if not user_id:
            return None
        
        user = get_user_by_id(user_id)
        if not user:
            return None
        
        # SQLite stores booleans as integers (0/1), so check explicitly
        # Handle various formats: integer 1, boolean True, string "1", etc.
        is_active = user.get("is_active")
        try:
            is_active_int = int(is_active) if is_active is not None else 0
        except (ValueError, TypeError):
            is_active_int = 0
        
        if is_active_int != 1 and is_active is not True:
            return None
        
        return user
    except Exception:
        return None


# Convenience dependencies
require_admin = require_role("admin")
require_moderator = require_role("moderator")

