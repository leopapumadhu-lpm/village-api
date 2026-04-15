import express from 'express';
import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import {
  createSetupIntent,
  createStripeCustomer,
  createSubscription,
  handleStripeWebhook,
  upgradeSubscription,
  cancelSubscription,
  getPlanInfo,
} from '../services/stripeService.js';

const router = express.Router();

// Initialize Stripe only if key is provided (graceful degradation)
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const prisma = new PrismaClient();

// Middleware to check Stripe configuration
function checkStripeConfig(req, res, next) {
  if (!stripe) {
    return res.status(503).json({
      success: false,
      error: 'Payment processing is not configured. Please contact support.',
    });
  }
  next();
}

/**
 * POST /payments/setup-intent
 * Create setup intent for card collection (spec 11.1)
 */
router.post('/setup-intent', checkStripeConfig, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Get or create Stripe customer
    let { stripeCustomerId } = user;
    if (!stripeCustomerId) {
      const customer = await createStripeCustomer(user);
      stripeCustomerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId },
      });
    }

    const setupIntent = await createSetupIntent(stripeCustomerId);

    res.json({
      success: true,
      data: {
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /payments/create-subscription
 * Create a new subscription (spec 11.1 - plans: FREE/PREMIUM/PRO/UNLIMITED)
 */
router.post('/create-subscription', checkStripeConfig, async (req, res) => {
  try {
    const { planType, paymentMethodId } = req.body;

    if (!planType) {
      return res.status(400).json({ success: false, error: 'Plan type required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Get or create Stripe customer
    let { stripeCustomerId } = user;
    if (!stripeCustomerId) {
      const customer = await createStripeCustomer(user);
      stripeCustomerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId },
      });
    }

    // Create subscription
    const result = await createSubscription(
      user.id,
      planType,
      stripeCustomerId,
      paymentMethodId,
    );

    // Update user plan
    await prisma.user.update({
      where: { id: user.id },
      data: { planType },
    });

    res.status(201).json({
      success: true,
      data: {
        subscription: result.subscription || result,
        clientSecret: result.clientSecret,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /payments/webhook
 * Handle Stripe webhook events (spec 11.3)
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Webhook processing not configured' });
  }

  const sig = req.headers['stripe-signature'];

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );

    const result = await handleStripeWebhook(event);

    res.json({ received: true, handled: result.handled });
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(400).json({ error: `Webhook error: ${error.message}` });
  }
});

/**
 * GET /payments/invoices
 * Get user's invoices (spec 11.3)
 */
router.get('/invoices', async (req, res) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { userId: req.user.id },
      include: { subscription: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: invoices,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /payments/upgrade
 * Upgrade to a higher plan (spec 11.1)
 */
router.post('/upgrade', async (req, res) => {
  try {
    const { newPlanType } = req.body;

    if (!newPlanType) {
      return res.status(400).json({ success: false, error: 'New plan type required' });
    }

    const subscription = await prisma.subscription.findFirst({
      where: { userId: req.user.id, status: 'ACTIVE' },
    });

    if (!subscription) {
      return res.status(404).json({ success: false, error: 'Active subscription not found' });
    }

    if (subscription.planType === 'FREE') {
      // For free plan users, create a new subscription
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
      });

      const result = await createSubscription(
        user.id,
        newPlanType,
        user.stripeCustomerId,
      );

      // Deactivate old free subscription
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'CANCELED' },
      });

      return res.json({
        success: true,
        data: result.subscription || result,
        clientSecret: result.clientSecret,
      });
    }

    // For paid plans, update existing subscription
    const updatedSubscription = await upgradeSubscription(
      req.user.id,
      newPlanType,
      subscription.stripeSubscriptionId,
    );

    res.json({
      success: true,
      data: updatedSubscription,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /payments/cancel
 * Cancel subscription (spec 11.1)
 */
router.post('/cancel', async (req, res) => {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: { userId: req.user.id, status: 'ACTIVE' },
    });

    if (!subscription) {
      return res.status(404).json({ success: false, error: 'Active subscription not found' });
    }

    if (!subscription.stripeSubscriptionId) {
      // Free plan, just update status
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'CANCELED', canceledAt: new Date() },
      });
    } else {
      // Paid plan, cancel on Stripe
      await cancelSubscription(subscription.stripeSubscriptionId);
    }

    res.json({
      success: true,
      message: 'Subscription canceled successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /payments/current-plan
 * Get current subscription plan info
 */
router.get('/current-plan', async (req, res) => {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: { userId: req.user.id, status: 'ACTIVE' },
    });

    if (!subscription) {
      return res.status(404).json({ success: false, error: 'No active subscription' });
    }

    const planInfo = getPlanInfo(subscription.planType);

    res.json({
      success: true,
      data: {
        planType: subscription.planType,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        ...planInfo,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
