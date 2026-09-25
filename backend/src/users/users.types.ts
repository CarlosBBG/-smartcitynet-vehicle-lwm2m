import type { Role, User } from '@prisma/client';

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: Role;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    enabled: user.enabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
