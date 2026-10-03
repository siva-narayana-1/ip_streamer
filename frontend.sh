#!/bin/bash
# Frontend Deployment Script
# Usage: sudo ./frontend.sh
# Assumes repo is already cloned to current directory

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  RTSP Viewer - Frontend Deployment                       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "❌ This script must be run as root (use: sudo ./frontend.sh)"
  exit 1
fi

# Check if we're in the right directory
if [ ! -d "frontend" ]; then
  echo "❌ frontend/ not found. Run this script from the project root directory."
  exit 1
fi

cd frontend

# Check prerequisites
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not installed."
  exit 1
fi

echo "✓ Node.js $(node -v)"
echo ""

# Setup .env
echo "📝 Setting up configuration..."
if [ ! -f .env ]; then
  if [ ! -f .env.example ]; then
    echo "❌ .env.example not found"
    exit 1
  fi
  cp .env.example .env
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install 2>&1 | tail -3

# Build
echo ""
echo "🏗 Building frontend..."
npm run build 2>&1 | tail -5

if [ ! -d "dist" ]; then
  echo "❌ Build failed: dist/ not found"
  exit 1
fi

# Deploy
echo ""
echo "📤 Deploying build..."
mkdir -p /srv/rtsp-viewer-frontend
cp -r dist/* /srv/rtsp-viewer-frontend/
chown -R www-data:www-data /srv/rtsp-viewer-frontend 2>/dev/null || true

# Build info
cat > /srv/rtsp-viewer-frontend/.build-info <<EOF
Build Date: $(date)
Built from: $(git -C "$(dirname "$PWD")" rev-parse --short HEAD 2>/dev/null || echo "local")
EOF

echo "✓ Frontend deployed to /srv/rtsp-viewer-frontend"

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  ✓ Frontend deployment complete                          ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "Frontend build size: $(du -sh /srv/rtsp-viewer-frontend | cut -f1)"
echo ""
echo "Next: Run 'sudo ./nginx_setup.sh' to configure nginx"
