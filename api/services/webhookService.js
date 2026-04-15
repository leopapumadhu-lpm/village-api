import Queue from 'bull';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

// Create Bull job queue for webhook delivery (spec 9.4)
const webhookQueue = new Queue('webhooks', {
  redis: process.env.REDIS_URL,
});

// Process webhook jobs with retry logic
webhookQueue.process(3, async (job) => {
  const {
    endpointId,
    event,
    payload,
    attempt = 1,
  } = job.data;

  try {
    const endpoint = await prisma.webhookEndpoint.findUnique({
      where: { id: endpointId },
    });

    if (!endpoint || !endpoint.isActive) {
      return { success: false, reason: 'Endpoint not found or inactive' };
    }

    // Create HMAC signature per spec 10.2
    const signature = createHmacSignature(
      JSON.stringify(payload),
      endpoint.secret,
    );

    // Send webhook with retry (spec 9.4)
    const response = await axios.post(endpoint.url, payload, {
      headers: {
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': event,
        'X-Webhook-Delivery': crypto.randomUUID(),
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    // Log successful delivery
    await prisma.webhookDeliveryLog.create({
      data: {
        webhookEndpointId: endpointId,
        event,
        statusCode: response.status,
        responseTime: response.headers['x-response-time'] || 0,
        status: 'SUCCESS',
      },
    });

    return { success: true, statusCode: response.status };
  } catch (error) {
    console.error(`Webhook delivery failed (attempt ${attempt}):`, error.message);

    // Log failed delivery
    await prisma.webhookDeliveryLog.create({
      data: {
        webhookEndpointId: endpointId,
        event,
        statusCode: error.response?.status,
        status: attempt >= 3 ? 'FAILED' : 'PENDING',
        errorMessage: error.message,
        retryCount: attempt,
      },
    });

    // Retry with exponential backoff (3 attempts per spec)
    if (attempt < 3) {
      const delay = 2 ** attempt * 1000; // 2s, 4s, 8s
      throw new Error(`Retry after ${delay}ms`);
    }

    return { success: false, error: error.message };
  }
});

// Event listeners for job lifecycle
webhookQueue.on('failed', (job, err) => {
  console.error(`Webhook job ${job.id} failed:`, err.message);
});

webhookQueue.on('completed', (job) => {
  console.log(`Webhook job ${job.id} completed successfully`);
});

/**
 * Create HMAC signature for webhook validation (spec 10.2)
 */
export function createHmacSignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Emit webhook event (spec 9.4)
 * Supported events: user.approved, payment.received, api_key.created, quota.warning
 */
export async function emitWebhookEvent(
  organizationId,
  event,
  payload,
) {
  try {
    // Find all webhook endpoints for this organization
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: {
        organizationId,
        isActive: true,
      },
    });

    // Filter endpoints that are subscribed to this event
    const subscribedEndpoints = endpoints.filter((ep) => {
      try {
        const events = JSON.parse(ep.events);
        return events.includes(event) || events.includes('*');
      } catch {
        return false;
      }
    });

    if (subscribedEndpoints.length === 0) {
      return { sent: 0 };
    }

    // Queue webhook deliveries
    let sent = 0;
    for (const endpoint of subscribedEndpoints) {
      await webhookQueue.add(
        {
          endpointId: endpoint.id,
          event,
          payload,
          timestamp: new Date().toISOString(),
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: true,
        },
      );
      sent++;
    }

    return { sent };
  } catch (error) {
    console.error('Webhook emission error:', error.message);
    return { sent: 0, error: error.message };
  }
}

/**
 * Register webhook endpoint (spec 9.4)
 */
export async function registerWebhookEndpoint(
  organizationId,
  url,
  events,
) {
  try {
    // Validate URL
    new URL(url);

    // Generate secret
    const secret = crypto.randomBytes(32).toString('hex');

    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        organizationId,
        url,
        events: JSON.stringify(events || ['*']),
        secret,
        isActive: true,
      },
    });

    return {
      ...endpoint,
      events: JSON.parse(endpoint.events),
    };
  } catch (error) {
    console.error('Webhook registration error:', error.message);
    throw error;
  }
}

/**
 * Update webhook endpoint
 */
export async function updateWebhookEndpoint(
  endpointId,
  updates,
) {
  try {
    const endpoint = await prisma.webhookEndpoint.update({
      where: { id: endpointId },
      data: {
        url: updates.url,
        events: updates.events ? JSON.stringify(updates.events) : undefined,
        isActive: updates.isActive,
      },
    });

    return {
      ...endpoint,
      events: JSON.parse(endpoint.events),
    };
  } catch (error) {
    console.error('Webhook update error:', error.message);
    throw error;
  }
}

/**
 * Delete webhook endpoint
 */
export async function deleteWebhookEndpoint(endpointId) {
  try {
    await prisma.webhookEndpoint.delete({
      where: { id: endpointId },
    });
    return { success: true };
  } catch (error) {
    console.error('Webhook deletion error:', error.message);
    throw error;
  }
}

/**
 * Get webhook deliveries for an endpoint
 */
export async function getWebhookDeliveries(endpointId, limit = 50) {
  try {
    const logs = await prisma.webhookDeliveryLog.findMany({
      where: { webhookEndpointId: endpointId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return logs;
  } catch (error) {
    console.error('Webhook delivery log error:', error.message);
    throw error;
  }
}

/**
 * Test webhook endpoint
 */
export async function testWebhookEndpoint(endpointId) {
  try {
    const endpoint = await prisma.webhookEndpoint.findUnique({
      where: { id: endpointId },
    });

    if (!endpoint) {
      throw new Error('Webhook endpoint not found');
    }

    const testPayload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook delivery',
      },
    };

    // Add to queue for immediate delivery
    await webhookQueue.add(
      {
        endpointId,
        event: 'webhook.test',
        payload: testPayload,
      },
      {
        priority: 1, // High priority for tests
        delay: 0,
      },
    );

    return { success: true, message: 'Test webhook queued' };
  } catch (error) {
    console.error('Webhook test error:', error.message);
    throw error;
  }
}
