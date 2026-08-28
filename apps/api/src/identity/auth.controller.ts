import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { Request, Response } from 'express';
import {
  clearSessionCookies,
  cookieNames,
  readCookies,
  setSessionCookies,
} from '../common/cookies.js';
import { Public } from '../common/public.decorator.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { AuthService } from './auth.service.js';
import { LoginDto, OnboardOrganizationDto, RegisterPasskeyDto, VerifyStepUpDto } from './dto.js';
import { PasskeyService } from './passkey.service.js';
import { SessionService } from './session.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly passkeys: PasskeyService,
  ) {}

  @Public()
  @Post('onboard')
  async onboard(
    @Body() dto: OnboardOrganizationDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.onboard(dto, request);
    setSessionCookies(response, result.session);

    return this.authResponse(result);
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(dto, request);
    setSessionCookies(response, result.session);

    return this.authResponse(result);
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = readCookies(request)[cookieNames.refresh];
    if (!refreshToken) throw this.refreshRequired();

    const session = await this.sessions.rotate(refreshToken, this.sessions.metadataFrom(request));
    setSessionCookies(response, session);

    return {
      csrfToken: session.csrfToken,
      accessExpiresAt: session.accessExpiresAt.toISOString(),
      refreshExpiresAt: session.refreshExpiresAt.toISOString(),
    };
  }

  @Post('logout')
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ loggedOut: true }> {
    await this.sessions.revoke(request.auth.sessionId);
    clearSessionCookies(response);

    return { loggedOut: true };
  }

  @Post('logout-all')
  async logoutAll(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ loggedOut: true }> {
    await this.sessions.revokeAll(request.auth.userId);
    clearSessionCookies(response);

    return { loggedOut: true };
  }

  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return this.auth.me(request.auth);
  }

  @Post('passkeys/registration/options')
  registrationOptions(@Req() request: AuthenticatedRequest) {
    return this.passkeys.registrationOptions(request.auth);
  }

  @Post('passkeys/registration/verify')
  verifyRegistration(@Req() request: AuthenticatedRequest, @Body() dto: RegisterPasskeyDto) {
    return this.passkeys.verifyRegistration(
      request.auth,
      dto.response as RegistrationResponseJSON,
      dto.deviceName,
    );
  }

  @Post('step-up/options')
  stepUpOptions(@Req() request: AuthenticatedRequest) {
    return this.passkeys.stepUpOptions(request.auth);
  }

  @Post('step-up/verify')
  verifyStepUp(@Req() request: AuthenticatedRequest, @Body() dto: VerifyStepUpDto) {
    return this.passkeys.verifyStepUp(request.auth, dto.response as AuthenticationResponseJSON);
  }

  private authResponse(result: Awaited<ReturnType<AuthService['login']>>) {
    return {
      user: result.user,
      organization: result.organization,
      csrfToken: result.session.csrfToken,
      accessExpiresAt: result.session.accessExpiresAt.toISOString(),
      refreshExpiresAt: result.session.refreshExpiresAt.toISOString(),
    };
  }

  private refreshRequired(): UnauthorizedException {
    return new UnauthorizedException({
      type: 'about:blank',
      title: 'A refresh session cookie is required',
      status: 401,
      code: 'REFRESH_SESSION_REQUIRED',
    });
  }
}
