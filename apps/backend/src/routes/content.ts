import type { CalendarDay, StatsResponse, TodayResponse, WorkoutLogStatus } from '@cyclefit/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { resolveCycle } from '../domain/cycle.js';
import { addDays } from '../domain/dates.js';
import { subscriptionInfo } from '../domain/subscription.js';
import { cycleTodayFor, todayISO, userCycleState } from '../domain/user-cycle.js';
import { phaseContentFor } from '../services/content-service.js';
import {
  buildWorkoutDto,
  dateFromISO,
  getOrAssignDailyWorkout,
  getStreak,
  logWorkout,
  workoutPreview,
} from '../services/workout-service.js';

// Через плеер пользовательница доходит только до completed/skipped.
// 'rest' — отдельный эндпоинт /api/today/rest (проверяет фазу), 'replaced_easy' ставит сервер (бот).
const logSchema = z.object({
  status: z.enum(['completed', 'skipped']),
  feltRating: z.number().int().min(1).max(5).optional(),
});

export async function contentRoutes(app: FastifyInstance): Promise<void> {
  // Календарь фаз — доступен всегда, в т.ч. без подписки (§5.3, §6)
  app.get('/api/calendar', { preHandler: [app.authenticate] }, async (req, reply) => {
    const month = (req.query as Record<string, string>).month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return reply.code(400).send({ error: 'bad_month' });

    const user = req.currentUser;
    const state = userCycleState(user);
    const today = todayISO(user.timezone);

    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

    const monthStart = dateFromISO(`${month}-01`);
    const monthEnd = dateFromISO(`${month}-${String(daysInMonth).padStart(2, '0')}`);
    const logs = await app.prisma.workoutLog.findMany({
      where: { userId: user.id, date: { gte: monthStart, lte: monthEnd } },
      select: { date: true, status: true },
    });
    const logMap = new Map(logs.map((l) => [l.date.toISOString().slice(0, 10), l.status]));

    const onboarded = !!user.onboardingCompletedAt;
    const days: CalendarDay[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`;
      const resolved = onboarded ? resolveCycle(date, state) : null;
      days.push({
        date,
        cycleDay: resolved?.cycleDay ?? null,
        phase: resolved?.phase ?? null,
        isToday: date === today,
        workoutStatus: (logMap.get(date) as WorkoutLogStatus | undefined) ?? null,
      });
    }
    return { month, days };
  });

  // Главный экран «Сегодня» (§5.2). Тренировка — subscription-gated (§6)
  app.get('/api/today', { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = req.currentUser;
    if (!user.onboardingCompletedAt) return reply.code(409).send({ error: 'onboarding_required' });

    const cycle = cycleTodayFor(user);
    const sub = await app.prisma.subscription.findUnique({ where: { userId: user.id } });
    const hasAccess = subscriptionInfo(sub).hasAccess;

    const { nutritionTip, bodyNote } = await phaseContentFor(app.prisma, cycle.phase, cycle.cycleDay);

    let workout = null;
    if (hasAccess) {
      const assignment = await getOrAssignDailyWorkout(app.prisma, user, cycle.date, cycle.phase);
      if (assignment) {
        workout = await workoutPreview(app.prisma, assignment.workoutId, assignment.easyReplaced);
      }
    }

    const todayLog = await app.prisma.workoutLog.findUnique({
      where: { userId_date: { userId: user.id, date: dateFromISO(cycle.date) } },
    });

    const response: TodayResponse = {
      cycle,
      bodyNote,
      nutritionTip: hasAccess ? nutritionTip : null,
      workout,
      workoutLocked: !hasAccess,
      restDayAvailable: cycle.phase === 'menstrual',
      todayLog: (todayLog?.status as WorkoutLogStatus | undefined) ?? null,
      streak: await getStreak(app.prisma, user.id, cycle.date),
    };
    return response;
  });

  // «Сегодня отдыхаю» (§5.2): осознанный отдых, не ломает стрик в menstrual-фазе
  app.post('/api/today/rest', { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = req.currentUser;
    const cycle = cycleTodayFor(user);
    if (cycle.phase !== 'menstrual') return reply.code(400).send({ error: 'rest_only_in_menstrual' });
    await logWorkout(app.prisma, user.id, cycle.date, null, 'rest');
    return { ok: true };
  });

  // Состав тренировки (gated, §9)
  app.get(
    '/api/workouts/:id',
    { preHandler: [app.authenticate, app.requireSubscription] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const dto = await buildWorkoutDto(
        app.prisma,
        id,
        req.currentUser.restrictions as ('knees' | 'back' | 'diastasis')[],
      );
      if (!dto) return reply.code(404).send({ error: 'not_found' });
      return dto;
    },
  );

  app.post('/api/workouts/:id/log', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = logSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });

    const workout = await app.prisma.workout.findUnique({ where: { id }, select: { id: true } });
    if (!workout) return reply.code(404).send({ error: 'not_found' });

    const user = req.currentUser;
    const today = todayISO(user.timezone);
    // Переход через полночь: если тренировка была назначена вчера (начата до полуночи)
    // и на сегодня лога ещё нет — засчитываем на дату назначения, иначе стрик рвётся.
    const yesterday = addDays(today, -1);
    const assignment = await app.prisma.dailyAssignment.findFirst({
      where: { userId: user.id, workoutId: id, date: { in: [dateFromISO(today), dateFromISO(yesterday)] } },
      orderBy: { date: 'desc' },
    });
    const yesterdayLog = await app.prisma.workoutLog.findUnique({
      where: { userId_date: { userId: user.id, date: dateFromISO(yesterday) } },
    });
    const date =
      assignment && assignment.date.toISOString().slice(0, 10) === yesterday && !yesterdayLog ? yesterday : today;
    await logWorkout(app.prisma, user.id, date, id, parsed.data.status, parsed.data.feltRating);
    return { ok: true, streak: await getStreak(app.prisma, user.id, date) };
  });

  app.get('/api/stats', { preHandler: [app.authenticate] }, async (req) => {
    const user = req.currentUser;
    const today = todayISO(user.timezone);
    const monthStart = dateFromISO(`${today.slice(0, 7)}-01`);
    const logs = await app.prisma.workoutLog.findMany({
      where: { userId: user.id, date: { gte: monthStart } },
      orderBy: { date: 'asc' },
      select: { date: true, status: true },
    });
    const completedTotal = await app.prisma.workoutLog.count({
      where: { userId: user.id, status: { in: ['completed', 'replaced_easy'] } },
    });
    const response: StatsResponse = {
      streak: await getStreak(app.prisma, user.id, today),
      month: logs.map((l) => ({
        date: l.date.toISOString().slice(0, 10),
        status: l.status as WorkoutLogStatus,
      })),
      completedTotal,
    };
    return response;
  });
}
