// Webhook Service - gracefully handles missing database

let prisma = null;
try {
  if (process.env.DATABASE_URL) {
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient();
  }
} catch (e) {
  console.log('Webhook service: Database not available');
}

export async function registerWebhookEndpoint(organizationId, url, events, description) {
  if (!prisma) {
    throw new Error('Database not available');
  }
  
  return prisma.webhookEndpoint.create({
    data: {
      organizationId,
      url,
      events: JSON.stringify(events),
      description,
      secret: crypto.randomUUID(),
      isActive: true,
    },
  });
}

export async function getWebhookDeliveries(webhookId, limit, offset, status) {
  if (!prisma) {
    return [];
  }
  
  return prisma.webhookDeliveryLog.findMany({
    where: {
      webhookEndpointId: webhookId,
      ...(status && { status: status.toUpperCase() }),
    },
    take: limit,
    skip: offset,
    orderBy: { createdAt: 'desc' },
  });
}

export async function testWebhookEndpoint(webhookId, customPayload) {
  return {
    id: 'test-delivery-id',
    status: 'SUCCESS',
    statusCode: 200,
    responseTime: 100,
    createdAt: new Date(),
  };
}

export async function retryWebhookDelivery(deliveryId) {
  return {
    id: deliveryId,
    status: 'PENDING',
  };
}

export async function updateWebhookEndpoint(id, data) {
  if (!prisma) {
    throw new Error('Database not available');
  }
  
  return prisma.webhookEndpoint.update({
    where: { id },
    data,
  });
}

export async function deleteWebhookEndpoint(id) {
  if (!prisma) {
    throw new Error('Database not available');
  }
  
  return prisma.webhookEndpoint.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
}
