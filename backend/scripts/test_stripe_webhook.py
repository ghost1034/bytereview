#!/usr/bin/env python3
"""
Test script for Stripe webhook endpoint
"""
import os
import json
import time
import hmac
import hashlib
import requests
from dotenv import load_dotenv

load_dotenv()

def create_stripe_signature(payload: str, secret: str, timestamp: int) -> str:
    """Create a valid Stripe signature for testing"""
    # Remove 'whsec_' prefix from secret
    if secret.startswith('whsec_'):
        secret = secret[6:]
    
    # Create the signed payload
    signed_payload = f"{timestamp}.{payload}"
    
    # Create HMAC signature
    signature = hmac.new(
        secret.encode('utf-8'),
        signed_payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return f"t={timestamp},v1={signature}"

def test_webhook_endpoint(base_url: str = "http://localhost:8000"):
    """Test the Stripe webhook endpoint with a mock event"""
    
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    if not webhook_secret:
        print("❌ STRIPE_WEBHOOK_SECRET not found in environment")
        return False
    
    # Mock checkout.session.completed event
    mock_event = {
        "id": "evt_test_webhook",
        "object": "event",
        "api_version": "2020-08-27",
        "created": int(time.time()),
        "data": {
            "object": {
                "id": "cs_test_123",
                "object": "checkout.session",
                "mode": "subscription",
                "status": "complete",
                "subscription": "sub_test_123",
                "metadata": {
                    "user_id": "test_user_123",
                    "plan_code": "basic"
                }
            }
        },
        "livemode": False,
        "pending_webhooks": 1,
        "request": {
            "id": "req_test_123",
            "idempotency_key": None
        },
        "type": "checkout.session.completed"
    }
    
    payload = json.dumps(mock_event)
    timestamp = int(time.time())
    signature = create_stripe_signature(payload, webhook_secret, timestamp)
    
    headers = {
        "Content-Type": "application/json",
        "Stripe-Signature": signature
    }
    
    webhook_url = f"{base_url}/api/webhooks/stripe"
    
    print(f"🧪 Testing webhook endpoint: {webhook_url}")
    print(f"📝 Event type: {mock_event['type']}")
    print(f"🔐 Signature: {signature[:50]}...")
    
    try:
        response = requests.post(webhook_url, data=payload, headers=headers, timeout=10)
        
        if response.status_code == 200:
            print("✅ Webhook test successful!")
            print(f"📄 Response: {response.json()}")
            return True
        else:
            print(f"❌ Webhook test failed with status {response.status_code}")
            print(f"📄 Response: {response.text}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        return False

def test_webhook_verification():
    """Test webhook signature verification"""
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    if not webhook_secret:
        print("❌ STRIPE_WEBHOOK_SECRET not found")
        return False
    
    print("🔐 Testing webhook signature verification...")
    
    # Test payload
    payload = '{"test": "data"}'
    timestamp = int(time.time())
    signature = create_stripe_signature(payload, webhook_secret, timestamp)
    
    print(f"✅ Generated signature: {signature}")
    print(f"✅ Timestamp: {timestamp}")
    print(f"✅ Payload: {payload}")
    
    return True

if __name__ == "__main__":
    print("🚀 Stripe Webhook Test")
    print("=" * 40)
    
    # Test signature generation
    if not test_webhook_verification():
        exit(1)
    
    print("\n" + "=" * 40)
    
    # Test webhook endpoint
    base_url = input("Enter your server URL (default: http://localhost:8000): ").strip()
    if not base_url:
        base_url = "http://localhost:8000"
    
    success = test_webhook_endpoint(base_url)
    
    if success:
        print("\n🎉 All tests passed!")
    else:
        print("\n❌ Tests failed!")
        exit(1)