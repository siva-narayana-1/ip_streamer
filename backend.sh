#!/bin/bash
# Backend Deployment Script
# Usage: sudo ./backend.sh
# Assumes repo is already cloned to current directory

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  RTSP Viewer - Backend Deployment                        ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "❌ This script must be run as root (use: sudo ./backend.sh)"
  exit 1
fi

# Check if we're in the right directory
if [ ! -d "backend" ]; then
  echo "❌ backend/ not found. Run this script from the project root directory."
  exit 1
fi

cd backend

# Check prerequisites
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not installed. Install it first."
  exit 1
fi

if ! command -v ffmpeg &> /dev/null; then
  echo "⚠ ffmpeg not installed. Videos won't stream without it."
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
  echo "⚠ Edit .env with your database credentials:"
  echo "   nano $PWD/.env"
  echo ""
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install 2>&1 | tail -3

# Create database
echo ""
echo "🗄 Setting up database..."
node scripts/create-db.js 2>/dev/null || echo "ℹ Database check completed"

# Create systemd service
SERVICE_NAME="rtsp-viewer-backend"
SCRIPT_DIR="$(pwd)"

echo ""
echo "📋 Creating systemd service..."
tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null <<EOF
[Unit]
Description=RTSP Viewer Backend API
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=$SCRIPT_DIR
Environment="NODE_ENV=production"
EnvironmentFile=$SCRIPT_DIR/.env
ExecStart=$(which node) server.js
Restart=always
RestartSec=10s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
echo "🚀 Starting backend service..."
systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl restart $SERVICE_NAME

sleep 2
if systemctl is-active --quiet $SERVICE_NAME; then
  echo "✓ Backend is running"
else
  echo "❌ Backend failed to start. Check logs:"
  echo "   journalctl -u $SERVICE_NAME -e"
  exit 1
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  ✓ Backend deployment complete                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "Backend is running on port 3000 (local only)"
echo ""
echo "Service commands:"
echo "  View logs:  sudo journalctl -u $SERVICE_NAME -f"
echo "  Restart:    sudo systemctl restart $SERVICE_NAME"
echo ""
echo "Next: Run './frontend.sh' to deploy the frontend"
