import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('SmartCityNet V2 API (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let viewerToken: string;
  let testAlertId: string | undefined;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleFixture.get(PrismaService);
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: process.env.ADMIN_INITIAL_EMAIL,
        password: process.env.ADMIN_INITIAL_PASSWORD,
      })
      .expect(201);
    adminToken = response.body.accessToken as string;
  });

  it('permite login y consulta de la sesión sin exponer el hash', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.email).toBe(process.env.ADMIN_INITIAL_EMAIL);
    expect(response.body).not.toHaveProperty('passwordHash');
  });

  it('rechaza credenciales incorrectas', () =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: process.env.ADMIN_INITIAL_EMAIL, password: 'incorrecta' })
      .expect(401));

  it('ADMIN registra un vehículo que queda pendiente de descubrimiento', async () => {
    const suffix = Date.now().toString().slice(-8);
    const response = await request(app.getHttpServer())
      .post('/api/vehicles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Vehículo E2E ${suffix}`,
        deviceId: `heltec-e2e-${suffix}`,
        model: 'Heltec WiFi LoRa 32 V3',
      })
      .expect(201);

    expect(response.body.status).toBe('PENDING_DISCOVERY');
    expect(response.body.lwm2mEndpoint).toBe(
      `smartcitynet-heltec-e2e-${suffix}`,
    );
  });

  it('ADMIN registra dos vehículos con UUID y endpoint LwM2M independientes', async () => {
    const suffix = Date.now().toString().slice(-8);
    const responses = await Promise.all(
      ['a', 'b'].map((label) =>
        request(app.getHttpServer())
          .post('/api/vehicles')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: `Vehículo multi ${label.toUpperCase()}`,
            deviceId: `heltec-e2e-${suffix}-${label}`,
            model: 'Heltec WiFi LoRa 32 V3',
          })
          .expect(201),
      ),
    );

    const [first, second] = responses.map((response) => response.body);
    expect(first.id).not.toBe(second.id);
    expect(first.lwm2mEndpoint).toBe(`smartcitynet-heltec-e2e-${suffix}-a`);
    expect(second.lwm2mEndpoint).toBe(`smartcitynet-heltec-e2e-${suffix}-b`);
  });

  it('VIEWER puede leer vehículos pero no registrarlos', async () => {
    const suffix = Date.now().toString().slice(-8);
    const email = `viewer-${suffix}@example.com`;
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email,
        password: 'viewer-password-2026',
        name: 'Viewer E2E',
        role: 'VIEWER',
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'viewer-password-2026' })
      .expect(201);
    viewerToken = login.body.accessToken as string;

    await request(app.getHttpServer())
      .get('/api/vehicles')
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/vehicles')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        name: 'No permitido',
        deviceId: `heltec-denied-${suffix}`,
        model: 'Heltec WiFi LoRa 32 V3',
      })
      .expect(403);
  });

  it('VIEWER consulta alertas y solo ADMIN puede reconocerlas', async () => {
    const alert = await prisma.alert.create({
      data: {
        type: 'SYSTEM',
        severity: 'INFO',
        title: 'Alerta E2E',
        message: 'Validación de permisos de alertas',
      },
    });
    testAlertId = alert.id;

    await request(app.getHttpServer())
      .get('/api/alerts')
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/alerts/${alert.id}/acknowledge`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(403);

    const acknowledged = await request(app.getHttpServer())
      .patch(`/api/alerts/${alert.id}/acknowledge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(acknowledged.body.acknowledged).toBe(true);
  });

  afterAll(async () => {
    if (testAlertId) {
      await prisma.alert.delete({ where: { id: testAlertId } });
    }
    await prisma.vehicle.deleteMany({
      where: { deviceId: { startsWith: 'heltec-e2e-' } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'viewer-' } },
    });
    await app.close();
  });
});
