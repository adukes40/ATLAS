#!/usr/bin/env python3
"""
One-time migration: re-encrypt all secrets from old key (SHA256 of SECRET_KEY)
to the new dedicated ENCRYPTION_KEY (Fernet key).

Usage: ./venv/bin/python3 scripts/migrate_encryption_key.py
"""
import os
import sys
import base64
import hashlib

# Add parent dir to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from cryptography.fernet import Fernet, InvalidToken
from app.database import SessionLocal
from app.models import AppSettings
from app.services.settings_service import SECRET_KEYS


def get_old_fernet():
    """Build Fernet from old derivation method (SHA256 of SECRET_KEY)."""
    secret_key = os.getenv("SECRET_KEY", "")
    key_bytes = hashlib.sha256(secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key_bytes))


def get_new_fernet():
    """Build Fernet from new ENCRYPTION_KEY (direct Fernet key)."""
    enc_key = os.getenv("ENCRYPTION_KEY", "")
    if not enc_key:
        print("ERROR: ENCRYPTION_KEY not found in .env")
        sys.exit(1)
    return Fernet(enc_key.encode())


def main():
    old_f = get_old_fernet()
    new_f = get_new_fernet()

    db = SessionLocal()
    try:
        migrated = 0
        skipped = 0
        for key_name in SECRET_KEYS:
            setting = db.query(AppSettings).filter(AppSettings.key == key_name).first()
            if not setting or not setting.value:
                continue

            # Try decrypting with old key
            try:
                plaintext = old_f.decrypt(setting.value.encode()).decode()
            except InvalidToken:
                # Maybe already encrypted with new key, or not encrypted
                print(f"  SKIP {key_name}: could not decrypt with old key (may already be migrated)")
                skipped += 1
                continue

            # Re-encrypt with new key
            new_encrypted = new_f.encrypt(plaintext.encode()).decode()
            setting.value = new_encrypted
            migrated += 1
            print(f"  OK   {key_name}: re-encrypted successfully")

        db.commit()
        print(f"\nMigration complete: {migrated} re-encrypted, {skipped} skipped")

    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
