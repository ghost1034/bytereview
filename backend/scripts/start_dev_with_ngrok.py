#!/usr/bin/env python3
"""
Development script to start FastAPI server and ngrok together

This script starts both the FastAPI server and ngrok tunnel,
then optionally updates the Pub/Sub subscription.

Usage:
    python start_dev_with_ngrok.py [--port PORT] [--update-pubsub]
"""
import os
import sys
import time
import signal
import argparse
import subprocess
import threading
from pathlib import Path

# Add the backend directory to Python path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

def start_fastapi_server(port=8000):
    """Start FastAPI server"""
    print(f"🚀 Starting FastAPI server on port {port}...")
    
    # Change to backend directory
    os.chdir(backend_dir)
    
    # Start uvicorn
    cmd = [
        sys.executable, '-m', 'uvicorn', 
        'main:app', 
        '--host', '0.0.0.0', 
        '--port', str(port),
        '--reload'
    ]
    
    return subprocess.Popen(cmd)

def start_ngrok_and_update(port=8000, update_pubsub=False):
    """Start ngrok and optionally update Pub/Sub"""
    print(f"🌐 Starting ngrok tunnel...")
    
    # Wait a moment for FastAPI to start
    time.sleep(2)
    
    # Start ngrok setup script
    cmd = [
        sys.executable, 
        str(backend_dir / 'scripts' / 'setup_ngrok.py'),
        '--port', str(port),
        '--check-existing'
    ]
    
    if update_pubsub:
        cmd.append('--update-subscription')
    
    return subprocess.Popen(cmd)

def signal_handler(signum, frame, processes):
    """Handle Ctrl+C to stop all processes"""
    print(f"\n🛑 Stopping all processes...")
    for process in processes:
        if process and process.poll() is None:
            process.terminate()
    
    # Wait a moment for graceful shutdown
    time.sleep(1)
    
    # Force kill if needed
    for process in processes:
        if process and process.poll() is None:
            process.kill()
    
    sys.exit(0)

def main():
    parser = argparse.ArgumentParser(description="Start FastAPI server with ngrok for development")
    parser.add_argument("--port", type=int, default=8000, help="Port for FastAPI server (default: 8000)")
    parser.add_argument("--update-pubsub", action="store_true", 
                       help="Automatically update Google Cloud Pub/Sub subscription")
    
    args = parser.parse_args()
    
    print("🔧 Starting development environment with ngrok...")
    print(f"   FastAPI server: http://localhost:{args.port}")
    print(f"   Auto-update Pub/Sub: {'Yes' if args.update_pubsub else 'No'}")
    
    processes = []
    
    try:
        # Start FastAPI server
        fastapi_process = start_fastapi_server(args.port)
        processes.append(fastapi_process)
        
        # Start ngrok
        ngrok_process = start_ngrok_and_update(args.port, args.update_pubsub)
        processes.append(ngrok_process)
        
        # Set up signal handler for Ctrl+C
        signal.signal(signal.SIGINT, lambda s, f: signal_handler(s, f, processes))
        
        print(f"\n✅ Development environment started!")
        print(f"📊 FastAPI server: http://localhost:{args.port}")
        print(f"📊 ngrok dashboard: http://localhost:4040")
        print(f"📊 API docs: http://localhost:{args.port}/api/docs")
        print(f"\n⏳ Both services are running. Press Ctrl+C to stop...")
        
        # Wait for processes
        while True:
            # Check if FastAPI process is still running
            if fastapi_process.poll() is not None:
                print("❌ FastAPI server stopped unexpectedly")
                break
            
            # Check if ngrok process is still running
            if ngrok_process.poll() is not None:
                print("❌ ngrok process stopped unexpectedly")
                break
            
            time.sleep(1)
            
    except KeyboardInterrupt:
        signal_handler(signal.SIGINT, None, processes)
    except Exception as e:
        print(f"❌ Error: {e}")
        signal_handler(signal.SIGINT, None, processes)

if __name__ == "__main__":
    main()