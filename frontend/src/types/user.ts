import type { UserRole } from './auth';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  role: UserRole;
  password: string;
}

export type UpdateUserInput = Partial<CreateUserInput> & { enabled?: boolean };
