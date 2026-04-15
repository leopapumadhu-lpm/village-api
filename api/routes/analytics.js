import express from 'express';
import { PrismaClient } from '@prisma/client';
import { createObjectCsvStringifier } from 'csv-writer';

const router = express.Router();
const prisma = new PrismaClient();

// Cache for analytics data (5 minutes TTL)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

// Helper: Get week number
function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round((((d - week1) / 86400000 - 3) + ((week1.getDay() + 6) % 7)) / 7);
}

// Helper: Calculate trend (increasing, decreasing, stable)
function calculateTrend(values) {
  if (values.length < 2) return 'stable';

  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));

  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const percentChange = ((secondAvg - firstAvg) / firstAvg) * 100;

  if (percentChange > 10) return 'increasing';
  if (percentChange < -10) return 'decreasing';
  return 'stable';
}

// Helper: Calculate percentile
function calculatePercentile(values, percentile) {
  if (!values || values.length === 0) return 0;

  const sorted = [...values].filter((v) => typeof v === 'number' && !isNaN(v))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return 0;

  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  // Linear interpolation
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

// Helper function to mask errors in production
function maskError(error, req) {
  if (process.env.NODE_ENV === 'production') {
    console.error('Analytics route error:', error);
    return 'Internal server error';
  }
  return error.message;
}

// Helper to get cached data
function getCached(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

// Helper to set cached data
function setCached(key, data) {
  cache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

// Helper to validate date range
function validateDateRange(startDate, endDate) {
  const maxDays = 90; // Maximum 90 days for analytics
  const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

  if (daysDiff > maxDays) {
    throw new Error(`Date range exceeds maximum of ${maxDays} days`);
  }

  if (startDate > endDate) {
    throw new Error('Start date must be before end date');
  }

  return daysDiff;
}

// Helper to get user role from request
function getUserRole(req) {
  return req.user?.role || 'user';
}

// Helper to check if user is admin
function isAdmin(req) {
  return getUserRole(req) === 'admin';
}

/**
 * GET /b2b/analytics/summary
 * Get daily/monthly usage summary (spec 8.1)
 */
router.get('/summary', async (req, res) => {
  try {
    // Verify authentication
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const userId = req.user.id;
    const period = req.query.period || 'monthly'; // daily, weekly, monthly, yearly
    const startDateParam = req.query.startDate;
    const endDateParam = req.query.endDate;

    // Validate period
    const validPeriods = ['daily', 'weekly', 'monthly', 'yearly'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        success: false,
        error: `Invalid period. Must be one of: ${validPeriods.join(', ')}`,
      });
    }

    const startDate = startDateParam ? new Date(startDateParam) : new Date();
    const endDate = endDateParam ? new Date(endDateParam) : new Date();

    if (!startDateParam) {
      switch (period) {
        case 'daily':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case 'weekly':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'yearly':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        default: // monthly
          startDate.setMonth(startDate.getMonth() - 1);
      }
    }

    // Validate date range
    try {
      validateDateRange(startDate, endDate);
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Check cache
    const cacheKey = `summary:${userId}:${period}:${startDate.toISOString()}:${endDate.toISOString()}`;
    const cachedData = getCached(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }

    // Get total requests in period
    const logs = await prisma.apiLog.findMany({
      where: {
        userId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        responseTime: true,
        statusCode: true,
        endpoint: true,
        createdAt: true,
      },
    });

    const totalRequests = logs.length;
    const totalResponseTime = logs.reduce((sum, log) => sum + (log.responseTime || 0), 0);
    const avgResponseTime = totalRequests > 0 ? Math.round(totalResponseTime / totalRequests) : 0;

    const successCount = logs.filter((l) => l.statusCode >= 200 && l.statusCode < 300).length;
    const successRate = totalRequests > 0
      ? parseFloat(((successCount / totalRequests) * 100).toFixed(2))
      : 0;
    const errorCount = logs.filter((l) => l.statusCode >= 400).length;
    const clientErrorCount = logs.filter((l) => l.statusCode >= 400 && l.statusCode < 500).length;
    const serverErrorCount = logs.filter((l) => l.statusCode >= 500).length;

    // Calculate response time percentiles
    const responseTimes = logs.map((l) => l.responseTime).filter((rt) => rt > 0);

    const result = {
      period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      totalRequests,
      avgResponseTime,
      successRate,
      errorCount,
      clientErrorCount,
      serverErrorCount,
      p50ResponseTime: calculatePercentile(responseTimes, 50),
      p90ResponseTime: calculatePercentile(responseTimes, 90),
      p95ResponseTime: calculatePercentile(responseTimes, 95),
      p99ResponseTime: calculatePercentile(responseTimes, 99),
      requestsPerMinute: totalRequests > 0
        ? parseFloat((totalRequests / ((endDate - startDate) / 60000)).toFixed(2))
        : 0,
    };

    // Cache the result
    setCached(cacheKey, result);

    res.json({ success: true, data: result });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /b2b/analytics/endpoints
 * Get per-endpoint usage statistics (spec 8.1)
 */
router.get('/endpoints', async (req, res) => {
  try {
    // Verify authentication
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const userId = req.user.id;
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
    const sortBy = req.query.sortBy || 'totalRequests'; // totalRequests, avgResponseTime, errorRate
    const sortOrder = req.query.sortOrder || 'desc';

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Check cache
    const cacheKey = `endpoints:${userId}:${days}:${sortBy}:${sortOrder}`;
    const cachedData = getCached(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }

    const logs = await prisma.apiLog.findMany({
      where: {
        userId,
        createdAt: { gte: startDate },
      },
      select: {
        endpoint: true,
        method: true,
        responseTime: true,
        statusCode: true,
        createdAt: true,
      },
    });

    // Group by endpoint and method
    const endpointStats = {};
    logs.forEach((log) => {
      const key = `${log.method}:${log.endpoint}`;
      if (!endpointStats[key]) {
        endpointStats[key] = {
          endpoint: log.endpoint,
          method: log.method,
          totalRequests: 0,
          totalResponseTime: 0,
          errorCount: 0,
          statusCodes: {},
          responseTimes: [],
        };
      }

      endpointStats[key].totalRequests += 1;
      endpointStats[key].totalResponseTime += log.responseTime || 0;
      endpointStats[key].responseTimes.push(log.responseTime || 0);

      if (log.statusCode >= 400) {
        endpointStats[key].errorCount += 1;
      }

      if (!endpointStats[key].statusCodes[log.statusCode]) {
        endpointStats[key].statusCodes[log.statusCode] = 0;
      }
      endpointStats[key].statusCodes[log.statusCode] += 1;
    });

    // Format results
    const results = Object.entries(endpointStats).map(([, stats]) => ({
      endpoint: stats.endpoint,
      method: stats.method,
      totalRequests: stats.totalRequests,
      avgResponseTime: Math.round(stats.totalResponseTime / stats.totalRequests),
      p95ResponseTime: calculatePercentile(stats.responseTimes, 95),
      errorRate: stats.totalRequests > 0
        ? parseFloat(((stats.errorCount / stats.totalRequests) * 100).toFixed(2))
        : 0,
      errorCount: stats.errorCount,
      topStatusCodes: Object.entries(stats.statusCodes)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([code, count]) => ({
          code: parseInt(code, 10),
          count,
          percentage: parseFloat(((count / stats.totalRequests) * 100).toFixed(2)),
        })),
    }));

    // Sort results
    results.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      if (sortBy === 'errorRate' || sortBy === 'avgResponseTime') {
        aVal = parseFloat(aVal);
        bVal = parseFloat(bVal);
      }
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });

    setCached(cacheKey, results);

    res.json({
      success: true,
      data: results,
      period: { days, startDate: startDate.toISOString() },
      metadata: {
        totalEndpoints: results.length,
        totalRequests: results.reduce((sum, r) => sum + r.totalRequests, 0),
      },
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /b2b/analytics/trends
 * Get usage trends over time
 */
router.get('/trends', async (req, res) => {
  try {
    // Verify authentication
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const userId = req.user.id;
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
    const granularity = req.query.granularity || 'day'; // hour, day, week

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Check cache
    const cacheKey = `trends:${userId}:${days}:${granularity}`;
    const cachedData = getCached(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }

    const logs = await prisma.apiLog.findMany({
      where: {
        userId,
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        responseTime: true,
        statusCode: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by time interval
    const trends = {};
    logs.forEach((log) => {
      let key;
      if (granularity === 'hour') {
        key = log.createdAt.toISOString().slice(0, 13); // YYYY-MM-DDTHH
      } else if (granularity === 'week') {
        const weekNumber = getWeekNumber(log.createdAt);
        key = `${log.createdAt.getFullYear()}-W${weekNumber}`;
      } else {
        key = log.createdAt.toISOString().split('T')[0]; // YYYY-MM-DD
      }

      if (!trends[key]) {
        trends[key] = {
          requests: 0,
          totalTime: 0,
          errors: 0,
          timestamp: key,
        };
      }
      trends[key].requests += 1;
      trends[key].totalTime += log.responseTime || 0;
      if (log.statusCode >= 400) {
        trends[key].errors += 1;
      }
    });

    // Format results with moving average
    const data = Object.entries(trends).map(([, stats]) => ({
      timestamp: stats.timestamp,
      requests: stats.requests,
      avgResponseTime: Math.round(stats.totalTime / stats.requests),
      errorRate: parseFloat(((stats.errors / stats.requests) * 100).toFixed(2)),
    }));

    // Calculate 7-day moving average for trends
    const movingAverage = [];
    for (let i = 0; i < data.length; i += 1) {
      const windowData = data.slice(Math.max(0, i - 6), i + 1);
      const avgRequests = windowData.reduce((sum, d) => sum + d.requests, 0) / windowData.length;
      movingAverage.push({
        timestamp: data[i].timestamp,
        movingAverageRequests: Math.round(avgRequests),
      });
    }

    const result = {
      granularity,
      data,
      movingAverage,
      summary: {
        totalRequests: data.reduce((sum, d) => sum + d.requests, 0),
        avgDailyRequests: Math.round(data.reduce((sum, d) => sum + d.requests, 0) / data.length),
        trend: calculateTrend(data.map((d) => d.requests)),
      },
    };

    setCached(cacheKey, result);

    res.json({ success: true, data: result });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /b2b/analytics/cost-projection
 * Project monthly cost based on usage and plan (spec 11.1)
 */
router.get('/cost-projection', async (req, res) => {
  try {
    // Verify authentication
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { planType: true, id: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const today = new Date().toISOString().split('T')[0];
    const todayUsage = await prisma.apiLog.count({
      where: {
        userId,
        createdAt: {
          gte: new Date(`${today}T00:00:00Z`),
          lte: new Date(`${today}T23:59:59Z`),
        },
      },
    });

    // Get last 30 days of usage for better projection
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const last30DaysUsage = await prisma.apiLog.groupBy({
      by: ['createdAt'],
      where: {
        userId,
        createdAt: { gte: thirtyDaysAgo },
      },
      _count: true,
    });

    const avgDailyUsage = last30DaysUsage.length > 0
      ? last30DaysUsage.reduce((sum, day) => sum + day._count, 0) / 30
      : todayUsage;

    const dayOfMonth = new Date().getDate();
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

    // Use weighted projection (last 7 days have higher weight)
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);

    const recentUsage = await prisma.apiLog.count({
      where: {
        userId,
        createdAt: { gte: last7Days },
      },
    });

    const recentAvgDaily = recentUsage / 7;
    const projectedDailyUsage = (recentAvgDaily * 0.7) + (avgDailyUsage * 0.3);
    const estimatedMonthlyUsage = Math.round(projectedDailyUsage * daysInMonth);

    // Plan limits (per spec 11.1)
    const plans = {
      FREE: {
        cost: 0, dailyLimit: 5000, monthlyLimit: 150000, currency: 'USD',
      },
      PREMIUM: {
        cost: 49, dailyLimit: 50000, monthlyLimit: 1500000, currency: 'USD',
      },
      PRO: {
        cost: 199, dailyLimit: 300000, monthlyLimit: 9000000, currency: 'USD',
      },
      UNLIMITED: {
        cost: 499, dailyLimit: 1000000, monthlyLimit: 30000000, currency: 'USD',
      },
    };

    const currentPlan = plans[user.planType];
    const currentPlanMonthlyCost = currentPlan.cost;

    // Calculate potential overage costs (if any)
    const overageRate = 0.005; // $0.005 per extra 1000 requests
    const projectedOverage = Math.max(0, estimatedMonthlyUsage - currentPlan.monthlyLimit);
    const projectedOverageCost = (projectedOverage / 1000) * overageRate;

    const projections = Object.entries(plans).map(([planType, plan]) => {
      const projectedExceed = estimatedMonthlyUsage > plan.monthlyLimit;
      const estimatedOverage = Math.max(0, estimatedMonthlyUsage - plan.monthlyLimit);
      const estimatedOverageCost = (estimatedOverage / 1000) * overageRate;

      return {
        planType,
        monthlyCost: plan.cost,
        dailyLimit: plan.dailyLimit,
        monthlyLimit: plan.monthlyLimit,
        projectedExceed,
        estimatedOverageCost: parseFloat(estimatedOverageCost.toFixed(2)),
        totalEstimatedCost: parseFloat((plan.cost + estimatedOverageCost).toFixed(2)),
        savingsComparedToCurrent: parseFloat((
          currentPlanMonthlyCost + projectedOverageCost - (plan.cost + estimatedOverageCost)
        ).toFixed(2)),
        recommended: plan.cost < currentPlan.cost && projectedExceed === false,
      };
    });

    // Calculate confidence level based on data availability
    const confidenceLevel = Math.min(100, Math.round((last30DaysUsage.length / 30) * 100));

    res.json({
      success: true,
      data: {
        currentPlan: user.planType,
        currentCost: currentPlanMonthlyCost,
        todayUsage,
        avgDailyUsage: Math.round(avgDailyUsage),
        recentAvgDaily: Math.round(recentAvgDaily),
        projectedDailyUsage: Math.round(projectedDailyUsage),
        estimatedMonthlyUsage,
        projectedOverage: Math.round(projectedOverage),
        projectedOverageCost: parseFloat(projectedOverageCost.toFixed(2)),
        totalProjectedCost: parseFloat((currentPlanMonthlyCost + projectedOverageCost).toFixed(2)),
        confidenceLevel,
        dayOfMonth,
        daysInMonth,
        projections: projections.sort((a, b) => a.monthlyCost - b.monthlyCost),
        recommendation: projections.find((p) => p.recommended) || null,
      },
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /admin/analytics/revenue
 * Admin endpoint: Get total MRR and revenue metrics (spec 8.1)
 */
router.get('/admin/revenue', async (req, res) => {
  try {
    // Admin check
    if (!isAdmin(req)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const period = req.query.period || 'monthly'; // monthly, quarterly, yearly

    const startDate = new Date();
    switch (period) {
      case 'quarterly':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case 'yearly':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setMonth(startDate.getMonth() - 1);
    }

    // Get active subscriptions
    const subscriptions = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
      },
      include: {
        user: {
          select: { planType: true, createdAt: true },
        },
      },
    });

    // Plan pricing (spec 11.1)
    const planPricing = {
      FREE: 0,
      PREMIUM: 49,
      PRO: 199,
      UNLIMITED: 499,
    };

    // Calculate MRR
    let totalMRR = 0;
    const planDistribution = {
      FREE: 0, PREMIUM: 0, PRO: 0, UNLIMITED: 0,
    };
    const planMRR = {
      FREE: 0, PREMIUM: 0, PRO: 0, UNLIMITED: 0,
    };

    subscriptions.forEach((sub) => {
      const planType = sub.user?.planType || 'FREE';
      const price = planPricing[planType] || 0;
      totalMRR += price;
      planDistribution[planType] += 1;
      planMRR[planType] += price;
    });

    // Calculate churn (users who canceled in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const canceledCount = await prisma.subscription.count({
      where: {
        status: 'CANCELED',
        canceledAt: { gte: thirtyDaysAgo },
      },
    });

    const activeSubscriptionsCount = subscriptions.length;
    const churnRate = activeSubscriptionsCount > 0 ? (canceledCount / activeSubscriptionsCount) * 100 : 0;

    // Calculate LTV (Lifetime Value)
    const avgMonthlyRevenue = totalMRR / Math.max(1, activeSubscriptionsCount);
    const avgCustomerLifetimeMonths = 100 / Math.max(1, churnRate);
    const ltv = avgMonthlyRevenue * avgCustomerLifetimeMonths;

    // Get revenue over time
    const revenueHistory = await prisma.paymentTransaction.findMany({
      where: {
        status: 'SUCCESS',
        createdAt: { gte: startDate },
      },
      select: {
        amount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group revenue by month
    const monthlyRevenue = {};
    revenueHistory.forEach((transaction) => {
      const month = transaction.createdAt.toISOString().slice(0, 7);
      monthlyRevenue[month] = (monthlyRevenue[month] || 0) + transaction.amount;
    });

    const revenueByMonth = Object.entries(monthlyRevenue).map(([month, revenue]) => ({
      month,
      revenue: parseFloat(revenue.toFixed(2)),
    }));

    res.json({
      success: true,
      data: {
        period,
        totalMRR: parseFloat(totalMRR.toFixed(2)),
        annualRunRate: parseFloat((totalMRR * 12).toFixed(2)),
        activeSubscriptions: activeSubscriptionsCount,
        churnRate: parseFloat(churnRate.toFixed(2)),
        customerLtv: parseFloat(ltv.toFixed(2)),
        planDistribution,
        revenuePerPlan: {
          FREE: 0,
          PREMIUM: planMRR.PREMIUM,
          PRO: planMRR.PRO,
          UNLIMITED: planMRR.UNLIMITED,
        },
        revenueHistory: revenueByMonth,
        totalRevenueToDate: parseFloat(
          revenueHistory.reduce((sum, t) => sum + t.amount, 0).toFixed(2),
        ),
      },
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /b2b/analytics/export
 * Export analytics data as CSV or JSON
 */
router.get('/export', async (req, res) => {
  try {
    // Verify authentication
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const userId = req.user.id;
    const format = req.query.format || 'json'; // json or csv
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
    const startDateParam = req.query.startDate;

    const startDate = startDateParam ? new Date(startDateParam) : new Date();
    if (!startDateParam) {
      startDate.setDate(startDate.getDate() - days);
    }

    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();

    // Validate date range
    try {
      validateDateRange(startDate, endDate);
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Rate limiting for exports (prevent abuse)
    const recentExports = await prisma.apiLog.count({
      where: {
        userId,
        endpoint: '/b2b/analytics/export',
        createdAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
        },
      },
    });

    if (recentExports >= 10) {
      return res.status(429).json({
        success: false,
        error: 'Export rate limit exceeded. Maximum 10 exports per hour.',
      });
    }

    const logs = await prisma.apiLog.findMany({
      where: {
        userId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10000, // Limit to 10k rows for performance
    });

    if (format === 'csv') {
      // Use proper CSV library for better escaping
      const csvStringifier = createObjectCsvStringifier({
        header: [
          { id: 'timestamp', title: 'Timestamp' },
          { id: 'endpoint', title: 'Endpoint' },
          { id: 'method', title: 'Method' },
          { id: 'statusCode', title: 'Status Code' },
          { id: 'responseTime', title: 'Response Time (ms)' },
          { id: 'ipAddress', title: 'IP Address' },
          { id: 'userAgent', title: 'User Agent' },
        ],
      });

      const records = logs.map((log) => ({
        timestamp: log.createdAt.toISOString(),
        endpoint: log.endpoint,
        method: log.method,
        statusCode: log.statusCode,
        responseTime: log.responseTime,
        ipAddress: log.ipAddress || '',
        userAgent: log.userAgent || '',
      }));

      const csv = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="analytics-${new Date().toISOString().slice(0, 19)}.csv"`,
      );
      res.setHeader('Content-Length', Buffer.byteLength(csv));
      res.send(csv);
    } else {
      // JSON format with pagination
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 100));
      const offset = (page - 1) * limit;

      const paginatedLogs = logs.slice(offset, offset + limit);

      res.json({
        success: true,
        data: paginatedLogs,
        pagination: {
          page,
          limit,
          total: logs.length,
          pages: Math.ceil(logs.length / limit),
        },
        exportedAt: new Date().toISOString(),
        filters: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          days,
        },
      });
    }
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /b2b/analytics/real-time
 * Get real-time usage metrics for the current minute
 */
router.get('/real-time', async (req, res) => {
  try {
    // Verify authentication
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const userId = req.user.id;
    const currentMinute = new Date();
    currentMinute.setSeconds(0, 0);

    const lastHour = new Date();
    lastHour.setHours(lastHour.getHours() - 1);

    // Get requests in current minute
    const currentMinuteRequests = await prisma.apiLog.count({
      where: {
        userId,
        createdAt: {
          gte: currentMinute,
        },
      },
    });

    // Get requests in last hour
    const lastHourRequests = await prisma.apiLog.count({
      where: {
        userId,
        createdAt: {
          gte: lastHour,
        },
      },
    });

    // Get average response time for last minute
    const lastMinuteLogs = await prisma.apiLog.findMany({
      where: {
        userId,
        createdAt: {
          gte: currentMinute,
        },
      },
      select: { responseTime: true },
    });

    const avgResponseTime = lastMinuteLogs.length > 0
      ? Math.round(lastMinuteLogs.reduce((sum, l) => sum + l.responseTime, 0) / lastMinuteLogs.length)
      : 0;

    // Get error rate for last minute
    const errorCount = await prisma.apiLog.count({
      where: {
        userId,
        createdAt: { gte: currentMinute },
        statusCode: { gte: 400 },
      },
    });

    const errorRate = lastMinuteLogs.length > 0
      ? parseFloat(((errorCount / lastMinuteLogs.length) * 100).toFixed(2))
      : 0;

    res.json({
      success: true,
      data: {
        timestamp: currentMinute.toISOString(),
        requestsPerMinute: currentMinuteRequests,
        requestsPerHour: lastHourRequests,
        avgResponseTime,
        errorRate,
        isActive: currentMinuteRequests > 0,
      },
    });
  } catch (error) {
    const message = maskError(error, req);
    res.status(500).json({ success: false, error: message });
  }
});

// Cleanup cache periodically (every hour)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}, 60 * 60 * 1000);

export default router;
