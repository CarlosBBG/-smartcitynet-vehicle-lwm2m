import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';

import type { LoginDto } from './dto/login.dto.js';
import type { JwtPayload } from './auth.types.js';
import { toUserResponse } from '../users/users.types.js';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.users.findForAuthentication(dto.email);
    if (
      !user ||
      !user.enabled ||
      !(await argon2.verify(user.passwordHash, dto.password))
    ) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return {
      accessToken: await this.jwt.signAsync(payload, {
        expiresIn: parseDurationSeconds(
          this.config.get<string>('JWT_EXPIRES_IN', '8h'),
        ),
      }),
      user: toUserResponse(user),
    };
  }
}

function parseDurationSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim().toLowerCase());
  if (!match) {
    throw new Error('JWT_EXPIRES_IN debe usar el formato 30m, 8h o 1d');
  }
  const amount = Number(match[1]);
  const factors: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * factors[match[2]];
}
