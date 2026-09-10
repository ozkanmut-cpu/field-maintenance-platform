import { UserRole } from '@prisma/client';

export type AuthenticatedUser = {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  tokenVersion: number;
};
