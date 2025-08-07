#!/usr/bin/env python3
"""
Helper script to set up ngrok for local Stripe webhook testing
"""
import os
import json
import subprocess
import time
import requests
from dotenv import load_dotenv

load_dotenv()

def start_ngrok(port: int = 8000):
    """Start ngrok tunnel for local development"""
    print(f"🚀 Starting ngrok tunnel for port {port}...")
    
    try:
        # Start ngrok in background
        process = subprocess.Popen(
            ["ngrok", "http", str(port), "--log=stdout"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        # Wait a moment for ngrok to start
        time.sleep(3)
        
        # Get the public URL from ngrok API
        try:
            response = requests.get("http://localhost:4040/api/tunnels", timeout=5)
            if response.status_code == 200:
                tunnels = response.json()["tunnels"]
                if tunnels:
                    public_url = tunnels[0]["public_url"]
                    print(f"✅ Ngrok tunnel active: {public_url}")
                    return public_url, process
        except:
            pass
        
        print("❌ Could not get ngrok URL from API")
        return None, process
        
    except FileNotFoundError:
        print("❌ ngrok not found. Please install ngrok:")
        print("   https://ngrok.com/download")
        return None, None
    except Exception as e:
        print(f"❌ Error starting ngrok: {e}")
        return None, None

def print_webhook_setup_instructions(public_url: str):
    """Print instructions for setting up the webhook in Stripe"""
    webhook_url = f"{public_url}/api/webhooks/stripe"
    
    print("\n" + "=" * 60)
    print("📋 STRIPE WEBHOOK SETUP INSTRUCTIONS")
    print("=" * 60)
    print(f"""
1. Go to your Stripe Dashboard:
   https://dashboard.stripe.com/test/webhooks

2. Click "Add endpoint"

3. Enter this URL:
   {webhook_url}

4. Select these events:
   ✅ checkout.session.completed
   ✅ customer.subscription.updated
   ✅ customer.subscription.deleted
   ✅ invoice.finalized

5. Click "Add endpoint"

6. Copy the "Signing secret" (starts with whsec_)

7. Add it to your backend/.env file:
   STRIPE_WEBHOOK_SECRET=whsec_your_secret_here

8. Test the webhook:
   python scripts/test_stripe_webhook.py
""")
    print("=" * 60)

def main():
    print("🔧 Ngrok Webhook Setup for Stripe")
    print("=" * 40)
    
    # Check if backend server is running
    try:
        response = requests.get("http://localhost:8000/docs", timeout=2)
        if response.status_code == 200:
            print("✅ Backend server is running on port 8000")
        else:
            print("⚠️  Backend server may not be running properly")
    except:
        print("❌ Backend server is not running on port 8000")
        print("   Please start it with: cd backend && python -m uvicorn main:app --reload")
        return
    
    # Start ngrok
    public_url, process = start_ngrok(8000)
    
    if not public_url:
        print("❌ Failed to start ngrok tunnel")
        return
    
    # Print setup instructions
    print_webhook_setup_instructions(public_url)
    
    try:
        print("\n🔄 Ngrok tunnel is running. Press Ctrl+C to stop...")
        process.wait()
    except KeyboardInterrupt:
        print("\n🛑 Stopping ngrok tunnel...")
        process.terminate()
        print("✅ Ngrok tunnel stopped")

if __name__ == "__main__":
    main()