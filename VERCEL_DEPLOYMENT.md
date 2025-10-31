# Vercel Deployment Guide

## Environment Variables Setup

In your Vercel dashboard, add these environment variables:

1. Go to your project settings → Environment Variables
2. Add the following:

```
NEXT_PUBLIC_SOCKET_URL=https://video-calling-psi-amber.vercel.app
```

**Important Notes:**

- Socket.IO requires persistent WebSocket connections
- Vercel's serverless functions have limitations with WebSockets
- For production, consider deploying the Socket.IO server separately on:
  - Railway (https://railway.app)
  - Render (https://render.com)
  - Fly.io (https://fly.io)
  - Or any Node.js hosting that supports WebSockets

## Alternative: Deploy Socket.IO Separately

If you encounter issues with WebSockets on Vercel, deploy the Socket.IO server separately:

1. Deploy `server.js` to Railway/Render/etc.
2. Update `NEXT_PUBLIC_SOCKET_URL` to point to your Socket.IO server URL
3. Keep your Next.js frontend on Vercel

## Local Development

For local development, use `.env.local`:
```
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
HOSTNAME=localhost
PORT=3000
```
