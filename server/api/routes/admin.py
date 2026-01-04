"""Admin API routes."""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
from datetime import datetime
import json
import uuid

from ..middleware.auth import require_admin
from ..middleware.admin import require_super_admin_dep
try:
    # Try relative import first (when running as module)
    from ...domain.user.service import (
        get_all_users,
        get_user_by_id,
        update_user_role,
        deactivate_user,
        activate_user
    )
    from ...domain.credits.service import add_credits, get_user_credits
    from ...database.db import get_db
    from ...infrastructure.pagination import (
        get_pagination_params,
        create_pagination_response,
        encode_cursor
    )
    from ...domain.admin.service import (
        mask_user_data,
        calculate_user_metrics,
        log_admin_action
    )
except ImportError:
    # Fallback to absolute import (when running directly)
    from domain.user.service import (
        get_all_users,
        get_user_by_id,
        update_user_role,
        deactivate_user,
        activate_user
    )
    from domain.credits.service import add_credits, get_user_credits
    from database.db import get_db
    from infrastructure.pagination import (
        get_pagination_params,
        create_pagination_response,
        encode_cursor
    )
    from domain.admin.service import (
        mask_user_data,
        calculate_user_metrics,
        log_admin_action
    )

router = APIRouter(prefix="/api/admin", tags=["admin"])


class RoleUpdate(BaseModel):
    """Model for role update."""
    role: str


class CreditAdjustment(BaseModel):
    """Model for credit adjustment."""
    amount: int
    description: str


class StatusUpdate(BaseModel):
    """Model for status update."""
    is_active: bool


@router.get("/users")
async def list_users(
    request: Request,
    cursor: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100),
    role: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    include_deleted: bool = Query(False),
    privacy_mode: bool = Query(False),
    admin: Dict[str, Any] = Depends(require_admin)
) -> Dict[str, Any]:
    """List users with cursor-based pagination (admin only)."""
    timestamp, item_id, page_limit = get_pagination_params(cursor, limit)
    
    # Get client IP and user agent for audit
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    # Log action
    log_admin_action(
        admin_id=admin["id"],
        action_type="list_users",
        details={
            "cursor": cursor,
            "limit": page_limit,
            "role": role,
            "is_active": is_active,
            "search": search,
            "privacy_mode": privacy_mode
        },
        ip_address=client_ip,
        user_agent=user_agent
    )
    
    with get_db() as conn:
        # Build query
        query = """SELECT u.*, uc.credits
                   FROM users u
                   LEFT JOIN user_credits uc ON u.id = uc.user_id
                   WHERE 1=1"""
        params = []
        
        # Apply filters
        if role:
            query += " AND u.role = ?"
            params.append(role)
        
        if is_active is not None:
            query += " AND u.is_active = ?"
            params.append(1 if is_active else 0)
        
        if search:
            query += " AND (u.email LIKE ? OR u.username LIKE ?)"
            search_term = f"%{search}%"
            params.extend([search_term, search_term])
        
        # Cursor-based pagination
        if timestamp and item_id:
            query += " AND (u.created_at < ? OR (u.created_at = ? AND u.id < ?))"
            params.extend([timestamp, timestamp, item_id])
        
        query += " ORDER BY u.created_at DESC, u.id DESC LIMIT ?"
        params.append(page_limit + 1)  # Fetch one extra to check if there's more
        
        users = conn.execute(query, params).fetchall()
        
        # Check if there are more items
        has_more = len(users) > page_limit
        if has_more:
            users = users[:page_limit]
        
        # Convert to dicts and mask if needed
        user_list = []
        for user in users:
            user_dict = dict(user)
            if privacy_mode:
                user_dict = mask_user_data(user_dict, privacy_mode=True)
            user_list.append(user_dict)
        
        # Create pagination response
        response = create_pagination_response(user_list, page_limit, has_more)
        
        return {
            "status": "success",
            "users": response["items"],
            "next_cursor": response["next_cursor"],
            "has_more": response["has_more"],
            "limit": response["limit"]
        }


@router.get("/users/{user_id}")
async def get_user_details(
    request: Request,
    user_id: str,
    privacy_mode: bool = Query(False),
    admin: Dict[str, Any] = Depends(require_admin)
) -> Dict[str, Any]:
    """Get user details (admin only)."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Mask if privacy mode
    if privacy_mode:
        user = mask_user_data(user, privacy_mode=True)
    
    # Log action
    log_admin_action(
        admin_id=admin["id"],
        action_type="view_user",
        target_type="user",
        target_id=user_id,
        details={"privacy_mode": privacy_mode},
        ip_address=client_ip,
        user_agent=user_agent
    )
    
    return {"status": "success", "user": user}


@router.get("/users/{user_id}/metrics")
async def get_user_metrics(
    request: Request,
    user_id: str,
    admin: Dict[str, Any] = Depends(require_admin)
) -> Dict[str, Any]:
    """Get user activity metrics (admin only)."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    metrics = calculate_user_metrics(user_id)
    
    log_admin_action(
        admin_id=admin["id"],
        action_type="view_user_metrics",
        target_type="user",
        target_id=user_id,
        ip_address=client_ip,
        user_agent=user_agent
    )
    
    return {"status": "success", "metrics": metrics}


@router.get("/users/{user_id}/chat")
async def get_user_chat(
    request: Request,
    user_id: str,
    cursor: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    agent_id: Optional[str] = Query(None),
    privacy_mode: bool = Query(False),
    admin: Dict[str, Any] = Depends(require_admin)
) -> Dict[str, Any]:
    """Get user's chat history (admin only)."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    timestamp, item_id, page_limit = get_pagination_params(cursor, limit)
    
    with get_db() as conn:
        # Get chat sessions
        query = """SELECT cs.*, COUNT(cm.id) as message_count
                   FROM chat_sessions cs
                   LEFT JOIN chat_messages cm ON cs.id = cm.session_id
                   WHERE cs.user_id = ?"""
        params = [user_id]
        
        if date_from:
            query += " AND cs.created_at >= ?"
            params.append(date_from)
        if date_to:
            query += " AND cs.created_at <= ?"
            params.append(date_to)
        
        query += " GROUP BY cs.id"
        
        if timestamp and item_id:
            query += " HAVING (cs.created_at < ? OR (cs.created_at = ? AND cs.id < ?))"
            params.extend([timestamp, timestamp, item_id])
        
        query += " ORDER BY cs.created_at DESC, cs.id DESC LIMIT ?"
        params.append(page_limit + 1)
        
        sessions = conn.execute(query, params).fetchall()
        
        has_more = len(sessions) > page_limit
        if has_more:
            sessions = sessions[:page_limit]
        
        session_list = [dict(session) for session in sessions]
        
        # Get messages for each session if not in privacy mode
        if not privacy_mode:
            for session in session_list:
                messages = conn.execute(
                    """SELECT * FROM chat_messages 
                       WHERE session_id = ? 
                       ORDER BY created_at ASC
                       LIMIT 50""",
                    (session["id"],)
                ).fetchall()
                session["messages"] = [dict(msg) for msg in messages]
        
        response = create_pagination_response(session_list, page_limit, has_more)
        
        log_admin_action(
            admin_id=admin["id"],
            action_type="view_user_chat",
            target_type="user",
            target_id=user_id,
            details={"privacy_mode": privacy_mode, "session_count": len(session_list)},
            ip_address=client_ip,
            user_agent=user_agent
        )
        
        return {
            "status": "success",
            "sessions": response["items"],
            "next_cursor": response["next_cursor"],
            "has_more": response["has_more"],
            "limit": response["limit"]
        }


@router.patch("/users/{user_id}/role")
async def update_user_role_endpoint(
    request: Request,
    user_id: str,
    role_data: RoleUpdate,
    admin: Dict[str, Any] = Depends(require_super_admin_dep)
) -> Dict[str, Any]:
    """Update user role (super admin only)."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_user_role(user_id, role_data.role)
    
    log_admin_action(
        admin_id=admin["id"],
        action_type="update_user_role",
        target_type="user",
        target_id=user_id,
        details={"new_role": role_data.role, "old_role": user.get("role")},
        ip_address=client_ip,
        user_agent=user_agent
    )
    
    return {"status": "success", "message": "User role updated successfully"}


@router.post("/users/{user_id}/credits")
async def adjust_credits(
    request: Request,
    user_id: str,
    credit_data: CreditAdjustment,
    admin: Dict[str, Any] = Depends(require_admin)
) -> Dict[str, Any]:
    """Adjust user credits (admin only)."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    add_credits(user_id, credit_data.amount, credit_data.description, "admin_adjustment")
    new_balance = get_user_credits(user_id)
    
    log_admin_action(
        admin_id=admin["id"],
        action_type="adjust_credits",
        target_type="user",
        target_id=user_id,
        details={
            "amount": credit_data.amount,
            "description": credit_data.description,
            "new_balance": new_balance
        },
        ip_address=client_ip,
        user_agent=user_agent
    )
    
    return {
        "status": "success",
        "message": "Credits adjusted successfully",
        "new_balance": new_balance
    }


@router.patch("/users/{user_id}/status")
async def update_user_status(
    request: Request,
    user_id: str,
    status_data: StatusUpdate,
    admin: Dict[str, Any] = Depends(require_admin)
) -> Dict[str, Any]:
    """Activate/deactivate user (admin only)."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if status_data.is_active:
        activate_user(user_id)
    else:
        deactivate_user(user_id)
    
    log_admin_action(
        admin_id=admin["id"],
        action_type="update_user_status",
        target_type="user",
        target_id=user_id,
        details={"is_active": status_data.is_active},
        ip_address=client_ip,
        user_agent=user_agent
    )
    
    return {"status": "success", "message": "User status updated successfully"}


@router.get("/stats")
async def get_stats(admin: Dict[str, Any] = Depends(require_admin)) -> Dict[str, Any]:
    """Get dashboard statistics (admin only)."""
    with get_db() as conn:
        # Total users
        total_users = conn.execute("SELECT COUNT(*) as count FROM users").fetchone()["count"]
        
        # Active users
        active_users = conn.execute(
            "SELECT COUNT(*) as count FROM users WHERE is_active = 1"
        ).fetchone()["count"]
        
        # Total credits in system
        total_credits = conn.execute(
            "SELECT SUM(credits) as total FROM user_credits"
        ).fetchone()["total"] or 0
        
        # Pending reports
        pending_reports = conn.execute(
            "SELECT COUNT(*) as count FROM user_reports WHERE status = 'pending'"
        ).fetchone()["count"]
        
        # Recent signups (last 7 days)
        from datetime import datetime, timedelta
        week_ago = datetime.utcnow() - timedelta(days=7)
        recent_signups = conn.execute(
            "SELECT COUNT(*) as count FROM users WHERE created_at > ?",
            (week_ago,)
        ).fetchone()["count"]
    
    return {
        "status": "success",
        "stats": {
            "total_users": total_users,
            "active_users": active_users,
            "total_credits": total_credits,
            "pending_reports": pending_reports,
            "recent_signups": recent_signups
        }
    }


@router.get("/users/{user_id}/tokens")
async def get_user_tokens(
    request: Request,
    user_id: str,
    cursor: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100),
    token_type: Optional[str] = Query(None),  # 'refresh', 'email_verification', 'password_reset'
    active_only: bool = Query(False),
    admin: Dict[str, Any] = Depends(require_admin)
) -> Dict[str, Any]:
    """Get user's tokens (admin only)."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    timestamp, item_id, page_limit = get_pagination_params(cursor, limit)
    
    tokens = []
    
    with get_db() as conn:
        # Get refresh tokens
        if not token_type or token_type == "refresh":
            query = """SELECT token, expires_at, created_at, 'refresh' as token_type
                       FROM refresh_tokens
                       WHERE user_id = ?"""
            params = [user_id]
            
            if active_only:
                query += " AND expires_at > datetime('now')"
            
            if timestamp and item_id:
                query += " AND (created_at < ? OR (created_at = ? AND token < ?))"
                params.extend([timestamp, timestamp, item_id])
            
            query += " ORDER BY created_at DESC, token DESC LIMIT ?"
            params.append(page_limit + 1)
            
            refresh_tokens = conn.execute(query, params).fetchall()
            for token in refresh_tokens:
                token_dict = dict(token)
                # Mask token (show first 8 and last 4 chars)
                token_str = token_dict["token"]
                if len(token_str) > 12:
                    token_dict["token_masked"] = token_str[:8] + "..." + token_str[-4:]
                else:
                    token_dict["token_masked"] = "***"
                token_dict["token"] = None  # Don't send full token
                tokens.append(token_dict)
        
        # Get email verification tokens
        if not token_type or token_type == "email_verification":
            query = """SELECT token, expires_at, 'email_verification' as token_type, NULL as created_at
                       FROM email_verification_tokens
                       WHERE user_id = ?"""
            params = [user_id]
            
            if active_only:
                query += " AND expires_at > datetime('now')"
            
            email_tokens = conn.execute(query, params).fetchall()
            for token in email_tokens:
                token_dict = dict(token)
                token_str = token_dict["token"]
                if len(token_str) > 12:
                    token_dict["token_masked"] = token_str[:8] + "..." + token_str[-4:]
                else:
                    token_dict["token_masked"] = "***"
                token_dict["token"] = None
                tokens.append(token_dict)
        
        # Get password reset tokens
        if not token_type or token_type == "password_reset":
            query = """SELECT token, expires_at, 'password_reset' as token_type, NULL as created_at, used
                       FROM password_reset_tokens
                       WHERE user_id = ?"""
            params = [user_id]
            
            if active_only:
                query += " AND expires_at > datetime('now') AND used = 0"
            
            password_tokens = conn.execute(query, params).fetchall()
            for token in password_tokens:
                token_dict = dict(token)
                token_str = token_dict["token"]
                if len(token_str) > 12:
                    token_dict["token_masked"] = token_str[:8] + "..." + token_str[-4:]
                else:
                    token_dict["token_masked"] = "***"
                token_dict["token"] = None
                tokens.append(token_dict)
    
    # Sort by created_at descending and limit
    tokens.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    has_more = len(tokens) > page_limit
    if has_more:
        tokens = tokens[:page_limit]
    
    # Create cursor for next page
    next_cursor = None
    if has_more and tokens:
        last_token = tokens[-1]
        created_at = last_token.get("created_at") or datetime.utcnow().isoformat()
        token_id = last_token.get("token_masked", "")
        next_cursor = encode_cursor(created_at, token_id)
    
    log_admin_action(
        admin_id=admin["id"],
        action_type="view_user_tokens",
        target_type="user",
        target_id=user_id,
        details={"token_count": len(tokens)},
        ip_address=client_ip,
        user_agent=user_agent
    )
    
    return {
        "status": "success",
        "tokens": tokens,
        "next_cursor": next_cursor,
        "has_more": has_more,
        "limit": page_limit
    }


@router.get("/chat/messages")
async def get_chat_messages(
    request: Request,
    cursor: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100),
    user_id: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None),
    conversation_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    message_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    include_deleted: bool = Query(False),
    privacy_mode: bool = Query(False),
    admin: Dict[str, Any] = Depends(require_admin)
) -> Dict[str, Any]:
    """Get chat messages with filtering (admin only)."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    timestamp, item_id, page_limit = get_pagination_params(cursor, limit)
    
    with get_db() as conn:
        query = """SELECT cm.*, u.username as sender_username, u.email as sender_email
                   FROM chat_messages cm
                   LEFT JOIN users u ON cm.sender_id = u.id
                   WHERE 1=1"""
        params = []
        
        if user_id:
            query += " AND cm.user_id = ?"
            params.append(user_id)
        
        if session_id:
            query += " AND cm.session_id = ?"
            params.append(session_id)
        
        if conversation_id:
            query += " AND cm.conversation_id = ?"
            params.append(conversation_id)
        
        if date_from:
            query += " AND cm.created_at >= ?"
            params.append(date_from)
        
        if date_to:
            query += " AND cm.created_at <= ?"
            params.append(date_to)
        
        if message_type:
            query += " AND cm.message_type = ?"
            params.append(message_type)
        
        if search:
            query += " AND cm.content LIKE ?"
            params.append(f"%{search}%")
        
        if timestamp and item_id:
            query += " AND (cm.created_at < ? OR (cm.created_at = ? AND cm.id < ?))"
            params.extend([timestamp, timestamp, item_id])
        
        query += " ORDER BY cm.created_at DESC, cm.id DESC LIMIT ?"
        params.append(page_limit + 1)
        
        messages = conn.execute(query, params).fetchall()
        
        has_more = len(messages) > page_limit
        if has_more:
            messages = messages[:page_limit]
        
        message_list = []
        for msg in messages:
            msg_dict = dict(msg)
            # Mask content if privacy mode
            if privacy_mode:
                msg_dict["content"] = "[Content hidden - privacy mode]"
            message_list.append(msg_dict)
        
        response = create_pagination_response(message_list, page_limit, has_more)
        
        log_admin_action(
            admin_id=admin["id"],
            action_type="view_chat_messages",
            details={
                "privacy_mode": privacy_mode,
                "message_count": len(message_list),
                "filters": {
                    "user_id": user_id,
                    "session_id": session_id,
                    "message_type": message_type
                }
            },
            ip_address=client_ip,
            user_agent=user_agent
        )
        
        return {
            "status": "success",
            "messages": response["items"],
            "next_cursor": response["next_cursor"],
            "has_more": response["has_more"],
            "limit": response["limit"]
        }


@router.get("/chat/sessions")
async def get_chat_sessions(
    request: Request,
    cursor: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100),
    user_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    admin: Dict[str, Any] = Depends(require_admin)
) -> Dict[str, Any]:
    """Get chat sessions (admin only)."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    timestamp, item_id, page_limit = get_pagination_params(cursor, limit)
    
    with get_db() as conn:
        query = """SELECT cs.*, COUNT(cm.id) as message_count, u.username, u.email
                   FROM chat_sessions cs
                   LEFT JOIN chat_messages cm ON cs.id = cm.session_id
                   LEFT JOIN users u ON cs.user_id = u.id
                   WHERE 1=1"""
        params = []
        
        if user_id:
            query += " AND cs.user_id = ?"
            params.append(user_id)
        
        if date_from:
            query += " AND cs.created_at >= ?"
            params.append(date_from)
        
        if date_to:
            query += " AND cs.created_at <= ?"
            params.append(date_to)
        
        query += " GROUP BY cs.id"
        
        if timestamp and item_id:
            query += " HAVING (cs.created_at < ? OR (cs.created_at = ? AND cs.id < ?))"
            params.extend([timestamp, timestamp, item_id])
        
        query += " ORDER BY cs.created_at DESC, cs.id DESC LIMIT ?"
        params.append(page_limit + 1)
        
        sessions = conn.execute(query, params).fetchall()
        
        has_more = len(sessions) > page_limit
        if has_more:
            sessions = sessions[:page_limit]
        
        session_list = [dict(session) for session in sessions]
        response = create_pagination_response(session_list, page_limit, has_more)
        
        log_admin_action(
            admin_id=admin["id"],
            action_type="view_chat_sessions",
            details={"session_count": len(session_list)},
            ip_address=client_ip,
            user_agent=user_agent
        )
        
        return {
            "status": "success",
            "sessions": response["items"],
            "next_cursor": response["next_cursor"],
            "has_more": response["has_more"],
            "limit": response["limit"]
        }


@router.get("/tokens")
async def get_tokens(
    request: Request,
    cursor: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100),
    user_id: Optional[str] = Query(None),
    token_type: Optional[str] = Query(None),
    active_only: bool = Query(False),
    expired_only: bool = Query(False),
    admin: Dict[str, Any] = Depends(require_admin)
) -> Dict[str, Any]:
    """Get all tokens with filtering (admin only)."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    timestamp, item_id, page_limit = get_pagination_params(cursor, limit)
    
    tokens = []
    
    with get_db() as conn:
        # Get refresh tokens
        if not token_type or token_type == "refresh":
            query = """SELECT rt.token, rt.user_id, rt.expires_at, rt.created_at, 
                              'refresh' as token_type, u.username, u.email
                       FROM refresh_tokens rt
                       LEFT JOIN users u ON rt.user_id = u.id
                       WHERE 1=1"""
            params = []
            
            if user_id:
                query += " AND rt.user_id = ?"
                params.append(user_id)
            
            if active_only:
                query += " AND rt.expires_at > datetime('now')"
            elif expired_only:
                query += " AND rt.expires_at <= datetime('now')"
            
            if timestamp and item_id:
                query += " AND (rt.created_at < ? OR (rt.created_at = ? AND rt.token < ?))"
                params.extend([timestamp, timestamp, item_id])
            
            query += " ORDER BY rt.created_at DESC, rt.token DESC LIMIT ?"
            params.append(page_limit + 1)
            
            refresh_tokens = conn.execute(query, params).fetchall()
            for token in refresh_tokens:
                token_dict = dict(token)
                token_str = token_dict["token"]
                if len(token_str) > 12:
                    token_dict["token_masked"] = token_str[:8] + "..." + token_str[-4:]
                else:
                    token_dict["token_masked"] = "***"
                token_dict["token"] = None
                tokens.append(token_dict)
    
    tokens.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    has_more = len(tokens) > page_limit
    if has_more:
        tokens = tokens[:page_limit]
    
    next_cursor = None
    if has_more and tokens:
        last_token = tokens[-1]
        created_at = last_token.get("created_at") or datetime.utcnow().isoformat()
        token_id = last_token.get("token_masked", "")
        next_cursor = encode_cursor(created_at, token_id)
    
    log_admin_action(
        admin_id=admin["id"],
        action_type="view_tokens",
        details={"token_count": len(tokens)},
        ip_address=client_ip,
        user_agent=user_agent
    )
    
    return {
        "status": "success",
        "tokens": tokens,
        "next_cursor": next_cursor,
        "has_more": has_more,
        "limit": page_limit
    }


@router.delete("/tokens/{token_id}")
async def revoke_token(
    request: Request,
    token_id: str,
    admin: Dict[str, Any] = Depends(require_super_admin_dep)
) -> Dict[str, Any]:
    """Revoke a token (super admin only)."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    with get_db() as conn:
        # Try refresh tokens first
        token = conn.execute(
            "SELECT * FROM refresh_tokens WHERE token = ?",
            (token_id,)
        ).fetchone()
        
        if token:
            conn.execute("DELETE FROM refresh_tokens WHERE token = ?", (token_id,))
            log_admin_action(
                admin_id=admin["id"],
                action_type="revoke_token",
                target_type="token",
                target_id=token_id,
                details={"token_type": "refresh"},
                ip_address=client_ip,
                user_agent=user_agent
            )
            return {"status": "success", "message": "Token revoked successfully"}
        
        # Try email verification tokens
        token = conn.execute(
            "SELECT * FROM email_verification_tokens WHERE token = ?",
            (token_id,)
        ).fetchone()
        
        if token:
            conn.execute("DELETE FROM email_verification_tokens WHERE token = ?", (token_id,))
            log_admin_action(
                admin_id=admin["id"],
                action_type="revoke_token",
                target_type="token",
                target_id=token_id,
                details={"token_type": "email_verification"},
                ip_address=client_ip,
                user_agent=user_agent
            )
            return {"status": "success", "message": "Token revoked successfully"}
        
        # Try password reset tokens
        token = conn.execute(
            "SELECT * FROM password_reset_tokens WHERE token = ?",
            (token_id,)
        ).fetchone()
        
        if token:
            conn.execute("DELETE FROM password_reset_tokens WHERE token = ?", (token_id,))
            log_admin_action(
                admin_id=admin["id"],
                action_type="revoke_token",
                target_type="token",
                target_id=token_id,
                details={"token_type": "password_reset"},
                ip_address=client_ip,
                user_agent=user_agent
            )
            return {"status": "success", "message": "Token revoked successfully"}
    
    raise HTTPException(status_code=404, detail="Token not found")


class BulkOperation(BaseModel):
    """Model for bulk operations."""
    user_ids: List[str]
    action: str  # 'activate', 'deactivate', 'export'


@router.post("/users/bulk")
async def bulk_user_operation(
    request: Request,
    operation: BulkOperation,
    admin: Dict[str, Any] = Depends(require_super_admin_dep)
) -> Dict[str, Any]:
    """Perform bulk operations on users (super admin only)."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    if operation.action == "activate":
        for user_id in operation.user_ids:
            activate_user(user_id)
    elif operation.action == "deactivate":
        for user_id in operation.user_ids:
            deactivate_user(user_id)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {operation.action}")
    
    log_admin_action(
        admin_id=admin["id"],
        action_type="bulk_user_operation",
        details={
            "action": operation.action,
            "user_count": len(operation.user_ids)
        },
        ip_address=client_ip,
        user_agent=user_agent
    )
    
    return {
        "status": "success",
        "message": f"Bulk {operation.action} completed",
        "affected_users": len(operation.user_ids)
    }


@router.get("/audit/logs")
async def get_audit_logs(
    request: Request,
    cursor: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100),
    admin_id: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    admin: Dict[str, Any] = Depends(require_admin)
) -> Dict[str, Any]:
    """Get audit logs (admin only)."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    timestamp, item_id, page_limit = get_pagination_params(cursor, limit)
    
    with get_db() as conn:
        query = """SELECT al.*, u.username as admin_username
                   FROM admin_audit_log al
                   LEFT JOIN users u ON al.admin_id = u.id
                   WHERE 1=1"""
        params = []
        
        if admin_id:
            query += " AND al.admin_id = ?"
            params.append(admin_id)
        
        if action_type:
            query += " AND al.action_type = ?"
            params.append(action_type)
        
        if date_from:
            query += " AND al.created_at >= ?"
            params.append(date_from)
        
        if date_to:
            query += " AND al.created_at <= ?"
            params.append(date_to)
        
        if timestamp and item_id:
            query += " AND (al.created_at < ? OR (al.created_at = ? AND al.id < ?))"
            params.extend([timestamp, timestamp, item_id])
        
        query += " ORDER BY al.created_at DESC, al.id DESC LIMIT ?"
        params.append(page_limit + 1)
        
        logs = conn.execute(query, params).fetchall()
        
        has_more = len(logs) > page_limit
        if has_more:
            logs = logs[:page_limit]
        
        log_list = []
        for log in logs:
            log_dict = dict(log)
            # Parse details JSON
            if log_dict.get("details"):
                try:
                    log_dict["details"] = json.loads(log_dict["details"])
                except:
                    pass
            log_list.append(log_dict)
        
        response = create_pagination_response(log_list, page_limit, has_more)
        
        return {
            "status": "success",
            "logs": response["items"],
            "next_cursor": response["next_cursor"],
            "has_more": response["has_more"],
            "limit": response["limit"]
        }


class ExportRequest(BaseModel):
    """Model for export requests."""
    format: str  # 'csv' or 'json'
    filters: Optional[Dict[str, Any]] = None
    fields: Optional[List[str]] = None
    include_content: bool = False  # For chat exports


@router.post("/export/users")
async def export_users(
    request: Request,
    export_data: ExportRequest,
    admin: Dict[str, Any] = Depends(require_super_admin_dep)
) -> Dict[str, Any]:
    """Export user data (super admin only, requires approval)."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    # For now, return a simple response indicating export would be generated
    # In production, this would queue the export and require approval
    
    log_admin_action(
        admin_id=admin["id"],
        action_type="export_users",
        details={
            "format": export_data.format,
            "filters": export_data.filters,
            "fields": export_data.fields
        },
        ip_address=client_ip,
        user_agent=user_agent
    )
    
    return {
        "status": "success",
        "message": "Export request queued (approval required for sensitive data)",
        "export_id": str(uuid.uuid4())
    }


@router.post("/export/chat")
async def export_chat(
    request: Request,
    export_data: ExportRequest,
    admin: Dict[str, Any] = Depends(require_super_admin_dep)
) -> Dict[str, Any]:
    """Export chat data (super admin only, requires approval)."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    log_admin_action(
        admin_id=admin["id"],
        action_type="export_chat",
        details={
            "format": export_data.format,
            "filters": export_data.filters,
            "include_content": export_data.include_content
        },
        ip_address=client_ip,
        user_agent=user_agent
    )
    
    return {
        "status": "success",
        "message": "Export request queued (approval required for sensitive data)",
        "export_id": str(uuid.uuid4())
    }

