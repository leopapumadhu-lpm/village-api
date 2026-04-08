# 🎯 Village API - Quick Reference

## 🚀 Start Development (2 Terminals)

**Terminal 1:**
```bash
cd /Users/madhuvanthi/village-api && node api/server.js
```

**Terminal 2:**
```bash
cd /Users/madhuvanthi/village-api/frontend && npm run dev
```

**Then visit:** http://localhost:5173

---

## 📋 Admin Testing

**Login Page:** http://localhost:5173/login
```
Email: admin@villageapi.com
Password: Admin@123456
```

**Dashboard Tabs:**
- Overview: Analytics metrics
- Users: B2B registration management
- API Logs: Request audit trail
- Data Browser: Explore 619K villages

---

## 🔌 API Testing

**Get All States:**
```bash
curl http://localhost:3000/v1/states \
  -H "X-API-Key: ak_frontend_test_key_dev_12345"
```

**Search Villages:**
```bash
curl "http://localhost:3000/v1/search?q=Mumbai" \
  -H "X-API-Key: ak_frontend_test_key_dev_12345"
```

**Admin Login:**
```bash
curl -X POST http://localhost:3000/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@villageapi.com","password":"Admin@123456"}'
```

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `/api/server.js` | All backend endpoints (200+ lines) |
| `/frontend/src/AdminDashboard.jsx` | Admin UI with Data Browser |
| `/frontend/src/api.js` | API client with auth |
| `/prisma/schema.prisma` | Database schema |
| `/scripts/setup-api-key.js` | Create API keys |
| `/PHASE2_COMPLETE.md` | Full feature list |

---

## ✨ Features Status

| Feature | Status | Test |
|---------|--------|------|
| Admin Login | ✅ Working | Test 1 |
| B2B Registration | ✅ Working | Test 2 |
| User Management | ✅ Working | Test 3 |
| API Authentication | ✅ Working | Test 4 |
| Village Data | ✅ Working | Test 5 |
| Analytics | ✅ Working | Test 6 |
| API Logs | ✅ Working | Test 7 |
| Rate Limiting | ✅ Working | Test 8 |

---

## 🧪 Run Full Test Suite

```bash
bash /tmp/test_platform.sh
```

Expected: All 8 tests **PASS** ✅

---

## 📊 Database

- **619,225 villages** indexed and searchable
- **30 states** with hierarchical relationships
- **Real-time queries** via Prisma
- **Redis caching** for performance
- **Connected to:** Neon (PostgreSQL) + Upstash (Redis)

---

## 🔐 Authentication

- Admin: JWT token (24h expiration)
- B2B: API Key + Secret pair
- Rate Limiting: Per-user daily quotas

---

## 🚀 Deploy to Production

```bash
# Commit changes
git add -A
git commit -m "Production ready"

# Push to main branch
git push origin main

# Vercel auto-deploys on push
# Check: https://vercel.com/your-team/village-api
```

---

## 📞 Support

All features verified with:
- ✅ 619,225 live village records
- ✅ Full admin dashboard
- ✅ B2B self-service portal
- ✅ API rate limiting
- ✅ Real-time analytics
