import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, type User } from '@prisma/client';
import argon2 from 'argon2';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  const user: User = {
    id: 'd84225c9-50c7-4c0f-a54b-c9d4e42622ad',
    email: 'admin@example.com',
    passwordHash: '',
    name: 'Admin',
    role: Role.ADMIN,
    enabled: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  it('devuelve un JWT y nunca expone passwordHash', async () => {
    const withHash = {
      ...user,
      passwordHash: await argon2.hash('valid-password'),
    };
    const users = {
      findForAuthentication: vi.fn().mockResolvedValue(withHash),
    } as unknown as UsersService;
    const signAsync = vi.fn().mockResolvedValue('signed-token');
    const jwt = { signAsync } as unknown as JwtService;
    const config = {
      get: vi.fn().mockReturnValue('8h'),
    } as unknown as ConfigService;
    const service = new AuthService(users, jwt, config);

    const result = await service.login({
      email: user.email,
      password: 'valid-password',
    });

    expect(result.accessToken).toBe('signed-token');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sub: user.id, role: Role.ADMIN }),
      { expiresIn: 28_800 },
    );
  });

  it('rechaza una contraseña incorrecta', async () => {
    const withHash = {
      ...user,
      passwordHash: await argon2.hash('valid-password'),
    };
    const users = {
      findForAuthentication: vi.fn().mockResolvedValue(withHash),
    } as unknown as UsersService;
    const service = new AuthService(
      users,
      {} as JwtService,
      { get: vi.fn().mockReturnValue('8h') } as unknown as ConfigService,
    );

    await expect(
      service.login({ email: user.email, password: 'incorrect-password' }),
    ).rejects.toThrow('Correo o contraseña incorrectos');
  });
});
