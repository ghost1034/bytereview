"""
Encryption service for securing OAuth tokens and sensitive data.
Uses simple Fernet encryption in development, KMS in production.
"""
from cryptography.fernet import Fernet
import os
import logging

logger = logging.getLogger(__name__)

class EncryptionService:
    def __init__(self):
        environment = os.getenv("ENVIRONMENT", "development")
        
        if environment == "production":
            # Use KMS in production
            self._init_kms()
        else:
            # Use simple encryption in development
            self._init_simple()
    
    def _init_simple(self):
        """Initialize simple Fernet encryption for development"""
        key = os.getenv("ENCRYPTION_KEY")
        if not key:
            key = Fernet.generate_key().decode()
            logger.warning(f"Generated encryption key: {key}")
            logger.warning("Add ENCRYPTION_KEY={key} to your .env file")
        
        if isinstance(key, str):
            key = key.encode()
        
        self.cipher = Fernet(key)
        self.use_kms = False
        logger.info("Encryption service initialized with Fernet (development mode)")
    
    def _init_kms(self):
        """Initialize KMS for production"""
        try:
            from google.cloud import kms
            self.kms_client = kms.KeyManagementServiceClient()
            self.key_name = os.getenv("KMS_KEY_RESOURCE_NAME")
            if not self.key_name:
                raise ValueError("KMS_KEY_RESOURCE_NAME environment variable not set")
            self.use_kms = True
            logger.info("Encryption service initialized with Google Cloud KMS")
        except ImportError:
            logger.error("google-cloud-kms not installed, falling back to simple encryption")
            self._init_simple()
        except Exception as e:
            logger.error(f"Failed to initialize KMS: {e}, falling back to simple encryption")
            self._init_simple()
    
    def encrypt_token(self, plaintext: str) -> bytes:
        """Encrypt a token"""
        if not plaintext:
            return None
            
        try:
            if self.use_kms:
                return self._kms_encrypt(plaintext)
            else:
                return self.cipher.encrypt(plaintext.encode('utf-8'))
        except Exception as e:
            logger.error(f"Failed to encrypt token: {e}")
            raise
    
    def decrypt_token(self, ciphertext: bytes) -> str:
        """Decrypt a token"""
        if not ciphertext:
            return None
            
        try:
            if self.use_kms:
                return self._kms_decrypt(ciphertext)
            else:
                return self.cipher.decrypt(ciphertext).decode('utf-8')
        except Exception as e:
            logger.error(f"Failed to decrypt token: {e}")
            raise
    
    def _kms_encrypt(self, plaintext: str) -> bytes:
        """KMS encryption for production"""
        response = self.kms_client.encrypt(
            request={
                "name": self.key_name,
                "plaintext": plaintext.encode('utf-8')
            }
        )
        return response.ciphertext
    
    def _kms_decrypt(self, ciphertext: bytes) -> str:
        """KMS decryption for production"""
        response = self.kms_client.decrypt(
            request={
                "name": self.key_name,
                "ciphertext": ciphertext
            }
        )
        return response.plaintext.decode('utf-8')

# Singleton instance
encryption_service = EncryptionService()