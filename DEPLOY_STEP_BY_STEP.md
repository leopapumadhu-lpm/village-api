# 🚀 Village API - Step-by-Step Deployment Guide

Complete walkthrough for deploying Demo + Production.

---

## 📋 PRE-DEPLOYMENT CHECKLIST

Before starting, ensure you have:
- [ ] Git repository pushed to GitHub
- [ ] Node.js 18+ installed (`node --version`)
- [ ] Vercel CLI installed (`npm install -g vercel`)
- [ ] Vercel account created ([vercel.com](https://vercel.com))

---

# PART 1: DEMO DEPLOYMENT (5 minutes)

## Step 1.1: Login to Vercel

```bash
# Install Vercel CLI if not already installed
npm install -g vercel

# Login to your Vercel account
vercel login
```

**Expected output:**
```
Vercel CLI 32.x.x
? Log in to Vercel (Use arrow keys)
❯ Continue with Email 
  Continue with GitHub
  Continue with GitLab
  Continue with Bitbucket
```

Select your preferred login method and complete authentication.

---

## Step 1.2: Configure Demo Environment

```bash
# Navigate to project directory
cd /Users/madhuvanthi/village-api

# Verify current .env is set for demo mode
cat .env | grep -E "USE_MEMORY_FALLBACK|DEMO_MODE"
```

**Should show:**
```
USE_MEMORY_FALLBACK=true
DEMO_MODE=true
```

If not, set them:
```bash
export USE_MEMORY_FALLBACK=true
export DEMO_MODE=true
export NODE_ENV=production
```

---

## Step 1.3: Deploy to Vercel

```bash
# Deploy to production
vercel --prod
```

**Expected output:**
```
Vercel CLI 32.x.x
? Set up \"~/village-api\"? [Y/n] y
? Which scope do you want to deploy to? [Your Account]
? Link to existing project? [y/N] n
? What's your project name? [village-api]
🔗  Linked to user/village-api (created .vercel)
🔍  Inspect: https://vercel.com/user/village-api/xxxxx [1s]
✅  Production: https://village-api-xxxxx.vercel.app [copied to clipboard]
```

**Save this URL!** This is your demo deployment URL.

---

## Step 1.4: Add Environment Variables (Vercel Dashboard)

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click on your project
3. Go to **Settings** → **Environment Variables**
4. Add these variables:

| Variable | Value |
|----------|-------|
| `USE_MEMORY_FALLBACK` | `true` |
| `DEMO_MODE` | `true` |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | `demo-jwt-secret-key-change-in-production` |
| `JWT_REFRESH_SECRET` | `demo-jwt-refresh-secret-key-change-in-production` |
| `CORS_ORIGINS` | `*` |

5. Click **Save**
6. Redeploy: `vercel --prod`

---

## Step 1.5: Verify Demo Deployment

### Test 1: Health Check
```bash
curl https://your-demo-url.vercel.app/health
```

**Expected:**
```json
{
  "status": "ok",
  "mode": "memory-fallback",
  "services": {
    "database": "memory-fallback",
    "redis": "memory-fallback",
    "api": "running"
  }
}
```

### Test 2: API Documentation
```bash
curl https://your-demo-url.vercel.app/api-docs
```

**Expected:** HTML page with Swagger UI

### Test 3: States Endpoint
```bash
curl https://your-demo-url.vercel.app/v1/states \
  -H "X-API-Key: ak_demo123456789012345678901234"
```

**Expected:**
```json
{
  "success": true,
  "count": 30,
  "data": [...]
}
```

### Test 4: Search
```bash
curl "https://your-demo-url.vercel.app/v1/search?q=Mumbai" \
  -H "X-API-Key: ak_demo123456789012345678901234"
```

### Test 5: Admin Login
```bash
curl -X POST https://your-demo-url.vercel.app/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@villageapi.com","password":"Demo@123456"}'
```

**Expected:** JWT token response

---

## Step 1.6: Test Frontend Dashboard

1. Open browser: `https://your-demo-url.vercel.app`
2. Click **"Go to Admin Dashboard"**
3. Login with:
   - Email: `demo@villageapi.com`
   - Password: `Demo@123456`
4. Explore:
   - Analytics tab
   - Users tab
   - API Logs tab
   - Data Browser tab

---

# PART 2: PRODUCTION DEPLOYMENT (30 minutes)

## Step 2.1: Provision PostgreSQL Database (NeonDB)

### 2.1.1: Sign Up
1. Go to [neon.tech](https://neon.tech)
2. Sign up with GitHub or email
3. Verify email

### 2.1.2: Create Project
1. Click **"Create Project"**
2. Project name: `village-api-prod`
3. Region: Choose closest to your users (e.g., `Asia Pacific (Singapore)`)
4. Click **"Create Project"**

### 2.1.3: Get Connection String
1. In Neon dashboard, click **"Connection String"**
2. Select **"Node.js"**
3. Copy the connection string
4. **SAVE THIS!** You'll need it in Step 2.4

**Example:**
```
postgresql://user:password@ep-xxx.ap-southeast-1.aws.neon.tech/village-api?sslmode=require
```

### 2.1.4: Verify Database
```bash
# Install PostgreSQL client if needed
# On Mac: brew install libpq

# Test connection
psql "YOUR_CONNECTION_STRING"

# Should see:
# psql (15.x, server 16.x)
# SSL connection (protocol: TLSv1.3, ...)
# Type \"help\" for help.
# village-api=>
```

Type `\q` to exit.

---

## Step 2.2: Provision Redis (Upstash)

### 2.2.1: Sign Up
1. Go to [upstash.com](https://upstash.com)
2. Sign up with GitHub or email
3. Verify email

### 2.2.2: Create Redis Database
1. Click **"Create Database"**
2. Name: `village-api-prod`
3. Region: Same as your NeonDB region
4. Type: **"Regional"** (NOT Global)
5. Click **"Create"**

### 2.2.3: Get Redis URL
1. Go to database **"Details"** tab
2. Copy **"Redis URL (TLS)"**
3. **SAVE THIS!** You'll need it in Step 2.4

**Example:**
```
rediss://default:password@host.upstash.io:6379
```

**Note:** Make sure it starts with `rediss://` (with 's' for TLS)

### 2.2.4: Verify Redis
```bash
# Install Redis CLI if needed
# On Mac: brew install redis

# Test connection
redis-cli -u YOUR_REDIS_URL ping

# Should return: PONG
```

---

## Step 2.3: Set Up Stripe (Optional but Recommended)

### 2.3.1: Sign Up
1. Go to [stripe.com](https://stripe.com)
2. Create account
3. Activate account (provide business details)

### 2.3.2: Get API Keys
1. Go to [Dashboard](https://dashboard.stripe.com)
2. Developers → API Keys
3. Copy **"Secret key"** (starts with `sk_test_` for test, `sk_live_` for production)
4. **SAVE THIS!** You'll need it in Step 2.4

### 2.3.3: Create Products & Prices
1. Go to [Products](https://dashboard.stripe.com/products)
2. Click **"Add product"**
3. Create 3 products:

**Premium Plan:**
- Name: `Premium`
- Price: `$49.00`
- Recurring: Monthly
- Copy Price ID (starts with `price_`)

**Pro Plan:**
- Name: `Pro`
- Price: `$199.00`
- Recurring: Monthly
- Copy Price ID

**Unlimited Plan:**
- Name: `Unlimited`
- Price: `$499.00`
- Recurring: Monthly
- Copy Price ID

### 2.3.4: Webhook Secret (For Production)
1. Developers → Webhooks
2. Add endpoint: `https://your-domain.com/webhooks/stripe`
3. Select events:
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.deleted`
4. Copy **"Signing secret"**
5. **SAVE THIS!** You'll need it in Step 2.4

---

## Step 2.4: Configure Production Environment

### 2.4.1: Generate Secure Secrets

```bash
# Generate JWT secret (run this command)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Should output something like:
# a1b2c3d4e5f6... (128 characters)

# Generate another one for refresh token (different!)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate webhook secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**SAVE ALL THREE SECRETS!**

### 2.4.2: Edit Production Environment File

```bash
# Copy template
cp .env.production.example .env.production

# Edit with your values
nano .env.production
```

**Fill in these values:**

```env
# ============================================
# CORE SETTINGS
# ============================================
PORT=3000
NODE_ENV=production
USE_MEMORY_FALLBACK=false
DEMO_MODE=false

# ============================================
# DATABASE (from NeonDB)
# ============================================
DATABASE_URL="postgresql://your-user:your-password@your-host/village-api?sslmode=require"

# ============================================
# REDIS (from Upstash)
# ============================================
REDIS_URL="rediss://default:your-password@your-host.upstash.io:6379"

# ============================================
# SECURITY (from Step 2.4.1)
# ============================================
JWT_SECRET="your-128-char-hex-string-from-step-2-4-1"
JWT_REFRESH_SECRET="your-different-128-char-hex-string"
WEBHOOK_SECRET="your-64-char-hex-string"

# ============================================
# CORS & FRONTEND (update with your domain)
# ============================================
CORS_ORIGINS="https://your-domain.com,https://app.your-domain.com"
FRONTEND_URL="https://app.your-domain.com"
VITE_API_URL="https://api.your-domain.com"

# ============================================
# STRIPE (from Step 2.3)
# ============================================
STRIPE_SECRET_KEY="sk_live_your_secret_key"
STRIPE_WEBHOOK_SECRET="whsec_your_webhook_secret"
STRIPE_PREMIUM_PRICE_ID="price_your_premium_price_id"
STRIPE_PRO_PRICE_ID="price_your_pro_price_id"
STRIPE_UNLIMITED_PRICE_ID="price_your_unlimited_price_id"

# ============================================
# EMAIL (your Gmail or SMTP provider)
# ============================================
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
SENDER_EMAIL="noreply@your-domain.com"
```

**Save and exit:** Press `Ctrl+X`, then `Y`, then `Enter`

---

## Step 2.5: Database Migrations

### 2.5.1: Install Dependencies

```bash
# In project root
cd /Users/madhuvanthi/village-api

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### 2.5.2: Generate Prisma Client

```bash
# Generate Prisma client
npx prisma generate
```

**Expected output:**
```
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma

✔ Generated Prisma Client (v5.x.x) to ./node_modules/@prisma/client in 123ms
```

### 2.5.3: Deploy Migrations

```bash
# Deploy database migrations
npx prisma migrate deploy
```

**Expected output:**
```
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "village-api" at "ep-xxx..."

1 migration found in prisma/migrations

The following migration(s) have been applied:

migrations/
  └─ 20240115000000_init/
    └─ migration.sql

✔ All migrations have been successfully applied.
```

### 2.5.4: Verify Database Tables

```bash
# Connect to database
psql "$DATABASE_URL"

# List tables
\dt

# Should show:
#                  List of relations
#  Schema |         Name          | Type  |  Owner
# ---------+-----------------------+-------+----------
#  public  | ApiKey                | table | neon
#  public  | ApiLog                | table | neon
#  public  | AuditLog              | table | neon
#  public  | District              | table | neon
#  public  | Invoice               | table | neon
#  public  | Organization          | table | neon
#  public  | PaymentMethod         | table | neon
#  public  | PaymentTransaction    | table | neon
#  public  | State                 | table | neon
#  public  | SubDistrict           | table | neon
#  public  | Subscription          | table | neon
#  public  | TeamMember            | table | neon
#  public  | UsageAggregation      | table | neon
#  public  | User                  | table | neon
#  public  | Village               | table | neon
#  public  | WebhookDeliveryLog    | table | neon
#  public  | WebhookEndpoint       | table | neon

# Exit
\q
```

---

## Step 2.6: Build Frontend

```bash
# Navigate to frontend
cd frontend

# Build for production
npm run build

# Expected output:
# vite v5.x.x building for production...
# ✓ 142 modules transformed.
# dist/                     0.15 kB │ gzip: 0.17 kB
# dist/index.html           0.46 kB │ gzip: 0.30 kB
# ...
# ✓ built in 3.45s

cd ..
```

---

## Step 2.7: Run Pre-Deployment Checks

```bash
# Run predeploy checks
npm run predeploy:check
```

**Expected output (all green):**
```
✅ Git working tree is clean.
✅ Backend env present.
✅ Email env present.
✅ Stripe env present.
✅ Frontend env present.

✅ Predeploy check passed.
```

If there are errors, fix them before proceeding.

---

## Step 2.8: Deploy to Vercel

### Option A: Vercel CLI (Recommended)

```bash
# Make sure you're in project root
cd /Users/madhuvanthi/village-api

# Load production environment
export $(cat .env.production | xargs)

# Deploy
vercel --prod
```

**Expected output:**
```
Vercel CLI 32.x.x
🔍  Inspect: https://vercel.com/user/village-api/xxxxx
✅  Production: https://village-api-prod.vercel.app
```

### Option B: Vercel Dashboard (Alternative)

1. Push code to GitHub
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import your GitHub repository
4. Configure:
   - Framework: `Other`
   - Root Directory: `./`
   - Build Command: `npm run build`
   - Output Directory: `frontend/dist`
5. Add Environment Variables (copy from `.env.production`)
6. Click **Deploy**

---

## Step 2.9: Add Custom Domain (Optional)

1. Buy domain: [namecheap.com](https://namecheap.com) or [cloudflare.com](https://cloudflare.com)
2. In Vercel dashboard: Project → Settings → Domains
3. Add domain: `api.yourdomain.com`
4. Follow DNS configuration instructions
5. Wait for DNS propagation (5-60 minutes)

---

## Step 2.10: Create Admin User

```bash
# Create admin user
node scripts/create-admin-user.js
```

Or via API:

```bash
# Register admin user
curl -X POST https://your-domain.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourdomain.com",
    "password": "YourStrongPassword123!",
    "businessName": "Your Company"
  }'

# Login to get JWT token
curl -X POST https://your-domain.com/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourdomain.com",
    "password": "YourStrongPassword123!"
  }'
```

---

# PART 3: POST-DEPLOYMENT VERIFICATION

## Step 3.1: Health Check

```bash
curl https://api.yourdomain.com/health
```

**Expected:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "mode": "database",
  "services": {
    "database": "connected",
    "redis": "connected",
    "api": "running"
  }
}
```

---

## Step 3.2: Test API Endpoints

### Test 1: Get States
```bash
curl https://api.yourdomain.com/v1/states \
  -H "X-API-Key: your-api-key"
```

### Test 2: Search Villages
```bash
curl "https://api.yourdomain.com/v1/search?q=Mumbai" \
  -H "X-API-Key: your-api-key"
```

### Test 3: Autocomplete
```bash
curl "https://api.yourdomain.com/v1/autocomplete?q=Ban" \
  -H "X-API-Key: your-api-key"
```

### Test 4: Get Districts
```bash
curl https://api.yourdomain.com/v1/states/1/districts \
  -H "X-API-Key: your-api-key"
```

---

## Step 3.3: Test Admin Dashboard

1. Open browser: `https://app.yourdomain.com`
2. Login with admin credentials
3. Verify:
   - Analytics tab loads with data
   - Users tab shows users
   - API Logs tab shows request logs
   - Data Browser shows village data

---

## Step 3.4: Test B2B Portal

1. Register a new B2B user:
```bash
curl -X POST https://api.yourdomain.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "business@company.com",
    "password": "SecurePass123!",
    "businessName": "Test Company"
  }'
```

2. Approve user via admin dashboard
3. Login as B2B user
4. Generate API key
5. Test API with new key

---

## Step 3.5: Test Payments (if Stripe configured)

1. Go to B2B dashboard → Billing tab
2. Select a plan
3. Enter test card: `4242 4242 4242 4242`
4. Verify subscription created in Stripe dashboard

---

# PART 4: MONITORING & MAINTENANCE

## Step 4.1: Set Up Monitoring

### Option: UptimeRobot (Free)
1. Sign up: [uptimerobot.com](https://uptimerobot.com)
2. Add monitor:
   - Type: HTTP(s)
   - URL: `https://api.yourdomain.com/health`
   - Interval: 5 minutes
3. Add alert contact (email/SMS)

### Option: Sentry (Error Tracking)
1. Sign up: [sentry.io](https://sentry.io)
2. Create project: `village-api`
3. Install SDK: `npm install @sentry/node`
4. Add to `api/server.js`:
```javascript
import * as Sentry from '@sentry/node';
Sentry.init({ dsn: 'your-dsn-url' });
```

---

## Step 4.2: Database Backups

NeonDB automatically backs up daily. To download manually:

```bash
# Export database
pg_dump "$DATABASE_URL" > backup.sql

# Or use Vercel CLI for automated backups
```

---

## Step 4.3: Update Deployment

```bash
# Pull latest code
git pull origin main

# Install new dependencies
npm install

# Run migrations (if any)
npx prisma migrate deploy

# Rebuild frontend
cd frontend && npm run build && cd ..

# Redeploy
vercel --prod
```

---

# TROUBLESHOOTING

## Issue: Database Connection Failed

**Error:** `Connection refused` or `timeout`

**Solutions:**
1. Check DATABASE_URL is correct
2. Verify sslmode=require is in URL
3. Test locally: `psql "$DATABASE_URL"`
4. Check NeonDB dashboard for active compute

## Issue: Redis Connection Failed

**Error:** `Redis connection failed`

**Solutions:**
1. Check REDIS_URL uses `rediss://` (with s)
2. Test locally: `redis-cli -u "$REDIS_URL" ping`
3. Check Upstash dashboard for usage limits

## Issue: CORS Errors

**Error:** `CORS policy: No 'Access-Control-Allow-Origin'`

**Solutions:**
1. Check CORS_ORIGINS includes your frontend domain
2. Must include full URL: `https://app.yourdomain.com`
3. No trailing slashes

## Issue: JWT Errors

**Error:** `invalid token` or `TokenExpiredError`

**Solutions:**
1. Verify JWT_SECRET is set and 32+ characters
2. Check JWT_REFRESH_SECRET is different
3. Regenerate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

## Issue: Frontend Not Loading

**Error:** `404` or blank page

**Solutions:**
1. Check `frontend/dist` exists after build
2. Verify Vercel config has correct output directory
3. Check browser console for JS errors

---

# CONGRATULATIONS! 🎉

Your Village API is now deployed!

## What You Have:
- ✅ Demo deployment for testing
- ✅ Production deployment with real database
- ✅ Admin dashboard
- ✅ B2B portal
- ✅ Payment processing
- ✅ API documentation

## Next Steps:
1. Invite beta users
2. Monitor usage and performance
3. Collect feedback
4. Iterate and improve

---

Need help? Check:
- Logs: `vercel logs --tail`
- Health: `curl https://api.yourdomain.com/health`
- Docs: `https://api.yourdomain.com/api-docs`
