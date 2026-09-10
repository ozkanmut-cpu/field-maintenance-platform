import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRegionDto } from './dto/create-region.dto';

@Injectable()
export class RegionsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.region.findMany({
      orderBy: { name: 'asc' },
      include: {
        technician: { select: { id: true, name: true, email: true, active: true } },
        _count: { select: { points: true } },
      },
    });
  }

  create(dto: CreateRegionDto) {
    return this.prisma.region.create({
      data: {
        name: dto.name.trim(),
        technicianId: dto.technicianId ?? null,
      },
    });
  }

  async update(id: string, dto: CreateRegionDto) {
    const exists = await this.prisma.region.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Bölge bulunamadı');

    return this.prisma.region.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        technicianId: dto.technicianId ?? null,
      },
    });
  }
}
