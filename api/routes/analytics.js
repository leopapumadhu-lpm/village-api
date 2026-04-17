import express from 'express';

const router = express.Router();

// Initialize Prisma only if database is available
let prisma = null;
try {
  if (process.env.DATABASE_URL) {
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient();
  }
} catch (e) {
  console.log('Analytics routes: Database not available');
}

// Check if DB is available middleware
function checkDb(req, res, next) {
  if (!prisma) {
    return res.status(503).json({
      success: false,
      error: 'Analytics temporarily unavailable in demo mode',
    });
  }
  next();
}

// Get summary
router.get('/summary', checkDb, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const totalRequests = await prisma.apiLog.count({
      where: {
        userId: req.user.id,
        createdAt: { gte: since },
      },
    });

    const avgResponseTime = await prisma.apiLog.aggregate({
      where: {
        userId: req.user.id,
        createdAt: { gte: since },
      },
      _avg: { responseTime: true },
    });

    res.json({
      success: true,
      data: {
        totalRequests,
        avgResponseTime: Math.round(avgResponseTime._avg.responseTime || 0),
        period: days,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get endpoint stats
router.get('/endpoints', checkDb, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const stats = await prisma.apiLog.groupBy({
      by: ['endpoint'],
      where: {
        userId: req.user.id,
        createdAt: { gte: since },
      },
      _count: { id: true },
      _avg: { responseTime: true },
    });

    res.json({
      success: true,
      data: stats.map((s) => ({
        endpoint: s.endpoint,
        count: s._count.id,
        avgResponseTime: Math.round(s._avg.responseTime || 0),
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get request trends (daily breakdown)
router.get('/trends', checkDb, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get daily request counts
    const logs = await prisma.apiLog.findMany({
      where: {
        userId: req.user.id,
        createdAt: { gte: since },
      },
      select: {
        createdAt: true,
      },
    });

    // Aggregate by date
    const dailyCounts = {};
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      dailyCounts[key] = 0;
    }

    logs.forEach(log => {
      const key = log.createdAt.toISOString().split('T')[0];
      if (dailyCounts[key] !== undefined) {
        dailyCounts[key]++;
      }
    });

    const trends = Object.entries(dailyCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      success: true,
      data: trends,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get cost projection
router.get('/cost-projection', checkDb, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { planType: true }
    });

    const planPrices = {
      FREE: 0,
      PREMIUM: 49,
      PRO: 199,
      UNLIMITED: 499
    };

    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const totalRequests = await prisma.apiLog.count({
      where: {
        userId: req.user.id,
        createdAt: { gte: since },
      },
    });

    const dailyAverage = totalRequests / days;
    const monthlyProjection = dailyAverage * 30;
    
    // Calculate cost per request based on plan
    const planLimit = { FREE: 1000, PREMIUM: 10000, PRO: 50000, UNLIMITED: 1000000 }[user.planType] || 1000;
    const overageRate = 0.001; // $0.001 per request over limit
    
    const currentPlanCost = planPrices[user.planType] || 0;
    const projectedOverage = Math.max(0, monthlyProjection - planLimit);
    const overageCost = projectedOverage * overageRate;
    const totalProjectedCost = currentPlanCost + overageCost;

    res.json({
      success: true,
      data: {
        currentPlan: user.planType,
        currentPlanCost,
        dailyAverage: Math.round(dailyAverage * 10) / 10,
        monthlyProjection: Math.round(monthlyProjection),
        projectedOverage: Math.round(projectedOverage),
        overageCost: Math.round(overageCost * 100) / 100,
        totalProjectedCost: Math.round(totalProjectedCost * 100) / 100,
        planLimit,
        days,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
