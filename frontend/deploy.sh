#!/bin/bash
# Frontend deployment script
# Usage: ./deploy.sh [dev|prod]

set -e
ENVIRONMENT="${1:-prod}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== RTSP Viewer Frontend Deployment ($ENVIRONMENT) ==="

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed"
  exit 1
fi
echo "✓ Node.js $(node -v)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check .env
if [ ! -f .env ]; then
  if [ ! -f .env.example ]; then
    echo "❌ No .env.example found"
    exit 1
  fi
  echo "📝 Creating .env from .env.example"
  cp .env.example .env
  echo "ℹ Using default VITE_API_URL=http://localhost:3000"
fi

# Build (required for prod)
if [ "$ENVIRONMENT" = "prod" ]; then
  echo "🏗 Building for production..."
  npm run build
  if [ ! -d dist ]; then
    echo "❌ Build failed"
    exit 1
  fi
  echo "✓ Build complete (dist/)"
fi

# Start server
if [ "$ENVIRONMENT" = "dev" ]; then
  echo "🚀 Starting frontend in DEV mode (hot reload, port 5173)"
  npm run dev
else
  echo "🚀 Starting frontend in PROD mode (serving dist/, port 5173)"
  npm start
fi
