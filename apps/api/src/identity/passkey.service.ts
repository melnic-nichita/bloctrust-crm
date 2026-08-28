import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { PrismaService } from '../database/prisma.service.js';
import { PasskeyChallengePurpose } from '../generated/prisma/client.js';
import type { WebAuthnCredential as StoredWebAuthnCredential } from '../generated/prisma/client.js';
import type { AuthContext } from './auth-context.js';

function isAuthenticatorTransport(value: string): value is AuthenticatorTransportFuture {
  return (
    value === 'ble' ||
    value === 'cable' ||
    value === 'hybrid' ||
    value === 'internal' ||
    value === 'nfc' ||
    value === 'smart-card' ||
    value === 'usb'
  );
}

function transportsForWebAuthn(values: string[]): AuthenticatorTransportFuture[] {
  return values.filter(isAuthenticatorTransport);
}

@Injectable()
export class PasskeyService {
  private readonly relyingPartyId = process.env.WEBAUTHN_RP_ID ?? 'localhost';
  private readonly relyingPartyName = process.env.WEBAUTHN_RP_NAME ?? 'BlocTrust CRM';
  private readonly expectedOrigin = process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:3000';
  private readonly challengeTtlMilliseconds = 5 * 60 * 1_000;

  constructor(private readonly prisma: PrismaService) {}

  async registrationOptions(auth: AuthContext) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    const credentials = await this.prisma.webAuthnCredential.findMany({
      where: { userId: auth.userId },
    });
    this.assertRegistrationAuthorized(auth, credentials.length);
    const options = await generateRegistrationOptions({
      rpName: this.relyingPartyName,
      rpID: this.relyingPartyId,
      userID: Buffer.from(user.id, 'utf8'),
      userName: user.email,
      userDisplayName: user.displayName,
      attestationType: 'none',
      excludeCredentials: credentials.map((credential: StoredWebAuthnCredential) => ({
        id: credential.credentialId,
        transports: transportsForWebAuthn(credential.transports),
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
    });

    await this.replaceChallenge(auth, PasskeyChallengePurpose.REGISTRATION, options.challenge);

    return options;
  }

  async verifyRegistration(
    auth: AuthContext,
    response: RegistrationResponseJSON,
    deviceName?: string,
  ): Promise<Readonly<{ credentialId: string; deviceName: string | null }>> {
    const challenge = await this.activeChallenge(auth, PasskeyChallengePurpose.REGISTRATION);
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: this.expectedOrigin,
      expectedRPID: this.relyingPartyId,
      requireUserVerification: true,
    });

    if (!verification.verified) throw this.verificationFailed();

    const { credential, credentialBackedUp } = verification.registrationInfo;
    const consumed = await this.prisma.transaction(async (transaction) => {
      const result = await transaction.passkeyChallenge.updateMany({
        where: { id: challenge.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });

      if (result.count !== 1) return undefined;

      return transaction.webAuthnCredential.create({
        data: {
          userId: auth.userId,
          credentialId: credential.id,
          publicKey: Buffer.from(credential.publicKey),
          counter: BigInt(credential.counter),
          transports: credential.transports ?? [],
          backedUp: credentialBackedUp,
          ...(deviceName ? { deviceName } : {}),
        },
      });
    });

    if (!consumed) throw this.challengeConsumed();

    return { credentialId: consumed.credentialId, deviceName: consumed.deviceName };
  }

  async stepUpOptions(auth: AuthContext) {
    const credentials = await this.prisma.webAuthnCredential.findMany({
      where: { userId: auth.userId },
    });

    if (credentials.length === 0) {
      throw new ForbiddenException({
        type: 'about:blank',
        title: 'Register a passkey before requesting step-up verification',
        status: 403,
        code: 'PASSKEY_REQUIRED',
      });
    }

    const options = await generateAuthenticationOptions({
      rpID: this.relyingPartyId,
      allowCredentials: credentials.map((credential: StoredWebAuthnCredential) => ({
        id: credential.credentialId,
        transports: transportsForWebAuthn(credential.transports),
      })),
      userVerification: 'required',
    });

    await this.replaceChallenge(auth, PasskeyChallengePurpose.STEP_UP, options.challenge);

    return options;
  }

  async verifyStepUp(
    auth: AuthContext,
    response: AuthenticationResponseJSON,
  ): Promise<Readonly<{ verifiedAt: string }>> {
    const challenge = await this.activeChallenge(auth, PasskeyChallengePurpose.STEP_UP);
    const storedCredential = await this.prisma.webAuthnCredential.findUnique({
      where: { credentialId: response.id },
    });

    if (!storedCredential || storedCredential.userId !== auth.userId) {
      throw this.verificationFailed();
    }

    const counter = Number(storedCredential.counter);
    if (!Number.isSafeInteger(counter)) throw this.verificationFailed();

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: this.expectedOrigin,
      expectedRPID: this.relyingPartyId,
      credential: {
        id: storedCredential.credentialId,
        publicKey: new Uint8Array(storedCredential.publicKey),
        counter,
        transports: transportsForWebAuthn(storedCredential.transports),
      },
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.authenticationInfo.userVerified) {
      throw this.verificationFailed();
    }

    const verifiedAt = new Date();
    const consumed = await this.prisma.transaction(async (transaction) => {
      const result = await transaction.passkeyChallenge.updateMany({
        where: { id: challenge.id, usedAt: null, expiresAt: { gt: verifiedAt } },
        data: { usedAt: verifiedAt },
      });

      if (result.count !== 1) return false;

      await transaction.webAuthnCredential.update({
        where: { id: storedCredential.id },
        data: {
          counter: BigInt(verification.authenticationInfo.newCounter),
          backedUp: verification.authenticationInfo.credentialBackedUp,
          lastUsedAt: verifiedAt,
        },
      });
      await transaction.session.update({
        where: { id: auth.sessionId },
        data: { stepUpVerifiedAt: verifiedAt },
      });

      return true;
    });

    if (!consumed) throw this.challengeConsumed();

    return { verifiedAt: verifiedAt.toISOString() };
  }

  private async replaceChallenge(
    auth: AuthContext,
    purpose: PasskeyChallengePurpose,
    challenge: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.passkeyChallenge.updateMany({
        where: { sessionId: auth.sessionId, purpose, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.passkeyChallenge.create({
        data: {
          userId: auth.userId,
          sessionId: auth.sessionId,
          purpose,
          challenge,
          expiresAt: new Date(now.getTime() + this.challengeTtlMilliseconds),
        },
      }),
    ]);
  }

  private assertRegistrationAuthorized(auth: AuthContext, credentialCount: number): void {
    const fiveMinutes = 5 * 60 * 1_000;
    const tenMinutes = 10 * 60 * 1_000;
    const hasRecentStepUp =
      auth.stepUpVerifiedAt && Date.now() - auth.stepUpVerifiedAt.getTime() <= fiveMinutes;
    const hasRecentLogin = Date.now() - auth.authenticatedAt.getTime() <= tenMinutes;

    if ((credentialCount > 0 && !hasRecentStepUp) || (credentialCount === 0 && !hasRecentLogin)) {
      throw new ForbiddenException({
        type: 'about:blank',
        title:
          credentialCount > 0
            ? 'Recent passkey verification is required to add another passkey'
            : 'Sign in again before registering the first passkey',
        status: 403,
        code: credentialCount > 0 ? 'STEP_UP_REQUIRED' : 'RECENT_LOGIN_REQUIRED',
      });
    }
  }

  private async activeChallenge(auth: AuthContext, purpose: PasskeyChallengePurpose) {
    const challenge = await this.prisma.passkeyChallenge.findFirst({
      where: {
        userId: auth.userId,
        sessionId: auth.sessionId,
        purpose,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw new BadRequestException({
        type: 'about:blank',
        title: 'The passkey challenge is missing or expired',
        status: 400,
        code: 'PASSKEY_CHALLENGE_INVALID',
      });
    }

    return challenge;
  }

  private verificationFailed(): BadRequestException {
    return new BadRequestException({
      type: 'about:blank',
      title: 'Passkey verification failed',
      status: 400,
      code: 'PASSKEY_VERIFICATION_FAILED',
    });
  }

  private challengeConsumed(): BadRequestException {
    return new BadRequestException({
      type: 'about:blank',
      title: 'The passkey challenge has already been consumed',
      status: 400,
      code: 'PASSKEY_CHALLENGE_REPLAYED',
    });
  }
}
