const bcrypt = require('bcryptjs');
const prisma = require('../config/database');
const { generatePassword } = require('../utils/credentials');

const userCardSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  username: true,
  role: true,
  avatar: true,
};

const accountSelect = {
  id: true,
  email: true,
  username: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  guardianEmail: true,
  guardianPhone: true,
  isActive: true,
  lastLogin: true,
  createdAt: true,
  createdById: true,
};

// Search users by email, username, or name
const searchUsers = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const currentUserId = req.user.id;

    const users = await prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        isActive: true,
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: 'insensitive' } },
                { username: { contains: q, mode: 'insensitive' } },
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: userCardSelect,
      take: 20,
      orderBy: { firstName: 'asc' },
    });

    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ success: false, message: 'Failed to search users.' });
  }
};

// Helper to determine partner profile for a thread
const getThreadPartner = (thread, currentUserId, defaultAdmin = null) => {
  if (thread.user1Id && thread.user2Id) {
    if (thread.user1Id === currentUserId) return thread.user2;
    if (thread.user2Id === currentUserId) return thread.user1;
  }
  if (thread.userId && thread.userId === currentUserId) {
    return defaultAdmin;
  }
  return thread.user || defaultAdmin;
};

// Helper to get unread count for current user
const getThreadUnreadCount = (thread, currentUserId, isAdmin = false) => {
  if (thread.user1Id && thread.user2Id) {
    if (thread.user1Id === currentUserId) return thread.unreadUser1 || 0;
    if (thread.user2Id === currentUserId) return thread.unreadUser2 || 0;
  }
  return isAdmin ? thread.unreadAdmin || 0 : thread.unreadUser || 0;
};

// GET /api/chat/conversations - List all conversations for the current user
const getConversations = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const isAdmin = req.user.role === 'ADMIN';

    const defaultAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: userCardSelect,
    });

    const whereClause = isAdmin
      ? {
          OR: [
            { user1Id: currentUserId },
            { user2Id: currentUserId },
            { userId: { not: null } },
          ],
        }
      : {
          OR: [
            { user1Id: currentUserId },
            { user2Id: currentUserId },
            { userId: currentUserId },
          ],
        };

    const threads = await prisma.chatThread.findMany({
      where: whereClause,
      orderBy: { lastMessageAt: 'desc' },
      include: {
        user1: { select: userCardSelect },
        user2: { select: userCardSelect },
        user: { select: userCardSelect },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: userCardSelect },
          },
        },
      },
    });

    const formatted = threads
      .map((t) => {
        const partner = getThreadPartner(t, currentUserId, defaultAdmin);
        if (!partner && !isAdmin) return null;
        return {
          id: t.id,
          status: t.status,
          lastMessageAt: t.lastMessageAt,
          unreadCount: getThreadUnreadCount(t, currentUserId, isAdmin),
          partner: partner || {
            id: 'system',
            firstName: 'Support',
            lastName: 'Team',
            email: 'admin@derivion.com',
            role: 'ADMIN',
          },
          lastMessage: t.messages?.[0] || null,
        };
      })
      .filter(Boolean);

    res.json({ success: true, data: formatted });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ success: false, message: 'Failed to load conversations.' });
  }
};

// POST /api/chat/conversations - Start or open conversation with user
const startConversation = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { recipientId, email, username } = req.body;

    let targetUser = null;
    if (recipientId) {
      targetUser = await prisma.user.findUnique({
        where: { id: recipientId },
        select: userCardSelect,
      });
    } else if (email) {
      targetUser = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
        select: userCardSelect,
      });
    } else if (username) {
      targetUser = await prisma.user.findFirst({
        where: { username: { equals: username.trim(), mode: 'insensitive' } },
        select: userCardSelect,
      });
    }

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (targetUser.id === currentUserId) {
      return res.status(400).json({ success: false, message: 'You cannot start a chat with yourself.' });
    }

    const [u1, u2] = [currentUserId, targetUser.id].sort();

    let thread = await prisma.chatThread.findFirst({
      where: {
        OR: [
          { user1Id: u1, user2Id: u2 },
          { user1Id: u2, user2Id: u1 },
          { userId: targetUser.id, user1Id: null },
          { userId: currentUserId, user1Id: null },
        ],
      },
      include: {
        user1: { select: userCardSelect },
        user2: { select: userCardSelect },
        user: { select: userCardSelect },
      },
    });

    if (!thread) {
      thread = await prisma.chatThread.create({
        data: {
          user1Id: u1,
          user2Id: u2,
          userId: currentUserId,
          status: 'OPEN',
        },
        include: {
          user1: { select: userCardSelect },
          user2: { select: userCardSelect },
          user: { select: userCardSelect },
        },
      });
    } else if (!thread.user1Id || !thread.user2Id) {
      thread = await prisma.chatThread.update({
        where: { id: thread.id },
        data: { user1Id: u1, user2Id: u2 },
        include: {
          user1: { select: userCardSelect },
          user2: { select: userCardSelect },
          user: { select: userCardSelect },
        },
      });
    }

    res.json({
      success: true,
      data: {
        threadId: thread.id,
        partner: targetUser,
        thread,
      },
    });
  } catch (error) {
    console.error('Start conversation error:', error);
    res.status(500).json({ success: false, message: 'Failed to start conversation.' });
  }
};

// GET /api/chat/conversations/:id/messages
const getConversationMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.id;
    const isAdmin = req.user.role === 'ADMIN';

    const thread = await prisma.chatThread.findUnique({
      where: { id },
      include: {
        user1: { select: userCardSelect },
        user2: { select: userCardSelect },
        user: { select: userCardSelect },
      },
    });

    if (!thread) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    const isParticipant =
      thread.user1Id === currentUserId ||
      thread.user2Id === currentUserId ||
      thread.userId === currentUserId ||
      isAdmin;

    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // Reset unread count for current user
    const updateData = {};
    if (thread.user1Id === currentUserId) updateData.unreadUser1 = 0;
    if (thread.user2Id === currentUserId) updateData.unreadUser2 = 0;
    if (isAdmin) updateData.unreadAdmin = 0;
    if (thread.userId === currentUserId) updateData.unreadUser = 0;

    if (Object.keys(updateData).length) {
      await prisma.chatThread.update({
        where: { id },
        data: updateData,
      });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { threadId: id },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: userCardSelect },
      },
    });

    const defaultAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: userCardSelect,
    });
    const partner = getThreadPartner(thread, currentUserId, defaultAdmin);

    res.json({
      success: true,
      data: {
        threadId: thread.id,
        partner,
        messages,
      },
    });
  } catch (error) {
    console.error('Get conversation messages error:', error);
    res.status(500).json({ success: false, message: 'Failed to load messages.' });
  }
};

// POST /api/chat/conversations/:id/messages
const sendConversationMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.id;
    const isAdmin = req.user.role === 'ADMIN';
    const body = (req.body.body || '').trim();

    if (!body) {
      return res.status(400).json({ success: false, message: 'Message body cannot be empty.' });
    }

    const thread = await prisma.chatThread.findUnique({
      where: { id },
    });

    if (!thread) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    const isParticipant =
      thread.user1Id === currentUserId ||
      thread.user2Id === currentUserId ||
      thread.userId === currentUserId ||
      isAdmin;

    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const message = await prisma.chatMessage.create({
      data: {
        threadId: id,
        senderId: currentUserId,
        body,
      },
      include: {
        sender: { select: userCardSelect },
      },
    });

    // Update unread count for recipient
    const updateData = {
      lastMessageAt: new Date(),
      status: 'OPEN',
    };

    let recipientId = null;
    if (thread.user1Id && thread.user2Id) {
      if (thread.user1Id === currentUserId) {
        updateData.unreadUser2 = { increment: 1 };
        recipientId = thread.user2Id;
      } else {
        updateData.unreadUser1 = { increment: 1 };
        recipientId = thread.user1Id;
      }
    } else {
      if (isAdmin) {
        updateData.unreadUser = { increment: 1 };
        recipientId = thread.userId;
      } else {
        updateData.unreadAdmin = { increment: 1 };
      }
    }

    await prisma.chatThread.update({
      where: { id },
      data: updateData,
    });

    // Notify recipient
    if (recipientId) {
      try {
        const roleLink =
          req.user.role === 'ADMIN'
            ? '/admin/support'
            : req.user.role === 'TEACHER'
            ? '/teacher/support'
            : '/support';

        await prisma.notification.create({
          data: {
            userId: recipientId,
            title: `New message from ${req.user.firstName} ${req.user.lastName}`,
            message: body.slice(0, 160),
            type: 'CHAT',
            link: roleLink,
          },
        });
      } catch (err) {
        console.error('Notification creation error:', err);
      }
    }

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    console.error('Send conversation message error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message.' });
  }
};

// ==================== LEGACY SUPPORT ENDPOINTS ====================

const notifyAdmins = async (title, message, link) => {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true },
  });
  if (!admins.length) return;
  await prisma.notification.createMany({
    data: admins.map((a) => ({ userId: a.id, title, message, type: 'CHAT', link })),
  });
};

const getOrCreateThread = async (userId) => {
  return prisma.chatThread.upsert({
    where: { userId },
    update: {},
    create: { userId, subject: 'Support' },
  });
};

const getMyThread = async (req, res) => {
  try {
    const thread = await getOrCreateThread(req.user.id);
    const messages = await prisma.chatMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: userCardSelect },
      },
    });
    await prisma.chatThread.update({
      where: { id: thread.id },
      data: { unreadUser: 0 },
    });
    res.json({ success: true, data: { thread, messages } });
  } catch (error) {
    console.error('Get thread error:', error);
    res.status(500).json({ success: false, message: 'Failed to load chat.' });
  }
};

const sendMyMessage = async (req, res) => {
  try {
    const body = (req.body.body || '').trim();
    if (!body) return res.status(400).json({ success: false, message: 'Message cannot be empty.' });

    const thread = await getOrCreateThread(req.user.id);
    const message = await prisma.chatMessage.create({
      data: { threadId: thread.id, senderId: req.user.id, body },
      include: {
        sender: { select: userCardSelect },
      },
    });

    await prisma.chatThread.update({
      where: { id: thread.id },
      data: {
        lastMessageAt: new Date(),
        status: 'OPEN',
        unreadAdmin: { increment: 1 },
      },
    });

    const who = `${req.user.firstName} ${req.user.lastName} (${req.user.role})`;
    await notifyAdmins(
      `New chat from ${who}`,
      body.slice(0, 180),
      `/admin/support/${thread.id}`
    );

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message.' });
  }
};

const adminListThreads = async (req, res) => {
  try {
    const { status } = req.query;
    const threads = await prisma.chatThread.findMany({
      where: status ? { status } : undefined,
      orderBy: { lastMessageAt: 'desc' },
      include: {
        user: { select: accountSelect },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: { firstName: true, lastName: true, role: true } } },
        },
      },
    });
    res.json({ success: true, data: threads });
  } catch (error) {
    console.error('Admin list threads error:', error);
    res.status(500).json({ success: false, message: 'Failed to load chats.' });
  }
};

const adminGetThread = async (req, res) => {
  try {
    const thread = await prisma.chatThread.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: {
            ...accountSelect,
            createdBy: { select: { firstName: true, lastName: true, email: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: { select: userCardSelect },
          },
        },
      },
    });
    if (!thread) return res.status(404).json({ success: false, message: 'Chat not found.' });
    await prisma.chatThread.update({ where: { id: thread.id }, data: { unreadAdmin: 0 } });
    res.json({ success: true, data: thread });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load chat.' });
  }
};

const adminReply = async (req, res) => {
  try {
    const body = (req.body.body || '').trim();
    if (!body) return res.status(400).json({ success: false, message: 'Message cannot be empty.' });
    const thread = await prisma.chatThread.findUnique({ where: { id: req.params.id } });
    if (!thread) return res.status(404).json({ success: false, message: 'Chat not found.' });

    const message = await prisma.chatMessage.create({
      data: { threadId: thread.id, senderId: req.user.id, body },
      include: {
        sender: { select: userCardSelect },
      },
    });

    await prisma.chatThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: new Date(), unreadUser: { increment: 1 }, status: 'OPEN' },
    });

    if (thread.userId) {
      await prisma.notification.create({
        data: {
          userId: thread.userId,
          title: 'Support replied',
          message: body.slice(0, 180),
          type: 'CHAT',
          link: '/support',
        },
      });
    }

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to send reply.' });
  }
};

const adminCloseThread = async (req, res) => {
  try {
    const thread = await prisma.chatThread.update({
      where: { id: req.params.id },
      data: { status: req.body.status === 'OPEN' ? 'OPEN' : 'CLOSED' },
    });
    res.json({ success: true, data: thread });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update chat.' });
  }
};

const adminResetStudentPassword = async (req, res) => {
  try {
    const thread = await prisma.chatThread.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });
    if (!thread) return res.status(404).json({ success: false, message: 'Chat not found.' });
    if (thread.user?.role !== 'STUDENT') {
      return res.status(400).json({ success: false, message: 'Password reset from chat is for student accounts.' });
    }

    const plainPassword = generatePassword(thread.user.firstName, thread.user.lastName);
    const hashedPassword = await bcrypt.hash(plainPassword, 12);

    await prisma.user.update({
      where: { id: thread.user.id },
      // One-time password: old sessions end and the student must choose a new password at next login
      data: { password: hashedPassword, mustChangePassword: true, passwordChangedAt: new Date() },
    });

    const note = `Admin reset the student password. New Student ID: ${thread.user.username || thread.user.email}. Share this password once with the teacher/guardian.`;
    await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        senderId: req.user.id,
        body: `${note}\nTemporary password: ${plainPassword}`,
      },
    });

    res.json({
      success: true,
      message: 'Password reset. Copy it now — this is the only time it is returned in the API response.',
      data: {
        studentId: thread.user.username,
        email: thread.user.email,
        password: plainPassword,
      },
    });
  } catch (error) {
    console.error('Admin reset password error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
};

module.exports = {
  searchUsers,
  getConversations,
  startConversation,
  getConversationMessages,
  sendConversationMessage,
  getMyThread,
  sendMyMessage,
  adminListThreads,
  adminGetThread,
  adminReply,
  adminCloseThread,
  adminResetStudentPassword,
};
