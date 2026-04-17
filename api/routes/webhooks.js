import express from 'express';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const router = express.Router();

// Initialize Prisma only if database is available
let prisma = null;
try {
  if (process.env.DATABASE_URL) {
    prisma = new PrismaClient();
  }
} catch (e) {
  console.log('Webhook routes: Database not available');
}

// Check if DB is available middleware
function checkDb(req, res, next) {
  if (!prisma) {
    return res.status(503).json({
      success: false,
      error: 'Webhook service temporarily unavailable in demo mode',
    });
  }
  next();
}

function maskError(error, req) {
  if (process.env.NODE_ENV === 'production') {
    console.error('Webhook route error:', error);
    return 'Internal server error';
  }
  return error.message;
}

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidEvents(events) {
  const validEvents = ['user.approved', 'payment.received', 'api_key.created', 'quota.warning', '*'];
  if (!Array.isArray(events)) return false;
  if (events.length === 0) return false;
  return events.every((event) => validEvents.includes(event));
}

// Authentication middleware for webhooks
function authenticateWebhook(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  // Token validation would happen here - for now pass through
  // The actual JWT validation should be done by authenticateJWT before this router
  next();
}

router.get('/', checkDb, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const organizationId = req.user.teamId || req.user.id;

    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { organizationId: String(organizationId), isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = endpoints.map((ep) => ({
      ...ep,
      events: typeof ep.events === 'string' ? JSON.parse(ep.events) : ep.events,
    }));

    res.json({ success: true, data: formatted, count: formatted.length });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

router.post('/', checkDb, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { url, events, description } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'Webhook URL required' });
    }

    if (!isValidUrl(url)) {
      return res.status(400).json({ success: false, error: 'Invalid webhook URL format' });
    }

    if (events && !isValidEvents(events)) {
      return res.status(400).json({ success: false, error: 'Invalid events array' });
    }

    const organizationId = req.user.teamId || req.user.id;
    const existingEndpoint = await prisma.webhookEndpoint.findFirst({
      where: { organizationId: String(organizationId), url, isDeleted: false },
    });

    if (existingEndpoint) {
      return res.status(409).json({ success: false, error: 'Webhook endpoint already exists' });
    }

    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        organizationId: String(organizationId),
        url,
        events: JSON.stringify(events || ['*']),
        description: description || null,
        secret: randomUUID(),
        isActive: true,
      },
    });

    res.status(201).json({
      success: true,
      data: endpoint,
      message: 'Webhook endpoint registered',
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

router.delete('/:id', checkDb, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const webhookId = parseInt(req.params.id);
    if (isNaN(webhookId)) {
      return res.status(400).json({ success: false, error: 'Invalid webhook ID' });
    }

    const organizationId = req.user.teamId || req.user.id;

    // Verify ownership before deleting
    const existing = await prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, organizationId: String(organizationId), isDeleted: false },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }

    await prisma.webhookEndpoint.update({
      where: { id: webhookId },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    res.json({ success: true, message: 'Webhook deleted' });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

router.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Invalid JSON payload' });
  }
  next(err);
});

export default router;
