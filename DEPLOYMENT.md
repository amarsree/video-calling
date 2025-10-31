# Vercel Deployment Guide

## Problem
Vercel doesn't support custom Node.js servers (`server.js`) with persistent WebSocket connections. Socket.IO requires persistent connections which don't work with serverless functions.

## Solution: Deploy Socket.IO Server Separately

The best approach is to deploy the Socket.IO server separately and keep your Next.js frontend on Vercel.

### Step 1: Deploy Socket.IO Server (Railway/Render/Fly.io)

I've created `socket-server.js` - a standalone Socket.IO server. Deploy it to:

**Option A: Railway (Recommended - Free tier available)**
1. Go to https://railway.app
2. Create new project → Deploy from GitHub repo
3. Select the `socket-server.js` file
4. Set start command: `node socket-server.js`
5. Railway will give you a URL like: `https://your-app.railway.app`

**Option B: Render**
1. Go to https://render.com
2. Create new Web Service
3. Connect your repo
4. Set:
   - Build Command: `npm install` (use socket-server-package.json)
   - Start Command: `node socket-server.js`
5. Render will give you a URL

**Option C: Fly.io**
1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Create `fly.toml` for socket server
3. Deploy: `fly deploy`

### Step 2: Update Environment Variables

1. **In Vercel Dashboard:**
   - Go to Settings → Environment Variables
   - Add: `NEXT_PUBLIC_SOCKET_URL=https://your-socket-server-url.com`
   - Apply to: Production, Preview, Development

2. **For local development (.env.local):**
   ```
   NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
   ```

### Step 3: Deploy Next.js Frontend to Vercel

Your Next.js app will deploy normally to Vercel. The `vercel.json` is now configured for standard Next.js deployment.

### Step 4: Local Development

For local development, run both servers:

**Terminal 1 - Socket.IO Server:**
```bash
node socket-server.js
```

**Terminal 2 - Next.js App:**
```bash
npm run dev
```

## Alternative: Quick Test with Railway

1. Copy `socket-server.js` and `socket-server-package.json` to a new folder
2. Rename `socket-server-package.json` to `package.json`
3. Deploy to Railway
4. Copy the Railway URL
5. Update `NEXT_PUBLIC_SOCKET_URL` in Vercel with the Railway URL

## Files Created

- `socket-server.js` - Standalone Socket.IO server
- `socket-server-package.json` - Package.json for socket server (rename to package.json when deploying)

## Current Setup

- ✅ `vercel.json` - Configured for standard Next.js deployment
- ✅ `server.js` - Still works for local development
- ✅ `socket-server.js` - Separate server for production deployment
- ✅ Frontend auto-detects socket URL from environment variable or window.location

Your Next.js app will now deploy successfully to Vercel!
