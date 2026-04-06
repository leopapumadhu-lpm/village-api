import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { PrismaClient } from "@prisma/client";
import { createClient } from "redis";
import { randomUUID } from "crypto";

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

app.use((req, _res, next) => { req._startTime = Date.now(); next(); });

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

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" }});
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`Village API running on port ${PORT}`));