#!/bin/bash
# Complete RTSP Viewer Deployment
# Clones repo and runs all deployment scripts
# Usage: sudo ./DEPLOY-ALL.sh [directory] [frontend-domain] [backend-domain]
# Example: sudo ./DEPLOY-ALL.sh /opt/ip_streamer streamtest.sivabio.in streamtest-api.sivabio.in

set -e

REPO_URL="https://github.com/siva-narayana-1/ip_streamer.git"
DEPLOY_DIR="${1:-.}"
FRONTEND_DOMAIN="${2:-streamtest.sivabio.in}"
BACKEND_DOMAIN="${3:-streamtest-api.sivabio.in}"

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     RTSP Viewer - Complete Automated Deployment          ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "❌ This script must be run as root (use: sudo ./DEPLOY-ALL.sh)"
  exit 1
fi

echo "📋 Configuration:"
echo "  Repository: $REPO_URL"
echo "  Deploy to:  $DEPLOY_DIR"
echo "  Frontend:   $FRONTEND_DOMAIN"
echo "  Backend:    $BACKEND_DOMAIN"
echo ""
read -p "Continue? (y/n) " -n 1 -r; echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  exit 1
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Step 1: Installing Dependencies                         ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Update system
echo "📦 Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# Install Node.js if not present
if ! command -v node &> /dev/null; then
  echo "📦 Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y nodejs > /dev/null 2>&1
fi

# Install ffmpeg if not present
if ! command -v ffmpeg &> /dev/null; then
  echo "📦 Installing ffmpeg..."
  apt-get install -y ffmpeg > /dev/null 2>&1
fi

# Install PostgreSQL if not present
if ! command -v psql &> /dev/null; then
  echo "📦 Installing PostgreSQL..."
  apt-get install -y postgresql postgresql-contrib > /dev/null 2>&1
  systemctl enable postgresql > /dev/null 2>&1
  systemctl start postgresql > /dev/null 2>&1
fi

# Install nginx if not present
if ! command -v nginx &> /dev/null; then
  echo "📦 Installing nginx..."
  apt-get install -y nginx > /dev/null 2>&1
  systemctl enable nginx > /dev/null 2>&1
fi

# Install certbot if not present
if ! command -v certbot &> /dev/null; then
  echo "📦 Installing certbot..."
  apt-get install -y certbot python3-certbot-nginx > /dev/null 2>&1
fi

# Install git if not present
if ! command -v git &> /dev/null; then
  echo "📦 Installing git..."
  apt-get install -y git > /dev/null 2>&1
fi

echo "✓ Node.js $(node -v | sed 's/v//')"
echo "✓ ffmpeg $(ffmpeg -version 2>&1 | head -1 | cut -d' ' -f3)"
echo "✓ PostgreSQL installed"
echo "✓ nginx installed"
echo "✓ certbot installed"
echo ""

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Step 2: Cloning Repository                              ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Clone or update repo
if [ -d "$DEPLOY_DIR/.git" ]; then
  echo "📥 Updating existing repository..."
  cd "$DEPLOY_DIR"
  git fetch origin > /dev/null 2>&1
  git reset --hard origin/main > /dev/null 2>&1 || git reset --hard origin/master > /dev/null 2>&1
else
  echo "📥 Cloning repository..."
  mkdir -p "$(dirname "$DEPLOY_DIR")"
  git clone "$REPO_URL" "$DEPLOY_DIR" > /dev/null 2>&1
fi

cd "$DEPLOY_DIR"

# Make scripts executable
chmod +x backend.sh frontend.sh nginx_setup.sh

echo "✓ Repository ready at: $DEPLOY_DIR"
echo ""

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Step 3: Deploying Backend                               ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

./backend.sh

echo ""
echo "⚠ IMPORTANT: Set database password"
echo "  Edit: nano $DEPLOY_DIR/backend/.env"
echo "  Change: DB_PASSWORD=change_me_in_production"
echo "  Then: sudo systemctl restart rtsp-viewer-backend"
echo ""
read -p "Press Enter when done editing .env..."

# Restart backend with new password
systemctl restart rtsp-viewer-backend
sleep 2

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Step 4: Deploying Frontend                              ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

./frontend.sh

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Step 5: Configuring Nginx                               ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

./nginx_setup.sh "$FRONTEND_DOMAIN" "$BACKEND_DOMAIN"

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Step 6: Getting SSL Certificates                        ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

read -p "Ready to get SSL certificates? (y/n) " -n 1 -r; echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  certbot --nginx -d "$FRONTEND_DOMAIN" -d "$BACKEND_DOMAIN"

  echo ""
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║  Step 7: Final Configuration                             ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  echo ""

  echo "📝 Updating CORS settings..."
  sed -i "s/CORS_ORIGIN=.*/CORS_ORIGIN=https:\/\/$FRONTEND_DOMAIN,https:\/\/$BACKEND_DOMAIN/" "$DEPLOY_DIR/backend/.env"

  echo "🔄 Restarting backend..."
  systemctl restart rtsp-viewer-backend
  sleep 2

  if systemctl is-active --quiet rtsp-viewer-backend; then
    echo "✓ Backend is running with updated CORS"
  else
    echo "❌ Backend failed to start"
    journalctl -u rtsp-viewer-backend -n 10 -e
    exit 1
  fi
else
  echo "⚠ SSL setup skipped. Configure later with:"
  echo "  sudo certbot --nginx -d $FRONTEND_DOMAIN -d $BACKEND_DOMAIN"
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  ✓ DEPLOYMENT COMPLETE!                                  ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "🎉 Your RTSP Viewer is ready!"
echo ""
echo "📍 Access your app at:"
echo "   https://$FRONTEND_DOMAIN"
echo ""
echo "📁 Important locations:"
echo "   Source:         $DEPLOY_DIR"
echo "   Backend:        $DEPLOY_DIR/backend"
echo "   Frontend build: /srv/rtsp-viewer-frontend"
echo "   Nginx configs:  /etc/nginx/sites-available/"
echo "   SSL certs:      /etc/letsencrypt/live/"
echo ""
echo "🔧 Service management:"
echo "   Backend logs:   sudo journalctl -u rtsp-viewer-backend -f"
echo "   Restart backend: sudo systemctl restart rtsp-viewer-backend"
echo "   Reload nginx:   sudo systemctl reload nginx"
echo ""
echo "📝 Next steps:"
echo "   1. Add your first camera at: https://$FRONTEND_DOMAIN"
echo "   2. Set RTSP URL (or HTTP for MJPEG streams)"
echo "   3. Click 'Test connection' to verify"
echo "   4. Watch live streams!"
echo ""
echo "❓ Need help?"
echo "   Check: $DEPLOY_DIR/DEPLOY.md"
echo "   Or: $DEPLOY_DIR/README.md"
echo ""
