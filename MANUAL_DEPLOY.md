# 🔧 Manual Deployment Guide (Offline Environment)

Since this environment has network restrictions, follow these steps on your **local machine** with internet access.

---

## Option 1: Deploy from Your Local Machine

### Prerequisites on Your Machine:
- [ ] Node.js 18+ installed
- [ ] Vercel CLI installed: `npm install -g vercel`
- [ ] Vercel account: [vercel.com](https://vercel.com)
- [ ] This code copied to your machine

### Step-by-Step:

#### 1. Copy Code to Your Machine

From this environment, zip the code:
```bash
cd /Users/madhuvanthi/village-api
git archive --format=zip HEAD > village-api.zip
```

Transfer `village-api.zip` to your local machine.

#### 2. Extract and Setup on Your Machine

```bash
# On your local machine:
unzip village-api.zip -d village-api
cd village-api

# Install dependencies
npm install
cd frontend && npm install && cd ..
```

#### 3. Deploy Demo to Vercel

```bash
# Login to Vercel
npx vercel login

# Deploy (follow prompts)
npx vercel --prod
```

When prompted:
- Set up project: **Y**
- Link to existing project: **N** (first time)
- Project name: **village-api-demo**

#### 4. Set Environment Variables

In the Vercel dashboard:
1. Go to your project
2. Settings → Environment Variables
3. Add:
   - `USE_MEMORY_FALLBACK` = `true`
   - `DEMO_MODE` = `true`
   - `NODE_ENV` = `production`
   - `JWT_SECRET` = `demo-jwt-secret-key-change-in-production`
   - `JWT_REFRESH_SECRET` = `demo-jwt-refresh-secret-key-change-in-production`
   - `CORS_ORIGINS` = `*`

4. Click Save and redeploy

---

## Option 2: GitHub + Vercel (Recommended)

### Step 1: Push to GitHub

If you have git access from this environment:
```bash
git add .
git commit -m "Ready for deployment - all fixes applied"
git push origin main
```

### Step 2: Deploy via Vercel Dashboard

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Configure:
   - Framework: **Other**
   - Root Directory: `./`
   - Build Command: `npm install`
   - Output Directory: `frontend/dist`
4. Add Environment Variables (same as above)
5. Click **Deploy**

---

## Option 3: One-Click Deploy Button

Create a `README.md` with a deploy button:

```markdown
# Village API

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/village-api)

## Demo Credentials

- API Key: `ak_demo123456789012345678901234`
- API Secret: `as_demo123456789012345678901234`
- Admin Login: `demo@villageapi.com` / `Demo@123456`
```

---

## After Deployment

### Verify Deployment

Once deployed, test these URLs:

```bash
# 1. Health check
curl https://your-url.vercel.app/health

# 2. API docs
curl https://your-url.vercel.app/api-docs

# 3. Test API
curl https://your-url.vercel.app/v1/states \
  -H "X-API-Key: ak_demo123456789012345678901234"
```

### Dashboard Access

1. Open: `https://your-url.vercel.app`
2. Click **Admin Dashboard**
3. Login:
   - Email: `demo@villageapi.com`
   - Password: `Demo@123456`

---

## Troubleshooting

### Build Fails
```bash
# Clear cache and rebuild
rm -rf node_modules frontend/node_modules
rm -rf frontend/dist
npm install
cd frontend && npm install && npm run build && cd ..
npx vercel --prod
```

### Environment Variables Not Applied
1. Go to Vercel Dashboard
2. Project → Settings → Environment Variables
3. Verify all variables are set
4. Click **Redeploy** on latest deployment

### API Returns 404
Check `vercel.json` routes are correct:
```json
{
  "src": "/v1/(.*)",
  "dest": "api/server.js"
}
```

---

## Production Deployment (After Demo Works)

Once demo is working, for production:

### 1. Provision Services
- PostgreSQL: [neon.tech](https://neon.tech)
- Redis: [upstash.com](https://upstash.com)
- Stripe: [stripe.com](https://stripe.com)

### 2. Update Environment Variables

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Your NeonDB connection string |
| `REDIS_URL` | Your Upstash connection string |
| `USE_MEMORY_FALLBACK` | `false` |
| `JWT_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `CORS_ORIGINS` | Your frontend domain |

### 3. Deploy
```bash
npx vercel --prod
```

