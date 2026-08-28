import type { Request } from 'express';
import type { AuthContext } from './auth-context.js';

export type AuthenticatedRequest = Request & { auth: AuthContext };
export type OptionallyAuthenticatedRequest = Request & { auth?: AuthContext };
