# 🚀 Village API - Production Deployment Guide

## Prerequisites

- Node.js 18+ installed
- PostgreSQL database (Neon, Railway, or Render)
- Redis instance (Upstash recommended)
- Stripe account (for payments)
- SMTP credentials (for emails)

## Environment Setup

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone <your-repo-url>
cd village-api

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..

# Install demo client dependencies (optional)
cd demo-client && npm install && cd ..
```

### 2. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Deploy database schema
npx prisma migrate deploy

# Seed with demo data (optional)
node setup-demo.js
```

### 3. Environment Variables

Copy `.env.example` to `.env` and fill in your production values:

```bash
# Required
DATABASE_URL="postgresql://..."
REDIS_URL="rediss://..."
JWT_SECRET="your-64-char-random-string"
JWT_REFRESH_SECRET="your-second-64-char-random-string"

# Security
CORS_ORIGINS="https://yourdomain.com,https://app.yourdomain.com"
FRONTEND_URL="https://app.yourdomain.com"

# Stripe (for payments)
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PREMIUM_PRICE_ID="price_..."
STRIPE_PRO_PRICE_ID="price_..."
STRIPE_UNLIMITED_PRICE_ID="price_..."

# Email
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
SENDER_EMAIL="noreply@yourdomain.com"

# Frontend build/runtime
VITE_API_URL="https://api.yourdomain.com"
```

Generate secure secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Run deploy validation:
```bash
npm run predeploy:check
```

## Deployment Options

### Option 1: Vercel (Recommended for Full Stack)

1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy settings:
   - Framework Preset: `Other`
   - Build Command: `npm run build`
   - Output Directory: `frontend/dist`
4. Deploy!

### Option 2: Render.com (Backend + Database)

**Web Service:**
- Build Command: `npm install && npx prisma migrate deploy`
- Start Command: `npm start`
- Add environment variables in dashboard

**Frontend (Static Site):**
- Build Command: `cd frontend && npm install && npm run build`
- Publish Directory: `frontend/dist`
- Set `VITE_API_URL` to your backend URL

### Option 3: Railway (Full Stack)

1. Create new project from GitHub
2. Add PostgreSQL and Redis services
3. Deploy - environment variables auto-configured

### Option 4: Self-Hosted (VPS/Dedicated Server)

```bash
# Install PM2 globally
npm install -g pm2

# Build frontend
cd frontend && npm run build && cd ..

# Start with PM2
pm2 start api/server.js --name "village-api"
pm2 save
pm2 startup

# Setup nginx reverse proxy (see below)
```

**Nginx Configuration:**

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Post-Deployment Checklist

- [ ] Health endpoint responds: `GET /health`
- [ ] API docs load: `/api-docs`
- [ ] Admin login works
- [ ] API key authentication works
- [ ] Rate limiting active
- [ ] Email notifications sending
- [ ] Stripe webhooks configured
- [ ] Database backups scheduled

## Troubleshooting

**Database Connection Issues:**
- Verify SSL mode in connection string
- Check firewall rules
- Test connection locally: `psql "<your-db-url>"`

**Redis Connection Issues:**
- Verify `rediss://` for TLS connections
- Check password is URL-encoded
- Verify connection: `redis-cli -u <your-redis-url> ping`

**JWT Errors:**
- Ensure `JWT_SECRET` is set
- Minimum 32 characters recommended
- Same secret across all server instances

**CORS Errors:**
- Add your frontend domain to `CORS_ORIGINS`
- Include protocol (`https://`)
- Separate multiple origins with commas

## Security Checklist

- [ ] JWT_SECRET is strong and unique
- [ ] CORS restricted to known origins
- [ ] Database uses SSL/TLS
- [ ] Redis uses authentication
- [ ] Stripe webhook secret configured
- [ ] Rate limiting enabled
- [ ] Helmet security headers active
- [ ] No hardcoded secrets in code

## Monitoring

Check these endpoints regularly:
- `GET /health` - Service health
- `GET /admin/analytics` - Usage stats (admin only)
- Database connection pool status
- Redis memory usage

## Support

For deployment issues:
1. Check logs: `pm2 logs` or Vercel dashboard
2. Verify environment variables
3. Test database connectivity
4. Review error tracking (Sentry recommended)
