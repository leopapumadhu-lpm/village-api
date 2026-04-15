import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import swaggerUi from 'swagger-ui-express';
import csrf from 'csurf';
import { sendApprovalEmail } from './services/emailService.js';
import paymentRoutes from './routes/payments.js';
import webhookRoutes from './routes/webhooks.js';
import teamRoutes from './routes/teams.js';
import analyticsRoutes from './routes/analytics.js';
import { specs } from './swagger.js';
import { getDocsPage } from './docs.js';

// CSRF Protection (for state-changing operations)

// Validate required environment variables
const requiredEnvVars = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

const app = express();
const prisma = new PrismaClient();

// Redis client with retry logic
const redis = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 5000),
  },
});

redis.on('error', (err) => console.error('Redis error:', err));
redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('reconnecting', () => console.log('🔄 Redis reconnecting...'));

// Connect to Redis
redis.connect().catch((err) => {
  console.error('❌ Failed to connect to Redis:', err.message);
  process.exit(1);
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ['\'self\''],
      styleSrc: ['\'self\'', '\'unsafe-inline\'', 'https:'],
      scriptSrc: ['\'self\'', '\'unsafe-inline\''],
      imgSrc: ['\'self\'', 'data:', 'https:'],
      connectSrc: ['\'self\'', 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Cookie parser middleware (for refresh tokens)
app.use(cookieParser());

// CORS configuration with production validation
const corsOrigins = process.env.CORS_ORIGINS?.split(',')
  ?? (process.env.NODE_ENV === 'production'
    ? ['https://yourdomain.com', 'https://admin.yourdomain.com']
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175']);

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-CSRF-Token'],
}));

// Parse JSON with limit
app.use(express.json({ limit: '10mb' }));

// Global rate limiting
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
}));

// Custom security headers (per spec section 10.3)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', 'default-src \'self\' \'unsafe-inline\' \'unsafe-eval\' https:; frame-ancestors \'self\'');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});
const csrfProtection = csrf({ cookie: true });

// Helper function to mask errors in production
function maskError(error, req) {
  const errorId = randomUUID().slice(0, 8);
  if (process.env.NODE_ENV === 'production') {
    console.error(`Error ${errorId}:`, error);
    return `Internal server error (Reference: ${errorId})`;
  }
  return error.message;
}

// Authentication middleware for API key
async function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const apiSecret = req.headers['x-api-secret'];
  const method = (req.method || 'GET').toUpperCase();
  const requiresSecret = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_API_KEY', message: 'API key missing' },
    });
  }

  try {
    const cached = await redis.get(`apikey:${apiKey}`);
    let keyRecord = cached ? JSON.parse(cached) : null;

    if (!keyRecord) {
      keyRecord = await prisma.apiKey.findUnique({
        where: { key: apiKey, isActive: true },
        include: { user: { include: { stateAccess: true } } },
      });

      if (!keyRecord) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_API_KEY', message: 'Invalid API key' },
        });
      }

      await redis.setEx(`apikey:${apiKey}`, 300, JSON.stringify(keyRecord));
    }

    if (keyRecord.user.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCESS_DENIED', message: 'Account not active' },
      });
    }

    if (requiresSecret) {
      if (!apiSecret) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_API_SECRET', message: 'API secret missing' },
        });
      }
      const isSecretValid = keyRecord.secretHash
        ? await bcrypt.compare(apiSecret, keyRecord.secretHash)
        : false;
      if (!isSecretValid) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_API_SECRET', message: 'Invalid API secret' },
        });
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const limits = {
      FREE: 5000, PREMIUM: 50000, PRO: 300000, UNLIMITED: 1000000,
    };
    const limit = limits[keyRecord.user.planType] ?? 1000;

    // Fixed race condition in rate limiting
    const key = `ratelimit:${keyRecord.userId}:${today}`;
    const usage = await redis.incr(key);

    if (usage === 1) {
      await redis.expire(key, 86400);
    } else {
      // Ensure TTL exists (handle race condition)
      const ttl = await redis.ttl(key);
      if (ttl === -1) await redis.expire(key, 86400);
    }

    if (usage > limit) {
      const reset = `${today}T23:59:59Z`;
      const resetEpoch = Math.floor(new Date(reset).getTime() / 1000);
      applyRateLimitHeaders(res, {
        limit, remaining: 0, reset, resetEpoch,
      });

      // Send quota exceeded notification asynchronously
      setImmediate(() => {
        import('./services/emailService.js').then(({ sendUsageExceededEmail }) => {
          sendUsageExceededEmail(keyRecord.user, { dailyLimit: limit }).catch(console.error);
        });
      });

      return res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Daily quota exceeded' },
      });
    }

    // Check for usage alert thresholds (80%, 95%)
    const usagePercentage = (usage / limit) * 100;
    if (usagePercentage >= 80 && usagePercentage < 95) {
      const alertKey = `alert:80:${keyRecord.userId}:${today}`;
      const alertSent = await redis.get(alertKey);
      if (!alertSent) {
        await redis.setEx(alertKey, 86400, 'sent');
        setImmediate(() => {
          import('./services/emailService.js').then(({ sendUsageAlert }) => {
            sendUsageAlert(keyRecord.user, usagePercentage, usage, limit).catch(console.error);
          });
        });
      }
    } else if (usagePercentage >= 95) {
      const alertKey = `alert:95:${keyRecord.userId}:${today}`;
      const alertSent = await redis.get(alertKey);
      if (!alertSent) {
        await redis.setEx(alertKey, 86400, 'sent');
        setImmediate(() => {
          import('./services/emailService.js').then(({ sendUsageAlert }) => {
            sendUsageAlert(keyRecord.user, usagePercentage, usage, limit).catch(console.error);
          });
        });
      }
    }

    req.apiKey = keyRecord;
    req.user = keyRecord.user;
    req.rateLimit = {
      remaining: Math.max(0, limit - usage),
      limit,
      reset: `${today}T23:59:59Z`,
      resetEpoch: Math.floor(new Date(`${today}T23:59:59Z`).getTime() / 1000),
      usagePercentage: Math.round(usagePercentage),
    };

    // Fire-and-forget update with proper error handling
    setImmediate(() => {
      prisma.apiKey.update({
        where: { id: keyRecord.id },
        data: { lastUsedAt: new Date() },
      }).catch((err) => console.error('Failed to update lastUsedAt:', err));
    });

    next();
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
}

// Success response formatter
function applyRateLimitHeaders(res, rateLimit) {
  if (!rateLimit) return;
  const resetEpoch = rateLimit.resetEpoch ?? Math.floor(new Date(rateLimit.reset).getTime() / 1000);
  res.setHeader('X-RateLimit-Limit', String(rateLimit.limit));
  res.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
  res.setHeader('X-RateLimit-Reset', String(resetEpoch));
}

function success(data, res, req) {
  applyRateLimitHeaders(res, req.rateLimit);
  return res.json({
    success: true,
    count: Array.isArray(data) ? data.length : 1,
    data,
    meta: {
      requestId: `req_${randomUUID().slice(0, 8)}`,
      responseTime: Date.now() - req._startTime,
      rateLimit: req.rateLimit,
    },
  });
}

// JWT Authentication Middleware with refresh token support
function authenticateJWT(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
    }
    res.status(403).json({ success: false, error: 'Invalid token' });
  }
}

// Refresh token endpoint
app.post('/auth/refresh', async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) {
    return res.status(401).json({ success: false, error: 'No refresh token' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const newAccessToken = jwt.sign(
      { id: decoded.id, email: decoded.email, role: decoded.role },
      process.env.JWT_SECRET,
      { expiresIn: '15m', algorithm: 'HS256' },
    );
    res.json({ success: true, data: { accessToken: newAccessToken } });
  } catch (error) {
    res.status(403).json({ success: false, error: 'Invalid refresh token' });
  }
});

// Logout endpoint
app.post('/auth/logout', (req, res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.json({ success: true, message: 'Logged out successfully' });
});

// Request timing middleware
app.use((req, _res, next) => {
  req._startTime = Date.now();
  next();
});

// Health check endpoint (no auth required)
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    // Check Redis connection
    await redis.ping();

    res.json({
      status: 'ok',
      timestamp: new Date(),
      services: {
        database: 'connected',
        redis: 'connected',
        api: 'running',
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'degraded',
      timestamp: new Date(),
      error: error.message,
    });
  }
});

// CSRF token endpoint
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// ===== AUTH ENDPOINTS =====
app.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;

  // Input validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password required' });
  }
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email format' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash || '');
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ success: false, error: 'Account not active' });
    }

    // Short-lived access token
    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '15m', algorithm: 'HS256' },
    );

    // Refresh token (store in HTTP-only cookie)
    const refreshToken = jwt.sign(
      { id: user.id, email: user.email, role: 'admin' },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' },
    );

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({
      success: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          businessName: user.businessName,
          planType: user.planType,
          status: user.status,
        },
      },
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

app.post('/auth/register', async (req, res) => {
  const {
    email, businessName, phone, gstNumber, password,
  } = req.body;

  // Input validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !businessName || !password) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email format' });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        businessName,
        phone: phone || null,
        gstNumber: gstNumber || null,
        passwordHash,
        status: 'PENDING_APPROVAL',
        planType: 'FREE',
      },
    });

    // Notify admin about new registration (optional)
    console.log(`📝 New registration: ${email} (${businessName})`);

    res.status(201).json({
      success: true,
      data: {
        message: 'Registration successful. Admin approval pending.',
        email: user.email,
        businessName: user.businessName,
      },
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

// ===== ADMIN ENDPOINTS =====
app.get('/admin/users', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        businessName: true,
        planType: true,
        status: true,
        createdAt: true,
        phone: true,
        gstNumber: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: users, count: users.length });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

app.patch('/admin/users/:id/approve', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }

  try {
    // Handle both Int and String IDs
    const { id } = req.params;
    const whereId = isNaN(parseInt(id)) ? id : parseInt(id);

    const user = await prisma.user.update({
      where: { id: whereId },
      data: { status: 'ACTIVE' },
    });

    // Send approval email to user (spec 8.2)
    await sendApprovalEmail(user).catch((err) => {
      console.error('Failed to send approval email:', err);
    });

    res.json({ success: true, data: user });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

app.patch('/admin/users/:id/plan', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }

  const { planType } = req.body;
  const validPlans = ['FREE', 'PREMIUM', 'PRO', 'UNLIMITED'];

  if (!planType || !validPlans.includes(planType)) {
    return res.status(400).json({
      success: false,
      error: `Invalid plan type. Must be one of: ${validPlans.join(', ')}`,
    });
  }

  try {
    const { id } = req.params;
    const whereId = isNaN(parseInt(id)) ? id : parseInt(id);

    const user = await prisma.user.update({
      where: { id: whereId },
      data: { planType },
    });
    res.json({ success: true, data: user });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

app.get('/admin/analytics', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }

  try {
    const [totalVillages, activeUsers, totalRequests, pendingApprovals] = await Promise.all([
      prisma.village.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.apiLog.count(),
      prisma.user.count({ where: { status: 'PENDING_APPROVAL' } }),
    ]);

    res.json({
      success: true,
      data: {
        totalVillages,
        activeUsers,
        totalRequests,
        pendingApprovals,
      },
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

app.get('/admin/logs', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }

  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.apiLog.findMany({
        include: {
          user: { select: { businessName: true, email: true } },
          apiKey: { select: { key: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.apiLog.count(),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

// ===== VILLAGE API ENDPOINTS =====

app.get('/v1/states', authenticate, async (req, res) => {
  try {
    const stateAccessIds = Array.isArray(req.user?.stateAccess)
      ? req.user.stateAccess
        .map((entry) => entry?.stateId ?? entry?.id)
        .filter((id) => Number.isInteger(id))
      : [];
    const hasRestrictedStateAccess = stateAccessIds.length > 0;
    const cacheKey = hasRestrictedStateAccess
      ? `states:restricted:${stateAccessIds.sort((a, b) => a - b).join(',')}`
      : 'states:all';

    const cached = await redis.get(cacheKey);
    if (cached) return success(JSON.parse(cached), res, req);

    const states = await prisma.state.findMany({
      where: hasRestrictedStateAccess ? { id: { in: stateAccessIds } } : undefined,
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true },
    });

    await redis.setEx(cacheKey, 3600, JSON.stringify(states));
    return success(states, res, req);
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

app.get('/v1/states/:id/districts', authenticate, async (req, res) => {
  try {
    const stateId = parseInt(req.params.id);
    if (isNaN(stateId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_QUERY', message: 'Invalid state ID' },
      });
    }

    const stateAccessIds = Array.isArray(req.user?.stateAccess)
      ? req.user.stateAccess
        .map((entry) => entry?.stateId ?? entry?.id)
        .filter((id) => Number.isInteger(id))
      : [];
    if (stateAccessIds.length > 0 && !stateAccessIds.includes(stateId)) {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCESS_DENIED', message: 'Not authorized for requested state' },
      });
    }

    const cached = await redis.get(`districts:state:${stateId}`);
    if (cached) return success(JSON.parse(cached), res, req);

    const districts = await prisma.district.findMany({
      where: { stateId },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true },
    });

    if (!districts.length) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'State not found' },
      });
    }

    await redis.setEx(`districts:state:${stateId}`, 3600, JSON.stringify(districts));
    return success(districts, res, req);
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

app.get('/v1/districts/:id/subdistricts', authenticate, async (req, res) => {
  try {
    const districtId = parseInt(req.params.id);
    if (isNaN(districtId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_QUERY', message: 'Invalid district ID' },
      });
    }

    const cached = await redis.get(`subdistricts:district:${districtId}`);
    if (cached) return success(JSON.parse(cached), res, req);

    const subs = await prisma.subDistrict.findMany({
      where: { districtId },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true },
    });

    if (!subs.length) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'District not found' },
      });
    }

    await redis.setEx(`subdistricts:district:${districtId}`, 3600, JSON.stringify(subs));
    return success(subs, res, req);
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

app.get('/v1/subdistricts/:id/villages', authenticate, async (req, res) => {
  try {
    const subDistrictId = parseInt(req.params.id);
    const page = Math.max(1, parseInt(req.query.page ?? '1'));
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit ?? '100')));

    if (isNaN(subDistrictId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_QUERY', message: 'Invalid sub-district ID' },
      });
    }

    const [villages, total] = await Promise.all([
      prisma.village.findMany({
        where: { subDistrictId },
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.village.count({ where: { subDistrictId } }),
    ]);

    applyRateLimitHeaders(res, req.rateLimit);
    return res.json({
      success: true,
      count: villages.length,
      data: villages,
      meta: {
        requestId: `req_${randomUUID().slice(0, 8)}`,
        responseTime: Date.now() - req._startTime,
        rateLimit: req.rateLimit,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit,
        },
      },
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

app.get('/v1/search', authenticate, async (req, res) => {
  try {
    const q = (req.query.q ?? '').trim();
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '25')));
    const stateQuery = (req.query.state ?? '').toString().trim();
    const districtQuery = (req.query.district ?? '').toString().trim();
    const subDistrictQuery = (req.query.subDistrict ?? '').toString().trim();

    if (q.length < 2) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_QUERY', message: 'Query must be at least 2 characters' },
      });
    }

    const stateAccessIds = Array.isArray(req.user?.stateAccess)
      ? req.user.stateAccess
        .map((entry) => entry?.stateId ?? entry?.id)
        .filter((id) => Number.isInteger(id))
      : [];
    const hasRestrictedStateAccess = stateAccessIds.length > 0;
    const parsedStateId = parseInt(stateQuery, 10);

    if (hasRestrictedStateAccess && stateQuery && !isNaN(parsedStateId) && !stateAccessIds.includes(parsedStateId)) {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCESS_DENIED', message: 'Not authorized for requested state' },
      });
    }

    const subDistrictWhere = {};

    if (subDistrictQuery) {
      const parsedSubDistrictId = parseInt(subDistrictQuery, 10);
      if (!isNaN(parsedSubDistrictId)) {
        subDistrictWhere.id = parsedSubDistrictId;
      } else {
        subDistrictWhere.name = { contains: subDistrictQuery, mode: 'insensitive' };
      }
    }

    if (districtQuery) {
      const parsedDistrictId = parseInt(districtQuery, 10);
      if (!isNaN(parsedDistrictId)) {
        subDistrictWhere.districtId = parsedDistrictId;
      } else {
        subDistrictWhere.district = {
          ...(subDistrictWhere.district ?? {}),
          name: { contains: districtQuery, mode: 'insensitive' },
        };
      }
    }

    if (stateQuery) {
      if (!isNaN(parsedStateId)) {
        subDistrictWhere.district = {
          ...(subDistrictWhere.district ?? {}),
          stateId: parsedStateId,
        };
      } else {
        subDistrictWhere.district = {
          ...(subDistrictWhere.district ?? {}),
          state: { name: { contains: stateQuery, mode: 'insensitive' } },
        };
      }
    }

    if (hasRestrictedStateAccess) {
      subDistrictWhere.district = {
        ...(subDistrictWhere.district ?? {}),
        stateId: { in: stateAccessIds },
      };
    }

    const villages = await prisma.village.findMany({
      where: {
        name: { contains: q, mode: 'insensitive' },
        ...(Object.keys(subDistrictWhere).length > 0 ? { subDistrict: subDistrictWhere } : {}),
      },
      take: limit,
      select: {
        id: true,
        code: true,
        name: true,
        subDistrict: {
          select: {
            name: true,
            district: {
              select: {
                name: true,
                state: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    const data = villages.map((v) => ({
      value: `village_id_${v.code}`,
      label: v.name,
      fullAddress: `${v.name}, ${v.subDistrict.name}, ${v.subDistrict.district.name}, ${v.subDistrict.district.state.name}, India`,
      hierarchy: {
        village: v.name,
        subDistrict: v.subDistrict.name,
        district: v.subDistrict.district.name,
        state: v.subDistrict.district.state.name,
        country: 'India',
      },
    }));

    return success(data, res, req);
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

app.get('/v1/autocomplete', authenticate, async (req, res) => {
  try {
    const q = (req.query.q ?? '').trim();
    const hierarchyLevel = (req.query.hierarchyLevel ?? 'village').toString().trim().toLowerCase();
    const validLevels = ['village', 'subdistrict', 'district', 'state'];

    if (q.length < 2) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_QUERY', message: 'Query must be at least 2 characters' },
      });
    }
    if (!validLevels.includes(hierarchyLevel)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_QUERY', message: 'Invalid hierarchyLevel' },
      });
    }

    const cached = await redis.get(`autocomplete:${hierarchyLevel}:${q.toLowerCase()}`);
    if (cached) return success(JSON.parse(cached), res, req);

    let suggestions = [];

    if (hierarchyLevel === 'state') {
      const states = await prisma.state.findMany({
        where: { name: { startsWith: q, mode: 'insensitive' } },
        orderBy: { name: 'asc' },
        take: 15,
        select: { id: true, code: true, name: true },
      });
      suggestions = states.map((state) => ({
        id: state.id,
        value: `state_id_${state.code}`,
        label: state.name,
        sublabel: 'India',
        state: state.name,
        fullAddress: `${state.name}, India`,
        hierarchy: {
          village: null,
          subDistrict: null,
          district: null,
          state: state.name,
          country: 'India',
        },
      }));
    } else if (hierarchyLevel === 'district') {
      const districts = await prisma.district.findMany({
        where: { name: { startsWith: q, mode: 'insensitive' } },
        orderBy: { name: 'asc' },
        take: 15,
        select: {
          id: true,
          code: true,
          name: true,
          state: { select: { name: true } },
        },
      });
      suggestions = districts.map((district) => ({
        id: district.id,
        value: `district_id_${district.code}`,
        label: district.name,
        sublabel: `${district.state.name}, India`,
        state: district.state.name,
        fullAddress: `${district.name}, ${district.state.name}, India`,
        hierarchy: {
          village: null,
          subDistrict: null,
          district: district.name,
          state: district.state.name,
          country: 'India',
        },
      }));
    } else if (hierarchyLevel === 'subdistrict') {
      const subDistricts = await prisma.subDistrict.findMany({
        where: { name: { startsWith: q, mode: 'insensitive' } },
        orderBy: { name: 'asc' },
        take: 15,
        select: {
          id: true,
          code: true,
          name: true,
          district: {
            select: {
              name: true,
              state: { select: { name: true } },
            },
          },
        },
      });
      suggestions = subDistricts.map((subDistrict) => ({
        id: subDistrict.id,
        value: `subdistrict_id_${subDistrict.code}`,
        label: subDistrict.name,
        sublabel: `${subDistrict.district.name}, ${subDistrict.district.state.name}`,
        state: subDistrict.district.state.name,
        fullAddress: `${subDistrict.name}, ${subDistrict.district.name}, ${subDistrict.district.state.name}, India`,
        hierarchy: {
          village: null,
          subDistrict: subDistrict.name,
          district: subDistrict.district.name,
          state: subDistrict.district.state.name,
          country: 'India',
        },
      }));
    } else {
      const villages = await prisma.village.findMany({
        where: { name: { startsWith: q, mode: 'insensitive' } },
        take: 15,
        select: {
          id: true,
          name: true,
          code: true,
          subDistrict: {
            select: {
              name: true,
              district: {
                select: {
                  name: true,
                  state: { select: { name: true } },
                },
              },
            },
          },
        },
      });
      suggestions = villages.map((v) => ({
        id: v.id,
        value: `village_id_${v.code}`,
        label: v.name,
        sublabel: `${v.subDistrict.name}, ${v.subDistrict.district.name}`,
        state: v.subDistrict.district.state.name,
        fullAddress: `${v.name}, ${v.subDistrict.name}, ${v.subDistrict.district.name}, ${v.subDistrict.district.state.name}, India`,
        hierarchy: {
          village: v.name,
          subDistrict: v.subDistrict.name,
          district: v.subDistrict.district.name,
          state: v.subDistrict.district.state.name,
          country: 'India',
        },
      }));
    }

    await redis.setEx(`autocomplete:${hierarchyLevel}:${q.toLowerCase()}`, 60, JSON.stringify(suggestions));
    return success(suggestions, res, req);
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

// ===== B2B USER ENDPOINTS =====

// Get B2B user dashboard stats
app.get('/b2b/dashboard', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's daily quota info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { planType: true },
    });

    const today = new Date().toISOString().slice(0, 10);
    const plans = {
      FREE: 1000, PREMIUM: 10000, PRO: 50000, UNLIMITED: 999999999,
    };
    const dailyLimit = plans[user.planType] || 1000;

    // Get today's usage
    const todayUsage = await redis.get(`ratelimit:${userId}:${today}`) || 0;

    // Get user's API logs for usage stats
    const logs = await prisma.apiLog.findMany({
      where: { userId },
      select: { responseTime: true, createdAt: true, statusCode: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    const totalRequests = logs.length;
    const avgResponseTime = logs.length > 0
      ? Math.round(logs.reduce((a, b) => a + b.responseTime, 0) / logs.length)
      : 0;
    const successRate = logs.length > 0
      ? Math.round((logs.filter((l) => l.statusCode >= 200 && l.statusCode < 300).length / logs.length) * 100)
      : 0;

    // Last 7 days usage chart data
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const count = logs.filter((l) => l.createdAt.toISOString().slice(0, 10) === dateStr).length;
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
        chartData: last7Days,
      },
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

// List user's API keys
app.get('/b2b/apikeys', authenticateJWT, async (req, res) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { userId: req.user.id, isActive: true },
      select: {
        id: true, name: true, key: true, isActive: true, createdAt: true, lastUsedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: keys.map((k) => ({
        ...k,
        key: `${k.key.slice(0, 10)}...${k.key.slice(-4)}`, // Mask key
      })),
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

// Create new API key
app.post('/b2b/apikeys', authenticateJWT, async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, error: 'Key name required' });
  }

  try {
    // Generate random key and secret
    const key = `ak_${randomUUID().replace(/-/g, '').slice(0, 28)}`;
    const secret = `as_${randomUUID().replace(/-/g, '').slice(0, 28)}`;
    const secretHash = await bcrypt.hash(secret, 10);

    const apiKey = await prisma.apiKey.create({
      data: {
        name,
        key,
        secretHash,
        userId: req.user.id,
        isActive: true,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: apiKey.id,
        name: apiKey.name,
        key, // Show full key only once
        secret, // Show full secret only once
        createdAt: apiKey.createdAt,
        warning: 'Store the API key and secret securely. You won\'t see the secret again!',
      },
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

// Revoke API key
app.delete('/b2b/apikeys/:keyId', authenticateJWT, async (req, res) => {
  try {
    const keyId = parseInt(req.params.keyId);
    if (isNaN(keyId)) {
      return res.status(400).json({ success: false, error: 'Invalid key ID' });
    }

    // Verify ownership
    const apiKey = await prisma.apiKey.findUnique({ where: { id: keyId } });
    if (!apiKey || apiKey.userId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    await prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });

    // Invalidate Redis cache
    await redis.del(`apikey:${apiKey.key}`);

    res.json({ success: true, data: { message: 'API key revoked' } });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

// Regenerate API key secret
app.post('/b2b/apikeys/:keyId/regenerate', authenticateJWT, async (req, res) => {
  try {
    const keyId = parseInt(req.params.keyId);
    if (isNaN(keyId)) {
      return res.status(400).json({ success: false, error: 'Invalid key ID' });
    }

    // Verify ownership
    const apiKey = await prisma.apiKey.findUnique({ where: { id: keyId } });
    if (!apiKey || apiKey.userId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const newSecret = `as_${randomUUID().replace(/-/g, '').slice(0, 28)}`;
    const newSecretHash = await bcrypt.hash(newSecret, 10);

    await prisma.apiKey.update({
      where: { id: keyId },
      data: { secretHash: newSecretHash },
    });

    // Invalidate Redis cache
    await redis.del(`apikey:${apiKey.key}`);

    res.json({
      success: true,
      data: {
        message: 'Secret regenerated',
        secret: newSecret,
        warning: 'Store the new secret securely. The old secret is now invalid!',
      },
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

// Get API key usage statistics
app.get('/b2b/apikeys/:keyId/usage', authenticateJWT, async (req, res) => {
  try {
    const keyId = parseInt(req.params.keyId);
    if (isNaN(keyId)) {
      return res.status(400).json({ success: false, error: 'Invalid key ID' });
    }

    // Verify ownership
    const apiKey = await prisma.apiKey.findUnique({
      where: { id: keyId },
      include: {
        apiLogs: {
          select: {
            responseTime: true, createdAt: true, endpoint: true, statusCode: true,
          },
        },
      },
    });

    if (!apiKey || apiKey.userId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const logs = apiKey.apiLogs;
    const totalRequests = logs.length;
    const avgResponseTime = logs.length > 0
      ? Math.round(logs.reduce((a, b) => a + b.responseTime, 0) / logs.length)
      : 0;

    // Group by endpoint
    const endpointStats = {};
    logs.forEach((log) => {
      if (!endpointStats[log.endpoint]) {
        endpointStats[log.endpoint] = { count: 0, avgTime: 0, totalTime: 0 };
      }
      endpointStats[log.endpoint].count++;
      endpointStats[log.endpoint].totalTime += log.responseTime;
    });

    Object.keys(endpointStats).forEach((endpoint) => {
      endpointStats[endpoint].avgTime = Math.round(
        endpointStats[endpoint].totalTime / endpointStats[endpoint].count,
      );
    });

    res.json({
      success: true,
      data: {
        keyName: apiKey.name,
        totalRequests,
        avgResponseTime,
        endpointStats,
        lastUsed: apiKey.lastUsedAt,
      },
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

// Mount routes
app.use('/payments', authenticateJWT, paymentRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/teams', authenticateJWT, teamRoutes);
app.use('/b2b/analytics', authenticateJWT, analyticsRoutes);

// Documentation routes
app.get('/', (req, res) => res.send(getDocsPage()));
app.get('/docs', (req, res) => res.send(getDocsPage()));
app.get('/api-docs/', swaggerUi.serve, swaggerUi.setup(specs));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
app.get('/api-spec', (req, res) => res.json(specs));

// Global error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  const message = process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred'
    : err.message;
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message } });
});

// Initialize demo API key
async function initializeDemoKey() {
  try {
    // Check if demo user exists
    let demoUser = await prisma.user.findUnique({ where: { email: 'demo@villageapi.com' } });

    if (!demoUser) {
      const hashedPassword = await bcrypt.hash('Demo@123456', 10);
      demoUser = await prisma.user.create({
        data: {
          email: 'demo@villageapi.com',
          businessName: 'Village API Demo',
          passwordHash: hashedPassword,
          planType: 'UNLIMITED',
          status: 'ACTIVE',
        },
      });
      console.log('✅ Created demo user: demo@villageapi.com');
    }

    // Check if demo API key exists
    const existingKey = await prisma.apiKey.findFirst({
      where: { userId: demoUser.id, name: 'Demo Client Key' },
    });

    if (!existingKey) {
      const demoKey = `ak_${randomUUID().replace(/-/g, '').slice(0, 28)}`;
      const demoSecret = `as_${randomUUID().replace(/-/g, '').slice(0, 28)}`;
      const demoSecretHash = await bcrypt.hash(demoSecret, 10);

      await prisma.apiKey.create({
        data: {
          userId: demoUser.id,
          name: 'Demo Client Key',
          key: demoKey,
          secretHash: demoSecretHash,
          isActive: true,
        },
      });

      console.log('✅ Created demo API key:', demoKey);
      console.log('⚠️  Demo Secret (save this):', demoSecret);

      await redis.setEx(`apikey:${demoKey}`, 300, JSON.stringify({
        userId: demoUser.id,
        isActive: true,
        user: demoUser,
      }));
    } else {
      await redis.setEx(`apikey:${existingKey.key}`, 300, JSON.stringify({
        userId: demoUser.id,
        isActive: true,
        user: demoUser,
      }));
      console.log('✅ Demo API key already exists');
    }
  } catch (err) {
    console.error('Demo key initialization error:', err);
  }
}

// Graceful shutdown handling
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('Already shutting down, ignoring signal');
    return;
  }

  isShuttingDown = true;
  console.log(`\n${signal} received, starting graceful shutdown...`);

  // Set timeout for forced shutdown
  const forceShutdown = setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);

  try {
    // Stop accepting new requests
    console.log('Closing HTTP server...');
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log('HTTP server closed');

    // Close database connections
    console.log('Disconnecting from database...');
    await prisma.$disconnect();
    console.log('Database disconnected');

    // Close Redis connection
    console.log('Disconnecting from Redis...');
    await redis.quit();
    console.log('Redis disconnected');

    clearTimeout(forceShutdown);
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    clearTimeout(forceShutdown);
    process.exit(1);
  }
}

const PORT = process.env.PORT ?? 3000;
const server = app.listen(PORT, async () => {
  console.log(`✅ Village API running on port ${PORT}`);
  console.log(`📚 API Docs: http://localhost:${PORT}/api-docs`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  await initializeDemoKey();
});

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

export default app;
