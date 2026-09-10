import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MaintenanceObligationService {
  constructor(private readonly prisma: PrismaService) {}

  async history(pointId: string) {
    const point = await this.prisma.point.findFirst({
      where: { id: pointId, deletedAt: null },
      select: { id: true, code: true, name: true, maintenanceType: true },
    });
    if (!point) throw new NotFoundException('Nokta bulunamadı');

    const obligations = await this.prisma.maintenanceObligation.findMany({
      where: { pointId },
      orderBy: { dueStart: 'asc' },
      include: {
        visits: {
          select: {
            id: true,
            technicianId: true,
            performedAt: true,
            status: true,
          },
          orderBy: { performedAt: 'asc' },
        },
      },
    });

    return {
      point,
      totals: obligations.reduce(
        (acc, item) => {
          acc[item.status.toLowerCase() as 'open' | 'completed' | 'missed'] += 1;
          return acc;
        },
        { open: 0, completed: 0, missed: 0 },
      ),
      items: obligations,
    };
  }
}
