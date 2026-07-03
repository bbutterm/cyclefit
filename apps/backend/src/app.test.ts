import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Smoke-тесты API (§12): основной путь онбординг → сегодня → тренировка → лог.
// Требуют PostgreSQL с применёнными миграциями и сидом (pnpm seed).

process.env.DEV_AUTH_BYPASS = 'true';

const TEST_TG_ID = 990_000_001;

let app: FastifyInstance;
let prisma: import('@prisma/client').PrismaClient;
let token = '';
let adminToken = '';

async function cleanup() {
  await prisma.user.deleteMany({ where: { telegramId: BigInt(TEST_TG_ID) } });
}

beforeAll(async () => {
  await import('./config.js'); // подхватывает .env (DATABASE_URL) до создания клиента
  const { PrismaClient } = await import('@prisma/client');
  prisma = new PrismaClient();
  await prisma.$connect();
  const { buildApp } = await import('./app.js');
  app = buildApp({ prisma, logger: false });
  await app.ready();
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await app.close();
  await prisma.$disconnect();
});

function auth() {
  return { authorization: `Bearer ${token}` };
}

describe('основной путь пользовательницы', () => {
  it('healthcheck', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('auth: dev-байпас выдаёт JWT', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: { devUser: { id: TEST_TG_ID, firstName: 'Тест' } },
    });
    expect(res.statusCode).toBe(200);
    token = res.json().token;
    expect(token).toBeTruthy();
  });

  it('auth: мусорный initData отклоняется', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: { initData: 'hash=deadbeef&auth_date=1' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/me: онбординг не завершён', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json().onboardingCompleted).toBe(false);
    expect(res.json().today).toBeNull();
  });

  it('/api/today до онбординга → 409', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/today', headers: auth() });
    expect(res.statusCode).toBe(409);
  });

  it('PUT /api/me: онбординг завершается, триал стартует', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/me',
      headers: auth(),
      payload: {
        level: 'beginner',
        equipment: 'basic',
        goal: 'tone',
        restrictions: ['knees'],
        cycleMode: 'tracked',
        cycleStartDate: today,
        cycleLength: 28,
        periodLength: 5,
        disclaimerAccepted: true,
        onboardingCompleted: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const me = res.json();
    expect(me.onboardingCompleted).toBe(true);
    expect(me.subscription.status).toBe('trial');
    expect(me.subscription.hasAccess).toBe(true);
    expect(me.today.cycleDay).toBe(1);
    expect(me.today.phase).toBe('menstrual');
  });

  let workoutId = '';

  it('GET /api/today: тренировка дня из menstrual-слота, отдых доступен', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/today', headers: auth() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.workoutLocked).toBe(false);
    expect(body.workout).toBeTruthy();
    expect(body.restDayAvailable).toBe(true);
    expect(body.bodyNote).toBeTruthy();
    expect(body.nutritionTip).toBeTruthy();
    workoutId = body.workout.id;
  });

  it('тренировка дня стабильна в течение дня', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/today', headers: auth() });
    expect(res.json().workout.id).toBe(workoutId);
  });

  it('GET /api/workouts/:id: состав с упражнениями (ограничение knees учтено)', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/workouts/${workoutId}`, headers: auth() });
    expect(res.statusCode).toBe(200);
    const w = res.json();
    expect(w.items.length).toBeGreaterThan(0);
    for (const item of w.items) {
      if (!item.skippedNote) {
        expect(item.exercise.contraindications).not.toContain('knees');
      }
      expect(item.exercise.images.length).toBeGreaterThan(0);
    }
  });

  it('POST /api/workouts/:id/log: completed → стрик 1', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/workouts/${workoutId}/log`,
      headers: auth(),
      payload: { status: 'completed', feltRating: 5 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().streak).toBe(1);
  });

  it('GET /api/stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stats', headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json().streak).toBe(1);
    expect(res.json().completedTotal).toBe(1);
  });

  it('GET /api/calendar: месяц раскрашен по фазам', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const res = await app.inject({ method: 'GET', url: `/api/calendar?month=${month}`, headers: auth() });
    expect(res.statusCode).toBe(200);
    const days = res.json().days;
    expect(days.length).toBeGreaterThanOrEqual(28);
    expect(days.every((d: { phase: string | null }) => d.phase)).toBe(true);
  });

  it('POST /api/me/cycle/period-start: пересчёт цикла', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await app.inject({
      method: 'POST',
      url: '/api/me/cycle/period-start',
      headers: auth(),
      payload: { date: today },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().today.cycleDay).toBe(1);
  });

  it('GET /api/plans: 3 тарифа, stub-режим', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/plans' });
    expect(res.statusCode).toBe(200);
    expect(res.json().plans).toHaveLength(3);
    expect(res.json().paymentsMode).toBe('stub');
  });

  it('деградация доступа: без подписки тренировки закрыты (402), календарь открыт', async () => {
    await prisma.subscription.updateMany({
      where: { user: { telegramId: BigInt(TEST_TG_ID) } },
      data: { status: 'expired' },
    });
    const workoutRes = await app.inject({ method: 'GET', url: `/api/workouts/${workoutId}`, headers: auth() });
    expect(workoutRes.statusCode).toBe(402);

    const todayRes = await app.inject({ method: 'GET', url: '/api/today', headers: auth() });
    expect(todayRes.json().workoutLocked).toBe(true);
    expect(todayRes.json().workout).toBeNull();

    const month = new Date().toISOString().slice(0, 7);
    const calRes = await app.inject({ method: 'GET', url: `/api/calendar?month=${month}`, headers: auth() });
    expect(calRes.statusCode).toBe(200);
  });

  it('stub checkout мгновенно активирует подписку', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/subscription/checkout',
      headers: auth(),
      payload: { plan: 'monthly' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('active');

    const workoutRes = await app.inject({ method: 'GET', url: `/api/workouts/${workoutId}`, headers: auth() });
    expect(workoutRes.statusCode).toBe(200);
  });
});

describe('админка', () => {
  it('логин админа', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      payload: { email: process.env.ADMIN_EMAIL ?? 'admin@cyclefit.local', password: process.env.ADMIN_PASSWORD ?? 'admin12345' },
    });
    expect(res.statusCode).toBe(200);
    adminToken = res.json().token;
  });

  it('пользовательский JWT не проходит в админку', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/dashboard', headers: auth() });
    expect(res.statusCode).toBe(403);
  });

  it('матрица покрытия: 36 слотов, все с ≥1 опубликованной тренировкой', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/workouts/coverage',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const cells = res.json().data;
    expect(cells).toHaveLength(36);
    expect(cells.every((c: { publishedCount: number }) => c.publishedCount >= 1)).toBe(true);
  });

  it('дашборд и список пользователей без данных цикла', async () => {
    const headers = { authorization: `Bearer ${adminToken}` };
    const dash = await app.inject({ method: 'GET', url: '/api/admin/dashboard', headers });
    expect(dash.statusCode).toBe(200);
    expect(dash.json().data.usersTotal).toBeGreaterThan(0);

    const users = await app.inject({ method: 'GET', url: '/api/admin/users', headers });
    expect(users.statusCode).toBe(200);
    const row = users.json().data[0];
    expect(row).not.toHaveProperty('cycleStartDate');
    expect(row).not.toHaveProperty('periodLength');
  });
});
