"""
Setup script for ByteReview migration
Handles database initialization and data population
"""
import sys
import os
from pathlib import Path

# Add the parent directory to the path so we can import our modules
sys.path.append(str(Path(__file__).parent.parent))

import subprocess
from core.database import init_database
from scripts.populate_initial_data import main as populate_data

def run_command(command, description):
    """Run a shell command and handle errors"""
    print(f"\n{description}...")
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description} completed successfully")
        if result.stdout:
            print(result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} failed")
        print(f"Error: {e}")
        if e.stdout:
            print(f"STDOUT: {e.stdout}")
        if e.stderr:
            print(f"STDERR: {e.stderr}")
        return False

def check_docker():
    """Check if Docker containers are running"""
    print("\n🔍 Checking Docker containers...")
    
    # Check PostgreSQL
    postgres_check = subprocess.run(
        "docker ps --filter name=bytereview-postgres-dev --format '{{.Names}}'",
        shell=True, capture_output=True, text=True
    )
    
    redis_check = subprocess.run(
        "docker ps --filter name=bytereview-redis-dev --format '{{.Names}}'",
        shell=True, capture_output=True, text=True
    )
    
    postgres_running = "bytereview-postgres-dev" in postgres_check.stdout
    redis_running = "bytereview-redis-dev" in redis_check.stdout
    
    if postgres_running:
        print("✅ PostgreSQL container is running")
    else:
        print("❌ PostgreSQL container is not running")
        print("   Please start it with: docker run -d --name bytereview-postgres-dev -p 5432:5432 -e POSTGRES_USER=bytereview -e POSTGRES_PASSWORD=bytereview -e POSTGRES_DB=bytereview_dev postgres:15-alpine")
    
    if redis_running:
        print("✅ Redis container is running")
    else:
        print("❌ Redis container is not running")
        print("   Please start it with: docker run -d --name bytereview-redis-dev -p 6379:6379 redis:7-alpine")
    
    return postgres_running and redis_running

def setup_database():
    """Set up the database schema and initial data"""
    print("\n🗄️ Setting up database...")
    
    # Run Alembic migration
    if not run_command("cd backend && alembic upgrade head", "Running database migrations"):
        return False
    
    # Populate initial data
    try:
        print("\n📊 Populating initial data...")
        populate_data()
        print("✅ Initial data populated successfully")
        return True
    except Exception as e:
        print(f"❌ Failed to populate initial data: {e}")
        return False

def create_env_file():
    """Create .env file if it doesn't exist"""
    env_path = Path(__file__).parent.parent / ".env"
    env_example_path = Path(__file__).parent.parent / ".env.example"
    
    if not env_path.exists():
        if env_example_path.exists():
            print("\n📝 Creating .env file from .env.example...")
            with open(env_example_path, 'r') as example_file:
                content = example_file.read()
            
            with open(env_path, 'w') as env_file:
                env_file.write(content)
            
            print("✅ .env file created")
            print("⚠️  Please update the .env file with your actual configuration values")
        else:
            print("❌ .env.example file not found")
            return False
    else:
        print("✅ .env file already exists")
    
    return True

def main():
    """Main setup function"""
    print("🚀 ByteReview Migration Setup")
    print("=" * 50)
    
    # Check if we're in the right directory
    if not Path("backend").exists():
        print("❌ Please run this script from the project root directory")
        sys.exit(1)
    
    # Create .env file
    if not create_env_file():
        print("❌ Setup failed: Could not create .env file")
        sys.exit(1)
    
    # Check Docker containers
    if not check_docker():
        print("\n❌ Setup cannot continue: Docker containers are not running")
        print("\nPlease start the required containers and run this script again.")
        sys.exit(1)
    
    # Set up database
    if not setup_database():
        print("❌ Setup failed: Database setup failed")
        sys.exit(1)
    
    print("\n🎉 Migration setup completed successfully!")
    print("\nNext steps:")
    print("1. Update your .env file with actual configuration values")
    print("2. Install Python dependencies: cd backend && pip install -r requirements.txt")
    print("3. Start the FastAPI server: cd backend && python -m uvicorn main:app --reload")
    print("4. Start the ARQ worker: cd backend && python -m arq worker.WorkerSettings --watch")
    print("5. Start the Next.js frontend: npm run dev")

if __name__ == "__main__":
    main()