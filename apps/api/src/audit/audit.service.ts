import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: { limit?: number; entityType?: string; entityId?: string; action?: string; actorId?: string }) {
    const limit = Math.min(Math.max(Number(filters.limit) || 200, 1), 500);
    const where: Prisma.AdminAuditLogWhereInput = {};
    if (filters.entityType?.trim()) where.entityType = filters.entityType.trim();
    if (filters.entityId?.trim()) where.entityId = filters.entityId.trim();
    if (filters.action?.trim()) where.action = filters.action.trim();
    if (filters.actorId?.trim()) where.actorId = filters.actorId.trim();

    const [count, items] = await Promise.all([
      this.prisma.adminAuditLog.count({ where }),
      this.prisma.adminAuditLog.findMany({
        where,
        include: { actor: { select: { id: true, name: true, username: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);
    return { count, limit, items };
  }
}
