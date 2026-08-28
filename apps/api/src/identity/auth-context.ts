import type { MembershipRole } from '../generated/prisma/client.js';

export type AuthContext = Readonly<{
  userId: string;
  membershipId: string;
  sessionId: string;
  organizationId: string;
  role: MembershipRole;
  authenticatedAt: Date;
  stepUpVerifiedAt: Date | null;
}>;
