import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AI_ENGINE_VERSION } from './ai-version';
import { RecommendationFeedbackDto } from './dto/recommendation-feedback.dto';

@Injectable()
export class RecommendationFeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async record(actorId: string, dto: RecommendationFeedbackDto) {
    const created = await this.prisma.adminAuditLog.create({
      data: {
        entityType: 'AI_RECOMMENDATION',
        entityId: dto.recommendationId,
        action: dto.decision,
        actorId,
        newValue: {
          recommendationId: dto.recommendationId,
          decision: dto.decision,
          engineVersion: AI_ENGINE_VERSION,
        } as Prisma.InputJsonValue,
        note: dto.note?.trim() || null,
      },
    });
    return { id: created.id, recommendationId: dto.recommendationId, decision: dto.decision, createdAt: created.createdAt };
  }

  async list(limit = 100) {
    const rows = await this.prisma.adminAuditLog.findMany({
      where: { entityType: 'AI_RECOMMENDATION' },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
    return rows.map((row) => ({
      id: row.id,
      recommendationId: row.entityId,
      decision: row.action,
      note: row.note,
      createdAt: row.createdAt,
      actor: row.actor,
      payload: row.newValue,
    }));
  }
}
