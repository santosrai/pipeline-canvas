"""Admin service functions for user metrics, masking, and audit logging."""

import json
import uuid
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta

try:
    from ...database.db import get_db
    from ...infrastructure.utils import log_line
except ImportError:
    from database.db import get_db
    from infrastructure.utils import log_line


def mask_email(email: Optional[str]) -> str:
    """Mask email address for privacy."""
    if not email:
        return ""
    if "@" not in email:
        return "u***"
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked_local = "u***"
    else:
        masked_local = local[0] + "***" + local[-1] if len(local) > 2 else "u***"
    
    if "." in domain:
        domain_parts = domain.split(".")
        masked_domain = domain_parts[0][0] + "***." + ".".join(domain_parts[1:])
    else:
        masked_domain = domain[0] + "***"
    
    return f"{masked_local}@{masked_domain}"


def mask_username(username: Optional[str]) -> str:
    """Mask username for privacy."""
    if not username:
        return ""
    if len(username) <= 2:
        return "u***"
    return username[0] + "***" + username[-1] if len(username) > 2 else "u***"


def mask_user_data(user: Dict[str, Any], privacy_mode: bool = False) -> Dict[str, Any]:
    """Mask PII in user data if privacy mode is enabled."""
    if not privacy_mode:
        return user
    
    masked = user.copy()
    if "email" in masked:
        masked["email"] = mask_email(masked.get("email"))
    if "username" in masked:
        masked["username"] = mask_username(masked.get("username"))
    # Never show password hash
    if "password_hash" in masked:
        del masked["password_hash"]
    
    return masked


def calculate_user_metrics(user_id: str) -> Dict[str, Any]:
    """Calculate user activity metrics."""
    with get_db() as conn:
        # Messages per day (last 30 days)
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        messages_count = conn.execute(
            """SELECT COUNT(*) as count FROM chat_messages 
               WHERE user_id = ? AND created_at > ?""",
            (user_id, thirty_days_ago)
        ).fetchone()["count"]
        messages_per_day = round(messages_count / 30, 2) if messages_count > 0 else 0
        
        # Total sessions
        total_sessions = conn.execute(
            "SELECT COUNT(*) as count FROM chat_sessions WHERE user_id = ?",
            (user_id,)
        ).fetchone()["count"]
        
        # Total messages
        total_messages = conn.execute(
            "SELECT COUNT(*) as count FROM chat_messages WHERE user_id = ?",
            (user_id,)
        ).fetchone()["count"]
        
        # Most used agent (from message metadata)
        agent_usage = conn.execute(
            """SELECT metadata FROM chat_messages 
               WHERE user_id = ? AND metadata IS NOT NULL""",
            (user_id,)
        ).fetchall()
        
        agent_counts = {}
        for row in agent_usage:
            try:
                metadata = json.loads(row["metadata"]) if isinstance(row["metadata"], str) else row["metadata"]
                agent_id = metadata.get("agentId") or metadata.get("agent_id")
                if agent_id:
                    agent_counts[agent_id] = agent_counts.get(agent_id, 0) + 1
            except:
                pass
        
        most_used_agent = max(agent_counts.items(), key=lambda x: x[1])[0] if agent_counts else None
        
        # Account age in days
        user = conn.execute(
            "SELECT created_at FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()
        
        account_age_days = 0
        if user and user.get("created_at"):
            created_at = user["created_at"]
            if isinstance(created_at, str):
                created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            account_age_days = (datetime.utcnow() - created_at.replace(tzinfo=None)).days
        
        # Credit usage rate (spent per day)
        credit_transactions = conn.execute(
            """SELECT SUM(ABS(amount)) as total FROM credit_transactions 
               WHERE user_id = ? AND amount < 0 AND created_at > ?""",
            (user_id, thirty_days_ago)
        ).fetchone()["total"] or 0
        credit_usage_rate = round(credit_transactions / 30, 2) if credit_transactions > 0 else 0
        
        return {
            "messages_per_day": messages_per_day,
            "total_sessions": total_sessions,
            "total_messages": total_messages,
            "most_used_agent": most_used_agent,
            "account_age_days": account_age_days,
            "credit_usage_rate": credit_usage_rate
        }


def log_admin_action(
    admin_id: str,
    action_type: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None
) -> None:
    """Log admin action to audit log."""
    audit_id = str(uuid.uuid4())
    
    with get_db() as conn:
        conn.execute(
            """INSERT INTO admin_audit_log 
               (id, admin_id, action_type, target_type, target_id, details, ip_address, user_agent)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                audit_id,
                admin_id,
                action_type,
                target_type,
                target_id,
                json.dumps(details) if details else None,
                ip_address,
                user_agent
            )
        )
    
    # Also log to infrastructure logger
    log_line("admin_action", {
        "admin_id": admin_id,
        "action_type": action_type,
        "target_type": target_type,
        "target_id": target_id,
        "details": details
    })
