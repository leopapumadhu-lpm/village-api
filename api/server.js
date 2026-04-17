import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
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

// In-memory cache fallback when Redis is not available
class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();
  }

  async get(key) {
    return this.cache.get(key) || null;
  }

  async set(key, value) {
    this.cache.set(key, value);
    return true;
  }

  async setEx(key, seconds, value) {
    this.cache.set(key, value);
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }
    const timer = setTimeout(() => {
      this.cache.delete(key);
      this.timers.delete(key);
    }, seconds * 1000);
    this.timers.set(key, timer);
    return true;
  }

  async ping() {
    return 'PONG';
  }

  async quit() {
    this.cache.clear();
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }

  on() {}
}

// In-memory database fallback with expanded demo data
class MemoryDB {
  constructor() {
    this.users = new Map();
    this.apiKeys = new Map();
    this.apiLogs = [];
    
    // Expanded village data - multiple states
    this.villages = [
      // Andhra Pradesh - Anantapur
      { id: 1, code: '501001001', name: 'Adivi Thanda', subDistrictId: 1, subDistrict: { name: 'Anantapur', district: { name: 'Anantapur', state: { name: 'Andhra Pradesh' } } } },
      { id: 2, code: '501001002', name: 'Gorantla', subDistrictId: 1, subDistrict: { name: 'Anantapur', district: { name: 'Anantapur', state: { name: 'Andhra Pradesh' } } } },
      { id: 3, code: '501001003', name: 'Kadiri', subDistrictId: 1, subDistrict: { name: 'Anantapur', district: { name: 'Anantapur', state: { name: 'Andhra Pradesh' } } } },
      { id: 4, code: '501001004', name: 'Hindupur', subDistrictId: 1, subDistrict: { name: 'Anantapur', district: { name: 'Anantapur', state: { name: 'Andhra Pradesh' } } } },
      { id: 5, code: '501001005', name: 'Tadipatri', subDistrictId: 1, subDistrict: { name: 'Anantapur', district: { name: 'Anantapur', state: { name: 'Andhra Pradesh' } } } },
      { id: 6, code: '501002001', name: 'Dharmavaram', subDistrictId: 2, subDistrict: { name: 'Dharmavaram', district: { name: 'Anantapur', state: { name: 'Andhra Pradesh' } } } },
      
      // Tamil Nadu - Chennai
      { id: 10, code: '601001001', name: 'Chennai Central', subDistrictId: 3, subDistrict: { name: 'Chennai City', district: { name: 'Chennai', state: { name: 'Tamil Nadu' } } } },
      { id: 11, code: '601001002', name: 'T Nagar', subDistrictId: 3, subDistrict: { name: 'Chennai City', district: { name: 'Chennai', state: { name: 'Tamil Nadu' } } } },
      { id: 12, code: '601001003', name: 'Adyar', subDistrictId: 3, subDistrict: { name: 'Chennai City', district: { name: 'Chennai', state: { name: 'Tamil Nadu' } } } },
      { id: 13, code: '601001004', name: 'Mylapore', subDistrictId: 3, subDistrict: { name: 'Chennai City', district: { name: 'Chennai', state: { name: 'Tamil Nadu' } } } },
      { id: 14, code: '601001005', name: 'Anna Nagar', subDistrictId: 3, subDistrict: { name: 'Chennai City', district: { name: 'Chennai', state: { name: 'Tamil Nadu' } } } },
      { id: 15, code: '601001006', name: 'Velachery', subDistrictId: 3, subDistrict: { name: 'Chennai City', district: { name: 'Chennai', state: { name: 'Tamil Nadu' } } } },
      { id: 16, code: '601001007', name: 'Porur', subDistrictId: 3, subDistrict: { name: 'Chennai City', district: { name: 'Chennai', state: { name: 'Tamil Nadu' } } } },
      { id: 17, code: '601001008', name: 'Ambattur', subDistrictId: 3, subDistrict: { name: 'Chennai City', district: { name: 'Chennai', state: { name: 'Tamil Nadu' } } } },
      { id: 18, code: '601001009', name: 'Tambaram', subDistrictId: 3, subDistrict: { name: 'Chennai City', district: { name: 'Chennai', state: { name: 'Tamil Nadu' } } } },
      
      // Karnataka - Bangalore
      { id: 20, code: '501002001', name: 'Bangalore North', subDistrictId: 4, subDistrict: { name: 'Bangalore Urban', district: { name: 'Bangalore', state: { name: 'Karnataka' } } } },
      { id: 21, code: '501002002', name: 'Koramangala', subDistrictId: 4, subDistrict: { name: 'Bangalore Urban', district: { name: 'Bangalore', state: { name: 'Karnataka' } } } },
      { id: 22, code: '501002003', name: 'Whitefield', subDistrictId: 4, subDistrict: { name: 'Bangalore Urban', district: { name: 'Bangalore', state: { name: 'Karnataka' } } } },
      { id: 23, code: '501002004', name: 'Electronic City', subDistrictId: 4, subDistrict: { name: 'Bangalore Urban', district: { name: 'Bangalore', state: { name: 'Karnataka' } } } },
      { id: 24, code: '501002005', name: 'Jayanagar', subDistrictId: 4, subDistrict: { name: 'Bangalore Urban', district: { name: 'Bangalore', state: { name: 'Karnataka' } } } },
      { id: 25, code: '501002006', name: 'Indiranagar', subDistrictId: 4, subDistrict: { name: 'Bangalore Urban', district: { name: 'Bangalore', state: { name: 'Karnataka' } } } },
      
      // Kerala - Kochi
      { id: 30, code: '401001001', name: 'Kochi Central', subDistrictId: 5, subDistrict: { name: 'Ernakulam', district: { name: 'Ernakulam', state: { name: 'Kerala' } } } },
      { id: 31, code: '401001002', name: 'Fort Kochi', subDistrictId: 5, subDistrict: { name: 'Ernakulam', district: { name: 'Ernakulam', state: { name: 'Kerala' } } } },
      { id: 32, code: '401001003', name: 'Aluva', subDistrictId: 5, subDistrict: { name: 'Ernakulam', district: { name: 'Ernakulam', state: { name: 'Kerala' } } } },
      
      // Maharashtra - Mumbai
      { id: 40, code: '301001001', name: 'Mumbai Central', subDistrictId: 6, subDistrict: { name: 'Mumbai City', district: { name: 'Mumbai', state: { name: 'Maharashtra' } } } },
      { id: 41, code: '301001002', name: 'Andheri', subDistrictId: 6, subDistrict: { name: 'Mumbai City', district: { name: 'Mumbai', state: { name: 'Maharashtra' } } } },
      { id: 42, code: '301001003', name: 'Bandra', subDistrictId: 6, subDistrict: { name: 'Mumbai City', district: { name: 'Mumbai', state: { name: 'Maharashtra' } } } },
      { id: 43, code: '301001004', name: 'Thane', subDistrictId: 6, subDistrict: { name: 'Mumbai City', district: { name: 'Mumbai', state: { name: 'Maharashtra' } } } },
      { id: 44, code: '301001005', name: 'Navi Mumbai', subDistrictId: 6, subDistrict: { name: 'Mumbai City', district: { name: 'Mumbai', state: { name: 'Maharashtra' } } } },
    ];
    
    this.states = [
      { id: 1, code: 'AP', name: 'Andhra Pradesh' },
      { id: 2, code: 'TN', name: 'Tamil Nadu' },
      { id: 3, code: 'KA', name: 'Karnataka' },
      { id: 4, code: 'KL', name: 'Kerala' },
      { id: 5, code: 'MH', name: 'Maharashtra' },
    ];
    
    this.districts = [
      { id: 1, code: '501', name: 'Anantapur', stateId: 1 },
      { id: 2, code: '502', name: 'Chittoor', stateId: 1 },
      { id: 3, code: '601', name: 'Chennai', stateId: 2 },
      { id: 4, code: '602', name: 'Coimbatore', stateId: 2 },
      { id: 5, code: '701', name: 'Bangalore', stateId: 3 },
      { id: 6, code: '401', name: 'Ernakulam', stateId: 4 },
      { id: 7, code: '301', name: 'Mumbai', stateId: 5 },
    ];
    
    this.subDistricts = [
      { id: 1, code: '501001', name: 'Anantapur', districtId: 1 },
      { id: 2, code: '501002', name: 'Dharmavaram', districtId: 1 },
      { id: 3, code: '601001', name: 'Chennai City', districtId: 3 },
      { id: 4, code: '701001', name: 'Bangalore Urban', districtId: 5 },
      { id: 5, code: '401001', name: 'Ernakulam', districtId: 6 },
      { id: 6, code: '301001', name: 'Mumbai City', districtId: 7 },
    ];
    
    this.initialized = false;
  }

  async initDemoData() {
    if (this.initialized) return;
    
    const hashedPassword = await bcrypt.hash('Demo@123456', 10);
    const demoUser = {
      id: 'demo-user-1',
      email: 'demo@villageapi.com',
      businessName: 'Village API Demo',
      passwordHash: hashedPassword,
      planType: 'UNLIMITED',
      status: 'ACTIVE',
      stateAccess: [],
    };
    this.users.set(demoUser.id, demoUser);
    this.users.set(demoUser.email, demoUser);

    const demoKey = 'ak_demo123456789012345678901234';
    const demoSecretHash = await bcrypt.hash('as_demo123456789012345678901234', 10);
    const apiKeyRecord = {
      id: 'key-1',
      userId: demoUser.id,
      name: 'Demo Client Key',
      key: demoKey,
      secretHash: demoSecretHash,
      isActive: true,
      user: demoUser,
    };
    this.apiKeys.set(demoKey, apiKeyRecord);
    
    console.log('Demo API Key:', demoKey);
    this.initialized = true;
  }

  async findUserByEmail(email) { return this.users.get(email) || null; }
  async findUserById(id) { return this.users.get(id) || null; }
  async createUser(data) {
    const id = `user-${randomUUID()}`;
    const user = { ...data, id, stateAccess: [] };
    this.users.set(id, user);
    this.users.set(data.email, user);
    return user;
  }
  async findApiKey(key) { return this.apiKeys.get(key) || null; }
  async createApiKey(data) {
    const id = `key-${randomUUID()}`;
    const keyRecord = { ...data, id };
    this.apiKeys.set(data.key, keyRecord);
    return keyRecord;
  }

  getAllStates() { return this.states; }
  getDistrictsByState(stateId) { return this.districts.filter(d => d.stateId === parseInt(stateId)); }
  getSubDistrictsByDistrict(districtId) { return this.subDistricts.filter(s => s.districtId === parseInt(districtId)); }
  getVillagesBySubDistrict(subDistrictId) { return this.villages.filter(v => v.subDistrictId === parseInt(subDistrictId)); }
  
  searchVillages(query) {
    const q = query.toLowerCase();
    return this.villages.filter(v => v.name.toLowerCase().includes(q));
  }

  autocompleteVillages(query) {
    return this.searchVillages(query).slice(0, 10);
  }

  async addApiLog(log) {
    this.apiLogs.push({ ...log, id: this.apiLogs.length + 1, createdAt: new Date() });
  }

  getApiLogs(userId) { return this.apiLogs.filter(l => l.userId === userId); }
}

const USE_MEMORY_FALLBACK = process.env.USE_MEMORY_FALLBACK === 'true' || !process.env.DATABASE_URL;
const DEMO_MODE = process.env.DEMO_MODE === 'true' || USE_MEMORY_FALLBACK;

const app = express();
const memoryDB = new MemoryDB();
const IS_VERCEL = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

let prisma = null;
try {
  if (!USE_MEMORY_FALLBACK && process.env.DATABASE_URL) {
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient();
    console.log('Database mode: PostgreSQL');
  }
} catch (e) {
  console.log('Database connection failed, using memory fallback');
}

let redis = null;
let redisConnected = false;

async function initRedis() {
  if (!process.env.REDIS_URL || USE_MEMORY_FALLBACK) {
    console.log('Redis mode: In-memory fallback');
    redis = new MemoryCache();
    return;
  }

  try {
    const client = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 5000),
        connectTimeout: 5000,
      },
    });

    client.on('error', (err) => { redisConnected = false; });
    client.on('connect', () => { redisConnected = true; });

    await client.connect();
    redis = client;
    redisConnected = true;
  } catch (err) {
    console.log('Redis connection failed, using in-memory fallback');
    redis = new MemoryCache();
  }
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cookieParser());

const corsOrigins = process.env.CORS_ORIGINS?.split(',')
  ?? ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:3000'];

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-API-Secret', 'X-CSRF-Token'],
}));

app.use(express.json({ limit: '10mb' }));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' https:; frame-ancestors 'self'");
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

const csrfProtection = csrf({ cookie: true });

function maskError(error, req) {
  const errorId = randomUUID().slice(0, 8);
  if (process.env.NODE_ENV === 'production') {
    console.error(`Error ${errorId}:`, error);
    return `Internal server error (Reference: ${errorId})`;
  }
  return error.message;
}

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
      if (prisma) {
        keyRecord = await prisma.apiKey.findUnique({
          where: { key: apiKey, isActive: true },
          include: { user: { include: { stateAccess: true } } },
        });
      }
      
      if (!keyRecord && USE_MEMORY_FALLBACK) {
        keyRecord = await memoryDB.findApiKey(apiKey);
      }

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

    req.user = keyRecord.user;
    req.apiKey = keyRecord;
    req.userId = keyRecord.user.id;

    if (prisma) {
      await prisma.apiKey.update({
        where: { id: keyRecord.id },
        data: { lastUsedAt: new Date() },
      });
    }

    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
}

function authenticateJWT(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  const jwtSecret = process.env.JWT_SECRET || 'demo-jwt-secret';
  try {
    const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
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

app.post('/auth/refresh', async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) {
    return res.status(401).json({ success: false, error: 'No refresh token' });
  }

  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'demo-refresh-secret';
  try {
    const decoded = jwt.verify(refreshToken, jwtRefreshSecret);
    const jwtSecret = process.env.JWT_SECRET || 'demo-jwt-secret';
    const newAccessToken = jwt.sign(
      { id: decoded.id, email: decoded.email, role: decoded.role },
      jwtSecret,
      { expiresIn: '15m', algorithm: 'HS256' },
    );
    res.json({ success: true, data: { accessToken: newAccessToken } });
  } catch (error) {
    res.status(403).json({ success: false, error: 'Invalid refresh token' });
  }
});

app.post('/auth/logout', (req, res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.json({ success: true, message: 'Logged out successfully' });
});

app.use((req, _res, next) => {
  req._startTime = Date.now();
  next();
});

app.use(async (req, res, next) => {
  try {
    await ensureInitialized();
    next();
  } catch (error) {
    console.error('Application initialization failed:', error);
    res.status(500).json({ success: false, error: 'Application initialization failed' });
  }
});

app.get('/health', async (req, res) => {
  const status = {
    status: 'ok',
    timestamp: new Date(),
    mode: USE_MEMORY_FALLBACK ? 'memory-fallback' : 'database',
    services: {
      database: prisma ? 'connected' : 'memory-fallback',
      redis: redisConnected ? 'connected' : 'memory-fallback',
      api: 'running',
    },
  };

  try {
    if (prisma) await prisma.$queryRaw`SELECT 1`;
    if (redis && redisConnected) await redis.ping();
    res.json(status);
  } catch (error) {
    status.status = 'degraded';
    status.error = error.message;
    res.status(503).json(status);
  }
});

app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

app.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password required' });
  }

  try {
    let user = null;
    
    if (prisma) {
      user = await prisma.user.findUnique({ where: { email } });
    }
    
    if (!user && USE_MEMORY_FALLBACK) {
      user = await memoryDB.findUserByEmail(email);
    }

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

    const jwtSecret = process.env.JWT_SECRET || 'demo-jwt-secret';
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'demo-refresh-secret';
    
    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: 'admin' },
      jwtSecret,
      { expiresIn: '15m', algorithm: 'HS256' },
    );

    const refreshToken = jwt.sign(
      { id: user.id, email: user.email, role: 'admin' },
      jwtRefreshSecret,
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
  const { email, businessName, phone, gstNumber, password } = req.body;

  if (!email || !businessName || !password) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
  }

  try {
    let existing = null;
    
    if (prisma) {
      existing = await prisma.user.findUnique({ where: { email } });
    }
    if (!existing && USE_MEMORY_FALLBACK) {
      existing = await memoryDB.findUserByEmail(email);
    }
    
    if (existing) {
      return res.status(409).json({ success: false, error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userData = {
      email,
      businessName,
      phone: phone || null,
      gstNumber: gstNumber || null,
      passwordHash,
      status: 'PENDING_APPROVAL',
      planType: 'FREE',
    };

    let user;
    if (prisma) {
      user = await prisma.user.create({ data: userData });
    } else {
      user = await memoryDB.createUser(userData);
    }

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

app.get('/v1/states', authenticate, async (req, res) => {
  try {
    let states = [];
    
    if (prisma) {
      states = await prisma.state.findMany({ orderBy: { name: 'asc' } });
    }
    
    if (states.length === 0 || USE_MEMORY_FALLBACK) {
      states = memoryDB.getAllStates();
    }

    res.json({
      success: true,
      count: states.length,
      data: states.map(s => ({ code: s.code, name: s.name })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/v1/states/:id/districts', authenticate, async (req, res) => {
  const stateId = parseInt(req.params.id);
  if (isNaN(stateId)) {
    return res.status(400).json({ success: false, error: 'Invalid state ID' });
  }

  try {
    let districts = [];
    
    if (prisma) {
      districts = await prisma.district.findMany({
        where: { stateId },
        orderBy: { name: 'asc' },
      });
    }
    
    if (districts.length === 0 || USE_MEMORY_FALLBACK) {
      districts = memoryDB.getDistrictsByState(stateId);
    }

    res.json({
      success: true,
      count: districts.length,
      data: districts.map(d => ({ code: d.code, name: d.name })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/v1/districts/:id/subdistricts', authenticate, async (req, res) => {
  const districtId = parseInt(req.params.id);
  if (isNaN(districtId)) {
    return res.status(400).json({ success: false, error: 'Invalid district ID' });
  }

  try {
    let subDistricts = [];
    
    if (prisma) {
      subDistricts = await prisma.subDistrict.findMany({
        where: { districtId },
        orderBy: { name: 'asc' },
      });
    }
    
    if (subDistricts.length === 0 || USE_MEMORY_FALLBACK) {
      subDistricts = memoryDB.getSubDistrictsByDistrict(districtId);
    }

    res.json({
      success: true,
      count: subDistricts.length,
      data: subDistricts.map(s => ({ code: s.code, name: s.name })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/v1/subdistricts/:id/villages', authenticate, async (req, res) => {
  const subDistrictId = parseInt(req.params.id);
  if (isNaN(subDistrictId)) {
    return res.status(400).json({ success: false, error: 'Invalid sub-district ID' });
  }

  try {
    let villages = [];
    
    if (prisma) {
      villages = await prisma.village.findMany({
        where: { subDistrictId },
        include: { subDistrict: { include: { district: { include: { state: true } } } } },
        orderBy: { name: 'asc' },
      });
    }
    
    if (villages.length === 0 || USE_MEMORY_FALLBACK) {
      villages = memoryDB.getVillagesBySubDistrict(subDistrictId);
    }

    res.json({
      success: true,
      count: villages.length,
      data: villages.map(v => ({
        code: v.code,
        name: v.name,
        fullAddress: `${v.name}, ${v.subDistrict?.name || ''}, ${v.subDistrict?.district?.name || ''}, ${v.subDistrict?.district?.state?.name || ''}, India`,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/v1/search', authenticate, async (req, res) => {
  const { q, limit = 50, offset = 0 } = req.query;

  if (!q || q.length < 2) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_QUERY', message: 'Query must be at least 2 characters' },
    });
  }

  try {
    let villages = [];
    const cacheKey = `search:${q}:${limit}:${offset}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      villages = JSON.parse(cached);
    } else {
      if (prisma) {
        villages = await prisma.village.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { code: { contains: q } },
            ],
          },
          include: { subDistrict: { include: { district: { include: { state: true } } } } },
          take: parseInt(limit),
          skip: parseInt(offset),
        });
      }
      
      if (villages.length === 0 || USE_MEMORY_FALLBACK) {
        villages = memoryDB.searchVillages(q);
      }

      await redis.setEx(cacheKey, 300, JSON.stringify(villages));
    }

    res.json({
      success: true,
      count: villages.length,
      data: villages.map(v => ({
        value: `village_id_${v.code}`,
        label: v.name,
        fullAddress: `${v.name}, ${v.subDistrict?.name || ''}, ${v.subDistrict?.district?.name || ''}, ${v.subDistrict?.district?.state?.name || ''}, India`,
        hierarchy: {
          village: v.name,
          subDistrict: v.subDistrict?.name,
          district: v.subDistrict?.district?.name,
          state: v.subDistrict?.district?.state?.name,
          country: 'India',
        },
      })),
      meta: { query: q, limit: parseInt(limit), offset: parseInt(offset) },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/v1/autocomplete', authenticate, async (req, res) => {
  const { q, limit = 10 } = req.query;

  if (!q || q.length < 2) {
    return res.json({ success: true, count: 0, data: [] });
  }

  try {
    let villages = [];
    const cacheKey = `autocomplete:${q}:${limit}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      villages = JSON.parse(cached);
    } else {
      if (prisma) {
        villages = await prisma.village.findMany({
          where: {
            name: { contains: q, mode: 'insensitive' },
          },
          take: parseInt(limit),
          orderBy: { name: 'asc' },
        });
      }
      
      if (villages.length === 0 || USE_MEMORY_FALLBACK) {
        villages = memoryDB.autocompleteVillages(q).slice(0, parseInt(limit));
      }

      await redis.setEx(cacheKey, 600, JSON.stringify(villages));
    }

    res.json({
      success: true,
      count: villages.length,
      data: villages.map(v => ({ value: v.code, label: v.name })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// B2B Dashboard Endpoints
app.get('/b2b/dashboard', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    let user = null;
    let apiKeys = [];
    let todayRequests = 0;
    let monthRequests = 0;

    if (prisma) {
      user = await prisma.user.findUnique({ where: { id: userId } });
      apiKeys = await prisma.apiKey.findMany({ 
        where: { userId },
        select: { id: true, name: true, key: true, isActive: true, createdAt: true, lastUsedAt: true }
      });
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      
      todayRequests = await prisma.apiLog.count({
        where: { userId, createdAt: { gte: today } }
      });
      
      monthRequests = await prisma.apiLog.count({
        where: { userId, createdAt: { gte: monthStart } }
      });
    } else if (USE_MEMORY_FALLBACK) {
      user = await memoryDB.findUserById(userId);
      apiKeys = Array.from(memoryDB.apiKeys.values()).filter(k => k.userId === userId);
      const logs = memoryDB.getApiLogs(userId);
      todayRequests = logs.filter(l => new Date(l.createdAt) >= new Date().setHours(0,0,0,0)).length;
      monthRequests = logs.length;
    }

    const planLimits = { FREE: 1000, PREMIUM: 10000, PRO: 50000, UNLIMITED: 1000000 };
    const limit = planLimits[user?.planType] || 1000;

    res.json({
      success: true,
      data: {
        user: {
          email: user?.email,
          businessName: user?.businessName,
          planType: user?.planType,
          status: user?.status,
        },
        usage: {
          today: todayRequests,
          month: monthRequests,
          limit: limit,
          remaining: Math.max(0, limit - todayRequests),
        },
        apiKeys: apiKeys.map(k => ({
          id: k.id,
          name: k.name,
          key: k.key?.substring(0, 10) + '...',
          isActive: k.isActive,
          createdAt: k.createdAt,
          lastUsedAt: k.lastUsedAt,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// B2B API Keys endpoints
app.get('/b2b/apikeys', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    let apiKeys = [];
    
    if (prisma) {
      apiKeys = await prisma.apiKey.findMany({ 
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });
    } else if (USE_MEMORY_FALLBACK) {
      apiKeys = Array.from(memoryDB.apiKeys.values()).filter(k => k.userId === userId);
    }

    res.json({
      success: true,
      data: apiKeys.map(k => ({
        id: k.id,
        name: k.name,
        key: k.key?.substring(0, 10) + '****',
        isActive: k.isActive,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/b2b/apikeys', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'Key name is required' });
    }

    const apiKey = 'ak_' + randomUUID().replace(/-/g, '').substring(0, 28);
    const apiSecret = 'as_' + randomUUID().replace(/-/g, '').substring(0, 28);
    const secretHash = await bcrypt.hash(apiSecret, 10);

    let keyRecord;
    if (prisma) {
      keyRecord = await prisma.apiKey.create({
        data: {
          userId,
          name,
          key: apiKey,
          secretHash,
          isActive: true,
        }
      });
    } else if (USE_MEMORY_FALLBACK) {
      keyRecord = await memoryDB.createApiKey({
        userId,
        name,
        key: apiKey,
        secretHash,
        isActive: true,
      });
    }

    res.status(201).json({
      success: true,
      data: {
        id: keyRecord.id,
        name: keyRecord.name,
        key: apiKey,
        secret: apiSecret, // Only returned once
        isActive: true,
        createdAt: new Date(),
      },
      message: 'Store your API secret securely. It will not be shown again.',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/b2b/apikeys/:keyId', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const keyId = req.params.keyId;

    if (prisma) {
      const key = await prisma.apiKey.findFirst({ where: { id: keyId, userId } });
      if (!key) {
        return res.status(404).json({ success: false, error: 'API key not found' });
      }
      await prisma.apiKey.update({ where: { id: keyId }, data: { isActive: false } });
    } else if (USE_MEMORY_FALLBACK) {
      const key = memoryDB.apiKeys.get(keyId);
      if (!key || key.userId !== userId) {
        return res.status(404).json({ success: false, error: 'API key not found' });
      }
      key.isActive = false;
      memoryDB.apiKeys.set(keyId, key);
    }

    res.json({ success: true, message: 'API key revoked' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/b2b/apikeys/:keyId/regenerate', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const keyId = req.params.keyId;
    const newSecret = 'as_' + randomUUID().replace(/-/g, '').substring(0, 28);
    const secretHash = await bcrypt.hash(newSecret, 10);

    if (prisma) {
      const key = await prisma.apiKey.findFirst({ where: { id: keyId, userId } });
      if (!key) {
        return res.status(404).json({ success: false, error: 'API key not found' });
      }
      await prisma.apiKey.update({ where: { id: keyId }, data: { secretHash } });
    } else if (USE_MEMORY_FALLBACK) {
      const key = memoryDB.apiKeys.get(keyId);
      if (!key || key.userId !== userId) {
        return res.status(404).json({ success: false, error: 'API key not found' });
      }
      key.secretHash = secretHash;
      memoryDB.apiKeys.set(keyId, key);
    }

    res.json({
      success: true,
      data: { secret: newSecret },
      message: 'Store your new API secret securely. It will not be shown again.',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin Endpoints
app.get('/admin/users', authenticateJWT, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    let users = [];
    if (prisma) {
      users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          businessName: true,
          phone: true,
          status: true,
          planType: true,
          createdAt: true,
          lastActive: true,
        }
      });
    } else if (USE_MEMORY_FALLBACK) {
      users = Array.from(memoryDB.users.values()).filter(u => u.email !== 'demo@villageapi.com');
    }

    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.patch('/admin/users/:id/approve', authenticateJWT, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID' });
    }

    let user;
    if (prisma) {
      user = await prisma.user.update({
        where: { id: userId },
        data: { status: 'ACTIVE' },
      });
    } else if (USE_MEMORY_FALLBACK) {
      user = memoryDB.users.get(`user-${userId}`) || memoryDB.users.get(userId);
      if (user) {
        user.status = 'ACTIVE';
        memoryDB.users.set(user.id, user);
        memoryDB.users.set(user.email, user);
      }
    }

    res.json({ success: true, data: user, message: 'User approved' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.patch('/admin/users/:id/plan', authenticateJWT, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const userId = parseInt(req.params.id);
    const { planType } = req.body;
    
    if (isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID' });
    }
    
    const validPlans = ['FREE', 'PREMIUM', 'PRO', 'UNLIMITED'];
    if (!validPlans.includes(planType)) {
      return res.status(400).json({ success: false, error: 'Invalid plan type' });
    }

    let user;
    if (prisma) {
      user = await prisma.user.update({
        where: { id: userId },
        data: { planType },
      });
    } else if (USE_MEMORY_FALLBACK) {
      user = memoryDB.users.get(`user-${userId}`) || memoryDB.users.get(userId);
      if (user) {
        user.planType = planType;
        memoryDB.users.set(user.id, user);
        memoryDB.users.set(user.email, user);
      }
    }

    res.json({ success: true, data: user, message: 'Plan updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/admin/analytics', authenticateJWT, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    let stats = {
      totalUsers: 0,
      activeUsers: 0,
      pendingUsers: 0,
      totalVillages: 619225,
      totalRequests: 0,
      avgResponseTime: 0,
    };

    if (prisma) {
      stats.totalUsers = await prisma.user.count();
      stats.activeUsers = await prisma.user.count({ where: { status: 'ACTIVE' } });
      stats.pendingUsers = await prisma.user.count({ where: { status: 'PENDING_APPROVAL' } });
      stats.totalVillages = await prisma.village.count();
      stats.totalRequests = await prisma.apiLog.count();
      const avgTime = await prisma.apiLog.aggregate({ _avg: { responseTime: true } });
      stats.avgResponseTime = Math.round(avgTime._avg?.responseTime || 0);
    } else if (USE_MEMORY_FALLBACK) {
      const users = Array.from(memoryDB.users.values());
      stats.totalUsers = users.filter(u => u.email && !u.email.includes('admin')).length;
      stats.activeUsers = users.filter(u => u.status === 'ACTIVE').length;
      stats.pendingUsers = users.filter(u => u.status === 'PENDING_APPROVAL').length;
      stats.totalRequests = memoryDB.apiLogs.length;
      stats.totalVillages = memoryDB.villages.length;
    }

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/admin/logs', authenticateJWT, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const skip = (page - 1) * limit;

    let logs = [];
    let total = 0;

    if (prisma) {
      logs = await prisma.apiLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { email: true, businessName: true } } }
      });
      total = await prisma.apiLog.count();
    } else if (USE_MEMORY_FALLBACK) {
      logs = memoryDB.apiLogs.slice(-limit * page).reverse();
      total = memoryDB.apiLogs.length;
    }

    res.json({
      success: true,
      data: logs.map(l => ({
        ...l,
        apiKey: l.apiKey ? l.apiKey.substring(0, 8) + '****' : null,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.use('/payments', authenticateJWT, paymentRoutes);
app.use('/webhooks', authenticateJWT, webhookRoutes);
app.use('/teams', authenticateJWT, teamRoutes);
app.use('/b2b/analytics', authenticateJWT, analyticsRoutes);

app.get('/', (req, res) => res.send(getDocsPage()));
app.get('/docs', (req, res) => res.send(getDocsPage()));
app.get('/api-docs/', swaggerUi.serve, swaggerUi.setup(specs));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
app.get('/api-spec', (req, res) => res.json(specs));

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  const message = process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred'
    : err.message;
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message } });
});

async function initializeDemoKey() {
  if (!USE_MEMORY_FALLBACK) return;
  
  try {
    await memoryDB.initDemoData();
  } catch (err) {
    console.error('Demo key initialization error:', err);
  }
}

let isShuttingDown = false;
let initPromise = null;

async function ensureInitialized() {
  if (!initPromise) {
    initPromise = (async () => {
      await initRedis();
      await initializeDemoKey();
    })().catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
}

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n${signal} received, starting graceful shutdown...`);

  const forceShutdown = setTimeout(() => {
    console.error('Forcefully shutting down');
    process.exit(1);
  }, 30000);

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    if (prisma) {
      await prisma.$disconnect();
      console.log('Database disconnected');
    }

    if (redis) {
      await redis.quit();
      console.log('Redis disconnected');
    }

    clearTimeout(forceShutdown);
    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    clearTimeout(forceShutdown);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3000;
let server;

async function startServer() {
  await ensureInitialized();
  
  server = app.listen(PORT, () => {
    console.log(`Village API running on port ${PORT}`);
    console.log(`API Docs: http://localhost:${PORT}/api-docs`);
    console.log(`Mode: ${USE_MEMORY_FALLBACK ? 'Memory Fallback (Demo)' : 'Database'}`);
    if (USE_MEMORY_FALLBACK) {
      console.log('');
      console.log('Demo Credentials:');
      console.log('  API Key: ak_demo123456789012345678901234');
      console.log('  API Secret: as_demo123456789012345678901234');
      console.log('  Demo Login: demo@villageapi.com / Demo@123456');
    }
  });
}

// Serve frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendDist = join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/.*/, (req, res, next) => {
    const skip = ['/api','/v1','/auth','/admin','/health','/b2b','/payments','/teams'];
    if (skip.some(p => req.path.startsWith(p))) return next();
    res.sendFile(join(frontendDist, 'index.html'));
  });
}

if (!IS_VERCEL) {
  startServer();

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
  });
}

export default app;
