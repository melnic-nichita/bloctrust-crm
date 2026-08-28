import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../database/prisma.service.js';
import { MembershipRole, MembershipStatus, UserStatus } from '../generated/prisma/client.js';
import type { AuthContext } from './auth-context.js';
import type { LoginDto, OnboardOrganizationDto } from './dto.js';
import { PasswordService } from './password.service.js';
import { PwnedPasswordService } from './pwned-password.service.js';
import type { SessionBundle } from './session.service.js';
import { SessionService } from './session.service.js';

type AuthResult = Readonly<{
  session: SessionBundle;
  user: Readonly<{ id: string; email: string; displayName: string }>;
  organization: Readonly<{ id: string; slug: string; name: string; role: MembershipRole }>;
}>;

@Injectable()
export class AuthService {
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly pwnedPasswords: PwnedPasswordService,
    private readonly sessions: SessionService,
  ) {
    this.dummyHash = this.passwords.hash('invalid-account-timing-sentinel');
  }

  async onboard(dto: OnboardOrganizationDto, request: Request): Promise<AuthResult> {
    const exposureCount = await this.pwnedPasswords.exposureCount(dto.password);
    if (exposureCount > 0) {
      throw new UnprocessableEntityException({
        type: 'about:blank',
        title: 'Choose a password that has not appeared in known data breaches',
        status: 422,
        code: 'PASSWORD_COMPROMISED',
      });
    }

    const passwordHash = await this.passwords.hash(dto.password);

    try {
      const created = await this.prisma.transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            email: dto.email,
            displayName: dto.displayName.trim(),
            passwordHash,
          },
        });
        const organization = await transaction.organization.create({
          data: {
            name: dto.organizationName.trim(),
            slug: dto.organizationSlug,
          },
        });
        await transaction.membership.create({
          data: {
            organizationId: organization.id,
            userId: user.id,
            role: MembershipRole.OWNER,
          },
        });

        return { user, organization };
      });
      const session = await this.sessions.create(
        created.user.id,
        created.organization.id,
        this.sessions.metadataFrom(request),
      );

      return {
        session,
        user: {
          id: created.user.id,
          email: created.user.email,
          displayName: created.user.displayName,
        },
        organization: {
          id: created.organization.id,
          slug: created.organization.slug,
          name: created.organization.name,
          role: MembershipRole.OWNER,
        },
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException({
          type: 'about:blank',
          title: 'The email address or organization slug is already registered',
          status: 409,
          code: 'ONBOARDING_CONFLICT',
        });
      }
      throw error;
    }
  }

  async login(dto: LoginDto, request: Request): Promise<AuthResult> {
    const [user, organization] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: dto.email } }),
      this.prisma.organization.findUnique({ where: { slug: dto.organizationSlug } }),
    ]);
    const hash = user?.passwordHash ?? (await this.dummyHash);
    const passwordMatches = await this.passwords.verify(dto.password, hash);
    const membership =
      user && organization
        ? await this.prisma.membership.findUnique({
            where: {
              organizationId_userId: {
                organizationId: organization.id,
                userId: user.id,
              },
            },
          })
        : undefined;

    if (
      !user ||
      !organization ||
      !membership ||
      !passwordMatches ||
      user.status !== UserStatus.ACTIVE ||
      membership.status !== MembershipStatus.ACTIVE ||
      (membership.validUntil && membership.validUntil <= new Date())
    ) {
      throw new UnauthorizedException({
        type: 'about:blank',
        title: 'The supplied credentials are invalid',
        status: 401,
        code: 'CREDENTIALS_INVALID',
      });
    }

    const session = await this.sessions.create(
      user.id,
      organization.id,
      this.sessions.metadataFrom(request),
    );

    return {
      session,
      user: { id: user.id, email: user.email, displayName: user.displayName },
      organization: {
        id: organization.id,
        slug: organization.slug,
        name: organization.name,
        role: membership.role,
      },
    };
  }

  async me(auth: AuthContext) {
    const [user, organization, passkeyCount] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } }),
      this.prisma.organization.findUniqueOrThrow({ where: { id: auth.organizationId } }),
      this.prisma.webAuthnCredential.count({ where: { userId: auth.userId } }),
    ]);

    return {
      user: { id: user.id, email: user.email, displayName: user.displayName },
      organization: {
        id: organization.id,
        slug: organization.slug,
        name: organization.name,
        role: auth.role,
      },
      session: {
        id: auth.sessionId,
        stepUpVerifiedAt: auth.stepUpVerifiedAt?.toISOString() ?? null,
      },
      passkeyCount,
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
  }
}
