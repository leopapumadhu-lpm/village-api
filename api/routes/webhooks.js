import express from 'express';
import { PrismaClient } from '@prisma/client';
import {
  registerWebhookEndpoint,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  getWebhookDeliveries,
  testWebhookEndpoint,
} from '../services/webhookService.js';

const router = express.Router();
const prisma = new PrismaClient();

// Helper function to mask errors in production
function maskError(error, req) {
  if (process.env.NODE_ENV === 'production') {
    console.error('Webhook route error:', error);
    return 'Internal server error';
  }
  return error.message;
}

// Helper to validate URL format
function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Helper to validate events array
function isValidEvents(events) {
  const validEvents = ['user.approved', 'payment.received', 'api_key.created', 'quota.warning', '*'];
  if (!Array.isArray(events)) return false;
  if (events.length === 0) return false;
  return events.every((event) => validEvents.includes(event));
}

/**
 * GET /webhooks (Changed from /b2b/webhooks - no /b2b prefix for webhooks)
 * List webhook endpoints for a team (spec 9.4)
 */
router.get('/', async (req, res) => {
  try {
    // Verify authentication is present (added by middleware)
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const organizationId = req.user.teamId || req.user.id;

    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { organizationId, isDeleted: false }, // Add soft delete filter
      include: {
        _count: {
          select: { deliveryLogs: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Parse events array safely
    const formatted = endpoints.map((ep) => {
      try {
        return {
          ...ep,
          events: typeof ep.events === 'string' ? JSON.parse(ep.events) : ep.events,
        };
      } catch (parseError) {
        console.error(`Failed to parse events for webhook ${ep.id}:`, parseError);
        return {
          ...ep,
          events: [],
        };
      }
    });

    res.json({ success: true, data: formatted, count: formatted.length });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /webhooks
 * Register new webhook endpoint (spec 9.4)
 * Supported events: user.approved, payment.received, api_key.created, quota.warning
 */
router.post('/', async (req, res) => {
  try {
    // Verify authentication
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { url, events, description } = req.body;

    // Validate required fields
    if (!url) {
      return res
        .status(400)
        .json({ success: false, error: 'Webhook URL required' });
    }

    // Validate URL format
    if (!isValidUrl(url)) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid webhook URL format. Must be http:// or https://' });
    }

    // Validate events (if provided)
    if (events && !isValidEvents(events)) {
      return res
        .status(400)
        .json({
          success: false,
          error: 'Invalid events array. Valid events: user.approved, payment.received, api_key.created, quota.warning, or * for all',
        });
    }

    // Check for duplicate webhook URL for the same organization
    const organizationId = req.user.teamId || req.user.id;
    const existingEndpoint = await prisma.webhookEndpoint.findFirst({
      where: {
        organizationId,
        url,
        isDeleted: false,
      },
    });

    if (existingEndpoint) {
      return res
        .status(409)
        .json({ success: false, error: 'Webhook endpoint already exists for this URL' });
    }

    // Rate limiting check for webhook creation (prevent abuse)
    const recentCreations = await prisma.webhookEndpoint.count({
      where: {
        organizationId,
        createdAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
        },
      },
    });

    if (recentCreations >= 10) {
      return res
        .status(429)
        .json({ success: false, error: 'Too many webhook endpoints created. Limit 10 per hour.' });
    }

    const endpoint = await registerWebhookEndpoint(
      organizationId,
      url,
      events || ['*'],
      description || null,
    );

    // Mask the secret in response (show only first/last few chars)
    const maskedSecret = endpoint.secret
      ? `${endpoint.secret.slice(0, 8)}...${endpoint.secret.slice(-4)}`
      : null;

    res.status(201).json({
      success: true,
      data: {
        ...endpoint,
        secret: maskedSecret, // Don't return full secret
        fullSecret: endpoint.secret, // Only include if specifically requested? Better to show once
      },
      message: 'Webhook endpoint registered. Save your secret securely! You won\'t see it again.',
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * PATCH /webhooks/:id
 * Update webhook endpoint
 */
router.patch('/:id', async (req, res) => {
  try {
    // Verify authentication
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { id } = req.params;
    const webhookId = parseInt(id);

    if (isNaN(webhookId)) {
      return res.status(400).json({ success: false, error: 'Invalid webhook ID' });
    }

    const {
      url, events, isActive, description,
    } = req.body;

    // Verify ownership and existence
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: {
        id: webhookId,
        isDeleted: false,
      },
    });

    if (!endpoint) {
      return res
        .status(404)
        .json({ success: false, error: 'Webhook endpoint not found' });
    }

    const organizationId = req.user.teamId || req.user.id;
    if (endpoint.organizationId !== organizationId) {
      return res
        .status(403)
        .json({ success: false, error: 'Not authorized to modify this webhook' });
    }

    // Validate URL if provided
    if (url && !isValidUrl(url)) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid webhook URL format' });
    }

    // Validate events if provided
    if (events && !isValidEvents(events)) {
      return res
        .status(400)
        .json({
          success: false,
          error: 'Invalid events array',
        });
    }

    // Check for duplicate URL if changing
    if (url && url !== endpoint.url) {
      const duplicate = await prisma.webhookEndpoint.findFirst({
        where: {
          organizationId,
          url,
          isDeleted: false,
          id: { not: webhookId },
        },
      });

      if (duplicate) {
        return res
          .status(409)
          .json({ success: false, error: 'Another webhook endpoint already exists with this URL' });
      }
    }

    const updateData = {};
    if (url !== undefined) updateData.url = url;
    if (events !== undefined) updateData.events = JSON.stringify(events);
    if (isActive !== undefined) updateData.isActive = isActive;
    if (description !== undefined) updateData.description = description;

    const updated = await updateWebhookEndpoint(webhookId, updateData);

    // Parse events for response
    const parsedEvents = typeof updated.events === 'string'
      ? JSON.parse(updated.events)
      : updated.events;

    res.json({
      success: true,
      data: {
        ...updated,
        events: parsedEvents,
      },
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * DELETE /webhooks/:id
 * Delete webhook endpoint (soft delete)
 */
router.delete('/:id', async (req, res) => {
  try {
    // Verify authentication
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { id } = req.params;
    const webhookId = parseInt(id);

    if (isNaN(webhookId)) {
      return res.status(400).json({ success: false, error: 'Invalid webhook ID' });
    }

    // Verify ownership
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: {
        id: webhookId,
        isDeleted: false,
      },
    });

    if (!endpoint) {
      return res
        .status(404)
        .json({ success: false, error: 'Webhook endpoint not found' });
    }

    const organizationId = req.user.teamId || req.user.id;
    if (endpoint.organizationId !== organizationId) {
      return res
        .status(403)
        .json({ success: false, error: 'Not authorized to delete this webhook' });
    }

    // Perform soft delete instead of hard delete
    await prisma.webhookEndpoint.update({
      where: { id: webhookId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        isActive: false,
      },
    });

    // Also delete from service cache
    await deleteWebhookEndpoint(webhookId);

    res.json({
      success: true,
      message: 'Webhook endpoint deleted successfully',
      data: { id: webhookId },
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /webhooks/:id/deliveries
 * Get delivery logs for a webhook endpoint (spec 9.4)
 */
router.get('/:id/deliveries', async (req, res) => {
  try {
    // Verify authentication
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { id } = req.params;
    const webhookId = parseInt(id);

    if (isNaN(webhookId)) {
      return res.status(400).json({ success: false, error: 'Invalid webhook ID' });
    }

    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const { status } = req.query; // Optional filter by status (success/failed)

    // Verify ownership
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: {
        id: webhookId,
        isDeleted: false,
      },
    });

    if (!endpoint) {
      return res
        .status(404)
        .json({ success: false, error: 'Webhook endpoint not found' });
    }

    const organizationId = req.user.teamId || req.user.id;
    if (endpoint.organizationId !== organizationId) {
      return res
        .status(403)
        .json({ success: false, error: 'Not authorized to view these deliveries' });
    }

    const deliveries = await getWebhookDeliveries(webhookId, limit, offset, status);

    // Get total count for pagination
    const totalCount = await prisma.webhookDeliveryLog.count({
      where: {
        webhookEndpointId: webhookId,
        ...(status && { status: status.toUpperCase() }),
      },
    });

    res.json({
      success: true,
      data: deliveries,
      pagination: {
        limit,
        offset,
        total: totalCount,
        hasMore: offset + limit < totalCount,
      },
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /webhooks/:id/test
 * Send test webhook to endpoint
 */
router.post('/:id/test', async (req, res) => {
  try {
    // Verify authentication
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { id } = req.params;
    const webhookId = parseInt(id);

    if (isNaN(webhookId)) {
      return res.status(400).json({ success: false, error: 'Invalid webhook ID' });
    }

    // Optional custom test payload
    const { customPayload } = req.body;

    // Verify ownership
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: {
        id: webhookId,
        isDeleted: false,
        isActive: true,
      },
    });

    if (!endpoint) {
      return res
        .status(404)
        .json({ success: false, error: 'Active webhook endpoint not found' });
    }

    const organizationId = req.user.teamId || req.user.id;
    if (endpoint.organizationId !== organizationId) {
      return res
        .status(403)
        .json({ success: false, error: 'Not authorized to test this webhook' });
    }

    // Rate limiting for test requests (prevent abuse)
    const recentTests = await prisma.webhookDeliveryLog.count({
      where: {
        webhookEndpointId: webhookId,
        createdAt: {
          gte: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
        },
      },
    });

    if (recentTests >= 10) {
      return res
        .status(429)
        .json({ success: false, error: 'Too many test requests. Please wait 5 minutes.' });
    }

    const result = await testWebhookEndpoint(webhookId, customPayload);

    res.json({
      success: true,
      data: {
        deliveryId: result.id,
        status: result.status,
        statusCode: result.statusCode,
        responseTime: result.responseTime,
        createdAt: result.createdAt,
      },
      message: result.status === 'SUCCESS'
        ? 'Test webhook delivered successfully'
        : 'Test webhook failed. Check delivery logs for details.',
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /webhooks/:id/retry/:deliveryId
 * Retry a failed webhook delivery
 */
router.post('/:id/retry/:deliveryId', async (req, res) => {
  try {
    // Verify authentication
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { id, deliveryId } = req.params;
    const webhookId = parseInt(id);
    const deliveryIdNum = parseInt(deliveryId);

    if (isNaN(webhookId) || isNaN(deliveryIdNum)) {
      return res.status(400).json({ success: false, error: 'Invalid ID format' });
    }

    // Verify ownership
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: {
        id: webhookId,
        isDeleted: false,
      },
    });

    if (!endpoint) {
      return res.status(404).json({ success: false, error: 'Webhook endpoint not found' });
    }

    const organizationId = req.user.teamId || req.user.id;
    if (endpoint.organizationId !== organizationId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    // Find the failed delivery
    const delivery = await prisma.webhookDeliveryLog.findFirst({
      where: {
        id: deliveryIdNum,
        webhookEndpointId: webhookId,
        status: 'FAILED',
      },
    });

    if (!delivery) {
      return res.status(404).json({
        success: false,
        error: 'Failed delivery not found or already successful',
      });
    }

    // Trigger retry (implement this in webhookService)
    const retryResult = await retryWebhookDelivery(deliveryIdNum);

    res.json({
      success: true,
      data: retryResult,
      message: 'Retry queued successfully',
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

// Error handling middleware for this router
router.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON payload',
    });
  }
  next(err);
});

export default router;
