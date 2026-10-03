#!/bin/bash
# Backend deployment script
# Usage: ./deploy.sh [dev|prod]

set -e
ENVIRONMENT="${1:-prod}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== RTSP Viewer Backend Deployment ($ENVIRONMENT) ==="

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed"
  exit 1
fi
echo "✓ Node.js $(node -v)"

# Check ffmpeg
if ! command -v ffmpeg &> /dev/null; then
  echo "⚠ ffmpeg not found on PATH (set FFMPEG_PATH in .env if needed)"
fi

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
  echo "⚠ Edit .env with your database credentials"
  exit 1
fi

# Parse .env for database settings
export $(grep -v '^#' .env | grep DB_ | xargs)

# Create database (first time only)
echo "🗄 Creating database if needed..."
node scripts/create-db.js || {
  echo "⚠ Database setup failed (may already exist)"
}

# Start server
if [ "$ENVIRONMENT" = "dev" ]; then
  echo "🚀 Starting backend in DEV mode (auto-restart on changes)"
  npm run dev
else
  echo "🚀 Starting backend in PROD mode"
  npm start
fi
