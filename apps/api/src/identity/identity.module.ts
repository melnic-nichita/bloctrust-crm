import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasskeyService } from './passkey.service.js';
import { PasswordService } from './password.service.js';
import { PwnedPasswordService } from './pwned-password.service.js';
import { SessionService } from './session.service.js';
import { SessionTokenService } from './session-token.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasskeyService,
    PasswordService,
    PwnedPasswordService,
    SessionService,
    SessionTokenService,
  ],
  exports: [SessionService, SessionTokenService],
})
export class IdentityModule {}
