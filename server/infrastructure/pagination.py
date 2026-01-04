"""Cursor-based pagination utilities."""

import base64
import json
from typing import Optional, Dict, Any, Tuple
from datetime import datetime


def encode_cursor(timestamp: str, item_id: str) -> str:
    """Encode cursor from timestamp and ID.
    
    Args:
        timestamp: ISO format timestamp string
        item_id: Item ID string
        
    Returns:
        Base64 encoded cursor string
    """
    cursor_data = f"{timestamp}_{item_id}"
    return base64.b64encode(cursor_data.encode()).decode()


def decode_cursor(cursor: str) -> Optional[Tuple[str, str]]:
    """Decode cursor to timestamp and ID.
    
    Args:
        cursor: Base64 encoded cursor string
        
    Returns:
        Tuple of (timestamp, item_id) or None if invalid
    """
    try:
        decoded = base64.b64decode(cursor.encode()).decode()
        parts = decoded.split("_", 1)
        if len(parts) == 2:
            return (parts[0], parts[1])
        return None
    except Exception:
        return None


def get_pagination_params(
    cursor: Optional[str] = None,
    limit: int = 25
) -> Tuple[Optional[str], Optional[str], int]:
    """Parse pagination parameters.
    
    Args:
        cursor: Optional cursor string
        limit: Page size (default 25, max 100)
        
    Returns:
        Tuple of (timestamp, item_id, limit)
    """
    # Clamp limit between 1 and 100
    limit = max(1, min(limit, 100))
    
    if cursor:
        decoded = decode_cursor(cursor)
        if decoded:
            return (decoded[0], decoded[1], limit)
    
    return (None, None, limit)


def create_pagination_response(
    items: list[Dict[str, Any]],
    limit: int,
    has_more: bool = False
) -> Dict[str, Any]:
    """Create paginated response with cursor.
    
    Args:
        items: List of items (each must have 'created_at' and 'id')
        limit: Page size
        has_more: Whether there are more items
        
    Returns:
        Response dict with items and next_cursor
    """
    next_cursor = None
    if has_more and items:
        last_item = items[-1]
        # Use created_at timestamp and id for cursor
        timestamp = last_item.get("created_at")
        item_id = last_item.get("id")
        if timestamp and item_id:
            # Convert datetime to ISO string if needed
            if isinstance(timestamp, datetime):
                timestamp = timestamp.isoformat()
            elif not isinstance(timestamp, str):
                timestamp = str(timestamp)
            next_cursor = encode_cursor(timestamp, item_id)
    
    return {
        "items": items,
        "next_cursor": next_cursor,
        "has_more": has_more,
        "limit": limit
    }
