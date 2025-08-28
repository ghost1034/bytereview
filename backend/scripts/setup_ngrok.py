#!/usr/bin/env python3
"""
Setup script for ngrok integration with Gmail Pub/Sub

This script helps set up ngrok for development and automatically
updates the Pub/Sub subscription with the ngrok URL.

Usage:
    python setup_ngrok.py [--port PORT] [--update-subscription]
"""
import os
import sys
import json
import time
import argparse
import subprocess
import requests
from pathlib import Path

# Add the backend directory to Python path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
load_dotenv()

def check_ngrok_installed():
    """Check if ngrok is installed"""
    try:
        result = subprocess.run(['ngrok', 'version'], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✅ ngrok is installed: {result.stdout.strip()}")
            return True
        else:
            print("❌ ngrok is not installed or not in PATH")
            return False
    except FileNotFoundError:
        print("❌ ngrok is not installed")
        return False

def install_ngrok_instructions():
    """Print instructions for installing ngrok"""
    print("\n" + "="*60)
    print("NGROK INSTALLATION INSTRUCTIONS")
    print("="*60)
    print("\n1. Go to https://ngrok.com/download")
    print("2. Sign up for a free account")
    print("3. Download ngrok for your platform")
    print("4. Install ngrok:")
    print("\n   macOS (with Homebrew):")
    print("   brew install ngrok/ngrok/ngrok")
    print("\n   Linux:")
    print("   sudo snap install ngrok")
    print("\n   Windows:")
    print("   Download and extract the .exe file")
    print("\n5. Authenticate ngrok:")
    print("   ngrok config add-authtoken YOUR_AUTHTOKEN")
    print("   (Get your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken)")

def get_ngrok_tunnels():
    """Get active ngrok tunnels"""
    try:
        response = requests.get('http://localhost:4040/api/tunnels', timeout=5)
        if response.status_code == 200:
            return response.json()
        else:
            return None
    except requests.exceptions.RequestException:
        return None

def start_ngrok_tunnel(port=8000):
    """Start ngrok tunnel for the specified port"""
    print(f"Starting ngrok tunnel for port {port}...")
    
    # Start ngrok in the background
    try:
        process = subprocess.Popen(
            ['ngrok', 'http', str(port)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        # Wait a moment for ngrok to start
        time.sleep(3)
        
        # Check if ngrok is running
        tunnels = get_ngrok_tunnels()
        if tunnels and tunnels.get('tunnels'):
            for tunnel in tunnels['tunnels']:
                if tunnel.get('proto') == 'https':
                    public_url = tunnel['public_url']
                    print(f"✅ ngrok tunnel started: {public_url}")
                    return public_url, process
        
        print("❌ Failed to get ngrok tunnel URL")
        process.terminate()
        return None, None
        
    except FileNotFoundError:
        print("❌ ngrok command not found")
        return None, None
    except Exception as e:
        print(f"❌ Error starting ngrok: {e}")
        return None, None

def update_pubsub_subscription(webhook_url):
    """Update Google Cloud Pub/Sub subscription with new webhook URL"""
    try:
        project_id = os.getenv('GOOGLE_CLOUD_PROJECT_ID')
        topic_name = os.getenv('GMAIL_PUBSUB_TOPIC', 'gmail-central-notifications')
        subscription_name = os.getenv('GMAIL_PUBSUB_SUBSCRIPTION', 'gmail-central-webhook')
        
        if not project_id:
            print("❌ GOOGLE_CLOUD_PROJECT_ID not set")
            return False
        
        # Update the push config
        push_endpoint = f"{webhook_url}/api/webhooks/gmail-push"
        
        cmd = [
            'gcloud', 'pubsub', 'subscriptions', 'modify-push-config',
            subscription_name,
            f'--push-endpoint={push_endpoint}'
        ]
        
        print(f"Updating Pub/Sub subscription with endpoint: {push_endpoint}")
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print("✅ Pub/Sub subscription updated successfully")
            return True
        else:
            print(f"❌ Failed to update Pub/Sub subscription: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"❌ Error updating Pub/Sub subscription: {e}")
        return False

def save_ngrok_url(url):
    """Save ngrok URL to a file for other scripts to use"""
    try:
        ngrok_file = backend_dir / '.ngrok_url'
        with open(ngrok_file, 'w') as f:
            f.write(url)
        print(f"💾 Saved ngrok URL to {ngrok_file}")
    except Exception as e:
        print(f"⚠️  Failed to save ngrok URL: {e}")

def load_saved_ngrok_url():
    """Load previously saved ngrok URL"""
    try:
        ngrok_file = backend_dir / '.ngrok_url'
        if ngrok_file.exists():
            with open(ngrok_file, 'r') as f:
                return f.read().strip()
    except Exception:
        pass
    return None

def main():
    parser = argparse.ArgumentParser(description="Setup ngrok for Gmail Pub/Sub development")
    parser.add_argument("--port", type=int, default=8000, help="Port to tunnel (default: 8000)")
    parser.add_argument("--update-subscription", action="store_true", 
                       help="Update Google Cloud Pub/Sub subscription with ngrok URL")
    parser.add_argument("--check-existing", action="store_true",
                       help="Check for existing ngrok tunnels")
    
    args = parser.parse_args()
    
    print("🚀 Setting up ngrok for Gmail Pub/Sub development...")
    
    # Check if ngrok is installed
    if not check_ngrok_installed():
        install_ngrok_instructions()
        return
    
    # Check for existing tunnels
    if args.check_existing:
        tunnels = get_ngrok_tunnels()
        if tunnels and tunnels.get('tunnels'):
            print("\n📡 Active ngrok tunnels:")
            for tunnel in tunnels['tunnels']:
                print(f"  {tunnel['proto']}: {tunnel['public_url']} -> {tunnel['config']['addr']}")
            
            # Find HTTPS tunnel
            for tunnel in tunnels['tunnels']:
                if tunnel.get('proto') == 'https':
                    public_url = tunnel['public_url']
                    print(f"\n✅ Found existing HTTPS tunnel: {public_url}")
                    
                    if args.update_subscription:
                        update_pubsub_subscription(public_url)
                    
                    save_ngrok_url(public_url)
                    print(f"\n🎉 Use this webhook URL: {public_url}/api/webhooks/gmail-push")
                    return
        else:
            print("📡 No active ngrok tunnels found")
    
    # Start new tunnel
    public_url, process = start_ngrok_tunnel(args.port)
    
    if public_url:
        save_ngrok_url(public_url)
        
        print(f"\n🎉 ngrok tunnel is ready!")
        print(f"   Public URL: {public_url}")
        print(f"   Webhook URL: {public_url}/api/webhooks/gmail-push")
        print(f"   Local server: http://localhost:{args.port}")
        print(f"   ngrok dashboard: http://localhost:4040")
        
        if args.update_subscription:
            update_pubsub_subscription(public_url)
        
        print(f"\n📝 Next steps:")
        print(f"1. Make sure your FastAPI server is running on port {args.port}")
        print(f"2. Update your Pub/Sub subscription (if not done automatically):")
        print(f"   gcloud pubsub subscriptions modify-push-config gmail-central-webhook \\")
        print(f"     --push-endpoint='{public_url}/api/webhooks/gmail-push'")
        print(f"3. Test your webhook endpoint")
        
        try:
            print(f"\n⏳ ngrok tunnel is running. Press Ctrl+C to stop...")
            process.wait()
        except KeyboardInterrupt:
            print(f"\n🛑 Stopping ngrok tunnel...")
            process.terminate()
            
            # Clean up saved URL
            try:
                ngrok_file = backend_dir / '.ngrok_url'
                if ngrok_file.exists():
                    ngrok_file.unlink()
            except Exception:
                pass
    else:
        print("❌ Failed to start ngrok tunnel")

if __name__ == "__main__":
    main()