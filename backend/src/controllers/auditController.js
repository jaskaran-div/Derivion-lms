const prisma = require('../config/database');

/**
 * Log an audit event — fire-and-forget, never throw.
 */
const logAudit = async ({ userId, action, targetId, targetType, details, req } = {}) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        targetId: targetId || null,
        targetType: targetType || null,
        details: details || null,
        ipAddress: req ? (req.ip || req.headers['x-forwarded-for'] || null) : null,
        userAgent: req ? (req.headers['user-agent'] || null) : null,
      },
    });
  } catch (err) {
    // Audit failure must never break the main operation
    console.error('[AuditLog] Failed to write audit entry:', err.message);
  }
};

// GET /api/admin/audit-logs
const listAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, action, userId, startDate, endDate } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      ...(action && { action }),
      ...(userId && { userId }),
      ...(startDate && endDate && {
        createdAt: { gte: new Date(startDate), lte: new Date(endDate) },
      }),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Audit log fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch audit logs.' });
  }
};

module.exports = { logAudit, listAuditLogs };
