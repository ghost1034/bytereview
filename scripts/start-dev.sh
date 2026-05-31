#!/bin/bash

# ByteReview Development Environment Startup Script

echo "🚀 Starting ByteReview Development Environment"
echo "=============================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop and try again."
    exit 1
fi

echo "✅ Docker is running"

# Start PostgreSQL container
echo "🗄️ Starting PostgreSQL container..."
if docker ps -a --format "table {{.Names}}" | grep -q "bytereview-postgres-dev"; then
    echo "📦 PostgreSQL container exists, starting..."
    docker start bytereview-postgres-dev
else
    echo "📦 Creating PostgreSQL container..."
    docker run -d --name bytereview-postgres-dev \
        -p 5432:5432 \
        -e POSTGRES_USER=bytereview \
        -e POSTGRES_PASSWORD=bytereview \
        -e POSTGRES_DB=bytereview_dev \
        postgres:15-alpine
fi

# Wait for containers to be ready
echo "⏳ Waiting for containers to be ready..."
sleep 5

# Check container health
echo "🔍 Checking container status..."
if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "bytereview-postgres-dev.*Up"; then
    echo "✅ PostgreSQL is running"
else
    echo "❌ PostgreSQL failed to start"
    exit 1
fi

echo ""
echo "🎉 Development environment is ready!"
echo ""
echo "Next steps:"
echo "1. cd backend && pip install -r requirements.txt"
echo "2. cd backend && python scripts/setup_migration.py"
echo "3. cd backend && uvicorn main:app --reload"
echo "4. In another terminal: npm run dev"
echo ""
echo "API Documentation: http://localhost:8000/api/docs"
echo "Frontend: http://localhost:3000"
echo ""
echo "To stop containers: docker stop bytereview-postgres-dev"
