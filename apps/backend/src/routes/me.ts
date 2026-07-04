import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { clampCycleLength, clampPeriodLength } from '../domain/cycle.js';
import { isValidISODate } from '../domain/dates.js';
import { isValidTimezone, todayISO } from '../domain/user-cycle.js';
import { clearDailyAssignment, dateFromISO } from '../services/workout-service.js';
import { startTrialIfNone, toMeResponse } from '../services/user-service.js';

const updateSchema = z.object({
  level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  equipment: z.enum(['none', 'basic', 'dumbbells']).optional(),
  goal: z.enum(['tone', 'weight_loss', 'energy', 'recovery']).optional(),
  restrictions: z.array(z.enum(['knees', 'back', 'diastasis'])).optional(),
  cycleMode: z.enum(['tracked', 'no_cycle']).optional(),
  cycleStartDate: z.string().nullable().optional(),
  cycleLength: z.number().int().optional(),
  periodLength: z.number().int().optional(),
  timezone: z.string().optional(),
  notifyHourLocal: z.number().int().min(0).max(23).optional(),
  onboardingCompleted: z.boolean().optional(),
  disclaimerAccepted: z.boolean().optional(),
});

const periodStartSchema = z.object({
  date: z.string(),
});

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/me', { preHandler: [app.authenticate] }, async (req) => {
    return toMeResponse(app.prisma, req.currentUser);
  });

  app.put('/api/me', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', details: parsed.error.issues });
    const b = parsed.data;

    if (b.timezone && !isValidTimezone(b.timezone)) {
      return reply.code(400).send({ error: 'invalid_timezone' });
    }
    if (b.cycleStartDate != null && b.cycleStartDate !== '') {
      if (!isValidISODate(b.cycleStartDate)) {
        return reply.code(400).send({ error: 'invalid_date' });
      }
      if (b.cycleStartDate > todayISO(b.timezone ?? req.currentUser.timezone)) {
        return reply.code(400).send({ error: 'date_in_future' });
      }
    }
    // дата начала цикла не может быть в будущем (иначе «день 28» по модулю сегодня)
    if (b.cycleStartDate && b.cycleStartDate > todayISO(req.currentUser.timezone)) {
      return reply.code(400).send({ error: 'date_in_future' });
    }

    const user = req.currentUser;
    const data: Record<string, unknown> = {};
    if (b.level) data.level = b.level;
    if (b.equipment) data.equipment = b.equipment;
    if (b.goal) data.goal = b.goal;
    if (b.restrictions) data.restrictions = b.restrictions;
    if (b.cycleMode) data.cycleMode = b.cycleMode;
    if (b.cycleStartDate !== undefined) {
      data.cycleStartDate = b.cycleStartDate ? dateFromISO(b.cycleStartDate) : null;
    }
    if (b.cycleLength !== undefined) data.cycleLength = clampCycleLength(b.cycleLength);
    if (b.periodLength !== undefined) data.periodLength = clampPeriodLength(b.periodLength);
    if (b.timezone) data.timezone = b.timezone;
    if (b.notifyHourLocal !== undefined) data.notifyHourLocal = b.notifyHourLocal;
    if (b.disclaimerAccepted && !user.disclaimerAcceptedAt) data.disclaimerAcceptedAt = new Date();
    if (b.onboardingCompleted && !user.onboardingCompletedAt) data.onboardingCompletedAt = new Date();

    const updated = await app.prisma.user.update({ where: { id: user.id }, data });

    // Финал онбординга → автозапуск триала (§5.1)
    if (b.onboardingCompleted && !user.onboardingCompletedAt) {
      await startTrialIfNone(app.prisma, user.id);
    }

    // Смена параметров цикла меняет фазу дня → сбрасываем сегодняшнее назначение
    const cycleChanged =
      b.cycleMode !== undefined ||
      b.cycleStartDate !== undefined ||
      b.cycleLength !== undefined ||
      b.periodLength !== undefined;
    if (cycleChanged && updated.onboardingCompletedAt) {
      await clearDailyAssignment(app.prisma, updated.id, todayISO(updated.timezone));
    }

    return toMeResponse(app.prisma, updated);
  });

  // «Месячные начались {date}» → обновление старта цикла и пересчёт плана (§3.1)
  app.post('/api/me/cycle/period-start', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = periodStartSchema.safeParse(req.body);
    if (!parsed.success || !isValidISODate(parsed.data.date)) {
      return reply.code(400).send({ error: 'bad_request' });
    }
    const date = parsed.data.date;
    const today = todayISO(req.currentUser.timezone);
    if (date > today) return reply.code(400).send({ error: 'date_in_future' });

    const updated = await app.prisma.user.update({
      where: { id: req.currentUser.id },
      data: {
        cycleStartDate: dateFromISO(date),
        cycleMode: 'tracked',
        periodAskCount: 0,
        periodAskLastAt: null,
      },
    });
    // пересчёт плана: сбрасываем сегодняшнее назначение под новую фазу
    await clearDailyAssignment(app.prisma, updated.id, today);
    return toMeResponse(app.prisma, updated);
  });
}
