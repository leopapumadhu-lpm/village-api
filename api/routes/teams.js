import express from 'express';
import { PrismaClient } from '@prisma/client';
import { sendTeamInvitation } from '../services/emailService.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /teams
 * Create a new organization/team (spec 8.3)
 */
router.post('/', async (req, res) => {
  try {
    const { name, slug, website } = req.body;

    if (!name || !slug) {
      return res
        .status(400)
        .json({ success: false, error: 'Name and slug required' });
    }

    // Check slug uniqueness
    const existing = await prisma.organization.findUnique({
      where: { slug },
    });
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

    // Add creator as OWNER member
    await prisma.teamMember.create({
      data: {
        teamId: organization.id,
        userId: req.user.id,
        role: 'OWNER',
      },
    });

    res.status(201).json({
      success: true,
      data: organization,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /teams/:id
 * Get organization details
 */
router.get('/:id', async (req, res) => {
  try {
    const organization = await prisma.organization.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                businessName: true,
              },
            },
          },
        },
      },
    });

    if (!organization) {
      return res
        .status(404)
        .json({ success: false, error: 'Organization not found' });
    }

    // Verify user is member
    const isMember = organization.members.some(
      (m) => m.userId === req.user.id,
    );
    if (!isMember) {
      return res
        .status(403)
        .json({ success: false, error: 'Not authorized' });
    }

    res.json({ success: true, data: organization });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /teams/:id/members
 * List team members with roles (spec 8.3)
 */
router.get('/:id/members', async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);

    // Verify user is member
    const member = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: req.user.id,
        },
      },
    });

    if (!member) {
      return res
        .status(403)
        .json({ success: false, error: 'Not authorized' });
    }

    const members = await prisma.teamMember.findMany({
      where: { teamId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            businessName: true,
            createdAt: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    res.json({
      success: true,
      data: members,
      count: members.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /teams/:id/members
 * Invite member to team (spec 8.3)
 */
router.post('/:id/members', async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const { email, role = 'DEVELOPER' } = req.body;

    if (!email) {
      return res
        .status(400)
        .json({ success: false, error: 'Email required' });
    }

    // Verify user is OWNER or ADMIN
    const requester = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: req.user.id,
        },
      },
    });

    if (!requester || !['OWNER', 'ADMIN'].includes(requester.role)) {
      return res
        .status(403)
        .json({ success: false, error: 'Insufficient permissions' });
    }

    // Check if user exists
    const invitedUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!invitedUser) {
      return res
        .status(404)
        .json({ success: false, error: 'User not found' });
    }

    // Check if already member
    const existing = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: invitedUser.id,
        },
      },
    });

    if (existing) {
      return res
        .status(409)
        .json({ success: false, error: 'User is already a member' });
    }

    // Add member
    const member = await prisma.teamMember.create({
      data: {
        teamId,
        userId: invitedUser.id,
        role,
        invitedBy: req.user.id,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            businessName: true,
          },
        },
      },
    });

    // Send invitation email
    const organization = await prisma.organization.findUnique({
      where: { id: teamId },
    });
    // await sendTeamInvitation(invitedUser, organization, role);

    res.status(201).json({
      success: true,
      data: member,
      message: 'Team member invited successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /teams/:id/members/:userId
 * Remove member from team
 */
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);

    // Verify requester is OWNER or ADMIN
    const requester = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: req.user.id,
        },
      },
    });

    if (!requester || !['OWNER', 'ADMIN'].includes(requester.role)) {
      return res
        .status(403)
        .json({ success: false, error: 'Insufficient permissions' });
    }

    // Cannot remove owner
    const target = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId,
        },
      },
    });

    if (target?.role === 'OWNER') {
      return res
        .status(400)
        .json({ success: false, error: 'Cannot remove team owner' });
    }

    // Remove member
    await prisma.teamMember.delete({
      where: {
        teamId_userId: {
          teamId,
          userId,
        },
      },
    });

    res.json({ success: true, message: 'Member removed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /teams/:id/members/:userId/role
 * Change member role (spec 8.3 - OWNER|ADMIN|DEVELOPER|VIEWER)
 */
router.patch('/:id/members/:userId/role', async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);
    const { role } = req.body;

    const validRoles = ['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER'];
    if (!role || !validRoles.includes(role)) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid role' });
    }

    // Verify requester is OWNER
    const requester = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: req.user.id,
        },
      },
    });

    if (!requester || requester.role !== 'OWNER') {
      return res
        .status(403)
        .json({ success: false, error: 'Only owners can change roles' });
    }

    // Update role
    const member = await prisma.teamMember.update({
      where: {
        teamId_userId: {
          teamId,
          userId,
        },
      },
      data: { role },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            businessName: true,
          },
        },
      },
    });

    res.json({ success: true, data: member });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
