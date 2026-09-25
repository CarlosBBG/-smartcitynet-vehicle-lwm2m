import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

import { RolesGuard } from './roles.guard.js';

function contextFor(role: Role): ExecutionContext {
  return {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user: { role } }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('permite un ADMIN cuando el endpoint requiere ADMIN', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue([Role.ADMIN]),
    } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(contextFor(Role.ADMIN))).toBe(
      true,
    );
  });

  it('rechaza un VIEWER cuando el endpoint requiere ADMIN', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue([Role.ADMIN]),
    } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(contextFor(Role.VIEWER))).toBe(
      false,
    );
  });

  it('permite usuarios autenticados cuando no existe restricción de rol', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(contextFor(Role.VIEWER))).toBe(
      true,
    );
  });
});
