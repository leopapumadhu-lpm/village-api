import express from 'express';
import Stripe from 'stripe';

const router = express.Router();

// Initialize Prisma only if database is available
let prisma = null;
try {
  if (process.env.DATABASE_URL) {
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient();
  }
} catch (e) {
  console.log('Payment routes: Database not available');
}

// Initialize Stripe only if key is provided
const stripe = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_placeholder'
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// Check if DB is available middleware
function checkDb(req, res, next) {
  if (!prisma) {
    return res.status(503).json({
      success: false,
      error: 'Payment service temporarily unavailable in demo mode',
    });
  }
  next();
}

// Check Stripe configuration
function checkStripeConfig(req, res, next) {
  if (!stripe) {
    return res.status(503).json({
      success: false,
      error: 'Payment processing not configured',
    });
  }
  next();
}

// Get current subscription plan
router.get('/current-plan', checkDb, async (req, res) => {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: { userId: req.user.id, status: 'ACTIVE' },
    });

    if (!subscription) {
      return res.status(404).json({ success: false, error: 'No active subscription' });
    }

    const plans = {
      FREE: { name: 'Free', limit: 5000, price: 0 },
      PREMIUM: { name: 'Premium', limit: 50000, price: 49 },
      PRO: { name: 'Pro', limit: 300000, price: 199 },
      UNLIMITED: { name: 'Unlimited', limit: 1000000, price: 499 },
    };

    res.json({
      success: true,
      data: {
        planType: subscription.planType,
        status: subscription.status,
        ...plans[subscription.planType],
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get invoices
router.get('/invoices', checkDb, async (req, res) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: invoices });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get available plans
router.get('/plans', (req, res) => {
  const plans = [
    { id: 'FREE', name: 'Free', limit: 5000, price: 0, description: 'For development and testing' },
    { id: 'PREMIUM', name: 'Premium', limit: 50000, price: 49, description: 'For small businesses' },
    { id: 'PRO', name: 'Pro', limit: 300000, price: 199, description: 'For growing teams' },
    { id: 'UNLIMITED', name: 'Unlimited', limit: 1000000, price: 499, description: 'For enterprises' },
  ];

  res.json({ success: true, data: plans });
});

export default router;
