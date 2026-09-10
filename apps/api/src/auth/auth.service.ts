import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './auth-user';
import { BootstrapDto } from './dto/bootstrap.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { hashPassword, verifyPassword } from './password';

type Claims = { sub: string; role: UserRole; ver: number; iat: number; exp: number; iss: string; aud: string };

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async bootstrap(dto: BootstrapDto, bootstrapToken?: string) {
    const expected = this.config.get<string>('AUTH_BOOTSTRAP_TOKEN') ?? '';
    if (!expected || !bootstrapToken || !this.safeEqual(bootstrapToken, expected)) {
      throw new UnauthorizedException('Bootstrap yetkisi geçersiz');
    }
    if (await this.prisma.user.count()) throw new ConflictException('Bootstrap daha önce tamamlandı');
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        username: dto.username.trim().toLowerCase(),
        role: UserRole.ADMIN,
        active: true,
        passwordHash: hashPassword(dto.password),
      },
      select: this.userSelect(),
    });
    return { user, ...this.issueToken(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username.trim().toLowerCase() },
      select: { ...this.userSelect(), passwordHash: true },
    });
    if (!user || !user.active || !verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException('Kullanıcı adı veya şifre hatalı');
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id }, data: { lastLoginAt: new Date() }, select: this.userSelect(),
    });
    return { user: updated, ...this.issueToken(updated) };
  }

  async authenticateAccessToken(token: string): Promise<AuthenticatedUser> {
    const claims = this.verifyToken(token);
    const user = await this.prisma.user.findFirst({
      where: { id: claims.sub, active: true }, select: this.userSelect(),
    });
    if (!user || user.tokenVersion !== claims.ver || user.role !== claims.role) {
      throw new UnauthorizedException('Oturum geçersiz');
    }
    return user;
  }

  async changePassword(user: AuthenticatedUser, dto: ChangePasswordDto) {
    const record = await this.prisma.user.findUnique({
      where: { id: user.id }, select: { passwordHash: true },
    });
    if (!record || !verifyPassword(dto.currentPassword, record.passwordHash)) {
      throw new UnauthorizedException('Mevcut şifre hatalı');
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(dto.newPassword), tokenVersion: { increment: 1 } },
      select: this.userSelect(),
    });
    return { user: updated, ...this.issueToken(updated) };
  }

  issueToken(user: AuthenticatedUser) {
    const now = Math.floor(Date.now() / 1000);
    const ttl = this.tokenTtlSeconds();
    const claims: Claims = {
      sub: user.id, role: user.role, ver: user.tokenVersion, iat: now, exp: now + ttl,
      iss: 'field-maintenance-api', aud: 'field-maintenance-client',
    };
    const header = this.b64({ alg: 'HS256', typ: 'JWT' });
    const payload = this.b64(claims);
    const input = `${header}.${payload}`;
    const signature = createHmac('sha256', this.jwtSecret()).update(input).digest('base64url');
    return { accessToken: `${input}.${signature}`, tokenType: 'Bearer', expiresIn: ttl };
  }

  private verifyToken(token: string): Claims {
    const [header, payload, signature, extra] = token.split('.');
    if (!header || !payload || !signature || extra) throw new UnauthorizedException('Oturum geçersiz');
    const expected = createHmac('sha256', this.jwtSecret()).update(`${header}.${payload}`).digest('base64url');
    if (!this.safeEqual(signature, expected)) throw new UnauthorizedException('Oturum geçersiz');
    try {
      const parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Claims;
      const now = Math.floor(Date.now() / 1000);
      if (parsedHeader.alg !== 'HS256' || claims.iss !== 'field-maintenance-api' || claims.aud !== 'field-maintenance-client') throw new Error();
      if (!claims.sub || !claims.role || !Number.isInteger(claims.ver) || !Number.isInteger(claims.exp) || claims.exp <= now) throw new Error();
      return claims;
    } catch {
      throw new UnauthorizedException('Oturum geçersiz');
    }
  }

  private jwtSecret() {
    const secret = this.config.get<string>('AUTH_JWT_SECRET') ?? '';
    if (secret.length < 32) throw new Error('AUTH_JWT_SECRET must be at least 32 characters');
    return secret;
  }

  private tokenTtlSeconds() {
    const raw = Number(this.config.get<string>('AUTH_TOKEN_TTL_SECONDS') ?? 43200);
    return Number.isFinite(raw) && raw >= 900 && raw <= 604800 ? Math.floor(raw) : 43200;
  }

  private b64(value: object) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
  private safeEqual(a: string, b: string) {
    const left = Buffer.from(a); const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }
  private userSelect() {
    return { id: true, name: true, username: true, role: true, active: true, tokenVersion: true, lastLoginAt: true } as const;
  }
}
