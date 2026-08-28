import { SetMetadata } from '@nestjs/common';
import type { MembershipRole } from '../generated/prisma/client.js';

export const REQUIRED_ROLES = 'bloctrust.required-roles';
export const Roles = (...roles: MembershipRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLES, roles);
