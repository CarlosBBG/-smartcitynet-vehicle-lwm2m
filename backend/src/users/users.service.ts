import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import { toUserResponse, type UserResponse } from './users.types.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto): Promise<UserResponse> {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('Ya existe un usuario con ese correo');
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name,
        role: dto.role,
        passwordHash: await argon2.hash(dto.password),
      },
    });
    return toUserResponse(user);
  }

  async findAll(): Promise<UserResponse[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return users.map(toUserResponse);
  }

  async findOne(id: string): Promise<UserResponse> {
    return toUserResponse(await this.requireUser(id));
  }

  async findForAuthentication(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
  }

  async findEnabledById(id: string): Promise<UserResponse | null> {
    const user = await this.prisma.user.findFirst({
      where: { id, enabled: true },
    });
    return user ? toUserResponse(user) : null;
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponse> {
    await this.requireUser(id);
    if (dto.email) {
      const duplicate = await this.prisma.user.findFirst({
        where: { email: dto.email, NOT: { id } },
      });
      if (duplicate) {
        throw new ConflictException('Ya existe un usuario con ese correo');
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        email: dto.email,
        name: dto.name,
        role: dto.role,
        enabled: dto.enabled,
        passwordHash: dto.password
          ? await argon2.hash(dto.password)
          : undefined,
      },
    });
    return toUserResponse(user);
  }

  async disable(id: string): Promise<UserResponse> {
    await this.requireUser(id);
    return toUserResponse(
      await this.prisma.user.update({
        where: { id },
        data: { enabled: false },
      }),
    );
  }

  private async requireUser(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return user;
  }
}
