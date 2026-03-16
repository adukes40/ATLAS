"""
ATLAS Encryption Utilities
Uses Fernet symmetric encryption for storing secrets in database.
"""
import os
from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv()


def _get_fernet_key() -> bytes:
    """
    Get the Fernet encryption key from ENCRYPTION_KEY environment variable.
    ENCRYPTION_KEY must be a valid Fernet key (base64-encoded 32-byte key).
    """
    encryption_key = os.getenv("ENCRYPTION_KEY", "")
    if not encryption_key:
        raise RuntimeError(
            "ENCRYPTION_KEY not configured in .env. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )

    return encryption_key.encode()


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
