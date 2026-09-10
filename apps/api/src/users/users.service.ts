import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../auth/password';
import { UserRole } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { SetHelpTargetsDto } from './dto/set-help-targets.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: {
        id: true, name: true, username: true, role: true, active: true,
        createdAt: true, updatedAt: true, lastLoginAt: true,
        regions: { select: { id: true, name: true } },
      },
    });
  }

  create(dto: CreateUserDto) {
    return this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        username: dto.username.trim().toLowerCase(),
        role: dto.role,
        active: dto.active ?? true,
        passwordHash: hashPassword(dto.password),
      },
      select: { id: true, name: true, username: true, role: true, active: true, createdAt: true },
    });
  }

  async helpTargets(helperId: string) {
    const helper = await this.prisma.user.findUnique({
      where: { id: helperId },
      select: { id: true, name: true, username: true, role: true },
    });
    if (!helper) throw new NotFoundException('Kullanıcı bulunamadı');
    const permissions = await this.prisma.technicianHelpPermission.findMany({
      where: { helperId },
      include: { target: { select: { id: true, name: true, username: true, active: true, role: true } } },
      orderBy: { target: { name: 'asc' } },
    });
    return { helper, targets: permissions.map((item) => item.target) };
  }

  async setHelpTargets(helperId: string, dto: SetHelpTargetsDto) {
    const helper = await this.prisma.user.findUnique({ where: { id: helperId }, select: { id: true, role: true } });
    if (!helper) throw new NotFoundException('Kullanıcı bulunamadı');
    if (helper.role !== UserRole.TECHNICIAN) throw new BadRequestException('Yardım yetkisi yalnız teknisyen için ayarlanabilir');
    if (dto.targetIds.includes(helperId)) throw new BadRequestException('Teknisyen kendisine yardım hedefi olamaz');
    const targets = await this.prisma.user.findMany({
      where: { id: { in: dto.targetIds }, role: UserRole.TECHNICIAN, active: true },
      select: { id: true },
    });
    if (targets.length !== dto.targetIds.length) throw new BadRequestException('Geçersiz veya pasif yardım hedefi var');
    await this.prisma.$transaction(async (tx) => {
      await tx.technicianHelpPermission.deleteMany({ where: { helperId } });
      if (dto.targetIds.length) {
        await tx.technicianHelpPermission.createMany({ data: dto.targetIds.map((targetId) => ({ helperId, targetId })) });
      }
    });
    return this.helpTargets(helperId);
  }

  async setActive(id: string, active: boolean, actorId: string) {
    const exists = await this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true, active: true } });
    if (!exists) throw new NotFoundException('Kullanıcı bulunamadı');
    if (!active && id === actorId) throw new BadRequestException('Kendi hesabını pasifleştiremezsin');
    if (!active && exists.role === 'ADMIN' && exists.active) {
      const activeAdmins = await this.prisma.user.count({ where: { role: 'ADMIN', active: true } });
      if (activeAdmins <= 1) throw new BadRequestException('Son aktif yönetici pasifleştirilemez');
    }
    return this.prisma.user.update({ where: { id }, data: { active, tokenVersion: { increment: 1 } }, select: { id: true, name: true, username: true, role: true, active: true } });
  }

  async resetPassword(id: string, password: string) {
    const exists = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Kullanıcı bulunamadı');
    return this.prisma.user.update({
      where: { id },
      data: { passwordHash: hashPassword(password), tokenVersion: { increment: 1 } },
      select: { id: true, name: true, username: true, role: true, active: true },
    });
  }
}
