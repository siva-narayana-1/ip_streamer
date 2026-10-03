# 🚀 Deployment Guide

**Repository:** https://github.com/siva-narayana-1/ip_streamer.git  
**Frontend:** streamtest.sivabio.in  
**Backend API:** streamtest-api.sivabio.in

---

## Quick Deploy (3 Steps)

### Step 1: Clone Repository
```bash
git clone https://github.com/siva-narayana-1/ip_streamer.git
cd ip_streamer
```

### Step 2: Deploy Backend
```bash
sudo ./backend.sh
```

What it does:
- ✓ npm install
- ✓ Creates PostgreSQL database
- ✓ Creates systemd service (rtsp-viewer-backend)
- ✓ Starts backend on port 3000

**Then edit database password:**
```bash
sudo nano backend/.env
# Change: DB_PASSWORD=change_me_in_production
sudo systemctl restart rtsp-viewer-backend
```

### Step 3: Deploy Frontend
```bash
sudo ./frontend.sh
```

What it does:
- ✓ npm install
- ✓ npm run build (Vite)
- ✓ Deploys to /srv/rtsp-viewer-frontend

### Step 4: Setup Nginx
```bash
sudo ./nginx_setup.sh streamtest.sivabio.in streamtest-api.sivabio.in
```

What it does:
- ✓ Creates /etc/nginx/sites-available configs
- ✓ Enables reverse proxy
- ✓ Reloads nginx

### Step 5: Get SSL Certificates
```bash
sudo certbot --nginx -d streamtest.sivabio.in -d streamtest-api.sivabio.in
```

### Step 6: Update Backend CORS
```bash
sudo nano backend/.env
```

Change:
```
CORS_ORIGIN=https://streamtest.sivabio.in,https://streamtest-api.sivabio.in
```

Restart:
```bash
sudo systemctl restart rtsp-viewer-backend
```

---

## ✅ Verify

```bash
# Check backend
curl http://localhost:3000/api/health

# Check frontend build
ls /srv/rtsp-viewer-frontend/

# Check nginx
sudo nginx -t
sudo systemctl status nginx

# View backend logs
sudo journalctl -u rtsp-viewer-backend -f
```

---

## 🎉 Access

**Frontend:** https://streamtest.sivabio.in

Add cameras and watch live RTSP streams!

---

## 🔧 Service Management

### Backend
```bash
# View logs
sudo journalctl -u rtsp-viewer-backend -f

# Restart
sudo systemctl restart rtsp-viewer-backend

# Status
sudo systemctl status rtsp-viewer-backend
```

### Nginx
```bash
# Reload config
sudo systemctl reload nginx

# Test config
sudo nginx -t

# View error logs
sudo tail -f /var/log/nginx/streamtest.sivabio.in-error.log
```

---

## 📍 File Locations

```
Repository:        /root/ip_streamer (or wherever you cloned it)
Backend:           ./backend
Frontend:          ./frontend
Backend config:    ./backend/.env
Frontend build:    /srv/rtsp-viewer-frontend
Nginx frontend:    /etc/nginx/sites-available/streamtest.sivabio.in
Nginx backend:     /etc/nginx/sites-available/streamtest-api.sivabio.in
SSL certs:         /etc/letsencrypt/live/
Database:          PostgreSQL (localhost:5432)
```

---

## 🚨 Troubleshooting

### Backend won't start
```bash
sudo journalctl -u rtsp-viewer-backend -n 50 -e
# Check .env database credentials
sudo nano backend/.env
```

### Can't reach frontend
```bash
# Check DNS
nslookup streamtest.sivabio.in

# Check nginx is running
sudo systemctl status nginx

# Check firewall
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### No video streams
```bash
# Check ffmpeg is installed
ffmpeg -version

# Check backend logs
sudo journalctl -u rtsp-viewer-backend -f

# Test camera manually
ffmpeg -rtsp_transport tcp -i rtsp://user:pass@10.0.0.5:554/stream1 -t 5 -f null -
```

---

## 🔄 Update Application

### Frontend only
```bash
cd frontend
git pull
npm install
npm run build
sudo cp -r dist/* /srv/rtsp-viewer-frontend/
```

### Backend only
```bash
cd backend
git pull
npm install
sudo systemctl restart rtsp-viewer-backend
```

### Both
```bash
git pull
# Then run frontend and backend updates above
```

---

## 🆘 Questions?

Check logs:
```bash
# Backend
sudo journalctl -u rtsp-viewer-backend -f

# Nginx errors
sudo tail -f /var/log/nginx/*.log
```

Or check README.md for API documentation.
