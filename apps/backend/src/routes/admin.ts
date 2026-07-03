import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import bcrypt from 'bcryptjs';
import type { AdminDashboard, SlotCoverageCell } from '@cyclefit/shared';
import { EQUIPMENTS, LEVELS, PHASES } from '@cyclefit/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { addMonths, PLAN_MONTHS } from '../domain/subscription.js';
import { DEFAULT_TEXTS } from '../texts.js';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

const exerciseSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  commonMistakes: z.string().nullable().optional(),
  safetyCue: z.string().nullable().optional(),
  muscleGroups: z.array(z.string()).default([]),
  equipment: z.enum(['none', 'basic', 'dumbbells']).default('none'),
  contraindications: z.array(z.enum(['knees', 'back', 'diastasis'])).default([]),
});

const workoutItemSchema = z.object({
  exerciseId: z.string(),
  order: z.number().int(),
  sets: z.number().int().min(1).default(1),
  reps: z.number().int().nullable().optional(),
  durationSec: z.number().int().nullable().optional(),
  restSec: z.number().int().min(0).default(30),
});

const workoutSchema = z.object({
  title: z.string().min(1),
  phase: z.enum(['menstrual', 'follicular', 'ovulatory', 'luteal']),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  equipment: z.enum(['none', 'basic', 'dumbbells']),
  durationMin: z.number().int().min(5).max(60),
  intensity: z.number().int().min(1).max(5).default(3),
  description: z.string().nullable().optional(),
  isPublished: z.boolean().default(false),
  items: z.array(workoutItemSchema).default([]),
});

const phaseContentSchema = z.object({
  phase: z.enum(['menstrual', 'follicular', 'ovulatory', 'luteal']),
  dayHintMin: z.number().int().nullable().optional(),
  dayHintMax: z.number().int().nullable().optional(),
  nutritionTip: z.string().min(1),
  bodyNote: z.string().min(1),
  order: z.number().int().default(0),
});

function listParams(query: Record<string, string>) {
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(query.perPage) || 25));
  return { skip: (page - 1) * perPage, take: perPage, q: query.q?.trim() || undefined };
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/admin/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const admin = await app.prisma.adminUser.findUnique({ where: { email: parsed.data.email } });
    if (!admin || !(await bcrypt.compare(parsed.data.password, admin.passwordHash))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    const token = app.jwt.sign({ sub: admin.id, kind: 'admin' }, { expiresIn: '12h' });
    return { token };
  });

  const guard = { preHandler: [app.authenticateAdmin] };

  // --- Дашборд (§8.5) ---
  app.get('/api/admin/dashboard', guard, async () => {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const [usersTotal, activeLast7Days, trials, activeSubscriptions, workoutsCompletedLast7Days] =
      await Promise.all([
        app.prisma.user.count(),
        app.prisma.workoutLog
          .groupBy({ by: ['userId'], where: { createdAt: { gte: weekAgo } } })
          .then((g) => g.length),
        app.prisma.subscription.count({ where: { status: 'trial' } }),
        app.prisma.subscription.count({ where: { status: 'active' } }),
        app.prisma.workoutLog.count({
          where: { createdAt: { gte: weekAgo }, status: { in: ['completed', 'replaced_easy'] } },
        }),
      ]);
    const data: AdminDashboard = {
      usersTotal,
      activeLast7Days,
      trials,
      activeSubscriptions,
      workoutsCompletedLast7Days,
    };
    return { data };
  });

  // --- Упражнения (§8.1) ---
  app.get('/api/admin/exercises', guard, async (req) => {
    const { skip, take, q } = listParams(req.query as Record<string, string>);
    const where = q ? { name: { contains: q, mode: 'insensitive' as const } } : {};
    const [data, total] = await Promise.all([
      app.prisma.exercise.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' },
        include: { images: { orderBy: { order: 'asc' } } },
      }),
      app.prisma.exercise.count({ where }),
    ]);
    return { data, total };
  });

  app.get('/api/admin/exercises/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = await app.prisma.exercise.findUnique({
      where: { id },
      include: { images: { orderBy: { order: 'asc' } } },
    });
    if (!data) return reply.code(404).send({ error: 'not_found' });
    return { data };
  });

  app.post('/api/admin/exercises', guard, async (req, reply) => {
    const parsed = exerciseSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', details: parsed.error.issues });
    const data = await app.prisma.exercise.create({ data: parsed.data, include: { images: true } });
    return { data };
  });

  app.put('/api/admin/exercises/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = exerciseSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', details: parsed.error.issues });
    const data = await app.prisma.exercise.update({
      where: { id },
      data: parsed.data,
      include: { images: { orderBy: { order: 'asc' } } },
    });
    return { data };
  });

  app.delete('/api/admin/exercises/:id', guard, async (req) => {
    const { id } = req.params as { id: string };
    await app.prisma.exercise.delete({ where: { id } });
    return { data: { id } };
  });

  // Загрузка картинки упражнения (multipart: file, поля order/caption)
  app.post('/api/admin/exercises/:id/images', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    const exercise = await app.prisma.exercise.findUnique({ where: { id } });
    if (!exercise) return reply.code(404).send({ error: 'not_found' });

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'no_file' });
    const fields = file.fields as Record<string, { value?: string } | undefined>;
    const order = Number(fields.order?.value ?? 0);
    const caption = fields.caption?.value ?? null;

    const ext = extname(file.filename || '') || '.webp';
    const filename = `${randomUUID()}${ext}`;
    await pipeline(file.file, createWriteStream(join(config.uploadsDir, filename)));

    const data = await app.prisma.exerciseImage.create({
      data: { exerciseId: id, order, caption, url: `/uploads/${filename}` },
    });
    return { data };
  });

  app.delete('/api/admin/exercise-images/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    const image = await app.prisma.exerciseImage.findUnique({ where: { id } });
    if (!image) return reply.code(404).send({ error: 'not_found' });
    await app.prisma.exerciseImage.delete({ where: { id } });
    if (image.url.startsWith('/uploads/')) {
      await unlink(join(config.uploadsDir, image.url.slice('/uploads/'.length))).catch(() => {});
    }
    return { data: { id } };
  });

  // --- Тренировки (§8.2) ---
  app.get('/api/admin/workouts', guard, async (req) => {
    const query = req.query as Record<string, string>;
    const { skip, take, q } = listParams(query);
    const where = {
      ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}),
      ...(query.phase ? { phase: query.phase as never } : {}),
      ...(query.level ? { level: query.level as never } : {}),
      ...(query.equipment ? { equipment: query.equipment as never } : {}),
    };
    const [data, total] = await Promise.all([
      app.prisma.workout.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { items: { orderBy: { order: 'asc' } } },
      }),
      app.prisma.workout.count({ where }),
    ]);
    return { data, total };
  });

  app.get('/api/admin/workouts/coverage', guard, async () => {
    // Матрица покрытия слотов 4×3×3 (§8.2): число опубликованных тренировок в каждом слоте
    const grouped = await app.prisma.workout.groupBy({
      by: ['phase', 'level', 'equipment'],
      where: { isPublished: true },
      _count: { _all: true },
    });
    const counts = new Map(grouped.map((g) => [`${g.phase}|${g.level}|${g.equipment}`, g._count._all]));
    const data: SlotCoverageCell[] = [];
    for (const phase of PHASES)
      for (const level of LEVELS)
        for (const equipment of EQUIPMENTS)
          data.push({
            phase,
            level,
            equipment,
            publishedCount: counts.get(`${phase}|${level}|${equipment}`) ?? 0,
          });
    return { data };
  });

  app.get('/api/admin/workouts/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = await app.prisma.workout.findUnique({
      where: { id },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    if (!data) return reply.code(404).send({ error: 'not_found' });
    return { data };
  });

  app.post('/api/admin/workouts', guard, async (req, reply) => {
    const parsed = workoutSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', details: parsed.error.issues });
    const { items, ...fields } = parsed.data;
    const data = await app.prisma.workout.create({
      data: { ...fields, items: { create: items } },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    return { data };
  });

  app.put('/api/admin/workouts/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = workoutSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', details: parsed.error.issues });
    const { items, ...fields } = parsed.data;
    const data = await app.prisma.$transaction(async (tx) => {
      if (items) {
        await tx.workoutItem.deleteMany({ where: { workoutId: id } });
        await tx.workoutItem.createMany({ data: items.map((i) => ({ ...i, workoutId: id })) });
      }
      return tx.workout.update({
        where: { id },
        data: fields,
        include: { items: { orderBy: { order: 'asc' } } },
      });
    });
    return { data };
  });

  app.delete('/api/admin/workouts/:id', guard, async (req) => {
    const { id } = req.params as { id: string };
    await app.prisma.workout.delete({ where: { id } });
    return { data: { id } };
  });

  // --- Фазовый контент (§8.3) ---
  app.get('/api/admin/phase-content', guard, async (req) => {
    const query = req.query as Record<string, string>;
    const { skip, take } = listParams(query);
    const where = query.phase ? { phase: query.phase as never } : {};
    const [data, total] = await Promise.all([
      app.prisma.phaseContent.findMany({ where, skip, take, orderBy: [{ phase: 'asc' }, { order: 'asc' }] }),
      app.prisma.phaseContent.count({ where }),
    ]);
    return { data, total };
  });

  app.get('/api/admin/phase-content/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = await app.prisma.phaseContent.findUnique({ where: { id } });
    if (!data) return reply.code(404).send({ error: 'not_found' });
    return { data };
  });

  app.post('/api/admin/phase-content', guard, async (req, reply) => {
    const parsed = phaseContentSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', details: parsed.error.issues });
    return { data: await app.prisma.phaseContent.create({ data: parsed.data }) };
  });

  app.put('/api/admin/phase-content/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = phaseContentSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', details: parsed.error.issues });
    return { data: await app.prisma.phaseContent.update({ where: { id }, data: parsed.data }) };
  });

  app.delete('/api/admin/phase-content/:id', guard, async (req) => {
    const { id } = req.params as { id: string };
    await app.prisma.phaseContent.delete({ where: { id } });
    return { data: { id } };
  });

  // --- Пользователи (§8.4): без чувствительных данных цикла (§12) ---
  app.get('/api/admin/users', guard, async (req) => {
    const { skip, take, q } = listParams(req.query as Record<string, string>);
    const where = q
      ? {
          OR: [
            { username: { contains: q, mode: 'insensitive' as const } },
            { firstName: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [users, total] = await Promise.all([
      app.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { subscription: true, _count: { select: { workoutLogs: { where: { status: 'completed' } } } } },
      }),
      app.prisma.user.count({ where }),
    ]);
    return {
      data: users.map((u) => ({
        id: u.id,
        telegramId: u.telegramId.toString(),
        username: u.username,
        firstName: u.firstName,
        level: u.level,
        createdAt: u.createdAt,
        onboardingCompleted: !!u.onboardingCompletedAt,
        subscriptionStatus: u.subscription?.status ?? 'none',
        subscriptionEndsAt: u.subscription?.currentPeriodEndsAt ?? u.subscription?.trialEndsAt ?? null,
        completedWorkouts: u._count.workoutLogs,
      })),
      total,
    };
  });

  // Ручная выдача/продление подписки (поддержка)
  app.post('/api/admin/users/:id/subscription', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({ plan: z.enum(['monthly', 'quarterly', 'yearly']) })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const user = await app.prisma.user.findUnique({ where: { id } });
    if (!user) return reply.code(404).send({ error: 'not_found' });

    const existing = await app.prisma.subscription.findUnique({ where: { userId: id } });
    const from =
      existing?.status === 'active' && existing.currentPeriodEndsAt && existing.currentPeriodEndsAt > new Date()
        ? existing.currentPeriodEndsAt
        : new Date();
    const ends = addMonths(from, PLAN_MONTHS[parsed.data.plan]);
    const data = await app.prisma.subscription.upsert({
      where: { userId: id },
      create: { userId: id, status: 'active', plan: parsed.data.plan, currentPeriodEndsAt: ends },
      update: { status: 'active', plan: parsed.data.plan, currentPeriodEndsAt: ends },
    });
    return { data };
  });

  // --- Тексты (§8.6) ---
  app.get('/api/admin/texts', guard, async () => {
    const rows = await app.prisma.appText.findMany();
    const overrides = new Map(rows.map((r) => [r.key, r.value]));
    const data = Object.keys(DEFAULT_TEXTS)
      .sort()
      .map((key) => ({
        id: key,
        key,
        value: overrides.get(key) ?? DEFAULT_TEXTS[key],
        isOverridden: overrides.has(key),
      }));
    return { data, total: data.length };
  });

  app.put('/api/admin/texts/:key', guard, async (req, reply) => {
    const { key } = req.params as { key: string };
    const parsed = z.object({ value: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const data = await app.prisma.appText.upsert({
      where: { key },
      create: { key, value: parsed.data.value },
      update: { value: parsed.data.value },
    });
    return { data: { id: key, ...data } };
  });
}
