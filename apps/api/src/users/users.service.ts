import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../auth/password';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: {
        id: true, name: true, email: true, role: true, active: true,
        createdAt: true, updatedAt: true, lastLoginAt: true,
        regions: { select: { id: true, name: true } },
      },
    });
  }

  create(dto: CreateUserDto) {
    return this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        role: dto.role,
        active: dto.active ?? true,
        passwordHash: hashPassword(dto.password),
      },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
  }

  async setActive(id: string, active: boolean) {
    const exists = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Kullanıcı bulunamadı');

    return this.prisma.user.update({ where: { id }, data: { active, tokenVersion: { increment: 1 } }, select: { id: true, name: true, email: true, role: true, active: true } });
  }

  async resetPassword(id: string, password: string) {
    const exists = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Kullanıcı bulunamadı');
    return this.prisma.user.update({
      where: { id },
      data: { passwordHash: hashPassword(password), tokenVersion: { increment: 1 } },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
  }
}
