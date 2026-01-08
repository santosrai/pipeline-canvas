"""Authentication API routes."""

from fastapi import APIRouter, HTTPException, Depends, status, Request
from typing import Dict, Any, Optional
from pydantic import BaseModel
import traceback

try:
    # Try relative import first (when running as module)
    from ...domain.user.models import UserCreate, UserLogin
    from ...domain.user.service import create_user, authenticate_user, get_user_by_id
    from ..middleware.auth import get_current_user
    from ...database.db import get_db
except ImportError:
    # Fallback to absolute import (when running directly)
    from domain.user.models import UserCreate, UserLogin
    from domain.user.service import create_user, authenticate_user, get_user_by_id
    from api.middleware.auth import get_current_user
    from database.db import get_db
from datetime import datetime

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup")
async def signup(user_data: UserCreate) -> Dict[str, Any]:
    """User registration."""
    try:
        result = create_user(user_data)
        return {"status": "success", **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")


@router.post("/signin")
async def signin(login_data: UserLogin) -> Dict[str, Any]:
    """User login."""
    try:
        # Log signin attempt (without password)
        from ...infrastructure.utils import log_line
        log_line("signin_attempt", {"email": login_data.email})
        
        result = authenticate_user(login_data)
        
        log_line("signin_success", {"email": login_data.email, "user_id": result["user"]["id"]})
        
        return {
            "status": "success",
            "access_token": result["access_token"],
            "refresh_token": result["refresh_token"],
            "token_type": result.get("token_type", "bearer"),
            "user": result["user"]
        }
    except ValueError as e:
        from ...infrastructure.utils import log_line
        log_line("signin_failed", {"email": login_data.email, "error": str(e)})
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        from ...infrastructure.utils import log_line
        log_line("signin_error", {"email": login_data.email, "error": str(e), "trace": traceback.format_exc()})
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")


@router.post("/refresh")
async def refresh_token(refresh_token: str) -> Dict[str, Any]:
    """Refresh access token."""
    from ...infrastructure.auth import verify_token, create_access_token
    
    try:
        payload = verify_token(refresh_token, token_type="refresh")
        user_id = payload.get("sub")
        
        # Verify refresh token exists in database
        with get_db() as conn:
            token_row = conn.execute(
                """SELECT user_id, expires_at FROM refresh_tokens 
                   WHERE token = ? AND expires_at > ?""",
                (refresh_token, datetime.utcnow())
            ).fetchone()
            
            if not token_row:
                raise HTTPException(status_code=401, detail="Invalid refresh token")
            
            user = get_user_by_id(user_id)
            if not user:
                raise HTTPException(status_code=401, detail="User not found")
            
            # Create new access token
            new_access_token = create_access_token({
                "sub": user_id,
                "email": user["email"],
                "role": user["role"]
            })
            
            return {
                "status": "success",
                "access_token": new_access_token,
                "token_type": "bearer"
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token refresh failed: {str(e)}")


@router.get("/me")
async def get_current_user_info(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Get current user info."""
    return {"status": "success", "user": user}


class SignoutRequest(BaseModel):
    refresh_token: Optional[str] = None


@router.post("/signout")
async def signout(
    request_data: SignoutRequest,
    http_request: Request
) -> Dict[str, Any]:
    """Invalidate refresh token (sign out). 
    
    This endpoint is lenient - it allows signout even if tokens are expired/invalid.
    This is important because users should be able to sign out regardless of token state.
    """
    from ...infrastructure.auth import verify_token
    from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
    
    refresh_token = request_data.refresh_token
    user_id = None
    
    # Try to get user_id from refresh token
    if refresh_token:
        try:
            payload = verify_token(refresh_token, token_type="refresh")
            user_id = payload.get("sub")
        except:
            # Refresh token invalid/expired, but that's okay - we'll still try to delete it
            pass
    
    # If no user_id from refresh token, try to get from access token (optional)
    if not user_id:
        try:
            security = HTTPBearer(auto_error=False)
            credentials: Optional[HTTPAuthorizationCredentials] = await security(http_request)
            if credentials:
                try:
                    payload = verify_token(credentials.credentials)
                    user_id = payload.get("sub")
                except:
                    # Access token invalid/expired, but that's okay for signout
                    pass
        except:
            pass
    
    # Delete refresh token(s)
    with get_db() as conn:
        if user_id:
            # Delete all refresh tokens for this user (more secure - signs out all devices)
            conn.execute(
                "DELETE FROM refresh_tokens WHERE user_id = ?",
                (user_id,)
            )
        elif refresh_token:
            # Fallback: try to delete by token value
            conn.execute(
                "DELETE FROM refresh_tokens WHERE token = ?",
                (refresh_token,)
            )
        # If neither user_id nor refresh_token, just return success
        # (user might already be signed out or token already invalid)
    
    return {"status": "success", "message": "Signed out successfully"}

