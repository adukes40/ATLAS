"""
ATLAS Encryption Utilities
Uses Fernet symmetric encryption for storing secrets in database.
"""
import os
import base64
import hashlib
from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv()


def _get_fernet_key() -> bytes:
    """
    Derive a 32-byte key from SECRET_KEY for Fernet encryption.
    SECRET_KEY can be any length; we hash it to get consistent 32 bytes.
    """
    secret_key = os.getenv("SECRET_KEY", "")
    if not secret_key:
        raise RuntimeError("SECRET_KEY not configured in .env")

    # Hash the secret key to get exactly 32 bytes
    key_bytes = hashlib.sha256(secret_key.encode()).digest()
    # Fernet requires base64-encoded 32-byte key
    return base64.urlsafe_b64encode(key_bytes)


def get_fernet() -> Fernet:
    """Get Fernet instance for encryption/decryption."""
    return Fernet(_get_fernet_key())


def encrypt_value(plaintext: str) -> str:
    """
    Encrypt a string value for storage in database.
    Returns base64-encoded encrypted string.
    """
    if not plaintext:
        return ""
    fernet = get_fernet()
    encrypted = fernet.encrypt(plaintext.encode())
    return encrypted.decode()


def decrypt_value(encrypted: str) -> str:
    """
    Decrypt a value from database.
    Returns plaintext string.
    """
    if not encrypted:
        return ""
    fernet = get_fernet()
    decrypted = fernet.decrypt(encrypted.encode())
    return decrypted.decode()
