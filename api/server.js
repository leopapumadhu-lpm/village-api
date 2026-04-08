import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { PrismaClient } from "@prisma/client";
import { createClient } from "redis";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const app = express();
const prisma = new PrismaClient();

const redis = createClient({ url: process.env.REDIS_URL });
redis.on("error", (err) => console.error("Redis error:", err));
await redis.connect();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

async function authenticate(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) return res.status(401).json({ success: false, error: { code: "INVALID_API_KEY", message: "API key missing" }});

  const cached = await redis.get(`apikey:${apiKey}`);
  let keyRecord = cached ? JSON.parse(cached) : null;

  if (!keyRecord) {
    keyRecord = await prisma.apiKey.findUnique({
      where: { key: apiKey, isActive: true },
      include: { user: { include: { stateAccess: true } } },
    });
    if (!keyRecord) return res.status(401).json({ success: false, error: { code: "INVALID_API_KEY", message: "Invalid API key" }});
    await redis.setEx(`apikey:${apiKey}`, 300, JSON.stringify(keyRecord));
  }

  if (keyRecord.user.status !== "ACTIVE")
    return res.status(403).json({ success: false, error: { code: "ACCESS_DENIED", message: "Account not active" }});

  const today = new Date().toISOString().slice(0, 10);
  const limits = { FREE: 1000, PREMIUM: 10000, PRO: 50000, UNLIMITED: 999999999 };
  const limit = limits[keyRecord.user.planType] ?? 1000;
  const usage = await redis.incr(`ratelimit:${keyRecord.userId}:${today}`);
  if (usage === 1) await redis.expire(`ratelimit:${keyRecord.userId}:${today}`, 86400);
  if (usage > limit) return res.status(429).json({ success: false, error: { code: "RATE_LIMITED", message: "Daily quota exceeded" }});

  req.apiKey = keyRecord;
  req.user = keyRecord.user;
  req.rateLimit = { remaining: Math.max(0, limit - usage), limit, reset: `${today}T23:59:59Z` };
  prisma.apiKey.update({ where: { id: keyRecord.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  next();
}

function success(data, res, req) {
  return res.json({
    success: true,
    count: Array.isArray(data) ? data.length : 1,
    data,
    meta: { requestId: `req_${randomUUID().slice(0,8)}`, responseTime: Date.now() - req._startTime, rateLimit: req.rateLimit }
  });
}

// JWT Authentication Middleware
function authenticateJWT(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, error: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({ success: false, error: "Invalid token" });
  }
}

app.use((req, _res, next) => { req._startTime = Date.now(); next(); });

// ===== AUTH ENDPOINTS =====
app.post("/admin/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, error: "Email and password required" });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ success: false, error: "Invalid credentials" });

    const isValid = await bcrypt.compare(password, user.passwordHash || "");
    if (!isValid) return res.status(401).json({ success: false, error: "Invalid credentials" });
    if (user.status !== "ACTIVE") return res.status(403).json({ success: false, error: "Account not active" });

    const token = jwt.sign({ id: user.id, email: user.email, role: "admin" }, process.env.JWT_SECRET || "your-secret-key", { expiresIn: "24h" });
    res.json({ success: true, data: { token, user: { id: user.id, email: user.email, businessName: user.businessName } } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/auth/register", async (req, res) => {
  const { email, businessName, phone, gstNumber, password } = req.body;
  if (!email || !businessName || !password) return res.status(400).json({ success: false, error: "Missing required fields" });

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ success: false, error: "User already exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, businessName, passwordHash, status: "PENDING_APPROVAL" },
    });

    res.status(201).json({ success: true, data: { message: "Registration successful. Admin approval pending.", email: user.email } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== ADMIN ENDPOINTS =====
app.get("/admin/users", authenticateJWT, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ success: false, error: "Admin only" });

  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, businessName: true, planType: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    });
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.patch("/admin/users/:id/approve", authenticateJWT, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ success: false, error: "Admin only" });

  try {
    const user = await prisma.user.update({
      where: { id: parseInt(req.params.id) },
      data: { status: "ACTIVE" },
    });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.patch("/admin/users/:id/plan", authenticateJWT, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ success: false, error: "Admin only" });
  const { planType } = req.body;

  try {
    const user = await prisma.user.update({
      where: { id: parseInt(req.params.id) },
      data: { planType },
    });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/admin/analytics", authenticateJWT, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ success: false, error: "Admin only" });

  try {
    const [totalVillages, activeUsers, totalRequests] = await Promise.all([
      prisma.village.count(),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.apiLog.count()
    ]);

    res.json({ success: true, data: { totalVillages, activeUsers, totalRequests } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/admin/logs", authenticateJWT, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ success: false, error: "Admin only" });

  try {
    const logs = await prisma.apiLog.findMany({
      include: { user: { select: { businessName: true, email: true } }, apiKey: { select: { key: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== VILLAGE API ENDPOINTS =====

app.get("/v1/states", authenticate, async (req, res) => {
  const cached = await redis.get("states:all");
  if (cached) return success(JSON.parse(cached), res, req);
  const states = await prisma.state.findMany({ orderBy: { name: "asc" }, select: { id: true, code: true, name: true } });
  await redis.setEx("states:all", 3600, JSON.stringify(states));
  return success(states, res, req);
});

app.get("/v1/states/:id/districts", authenticate, async (req, res) => {
  const stateId = parseInt(req.params.id);
  if (isNaN(stateId)) return res.status(400).json({ success: false, error: { code: "INVALID_QUERY", message: "Invalid state ID" }});
  const cached = await redis.get(`districts:state:${stateId}`);
  if (cached) return success(JSON.parse(cached), res, req);
  const districts = await prisma.district.findMany({ where: { stateId }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } });
  if (!districts.length) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "State not found" }});
  await redis.setEx(`districts:state:${stateId}`, 3600, JSON.stringify(districts));
  return success(districts, res, req);
});

app.get("/v1/districts/:id/subdistricts", authenticate, async (req, res) => {
  const districtId = parseInt(req.params.id);
  if (isNaN(districtId)) return res.status(400).json({ success: false, error: { code: "INVALID_QUERY", message: "Invalid district ID" }});
  const cached = await redis.get(`subdistricts:district:${districtId}`);
  if (cached) return success(JSON.parse(cached), res, req);
  const subs = await prisma.subDistrict.findMany({ where: { districtId }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } });
  if (!subs.length) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "District not found" }});
  await redis.setEx(`subdistricts:district:${districtId}`, 3600, JSON.stringify(subs));
  return success(subs, res, req);
});

app.get("/v1/subdistricts/:id/villages", authenticate, async (req, res) => {
  const subDistrictId = parseInt(req.params.id);
  const page = Math.max(1, parseInt(req.query.page ?? "1"));
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit ?? "100")));
  if (isNaN(subDistrictId)) return res.status(400).json({ success: false, error: { code: "INVALID_QUERY", message: "Invalid sub-district ID" }});
  const [villages, total] = await Promise.all([
    prisma.village.findMany({ where: { subDistrictId }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true }, skip: (page-1)*limit, take: limit }),
    prisma.village.count({ where: { subDistrictId } })
  ]);
  return res.json({ success: true, count: villages.length, total, page, pages: Math.ceil(total/limit), data: villages });
});

app.get("/v1/search", authenticate, async (req, res) => {
  const q = (req.query.q ?? "").trim();
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? "25")));
  if (q.length < 2) return res.status(400).json({ success: false, error: { code: "INVALID_QUERY", message: "Query must be at least 2 characters" }});
  const villages = await prisma.village.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    take: limit,
    select: { id: true, code: true, name: true, subDistrict: { select: { name: true, district: { select: { name: true, state: { select: { name: true } } } } } } }
  });
  const data = villages.map(v => ({
    value: `village_id_${v.code}`,
    label: v.name,
    fullAddress: `${v.name}, ${v.subDistrict.name}, ${v.subDistrict.district.name}, ${v.subDistrict.district.state.name}, India`,
    hierarchy: { village: v.name, subDistrict: v.subDistrict.name, district: v.subDistrict.district.name, state: v.subDistrict.district.state.name, country: "India" }
  }));
  return success(data, res, req);
});

app.get("/v1/autocomplete", authenticate, async (req, res) => {
  const q = (req.query.q ?? "").trim();
  if (q.length < 2) return res.status(400).json({ success: false, error: { code: "INVALID_QUERY", message: "Query must be at least 2 characters" }});
  const cached = await redis.get(`autocomplete:${q.toLowerCase()}`);
  if (cached) return success(JSON.parse(cached), res, req);
  const villages = await prisma.village.findMany({
    where: { name: { startsWith: q, mode: "insensitive" } },
    take: 15,
    select: { id: true, name: true, code: true, subDistrict: { select: { name: true, district: { select: { name: true, state: { select: { name: true } } } } } } }
  });
  const suggestions = villages.map(v => ({ id: v.id, label: v.name, sublabel: `${v.subDistrict.name}, ${v.subDistrict.district.name}`, state: v.subDistrict.district.state.name }));
  await redis.setEx(`autocomplete:${q.toLowerCase()}`, 60, JSON.stringify(suggestions));
  return success(suggestions, res, req);
});

// ===== B2B USER ENDPOINTS =====

// Get B2B user dashboard stats
app.get("/b2b/dashboard", authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's daily quota info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { planType: true }
    });

    const today = new Date().toISOString().slice(0, 10);
    const plans = { FREE: 1000, PREMIUM: 10000, PRO: 50000, UNLIMITED: 999999999 };
    const dailyLimit = plans[user.planType] || 1000;

    // Get today's usage
    const todayUsage = await redis.get(`ratelimit:${userId}:${today}`) || 0;

    // Get user's API logs for usage stats
    const logs = await prisma.apiLog.findMany({
      where: { userId },
      select: { responseTime: true, createdAt: true, statusCode: true },
      orderBy: { createdAt: "desc" },
      take: 1000
    });

    const totalRequests = logs.length;
    const avgResponseTime = logs.length > 0
      ? Math.round(logs.reduce((a, b) => a + b.responseTime, 0) / logs.length)
      : 0;
    const successRate = logs.length > 0
      ? Math.round((logs.filter(l => l.statusCode >= 200 && l.statusCode < 300).length / logs.length) * 100)
      : 0;

    // Last 7 days usage chart data
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const count = logs.filter(l => l.createdAt.toISOString().slice(0, 10) === dateStr).length;
      last7Days.push({ date: dateStr, requests: count });
    }

    res.json({
      success: true,
      data: {
        plan: user.planType,
        dailyLimit,
        todayUsage: parseInt(todayUsage) || 0,
        totalRequests,
        avgResponseTime,
        successRate,
        chartData: last7Days
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List user's API keys
app.get("/b2b/apikeys", authenticateJWT, async (req, res) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { userId: req.user.id },
      select: { id: true, name: true, key: true, isActive: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: "desc" }
    });

    res.json({
      success: true,
      data: keys.map(k => ({
        ...k,
        key: k.key.slice(0, 10) + "..." + k.key.slice(-4) // Mask key
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new API key
app.post("/b2b/apikeys", authenticateJWT, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, error: "Key name required" });

  try {
    // Generate random key and secret
    const key = "ak_" + randomUUID().replace(/-/g, "").slice(0, 28);
    const secret = "as_" + randomUUID().replace(/-/g, "").slice(0, 28);
    const secretHash = await bcrypt.hash(secret, 10);

    const apiKey = await prisma.apiKey.create({
      data: {
        name,
        key,
        secretHash,
        userId: req.user.id,
        isActive: true
      }
    });

    res.status(201).json({
      success: true,
      data: {
        id: apiKey.id,
        name: apiKey.name,
        key, // Show full key only once
        secret, // Show full secret only once
        createdAt: apiKey.createdAt,
        warning: "Store the API key and secret securely. You won't see the secret again!"
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Revoke API key
app.delete("/b2b/apikeys/:keyId", authenticateJWT, async (req, res) => {
  try {
    const keyId = parseInt(req.params.keyId);

    // Verify ownership
    const apiKey = await prisma.apiKey.findUnique({ where: { id: keyId } });
    if (!apiKey || apiKey.userId !== req.user.id) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    await prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: false }
    });

    res.json({ success: true, data: { message: "API key revoked" } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Regenerate API key secret
app.post("/b2b/apikeys/:keyId/regenerate", authenticateJWT, async (req, res) => {
  try {
    const keyId = parseInt(req.params.keyId);

    // Verify ownership
    const apiKey = await prisma.apiKey.findUnique({ where: { id: keyId } });
    if (!apiKey || apiKey.userId !== req.user.id) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    const newSecret = "as_" + randomUUID().replace(/-/g, "").slice(0, 28);
    const newSecretHash = await bcrypt.hash(newSecret, 10);

    await prisma.apiKey.update({
      where: { id: keyId },
      data: { secretHash: newSecretHash }
    });

    res.json({
      success: true,
      data: {
        message: "Secret regenerated",
        secret: newSecret,
        warning: "Store the new secret securely. The old secret is now invalid!"
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get API key usage statistics
app.get("/b2b/apikeys/:keyId/usage", authenticateJWT, async (req, res) => {
  try {
    const keyId = parseInt(req.params.keyId);

    // Verify ownership
    const apiKey = await prisma.apiKey.findUnique({
      where: { id: keyId },
      include: { apiLogs: { select: { responseTime: true, createdAt: true, endpoint: true, statusCode: true } } }
    });

    if (!apiKey || apiKey.userId !== req.user.id) {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    const logs = apiKey.apiLogs;
    const totalRequests = logs.length;
    const avgResponseTime = logs.length > 0
      ? Math.round(logs.reduce((a, b) => a + b.responseTime, 0) / logs.length)
      : 0;

    // Group by endpoint
    const endpointStats = {};
    logs.forEach(log => {
      if (!endpointStats[log.endpoint]) {
        endpointStats[log.endpoint] = { count: 0, avgTime: 0, totalTime: 0 };
      }
      endpointStats[log.endpoint].count++;
      endpointStats[log.endpoint].totalTime += log.responseTime;
    });

    Object.keys(endpointStats).forEach(endpoint => {
      endpointStats[endpoint].avgTime = Math.round(
        endpointStats[endpoint].totalTime / endpointStats[endpoint].count
      );
    });

    res.json({
      success: true,
      data: {
        keyName: apiKey.name,
        totalRequests,
        avgResponseTime,
        endpointStats,
        lastUsed: apiKey.lastUsedAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" }});
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`Village API running on port ${PORT}`));