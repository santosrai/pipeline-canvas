#!/usr/bin/env python3
"""
Script to create an admin user.

Usage:
    cd server && python database/create_admin_user.py
    OR
    python server/database/create_admin_user.py (from project root)
"""

import sys
import os
from pathlib import Path
from datetime import datetime
import uuid

# Add server directory to path
script_dir = Path(__file__).parent  # server/database/
server_dir = script_dir.parent  # server/
sys.path.insert(0, str(server_dir))

# Import database utilities
try:
    from database.db import get_db, DB_PATH
except ImportError:
    # Fallback for direct execution
    from db import get_db, DB_PATH

# Import auth utilities - use bcrypt directly to avoid jwt dependency
try:
    import bcrypt
    def hash_password(password: str) -> str:
        """Hash password using bcrypt."""
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
except ImportError:
    # Try importing from infrastructure.auth as fallback
    try:
        from infrastructure.auth import hash_password
    except (ImportError, ModuleNotFoundError):
        print("ERROR: bcrypt module not found. Please install dependencies:")
        print("  pip install bcrypt")
        print("\nOr activate the virtual environment:")
        print("  source server/venv/bin/activate")
        print("  pip install -r server/requirements.txt")
        sys.exit(1)


def create_admin_user():
    """Create admin user with email admin@gmail.com and password admin12345."""
    email = "admin@gmail.com"
    username = "admin"
    password = "admin12345"
    
    print("=" * 60)
    print("Creating Admin User")
    print("=" * 60)
    print()
    
    try:
        with get_db() as conn:
            # Check if admin user already exists
            existing = conn.execute(
                "SELECT id, email, username, role FROM users WHERE email = ? OR username = ?",
                (email, username)
            ).fetchone()
            
            if existing:
                print(f"⚠️  User already exists:")
                print(f"   Email: {existing['email']}")
                print(f"   Username: {existing['username']}")
                print(f"   Role: {existing['role']}")
                print()
                
                # Check if already admin
                if existing['role'] == 'admin':
                    print("✓ User already has admin role")
                    return existing['id']
                
                # Update to admin role
                print("Updating user to admin role...")
                conn.execute(
                    "UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?",
                    (datetime.utcnow(), existing['id'])
                )
                print("✓ User role updated to admin")
                return existing['id']
            
            # Create new admin user
            print("Creating new admin user...")
            user_id = str(uuid.uuid4())
            password_hash = hash_password(password)
            
            conn.execute(
                """INSERT INTO users (
                    id, email, username, password_hash, role, user_type,
                    email_verified, is_active, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    user_id,
                    email,
                    username,
                    password_hash,
                    'admin',
                    'human',
                    1,  # email_verified
                    1,  # is_active
                    datetime.utcnow(),
                    datetime.utcnow(),
                )
            )
            
            # Initialize credits (100 free credits)
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
            
            print("✓ Admin user created successfully!")
            print()
            print("=" * 60)
            print("Admin User Credentials:")
            print("=" * 60)
            print(f"  Email: {email}")
            print(f"  Username: {username}")
            print(f"  Password: {password}")
            print(f"  Role: admin")
            print(f"  User ID: {user_id}")
            print()
            print("You can now sign in at /signin and access /admin")
            print("=" * 60)
            
            return user_id
            
    except Exception as e:
        print(f"\n✗ Failed to create admin user: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    create_admin_user()
