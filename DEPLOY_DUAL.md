# 🚀 Dual Deployment Guide

Deploy **Demo** for immediate testing + configure **Production** for real users.

---

## Quick Start

```bash
# 1. Demo Deploy (5 minutes)
./deploy-demo.sh

# 2. Production Setup (30 minutes)
./deploy-production.sh
```

---

## PART 1: Demo Deployment ⏱️ 5 Minutes

### Option A: Vercel CLI

```bash
# Install Vercel CLI (if not installed)
npm install -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

### Option B: GitHub + Vercel Dashboard

1. Push code to GitHub
2. Import repo at [vercel.com/new](https://vercel.com/new)
3. Add environment variables:
   ```
   USE_MEMORY_FALLBACK=true
   DEMO_MODE=true
   NODE_ENV=production
   ```
4. Deploy

### Demo URLs (Examples)

| Environment | URL Pattern |
|-------------|-------------|
| Demo | `https://village-api-demo.vercel.app` |
| Production | `https://api.yourdomain.com` |

### Demo Credentials

```
API Key:     ak_demo123456789012345678901234
API Secret:  as_demo123456789012345678901234
Admin Login: demo@villageapi.com / Demo@123456
```

---

## PART 2: Production Deployment ⏱️ 30 Minutes

### Step 1: Provision Services (10 min)

#### A. PostgreSQL Database

**Option 1: NeonDB** (Recommended - Free tier: 500MB)
1. Sign up: [neon.tech](https://neon.tech)
2. Create new project
3. Copy connection string
4. Save for later

**Option 2: Railway**
1. Sign up: [railway.app](https://railway.app)
2. New project → Add PostgreSQL
3. Copy connection string

**Option 3: Render**
1. Sign up: [render.com](https://render.com)
2. New PostgreSQL instance
3. Copy internal connection string

#### B. Redis Cache

**Option: Upstash** (Recommended - Free tier: 10k requests/day)
1. Sign up: [upstash.com](https://upstash.com)
2. Create Redis database
3. Copy Redis URL (use the `rediss://` URL for TLS)
4. Save for later

#### C. Stripe Account (for payments)

1. Sign up: [stripe.com](https://stripe.com)
2. Get API keys from Dashboard
3. Create products:
   - Premium Plan ($49/month)
   - Pro Plan ($199/month)  
   - Unlimited Plan ($499/month)
4. Copy price IDs

#### D. Email Service

**Gmail SMTP** (Easiest)
1. Enable 2FA on your Gmail
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Use your email + app password

---

### Step 2: Configure Environment (5 min)

```bash
# Copy template
cp .env.production.example .env.production

# Edit with your values
nano .env.production
```

**Fill in these values:**

```env
# Database (from NeonDB/Render/Railway)
DATABASE_URL="postgresql://user:password@host/db?sslmode=require"

# Redis (from Upstash)
REDIS_URL="rediss://default:password@host:6379"

# Generate secrets (run this command)
JWT_SECRET="64-char-hex-from-crypto-randomBytes"
JWT_REFRESH_SECRET="different-64-char-hex"

# Your domains
CORS_ORIGINS="https://yourdomain.com,https://app.yourdomain.com"
FRONTEND_URL="https://app.yourdomain.com"
VITE_API_URL="https://api.yourdomain.com"

# Stripe
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PREMIUM_PRICE_ID="price_..."
STRIPE_PRO_PRICE_ID="price_..."
STRIPE_UNLIMITED_PRICE_ID="price_..."

# Email
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
SENDER_EMAIL="noreply@yourdomain.com"
```

---

### Step 3: Database Setup (5 min)

```bash
# Install Prisma CLI
npm install -g prisma

# Generate Prisma client
npx prisma generate

# Deploy migrations (creates tables)
npx prisma migrate deploy

# Verify connection
npx prisma db pull
```

---

### Step 4: Deploy (5 min)

#### Option A: Vercel Production

```bash
# Install Vercel CLI
npm install -g vercel

# Link to project (if not already)
vercel

# Set environment variables
vercel env add DATABASE_URL
vercel env add REDIS_URL
vercel env add JWT_SECRET
# ... add all variables

# Deploy
vercel --prod
```

#### Option B: Render.com

**Web Service:**
- Build Command: `npm install && npx prisma migrate deploy`
- Start Command: `npm start`
- Add all env vars in dashboard

**Static Site (Frontend):**
- Build: `cd frontend && npm install && npm run build`
- Publish: `frontend/dist`
- Environment: `VITE_API_URL=https://api.yourdomain.com`

#### Option C: Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link project
railway link

# Deploy
railway up
```

---

### Step 5: Post-Deployment (5 min)

```bash
# Test health endpoint
curl https://api.yourdomain.com/health

# Test API docs
curl https://api.yourdomain.com/api-docs

# Create admin user
node scripts/create-admin-user.js

# Test API with your key
curl https://api.yourdomain.com/v1/states \
  -H "X-API-Key: your-api-key"
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     DEMO DEPLOYMENT                     │
│                    (village-api-demo)                   │
│                                                         │
│   ┌──────────────┐     ┌──────────────┐                │
│   │   Frontend   │────▶│   Backend    │                │
│   │   (Vite)     │     │  (Express)   │                │
│   └──────────────┘     └──────┬───────┘                │
│                               │                         │
│                      ┌────────┴────────┐               │
│                      │  Memory Storage │               │
│                      │  (In-Memory)    │               │
│                      └─────────────────┘               │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  PRODUCTION DEPLOYMENT                  │
│                                                         │
│   ┌──────────────┐     ┌──────────────┐                │
│   │   Frontend   │────▶│   Backend    │                │
│   │   (Vercel)   │     │  (Vercel/    │                │
│   └──────────────┘     │   Render)    │                │
│                        └──────┬───────┘                │
│                               │                         │
│              ┌────────────────┼────────────────┐       │
│              ▼                ▼                ▼       │
│      ┌───────────┐    ┌───────────┐   ┌──────────┐   │
│      │  NeonDB   │    │  Upstash  │   │  Stripe  │   │
│      │PostgreSQL │    │   Redis   │   │ Payments │   │
│      └───────────┘    └───────────┘   └──────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## Domain Setup

### Custom Domain on Vercel

1. Buy domain: [Namecheap](https://namecheap.com) / [Cloudflare](https://cloudflare.com)
2. In Vercel dashboard: Project → Settings → Domains
3. Add your domain
4. Update DNS records as instructed

### Recommended Domain Structure

| Service | Domain |
|---------|--------|
| API | `api.yourdomain.com` |
| Admin Dashboard | `app.yourdomain.com` |
| Demo | `demo.yourdomain.com` |
| Documentation | `docs.yourdomain.com` |

---

## Monitoring & Alerts

### Health Check Endpoint
```bash
curl https://api.yourdomain.com/health
```

Response:
```json
{
  "status": "ok",
  "mode": "database",
  "services": {
    "database": "connected",
    "redis": "connected",
    "api": "running"
  }
}
```

### Recommended Monitoring Tools

| Tool | Purpose | Free Tier |
|------|---------|-----------|
| [UptimeRobot](https://uptimerobot.com) | Uptime monitoring | 50 monitors |
| [Sentry](https://sentry.io) | Error tracking | 5k events/month |
| [LogRocket](https://logrocket.com) | Session replay | 1k sessions/month |

---

## Troubleshooting

### Database Connection Failed
```
# Test locally
psql "YOUR_DATABASE_URL"

# Check SSL mode
# NeonDB requires: ?sslmode=require
```

### Redis Connection Failed
```
# Test locally
redis-cli -u YOUR_REDIS_URL ping

# Should return: PONG
```

### CORS Errors
```
# Make sure CORS_ORIGINS includes your frontend domain
CORS_ORIGINS="https://app.yourdomain.com"
```

### JWT Errors
```
# Check secret length (minimum 32 chars)
echo -n "your-secret" | wc -c

# Generate new secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Next Steps

After deployment:

1. ✅ Test all endpoints
2. ✅ Create first admin user
3. ✅ Configure Stripe webhooks
4. ✅ Set up monitoring
5. ✅ Write API documentation
6. ✅ Invite beta users

---

**Need Help?** 
- Check logs: `vercel logs --tail`
- Run diagnostics: `node scripts/predeploy-check.js`
- Review: `DEPLOY.md`
