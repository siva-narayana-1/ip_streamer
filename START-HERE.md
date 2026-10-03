# 🚀 Start Here - Complete Deployment

## One Command to Deploy Everything

```bash
sudo ./DEPLOY-ALL.sh /opt/ip_streamer streamtest.sivabio.in streamtest-api.sivabio.in
```

That's it! This single script will:

1. ✓ Install all dependencies (Node.js, ffmpeg, PostgreSQL, nginx, certbot)
2. ✓ Clone your repository
3. ✓ Deploy backend (systemd service)
4. ✓ Deploy frontend (static files)
5. ✓ Configure nginx for both domains
6. ✓ Get SSL certificates
7. ✓ Setup everything and restart

**Time: ~20 minutes**

---

## Or: Run Scripts Separately

If you prefer more control:

### 1. Clone Repository
```bash
git clone https://github.com/siva-narayana-1/ip_streamer.git
cd ip_streamer
```

### 2. Deploy Backend
```bash
sudo ./backend.sh
```

Then edit database password:
```bash
sudo nano backend/.env
# Change: DB_PASSWORD=change_me_in_production
sudo systemctl restart rtsp-viewer-backend
```

### 3. Deploy Frontend
```bash
sudo ./frontend.sh
```

### 4. Setup Nginx
```bash
sudo ./nginx_setup.sh streamtest.sivabio.in streamtest-api.sivabio.in
```

### 5. Get SSL Certificates
```bash
sudo certbot --nginx -d streamtest.sivabio.in -d streamtest-api.sivabio.in
```

### 6. Update Backend Configuration
```bash
sudo nano backend/.env
# Update CORS_ORIGIN=https://streamtest.sivabio.in,https://streamtest-api.sivabio.in
sudo systemctl restart rtsp-viewer-backend
```

---

## ✅ Verify Everything Works

```bash
# Check backend
curl http://localhost:3000/api/health

# Check frontend exists
ls /srv/rtsp-viewer-frontend/

# Check nginx config
sudo nginx -t

# View backend logs
sudo journalctl -u rtsp-viewer-backend -f
```

---

## 🎉 Access Your App

**Frontend:** https://streamtest.sivabio.in

Add cameras → Test connection → Watch live streams!

---

## 📝 What Gets Deployed

### Backend
- **Port:** 3000 (local only, behind nginx)
- **Service:** `rtsp-viewer-backend` (systemd)
- **Database:** PostgreSQL stream_test
- **Config:** `backend/.env`

### Frontend
- **Location:** `/srv/rtsp-viewer-frontend`
- **Type:** Static files (HTML/CSS/JS)
- **Built with:** Vite

### Web Server
- **Port 80:** Redirects to 443
- **Port 443:** Serves frontend + proxies API
- **Domains:** Both configured automatically
- **SSL:** Let's Encrypt certificates

---

## 🔧 Common Commands

```bash
# View backend logs
sudo journalctl -u rtsp-viewer-backend -f

# Restart backend
sudo systemctl restart rtsp-viewer-backend

# Reload nginx config
sudo systemctl reload nginx

# Check nginx is valid
sudo nginx -t

# View nginx error log
sudo tail -f /var/log/nginx/error.log

# Connect to database
sudo -u postgres psql -d stream_test
SELECT count(*) FROM cameras;
\q
```

---

## 🆘 If Something Goes Wrong

### Backend won't start
```bash
# Check logs
sudo journalctl -u rtsp-viewer-backend -n 50 -e

# Check database credentials
nano backend/.env

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### Can't reach frontend
```bash
# Check DNS
nslookup streamtest.sivabio.in

# Check nginx is running
sudo systemctl status nginx

# Check nginx config
sudo nginx -t

# Allow firewall ports
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
```

### No video streams
```bash
# Check ffmpeg is installed
ffmpeg -version

# Check backend can reach camera
sudo journalctl -u rtsp-viewer-backend -f
# Look for connection errors

# Test camera URL manually
ffmpeg -rtsp_transport tcp -i rtsp://user:pass@192.168.1.10:554/stream1 -t 5 -f null -
```

---

## 📍 File Locations After Deployment

```
Repository:        /opt/ip_streamer
Backend:           /opt/ip_streamer/backend
Backend config:    /opt/ip_streamer/backend/.env
Frontend build:    /srv/rtsp-viewer-frontend
Nginx frontend:    /etc/nginx/sites-available/streamtest.sivabio.in
Nginx backend:     /etc/nginx/sites-available/streamtest-api.sivabio.in
SSL certificates:  /etc/letsencrypt/live/
Database:          PostgreSQL (localhost:5432)
```

---

## 🔄 Update Your Application

### Update frontend
```bash
cd /opt/ip_streamer
git pull
cd frontend && npm install && npm run build
sudo cp -r dist/* /srv/rtsp-viewer-frontend/
```

### Update backend
```bash
cd /opt/ip_streamer
git pull
cd backend && npm install
sudo systemctl restart rtsp-viewer-backend
```

---

## 📖 Documentation

- **README.md** – Application overview and API docs
- **DEPLOY.md** – Detailed deployment guide
- **STRUCTURE.txt** – File structure and what goes where

---

## 🎯 That's All!

Your RTSP Viewer is now production-ready. Add cameras and start watching live streams!

Questions? Check the README.md or DEPLOY.md files.
