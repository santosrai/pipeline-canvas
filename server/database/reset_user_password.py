#!/usr/bin/env python3
"""
Script to reset a user's password.

Usage:
    cd server && python database/reset_user_password.py <email> <new_password>
    OR
    python server/database/reset_user_password.py <email> <new_password> (from project root)
"""

import sys
import os
from pathlib import Path
from datetime import datetime

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

# Import auth utilities
try:
    import bcrypt
    def hash_password(password: str) -> str:
        """Hash password using bcrypt."""
        password_bytes = password.encode("utf-8")
        salt = bcrypt.gensalt()
        hash_bytes = bcrypt.hashpw(password_bytes, salt)
        return hash_bytes.decode("utf-8")
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


def reset_user_password(email: str, new_password: str):
    """Reset password for a user."""
    print("=" * 60)
    print("Reset User Password")
    print("=" * 60)
    print()
    
    try:
        with get_db() as conn:
            # Check if user exists
            user = conn.execute(
                "SELECT id, email, username, role FROM users WHERE email = ?",
                (email,)
            ).fetchone()
            
            if not user:
                print(f"❌ User not found: {email}")
                return False
            
            print(f"Found user:")
            print(f"  Email: {user['email']}")
            print(f"  Username: {user['username']}")
            print(f"  Role: {user['role']}")
            print()
            
            # Hash new password
            print("Hashing new password...")
            password_hash = hash_password(new_password)
            
            # Update password
            print("Updating password in database...")
            conn.execute(
                "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                (password_hash, datetime.utcnow(), user['id'])
            )
            
            print()
            print("=" * 60)
            print("Password Reset Successful!")
            print("=" * 60)
            print(f"  Email: {email}")
            print(f"  New Password: {new_password}")
            print()
            print("You can now sign in with the new password.")
            print("=" * 60)
            
            return True
            
    except Exception as e:
        print(f"❌ Error resetting password: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    if len(sys.argv) != 3:
        print("Usage: python reset_user_password.py <email> <new_password>")
        print()
        print("Example:")
        print("  python reset_user_password.py user1@gmail.com newpassword123")
        sys.exit(1)
    
    email = sys.argv[1]
    new_password = sys.argv[2]
    
    if len(new_password) < 6:
        print("❌ Error: Password must be at least 6 characters long")
        sys.exit(1)
    
    success = reset_user_password(email, new_password)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
