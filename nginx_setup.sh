#!/bin/bash
# Nginx Configuration Setup
# Usage: sudo ./nginx_setup.sh [frontend-domain] [backend-domain]
# Example: sudo ./nginx_setup.sh streamtest.sivabio.in streamtest-api.sivabio.in

set -e

FRONTEND_DOMAIN="${1:-streamtest.sivabio.in}"
BACKEND_DOMAIN="${2:-streamtest-api.sivabio.in}"

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Nginx Configuration Setup                               ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "Configuration:"
echo "  Frontend: $FRONTEND_DOMAIN"
echo "  Backend:  $BACKEND_DOMAIN"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "❌ This script must be run as root"
  exit 1
fi

# Check nginx
if ! command -v nginx &> /dev/null; then
  echo "❌ Nginx not installed"
  exit 1
fi

echo "✓ Nginx $(nginx -v 2>&1 | cut -d' ' -f3)"
echo ""

NGINX_SITES="/etc/nginx/sites-available"
NGINX_ENABLED="/etc/nginx/sites-enabled"

# Frontend config
echo "📝 Creating frontend config..."
tee "$NGINX_SITES/$FRONTEND_DOMAIN" > /dev/null <<'NGINX_FRONTEND'
server {
    listen 80;
    listen [::]:80;
    server_name FRONTEND_DOMAIN;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name FRONTEND_DOMAIN;

    ssl_certificate /etc/letsencrypt/live/FRONTEND_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/FRONTEND_DOMAIN/privkey.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    root /srv/rtsp-viewer-frontend;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 30d;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
    }

    access_log /var/log/nginx/FRONTEND_DOMAIN-access.log;
    error_log /var/log/nginx/FRONTEND_DOMAIN-error.log warn;
}
NGINX_FRONTEND

sed -i "s|FRONTEND_DOMAIN|$FRONTEND_DOMAIN|g" "$NGINX_SITES/$FRONTEND_DOMAIN"

# Backend config
echo "📝 Creating backend config..."
tee "$NGINX_SITES/$BACKEND_DOMAIN" > /dev/null <<'NGINX_BACKEND'
server {
    listen 80;
    listen [::]:80;
    server_name BACKEND_DOMAIN;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name BACKEND_DOMAIN;

    ssl_certificate /etc/letsencrypt/live/BACKEND_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/BACKEND_DOMAIN/privkey.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
    }

    location / {
        return 301 https://FRONTEND_DOMAIN/;
    }

    access_log /var/log/nginx/BACKEND_DOMAIN-access.log;
    error_log /var/log/nginx/BACKEND_DOMAIN-error.log warn;
}
NGINX_BACKEND

sed -i "s|BACKEND_DOMAIN|$BACKEND_DOMAIN|g" "$NGINX_SITES/$BACKEND_DOMAIN"
sed -i "s|FRONTEND_DOMAIN|$FRONTEND_DOMAIN|g" "$NGINX_SITES/$BACKEND_DOMAIN"

# Enable sites
echo "🔗 Enabling sites..."
ln -sf "$NGINX_SITES/$FRONTEND_DOMAIN" "$NGINX_ENABLED/$FRONTEND_DOMAIN" 2>/dev/null || true
ln -sf "$NGINX_SITES/$BACKEND_DOMAIN" "$NGINX_ENABLED/$BACKEND_DOMAIN" 2>/dev/null || true

# Test config
echo "🧪 Testing nginx config..."
if nginx -t 2>&1 | grep -q "successful"; then
  echo "✓ Config valid"
else
  echo "❌ Config error:"
  nginx -t
  exit 1
fi

# Reload nginx
echo "🔄 Reloading nginx..."
systemctl enable nginx
systemctl reload nginx

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  ✓ Nginx setup complete                                  ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "Get SSL certificates:"
echo "  sudo certbot --nginx -d $FRONTEND_DOMAIN -d $BACKEND_DOMAIN"
echo ""
echo "After certificates are installed:"
echo "  1. Edit: sudo nano backend/.env"
echo "  2. Update: CORS_ORIGIN=https://$FRONTEND_DOMAIN,https://$BACKEND_DOMAIN"
echo "  3. Restart: sudo systemctl restart rtsp-viewer-backend"
echo ""
echo "Then access: https://$FRONTEND_DOMAIN"
