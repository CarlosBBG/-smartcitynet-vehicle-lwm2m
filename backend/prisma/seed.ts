import argon2 from 'argon2';
import { PrismaClient, Role } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL;
const email = process.env.ADMIN_INITIAL_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_INITIAL_PASSWORD;
const name = process.env.ADMIN_INITIAL_NAME?.trim() || 'Administrador SmartCityNet';

if (!databaseUrl || !email || !password) {
  throw new Error(
    'DATABASE_URL, ADMIN_INITIAL_EMAIL y ADMIN_INITIAL_PASSWORD son requeridos para ejecutar el seed',
  );
}

if (password.length < 12) {
  throw new Error('ADMIN_INITIAL_PASSWORD debe contener al menos 12 caracteres');
}

const prisma = new PrismaClient();

try {
  const passwordHash = await argon2.hash(password);
  await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role: Role.ADMIN, enabled: true },
    create: { email, name, passwordHash, role: Role.ADMIN },
  });
  console.log(`Administrador inicial disponible: ${email}`);
} finally {
  await prisma.$disconnect();
}
