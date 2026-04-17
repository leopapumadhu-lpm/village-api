import express from 'express';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { sendTeamInvitation } from '../services/emailService.js';

const router = express.Router();

// Initialize Prisma only if database is available
let prisma = null;
try {
  if (process.env.DATABASE_URL) {
    prisma = new PrismaClient();
  }
} catch (e) {
  console.log('Teams routes: Database not available');
}

// Check if DB is available middleware
function checkDb(req, res, next) {
  if (!prisma) {
    return res.status(503).json({
      success: false,
      error: 'Team management temporarily unavailable in demo mode',
    });
  }
  next();
}

// Get members of a team
router.get('/members', checkDb, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Find user's team membership
    const membership = await prisma.teamMember.findFirst({
      where: { userId },
      include: { team: true }
    });
    
    if (!membership) {
      return res.status(404).json({ success: false, error: 'No team found' });
    }

    const members = await prisma.teamMember.findMany({
      where: { teamId: membership.teamId },
      include: {
        user: {
          select: { id: true, email: true, businessName: true, status: true }
        }
      }
    });

    res.json({
      success: true,
      data: members.map(m => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        email: m.user.email,
        businessName: m.user.businessName,
        status: m.user.status,
        joinedAt: m.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Invite a new team member
router.post('/invite', checkDb, async (req, res) => {
  try {
    const { email, role } = req.body;
    const inviterId = req.user.id;
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }
    
    const validRoles = ['ADMIN', 'MEMBER'];
    const assignedRole = validRoles.includes(role) ? role : 'MEMBER';

    // Find inviter's team
    const inviterMembership = await prisma.teamMember.findFirst({
      where: { userId: inviterId },
      include: { team: true }
    });

    if (!inviterMembership) {
      return res.status(404).json({ success: false, error: 'No team found' });
    }

    // Check if inviter has permission (OWNER or ADMIN)
    if (!['OWNER', 'ADMIN'].includes(inviterMembership.role)) {
      return res.status(403).json({ success: false, error: 'Not authorized to invite members' });
    }

    // Check if user already exists
    let invitedUser = await prisma.user.findUnique({ where: { email } });
    
    if (!invitedUser) {
      // Create a pending user
      invitedUser = await prisma.user.create({
        data: {
          email,
          status: 'PENDING_INVITE',
          planType: 'FREE',
          businessName: email.split('@')[0],
          passwordHash: 'pending', // Will be set when they accept
        }
      });
    }

    // Check if already a member
    const existingMember = await prisma.teamMember.findFirst({
      where: { teamId: inviterMembership.teamId, userId: invitedUser.id }
    });

    if (existingMember) {
      return res.status(409).json({ success: false, error: 'User is already a team member' });
    }

    // Create team membership
    const teamMember = await prisma.teamMember.create({
      data: {
        teamId: inviterMembership.teamId,
        userId: invitedUser.id,
        role: assignedRole,
      }
    });

    // Send invitation email
    await sendTeamInvitation(email, inviterMembership.team.name, req.user.email);

    res.status(201).json({
      success: true,
      data: {
        id: teamMember.id,
        email: invitedUser.email,
        role: assignedRole,
        status: invitedUser.status,
      },
      message: 'Invitation sent successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update member role
router.put('/members/:id', checkDb, async (req, res) => {
  try {
    const memberId = parseInt(req.params.id);
    const { role } = req.body;
    const userId = req.user.id;
    
    if (isNaN(memberId)) {
      return res.status(400).json({ success: false, error: 'Invalid member ID' });
    }

    const validRoles = ['OWNER', 'ADMIN', 'MEMBER'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    // Get user's membership
    const userMembership = await prisma.teamMember.findFirst({
      where: { userId }
    });

    if (!userMembership || !['OWNER', 'ADMIN'].includes(userMembership.role)) {
      return res.status(403).json({ success: false, error: 'Not authorized to update roles' });
    }

    // Cannot change owner's role unless you're the owner
    const targetMember = await prisma.teamMember.findUnique({
      where: { id: memberId }
    });

    if (targetMember?.role === 'OWNER' && userMembership.role !== 'OWNER') {
      return res.status(403).json({ success: false, error: 'Only owner can change owner role' });
    }

    const updated = await prisma.teamMember.update({
      where: { id: memberId },
      data: { role }
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove team member
router.delete('/members/:id', checkDb, async (req, res) => {
  try {
    const memberId = parseInt(req.params.id);
    const userId = req.user.id;
    
    if (isNaN(memberId)) {
      return res.status(400).json({ success: false, error: 'Invalid member ID' });
    }

    const userMembership = await prisma.teamMember.findFirst({
      where: { userId }
    });

    if (!userMembership || !['OWNER', 'ADMIN'].includes(userMembership.role)) {
      return res.status(403).json({ success: false, error: 'Not authorized to remove members' });
    }

    const targetMember = await prisma.teamMember.findUnique({
      where: { id: memberId }
    });

    if (targetMember?.role === 'OWNER') {
      return res.status(403).json({ success: false, error: 'Cannot remove owner' });
    }

    await prisma.teamMember.delete({ where: { id: memberId } });

    res.json({ success: true, message: 'Member removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', checkDb, async (req, res) => {
  try {
    const { name, slug, website } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ success: false, error: 'Name and slug required' });
    }

    const existing = await prisma.organization.findUnique({ where: { slug } });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Slug already exists' });
    }

    const organization = await prisma.organization.create({
      data: {
        name,
        slug,
        website,
        ownerId: req.user.id,
        billingEmail: req.user.email,
        status: 'ACTIVE',
      },
    });

    await prisma.teamMember.create({
      data: {
        teamId: organization.id,
        userId: req.user.id,
        role: 'OWNER',
      },
    });

    res.status(201).json({ success: true, data: organization });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', checkDb, async (req, res) => {
  try {
    const organization = await prisma.organization.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, email: true, businessName: true },
            },
          },
        },
      },
    });

    if (!organization) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }

    const isMember = organization.members.some((m) => m.userId === req.user.id);
    if (!isMember) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    res.json({ success: true, data: organization });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/', checkDb, async (req, res) => {
  try {
    const memberships = await prisma.teamMember.findMany({
      where: { userId: req.user.id },
      include: {
        team: true,
      },
    });

    res.json({
      success: true,
      data: memberships.map((m) => m.team),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
