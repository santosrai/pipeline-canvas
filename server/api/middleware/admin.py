"""Admin middleware for role-based access control."""

from fastapi import HTTPException, status, Depends
from typing import Dict, Any

from .auth import get_current_user


def require_super_admin():
    """Dependency factory to require super admin role."""
    async def super_admin_checker(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if user.get("role") != "admin":
            # For now, treat all admins as super admins
            # In the future, we can add a separate "super_admin" role
            # For now, check if user is admin
            if user.get("role") != "admin":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Requires super admin role"
                )
        return user
    return super_admin_checker


# Convenience dependency
require_super_admin_dep = require_super_admin()
