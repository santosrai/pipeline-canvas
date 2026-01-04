"""Migration 003: Add admin features tables.

Adds admin_audit_log and admin_preferences tables for admin dashboard functionality.
"""

import sqlite3
from pathlib import Path


def get_db():
    """Get database connection."""
    from database.db import get_db as _get_db
    return _get_db()


def create_admin_audit_log_table():
    """Create admin_audit_log table."""
    print("\nCreating admin_audit_log table...")
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS admin_audit_log (
                id TEXT PRIMARY KEY,
                admin_id TEXT NOT NULL,
                action_type TEXT NOT NULL,
                target_type TEXT,
                target_id TEXT,
                details TEXT,
                ip_address TEXT,
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (admin_id) REFERENCES users(id)
            )
        """)
        
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_id 
            ON admin_audit_log(admin_id)
        """)
        
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_admin_audit_action_type 
            ON admin_audit_log(action_type)
        """)
        
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at 
            ON admin_audit_log(created_at)
        """)
        
        print("  ✓ Created admin_audit_log table with indexes")


def create_admin_preferences_table():
    """Create admin_preferences table."""
    print("\nCreating admin_preferences table...")
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS admin_preferences (
                admin_id TEXT PRIMARY KEY,
                privacy_mode BOOLEAN DEFAULT 0,
                masked_fields TEXT,
                default_page_size INTEGER DEFAULT 25,
                preferred_view TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (admin_id) REFERENCES users(id)
            )
        """)
        
        print("  ✓ Created admin_preferences table")


def run_migration():
    """Run the migration."""
    print("=" * 60)
    print("Migration 003: Admin Features")
    print("=" * 60)
    
    create_admin_audit_log_table()
    create_admin_preferences_table()
    
    print("\n" + "=" * 60)
    print("Migration 003 completed successfully!")
    print("=" * 60)


if __name__ == "__main__":
    run_migration()
