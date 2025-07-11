"""
Centralized Firebase configuration and initialization
"""
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth, firestore as admin_firestore
import os
import logging

logger = logging.getLogger(__name__)

class FirebaseConfig:
    _instance = None
    _initialized = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(FirebaseConfig, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not self._initialized:
            self._initialize_firebase()
            self._initialized = True
    
    def _initialize_firebase(self):
        """Initialize Firebase Admin SDK once"""
        if not firebase_admin._apps:
            try:
                service_account_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
                if service_account_path and os.path.exists(service_account_path):
                    cred = credentials.Certificate(service_account_path)
                    firebase_admin.initialize_app(cred)
                    logger.info("Firebase initialized with service account")
                else:
                    # Use default credentials for development
                    firebase_admin.initialize_app()
                    logger.info("Firebase initialized with default credentials")
            except Exception as e:
                logger.warning(f"Firebase initialization failed: {e}")
                raise
    
    @property
    def auth(self):
        """Get Firebase Auth instance"""
        return firebase_auth
    
    @property
    def firestore(self):
        """Get Firestore client"""
        try:
            return admin_firestore.client()
        except Exception as e:
            logger.error(f"Failed to get Firestore client: {e}")
            return None

# Singleton instance
firebase_config = FirebaseConfig()