import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { PrismaService } from '../database/prisma.service.js';
import type { DatabaseTransaction } from '../database/prisma.service.js';
import { MembershipStatus, UserStatus } from '../generated/prisma/client.js';
import type { AuthContext } from './auth-context.js';
import { SessionTokenService } from './session-token.service.js';

export type SessionBundle = Readonly<{
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}>;

type RequestMetadata = Readonly<{ userAgent?: string; ipAddress?: string }>;

@Injectable()
export class SessionService {
  private readonly accessTtlMilliseconds =
    Number(process.env.ACCESS_SESSION_TTL_SECONDS ?? 900) * 1_000;
  private readonly refreshTtlMilliseconds =
    Number(process.env.REFRESH_SESSION_TTL_SECONDS ?? 2_592_000) * 1_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: SessionTokenService,
  ) {}

  metadataFrom(request: Request): RequestMetadata {
    const userAgent = request.headers['user-agent']?.slice(0, 512);
    const ipAddress = request.ip?.replace(/^::ffff:/u, '');

    return {
      ...(userAgent ? { userAgent } : {}),
      ...(ipAddress ? { ipAddress } : {}),
    };
  }

  async create(
    userId: string,
    organizationId: string,
    metadata: RequestMetadata,
  ): Promise<SessionBundle> {
    const now = new Date();
    const refreshExpiresAt = new Date(now.getTime() + this.refreshTtlMilliseconds);
    const refreshToken = this.tokens.createOpaqueToken();
    const csrfToken = this.tokens.createOpaqueToken();
    const refreshTokenHash = this.tokens.hashOpaqueToken(refreshToken);

    const session = await this.prisma.transaction(async (transaction) => {
      const created = await transaction.session.create({
        data: {
          userId,
          organizationId,
          tokenFamilyId: randomUUID(),
          refreshTokenHash,
          csrfTokenHash: this.tokens.hashOpaqueToken(csrfToken),
          expiresAt: refreshExpiresAt,
          ...metadata,
        },
      });

      await transaction.sessionRefreshToken.create({
        data: {
          sessionId: created.id,
          tokenHash: refreshTokenHash,
          expiresAt: refreshExpiresAt,
        },
      });

      return created;
    });

    return this.bundle(
      session.id,
      userId,
      organizationId,
      refreshToken,
      csrfToken,
      refreshExpiresAt,
    );
  }

  async authenticateAccessToken(accessToken: string): Promise<AuthContext> {
    const payload = this.tokens.verifyAccessToken(accessToken);
    const session = await this.prisma.session.findUnique({ where: { id: payload.sessionId } });

    if (
      !session ||
      session.userId !== payload.userId ||
      session.organizationId !== payload.organizationId ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      throw this.invalidAccessSession();
    }

    const [user, membership] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: session.userId } }),
      this.prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: session.organizationId,
            userId: session.userId,
          },
        },
      }),
    ]);

    if (
      user?.status !== UserStatus.ACTIVE ||
      membership?.status !== MembershipStatus.ACTIVE ||
      (membership.validUntil && membership.validUntil <= new Date())
    ) {
      throw this.invalidAccessSession();
    }

    return {
      userId: session.userId,
      sessionId: session.id,
      organizationId: session.organizationId,
      role: membership.role,
      authenticatedAt: session.createdAt,
      stepUpVerifiedAt: session.stepUpVerifiedAt,
    };
  }

  async rotate(refreshToken: string, metadata: RequestMetadata): Promise<SessionBundle> {
    const suppliedHash = this.tokens.hashOpaqueToken(refreshToken);
    const newRefreshToken = this.tokens.createOpaqueToken();
    const newCsrfToken = this.tokens.createOpaqueToken();
    const newRefreshHash = this.tokens.hashOpaqueToken(newRefreshToken);
    const now = new Date();

    const result = await this.prisma.transaction(async (transaction) => {
      const storedToken = await transaction.sessionRefreshToken.findUnique({
        where: { tokenHash: suppliedHash },
        include: { session: true },
      });

      if (!storedToken) return { kind: 'INVALID' as const };

      const session = storedToken.session;
      const reused = Boolean(storedToken.usedAt || storedToken.revokedAt);
      const inactive = Boolean(session.revokedAt || session.expiresAt <= now);

      if (reused) {
        await this.revokeFamily(transaction, session.tokenFamilyId, now);
        return { kind: 'REUSED' as const };
      }

      if (inactive || storedToken.expiresAt <= now) {
        await this.revokeFamily(transaction, session.tokenFamilyId, now);
        return { kind: 'INVALID' as const };
      }

      const membership = await transaction.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: session.organizationId,
            userId: session.userId,
          },
        },
      });
      const user = await transaction.user.findUnique({ where: { id: session.userId } });

      if (
        user?.status !== UserStatus.ACTIVE ||
        membership?.status !== MembershipStatus.ACTIVE ||
        (membership.validUntil && membership.validUntil <= now)
      ) {
        await this.revokeFamily(transaction, session.tokenFamilyId, now);
        return { kind: 'INVALID' as const };
      }

      const consumed = await transaction.sessionRefreshToken.updateMany({
        where: { id: storedToken.id, usedAt: null, revokedAt: null },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) {
        await this.revokeFamily(transaction, session.tokenFamilyId, now);
        return { kind: 'REUSED' as const };
      }

      await transaction.session.update({
        where: { id: session.id },
        data: {
          refreshTokenHash: newRefreshHash,
          csrfTokenHash: this.tokens.hashOpaqueToken(newCsrfToken),
          lastUsedAt: now,
          rotationCounter: { increment: 1 },
          ...metadata,
        },
      });
      await transaction.sessionRefreshToken.create({
        data: {
          sessionId: session.id,
          tokenHash: newRefreshHash,
          expiresAt: session.expiresAt,
        },
      });

      return { kind: 'ROTATED' as const, session };
    });

    if (result.kind === 'REUSED') {
      throw new UnauthorizedException({
        type: 'about:blank',
        title: 'Refresh token reuse was detected; the session family was revoked',
        status: 401,
        code: 'REFRESH_TOKEN_REUSED',
      });
    }

    if (result.kind === 'INVALID') throw this.invalidRefreshSession();

    return this.bundle(
      result.session.id,
      result.session.userId,
      result.session.organizationId,
      newRefreshToken,
      newCsrfToken,
      result.session.expiresAt,
    );
  }

  async revoke(sessionId: string): Promise<void> {
    const now = new Date();
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });

    if (!session) return;

    await this.prisma.transaction(async (transaction) => {
      await this.revokeFamily(transaction, session.tokenFamilyId, now);
    });
  }

  async revokeAll(userId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.sessionRefreshToken.updateMany({
        where: { session: { userId }, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  private bundle(
    sessionId: string,
    userId: string,
    organizationId: string,
    refreshToken: string,
    csrfToken: string,
    refreshExpiresAt: Date,
  ): SessionBundle {
    const accessExpiresAt = new Date(Date.now() + this.accessTtlMilliseconds);
    const accessToken = this.tokens.signAccessToken({
      version: 1,
      sessionId,
      userId,
      organizationId,
      expiresAt: accessExpiresAt.getTime(),
    });

    return {
      sessionId,
      accessToken,
      refreshToken,
      csrfToken,
      accessExpiresAt,
      refreshExpiresAt,
    };
  }

  private async revokeFamily(
    transaction: DatabaseTransaction,
    tokenFamilyId: string,
    revokedAt: Date,
  ): Promise<void> {
    await transaction.session.updateMany({
      where: { tokenFamilyId, revokedAt: null },
      data: { revokedAt },
    });
    await transaction.sessionRefreshToken.updateMany({
      where: { session: { tokenFamilyId }, revokedAt: null },
      data: { revokedAt },
    });
  }

  private invalidAccessSession(): UnauthorizedException {
    return new UnauthorizedException({
      type: 'about:blank',
      title: 'The access session is no longer active',
      status: 401,
      code: 'ACCESS_SESSION_INACTIVE',
    });
  }

  private invalidRefreshSession(): UnauthorizedException {
    return new UnauthorizedException({
      type: 'about:blank',
      title: 'The refresh session is invalid or expired',
      status: 401,
      code: 'REFRESH_SESSION_INVALID',
    });
  }
}
