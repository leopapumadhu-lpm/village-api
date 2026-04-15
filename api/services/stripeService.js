import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import { sendPaymentConfirmation, sendInvoiceEmail } from './emailService.js';

// Initialize Stripe only if key is provided
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16',
    maxNetworkRetries: 3,
    timeout: 30000,
  })
  : null;

const prisma = new PrismaClient();

// Plan pricing per spec section 11.1
const PLAN_PRICING = {
  FREE: {
    amount: 0, priceId: 'price_free', dailyLimit: 5000, currency: 'INR',
  },
  PREMIUM: {
    amount: 4900, priceId: process.env.STRIPE_PREMIUM_PRICE_ID, dailyLimit: 50000, currency: 'INR',
  },
  PRO: {
    amount: 19900, priceId: process.env.STRIPE_PRO_PRICE_ID, dailyLimit: 300000, currency: 'INR',
  },
  UNLIMITED: {
    amount: 49900, priceId: process.env.STRIPE_UNLIMITED_PRICE_ID, dailyLimit: 1000000, currency: 'INR',
  },
};

// Validation helper
function validatePlanType(planType) {
  if (!PLAN_PRICING[planType]) {
    throw new Error(`Invalid plan type: ${planType}. Must be one of: FREE, PREMIUM, PRO, UNLIMITED`);
  }
}

// Error handler with retry logic
async function withRetry(operation, maxRetries = 3, delay = 1000) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (error.type === 'StripeRateLimitError' || error.statusCode === 429) {
        const waitTime = delay * 2 ** i;
        console.log(`Rate limited, retrying in ${waitTime}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// Check if Stripe is configured
function requireStripe() {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
  }
}

/**
 * Create a setup intent for collecting payment method
 * Used before creating a subscription (spec 11.1)
 */
export async function createSetupIntent(customerId, returnUrl = null) {
  requireStripe();

  try {
    const setupIntentParams = {
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
    };

    if (returnUrl) {
      setupIntentParams.return_url = returnUrl;
    }

    const setupIntent = await withRetry(() => stripe.setupIntents.create(setupIntentParams));

    return {
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
    };
  } catch (error) {
    console.error('Setup intent error:', error.message);
    throw new Error(`Failed to create setup intent: ${error.message}`);
  }
}

/**
 * Create a Stripe customer
 * Called on user registration (spec 11.1)
 */
export async function createStripeCustomer(user, paymentMethodId = null) {
  requireStripe();

  try {
    const customerParams = {
      email: user.email,
      name: user.businessName,
      metadata: {
        userId: user.id.toString(),
        environment: process.env.NODE_ENV || 'development',
      },
      preferred_locales: ['en'],
    };

    if (paymentMethodId) {
      customerParams.payment_method = paymentMethodId;
    }

    const customer = await withRetry(() => stripe.customers.create(customerParams));

    // Store customer ID in database
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customer.id },
    });

    return customer;
  } catch (error) {
    console.error('Customer creation error:', error.message);
    throw new Error(`Failed to create Stripe customer: ${error.message}`);
  }
}

/**
 * Get or create Stripe customer for user
 */
export async function getOrCreateStripeCustomer(user) {
  if (user.stripeCustomerId) {
    try {
      const customer = await withRetry(() => stripe.customers.retrieve(user.stripeCustomerId));
      if (customer && !customer.deleted) {
        return customer;
      }
    } catch (error) {
      console.log('Customer not found, creating new one:', error.message);
    }
  }
  return await createStripeCustomer(user);
}

/**
 * Create a subscription (spec 11.1)
 * Plans: FREE ($0), PREMIUM ($49), PRO ($199), UNLIMITED ($499)
 */
export async function createSubscription(
  userId,
  planType,
  stripeCustomerId = null,
  paymentMethodId = null,
  trialDays = 0,
) {
  try {
    validatePlanType(planType);

    const plan = PLAN_PRICING[planType];

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Free plan doesn't need Stripe subscription
    if (planType === 'FREE') {
      // Cancel any existing paid subscription first
      await cancelAllSubscriptions(userId);

      const subscription = await prisma.subscription.create({
        data: {
          userId,
          planType,
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // Update user's plan
      await prisma.user.update({
        where: { id: userId },
        data: { planType },
      });

      return { subscription, isFree: true };
    }

    // Paid plan requires Stripe
    requireStripe();

    // Get or create Stripe customer
    let customerId = stripeCustomerId;
    if (!customerId) {
      const customer = await getOrCreateStripeCustomer(user);
      customerId = customer.id;
    }

    // Prepare subscription params
    const subscriptionParams = {
      customer: customerId,
      items: [
        {
          price: plan.priceId,
          quantity: 1,
        },
      ],
      payment_behavior: paymentMethodId ? 'default_incomplete' : 'default_incomplete',
      expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
      metadata: {
        userId: userId.toString(),
        planType,
      },
    };

    // Add trial if specified
    if (trialDays > 0) {
      subscriptionParams.trial_period_days = trialDays;
    }

    // Attach payment method if provided
    if (paymentMethodId) {
      subscriptionParams.default_payment_method = paymentMethodId;
    }

    const stripeSubscription = await withRetry(() => stripe.subscriptions.create(subscriptionParams));

    // Cancel any existing subscriptions
    await cancelAllSubscriptions(userId, stripeSubscription.id);

    // Save subscription to database
    const subscription = await prisma.subscription.create({
      data: {
        userId,
        planType,
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId: customerId,
        status: stripeSubscription.status.toUpperCase(),
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        trialStart: stripeSubscription.trial_start ? new Date(stripeSubscription.trial_start * 1000) : null,
        trialEnd: stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : null,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      },
    });

    // Update user's plan
    await prisma.user.update({
      where: { id: userId },
      data: { planType },
    });

    return {
      subscription,
      clientSecret: stripeSubscription.latest_invoice?.payment_intent?.client_secret,
      setupIntentClientSecret: stripeSubscription.pending_setup_intent?.client_secret,
    };
  } catch (error) {
    console.error('Subscription creation error:', error.message);
    throw new Error(`Failed to create subscription: ${error.message}`);
  }
}

/**
 * Cancel all active subscriptions for a user
 */
async function cancelAllSubscriptions(userId, excludeSubscriptionId = null) {
  const activeSubscriptions = await prisma.subscription.findMany({
    where: {
      userId,
      status: 'ACTIVE',
      ...(excludeSubscriptionId && { stripeSubscriptionId: { not: excludeSubscriptionId } }),
    },
  });

  for (const sub of activeSubscriptions) {
    if (sub.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.update(sub.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
      } catch (error) {
        console.error(`Failed to cancel subscription ${sub.id}:`, error.message);
      }
    }

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
      },
    });
  }
}

/**
 * Handle Stripe webhook events
 * Per spec 11.3 events: charge.succeeded, customer.subscription.updated, etc.
 */
export async function handleStripeWebhook(event, rawBody = null) {
  try {
    // Verify event type and process
    switch (event.type) {
      case 'charge.succeeded':
        return await handleChargeSucceeded(event.data.object);

      case 'charge.failed':
        return await handleChargeFailed(event.data.object);

      case 'customer.subscription.created':
        return await handleSubscriptionCreated(event.data.object);

      case 'customer.subscription.updated':
        return await handleSubscriptionUpdated(event.data.object);

      case 'customer.subscription.deleted':
        return await handleSubscriptionDeleted(event.data.object);

      case 'invoice.payment_succeeded':
        return await handleInvoicePaymentSucceeded(event.data.object);

      case 'invoice.payment_failed':
        return await handleInvoicePaymentFailed(event.data.object);

      case 'payment_intent.succeeded':
        return await handlePaymentIntentSucceeded(event.data.object);

      case 'payment_intent.payment_failed':
        return await handlePaymentIntentFailed(event.data.object);

      default:
        console.log(`Unhandled event type ${event.type}`);
        return { handled: false, eventType: event.type };
    }
  } catch (error) {
    console.error('Webhook handling error:', error.message);
    throw new Error(`Webhook processing failed: ${error.message}`);
  }
}

/**
 * Handle successful charge
 */
async function handleChargeSucceeded(charge) {
  try {
    // Find subscription by Stripe subscription ID
    let subscription = null;
    if (charge.subscription) {
      subscription = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId: charge.subscription },
        include: { user: true },
      });
    }

    if (!subscription) {
      // Try to find by customer ID for one-time charges
      const customer = await prisma.user.findFirst({
        where: { stripeCustomerId: charge.customer },
      });
      if (customer) {
        console.log(`One-time charge for customer ${charge.customer}`);
        return { handled: true, isOneTime: true };
      }
      return { handled: false, reason: 'Subscription not found' };
    }

    // Check for duplicate transaction
    const existingTransaction = await prisma.paymentTransaction.findFirst({
      where: { stripePaymentId: charge.id },
    });

    if (existingTransaction) {
      console.log(`Duplicate charge ${charge.id} ignored`);
      return { handled: true, duplicate: true };
    }

    // Create payment transaction record (spec 11.3)
    const transaction = await prisma.paymentTransaction.create({
      data: {
        subscriptionId: subscription.id,
        amount: charge.amount / 100,
        currency: charge.currency.toUpperCase(),
        status: 'SUCCESS',
        stripePaymentId: charge.id,
        paidAt: new Date(charge.created * 1000),
        receiptUrl: charge.receipt_url,
      },
    });

    // Check if invoice already exists
    let invoice = await prisma.invoice.findFirst({
      where: { stripeInvoiceId: charge.invoice },
    });

    if (!invoice && charge.invoice) {
      // Create invoice
      invoice = await prisma.invoice.create({
        data: {
          userId: subscription.userId,
          subscriptionId: subscription.id,
          invoiceNumber: `INV-${Date.now()}-${subscription.id}`,
          amount: charge.amount / 100,
          tax: 0,
          total: charge.amount / 100,
          status: 'PAID',
          issuedAt: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          paidAt: new Date(charge.created * 1000),
          pdfUrl: charge.receipt_url,
          stripeInvoiceId: charge.invoice,
        },
        include: { subscription: { include: { user: true } } },
      });

      // Send confirmation email (spec 8.2)
      try {
        await sendPaymentConfirmation(subscription.user, invoice);
      } catch (emailError) {
        console.error('Failed to send payment confirmation email:', emailError);
        // Don't throw - email failure shouldn't break webhook processing
      }
    }

    return { handled: true, transaction, invoice };
  } catch (error) {
    console.error('Charge succeeded handler error:', error.message);
    throw error;
  }
}

/**
 * Handle failed charge
 */
async function handleChargeFailed(charge) {
  try {
    // Log failed payment for monitoring
    console.error(`Charge failed: ${charge.id}`, charge.failure_message);

    // Create failed transaction record
    await prisma.paymentTransaction.create({
      data: {
        subscriptionId: null,
        amount: charge.amount / 100,
        currency: charge.currency.toUpperCase(),
        status: 'FAILED',
        stripePaymentId: charge.id,
        failureReason: charge.failure_message,
        paidAt: null,
      },
    });

    return { handled: true };
  } catch (error) {
    console.error('Charge failed handler error:', error.message);
    throw error;
  }
}

/**
 * Handle subscription creation
 */
async function handleSubscriptionCreated(stripeSubscription) {
  try {
    // Check if subscription already exists
    const existing = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: stripeSubscription.id },
    });

    if (existing) {
      return { handled: true, existing: true };
    }

    // Find user by customer ID
    const user = await prisma.user.findFirst({
      where: { stripeCustomerId: stripeSubscription.customer },
    });

    if (!user) {
      console.error(`User not found for customer ${stripeSubscription.customer}`);
      return { handled: false, reason: 'User not found' };
    }

    // Determine plan type from price ID
    let planType = 'FREE';
    for (const [type, plan] of Object.entries(PLAN_PRICING)) {
      if (plan.priceId === stripeSubscription.items.data[0]?.price.id) {
        planType = type;
        break;
      }
    }

    // Create subscription record
    const subscription = await prisma.subscription.create({
      data: {
        userId: user.id,
        planType,
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId: stripeSubscription.customer,
        status: stripeSubscription.status.toUpperCase(),
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        trialStart: stripeSubscription.trial_start ? new Date(stripeSubscription.trial_start * 1000) : null,
        trialEnd: stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : null,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      },
    });

    // Update user's plan
    await prisma.user.update({
      where: { id: user.id },
      data: { planType },
    });

    return { handled: true, subscription };
  } catch (error) {
    console.error('Subscription creation handler error:', error.message);
    throw error;
  }
}

/**
 * Handle subscription updates
 */
async function handleSubscriptionUpdated(stripeSubscription) {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: stripeSubscription.id },
    });

    if (!subscription) {
      return { handled: false, reason: 'Subscription not found' };
    }

    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: stripeSubscription.status.toUpperCase(),
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        ...(stripeSubscription.canceled_at && { canceledAt: new Date(stripeSubscription.canceled_at * 1000) }),
      },
    });

    return { handled: true, subscription: updated };
  } catch (error) {
    console.error('Subscription update handler error:', error.message);
    throw error;
  }
}

/**
 * Handle subscription cancellation
 */
async function handleSubscriptionDeleted(stripeSubscription) {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: stripeSubscription.id },
    });

    if (!subscription) {
      return { handled: false, reason: 'Subscription not found' };
    }

    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
      },
    });

    // Downgrade user to FREE plan
    await prisma.user.update({
      where: { id: subscription.userId },
      data: { planType: 'FREE' },
    });

    return { handled: true, subscription: updated };
  } catch (error) {
    console.error('Subscription delete handler error:', error.message);
    throw error;
  }
}

/**
 * Handle invoice payment success
 */
async function handleInvoicePaymentSucceeded(stripeInvoice) {
  try {
    // Find subscription
    const subscription = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: stripeInvoice.subscription },
      include: { user: true },
    });

    if (!subscription) {
      return { handled: false, reason: 'Subscription not found' };
    }

    // Find or create invoice
    let invoice = await prisma.invoice.findFirst({
      where: { stripeInvoiceId: stripeInvoice.id },
    });

    if (!invoice) {
      invoice = await prisma.invoice.create({
        data: {
          userId: subscription.userId,
          subscriptionId: subscription.id,
          invoiceNumber: stripeInvoice.number || `INV-${Date.now()}`,
          amount: stripeInvoice.amount_paid / 100,
          tax: 0,
          total: stripeInvoice.amount_paid / 100,
          status: 'PAID',
          issuedAt: new Date(stripeInvoice.created * 1000),
          dueDate: new Date(stripeInvoice.due_date * 1000),
          paidAt: new Date(),
          pdfUrl: stripeInvoice.invoice_pdf,
          stripeInvoiceId: stripeInvoice.id,
        },
      });

      // Send invoice email
      try {
        await sendInvoiceEmail(subscription.user, invoice);
      } catch (emailError) {
        console.error('Failed to send invoice email:', emailError);
      }
    } else {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'PAID', paidAt: new Date() },
      });
    }

    return { handled: true, invoice };
  } catch (error) {
    console.error('Invoice payment handler error:', error.message);
    throw error;
  }
}

/**
 * Handle invoice payment failure
 */
async function handleInvoicePaymentFailed(stripeInvoice) {
  try {
    console.error(`Invoice payment failed: ${stripeInvoice.id}`);

    // Notify user about failed payment
    const subscription = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: stripeInvoice.subscription },
      include: { user: true },
    });

    if (subscription) {
      // TODO: Send payment failure notification email
      console.log(`Payment failed for user ${subscription.user.email}`);
    }

    return { handled: true };
  } catch (error) {
    console.error('Invoice payment failed handler error:', error.message);
    throw error;
  }
}

/**
 * Handle payment intent success
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  try {
    console.log(`Payment intent succeeded: ${paymentIntent.id}`);
    return { handled: true };
  } catch (error) {
    console.error('Payment intent handler error:', error.message);
    throw error;
  }
}

/**
 * Handle payment intent failure
 */
async function handlePaymentIntentFailed(paymentIntent) {
  try {
    console.error(`Payment intent failed: ${paymentIntent.id}`, paymentIntent.last_payment_error);
    return { handled: true };
  } catch (error) {
    console.error('Payment intent failed handler error:', error.message);
    throw error;
  }
}

/**
 * Upgrade subscription (spec 11.1)
 */
export async function upgradeSubscription(userId, newPlanType, stripeSubscriptionId = null) {
  try {
    validatePlanType(newPlanType);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const currentPlan = user.planType;
    if (currentPlan === newPlanType) {
      throw new Error(`Already on ${newPlanType} plan`);
    }

    const newPlan = PLAN_PRICING[newPlanType];

    // If upgrading to FREE (downgrade), cancel subscription
    if (newPlanType === 'FREE') {
      if (user.subscription?.stripeSubscriptionId) {
        await cancelSubscription(user.subscription.stripeSubscriptionId);
      }
      return await createSubscription(userId, 'FREE');
    }

    requireStripe();

    // Get or create Stripe customer
    let { stripeCustomerId } = user;
    if (!stripeCustomerId) {
      const customer = await createStripeCustomer(user);
      stripeCustomerId = customer.id;
    }

    let subscriptionId = stripeSubscriptionId;
    if (!subscriptionId && user.subscription?.stripeSubscriptionId) {
      subscriptionId = user.subscription.stripeSubscriptionId;
    }

    if (!subscriptionId) {
      // No existing subscription, create new one
      return await createSubscription(userId, newPlanType, stripeCustomerId);
    }

    // Update Stripe subscription
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    const currentPriceId = stripeSubscription.items.data[0].price.id;
    const newPriceId = newPlan.priceId;

    if (currentPriceId === newPriceId) {
      throw new Error('Already subscribed to this plan');
    }

    const updatedStripeSubscription = await withRetry(() => stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: stripeSubscription.items.data[0].id,
          price: newPriceId,
        },
      ],
      proration_behavior: 'create_prorations',
    }));

    // Update database
    const subscription = await prisma.subscription.update({
      where: { stripeSubscriptionId: subscriptionId },
      data: {
        planType: newPlanType,
        status: updatedStripeSubscription.status.toUpperCase(),
        currentPeriodStart: new Date(updatedStripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(updatedStripeSubscription.current_period_end * 1000),
      },
    });

    // Update user's plan
    await prisma.user.update({
      where: { id: userId },
      data: { planType: newPlanType },
    });

    return subscription;
  } catch (error) {
    console.error('Upgrade subscription error:', error.message);
    throw new Error(`Failed to upgrade subscription: ${error.message}`);
  }
}

/**
 * Cancel subscription (spec 11.1)
 */
export async function cancelSubscription(stripeSubscriptionId, immediate = false) {
  try {
    requireStripe();

    const subscription = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId },
    });

    if (!subscription) {
      throw new Error(`Subscription not found: ${stripeSubscriptionId}`);
    }

    let stripeSubscription;
    if (immediate) {
      // Cancel immediately
      stripeSubscription = await withRetry(() => stripe.subscriptions.cancel(stripeSubscriptionId));
    } else {
      // Cancel at period end
      stripeSubscription = await withRetry(() => stripe.subscriptions.update(stripeSubscriptionId, {
        cancel_at_period_end: true,
      }));
    }

    // Update database
    const updatedSubscription = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: immediate ? 'CANCELED' : 'ACTIVE',
        cancelAtPeriodEnd: !immediate,
        ...(immediate && { canceledAt: new Date() }),
      },
    });

    // If immediate cancellation, downgrade user to FREE
    if (immediate) {
      await prisma.user.update({
        where: { id: subscription.userId },
        data: { planType: 'FREE' },
      });
    }

    return updatedSubscription;
  } catch (error) {
    console.error('Cancel subscription error:', error.message);
    throw new Error(`Failed to cancel subscription: ${error.message}`);
  }
}

/**
 * Reactivate a cancelled subscription
 */
export async function reactivateSubscription(stripeSubscriptionId) {
  try {
    requireStripe();

    const subscription = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId },
    });

    if (!subscription) {
      throw new Error(`Subscription not found: ${stripeSubscriptionId}`);
    }

    const stripeSubscription = await withRetry(() => stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: false,
    }));

    const updatedSubscription = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: false,
        status: stripeSubscription.status.toUpperCase(),
      },
    });

    return updatedSubscription;
  } catch (error) {
    console.error('Reactivate subscription error:', error.message);
    throw new Error(`Failed to reactivate subscription: ${error.message}`);
  }
}

/**
 * Get plan information
 */
export function getPlanInfo(planType) {
  validatePlanType(planType);
  const plan = PLAN_PRICING[planType];
  return {
    ...plan,
    amountFormatted: new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: plan.currency,
    }).format(plan.amount / 100),
  };
}

/**
 * Get all plans
 */
export function getAllPlans() {
  return Object.entries(PLAN_PRICING).map(([type, plan]) => ({
    type,
    ...getPlanInfo(type),
  }));
}

/**
 * Get subscription details for a user
 */
export async function getUserSubscriptionDetails(userId) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: true,
      },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    let stripeDetails = null;
    if (user.subscription?.stripeSubscriptionId && stripe) {
      try {
        const stripeSubscription = await stripe.subscriptions.retrieve(
          user.subscription.stripeSubscriptionId,
        );
        stripeDetails = {
          status: stripeSubscription.status,
          currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
          cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
          latestInvoice: stripeSubscription.latest_invoice,
        };
      } catch (error) {
        console.error('Failed to retrieve Stripe subscription:', error.message);
      }
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        planType: user.planType,
      },
      subscription: user.subscription,
      stripeDetails,
      planInfo: getPlanInfo(user.planType),
    };
  } catch (error) {
    console.error('Get subscription details error:', error.message);
    throw new Error(`Failed to get subscription details: ${error.message}`);
  }
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(rawBody, signature, webhookSecret) {
  requireStripe();

  if (!webhookSecret) {
    throw new Error('Webhook secret not configured');
  }

  try {
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    return event;
  } catch (error) {
    console.error('Webhook signature verification failed:', error.message);
    throw new Error(`Webhook signature verification failed: ${error.message}`);
  }
}
