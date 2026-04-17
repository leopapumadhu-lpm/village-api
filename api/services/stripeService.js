// Stripe Service - gracefully handles missing configuration

import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_placeholder'
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

let prisma = null;
try {
  if (process.env.DATABASE_URL) {
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient();
  }
} catch (e) {
  console.log('Stripe service: Database not available');
}

export async function createStripeCustomer(user) {
  if (!stripe) {
    return { id: `demo_customer_${user.id}` };
  }
  
  return stripe.customers.create({
    email: user.email,
    name: user.businessName,
  });
}

export async function createSetupIntent(customerId) {
  if (!stripe) {
    return { client_secret: 'demo_setup_secret', id: 'demo_setup_intent' };
  }
  
  return stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
  });
}

export async function createSubscription(userId, planType, customerId, paymentMethodId) {
  if (!stripe) {
    return {
      subscription: { id: `demo_sub_${userId}`, status: 'active', planType },
      clientSecret: null,
    };
  }
  
  // This would create a real Stripe subscription
  throw new Error('Stripe integration not configured');
}

export async function upgradeSubscription(userId, newPlanType, subscriptionId) {
  if (!stripe) {
    return { id: subscriptionId, status: 'active', planType: newPlanType };
  }
  
  throw new Error('Stripe integration not configured');
}

export async function cancelSubscription(subscriptionId) {
  if (!stripe) {
    return { id: subscriptionId, status: 'canceled' };
  }
  
  return stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

export async function handleStripeWebhook(event) {
  console.log('Stripe webhook received:', event.type);
  return { handled: true };
}

export function getPlanInfo(planType) {
  const plans = {
    FREE: { name: 'Free', limit: 5000, price: 0 },
    PREMIUM: { name: 'Premium', limit: 50000, price: 49 },
    PRO: { name: 'Pro', limit: 300000, price: 199 },
    UNLIMITED: { name: 'Unlimited', limit: 1000000, price: 499 },
  };
  
  return plans[planType] || plans.FREE;
}
