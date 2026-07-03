import { PHASE_NAMES_RU } from '@cyclefit/shared';
import type { PrismaClient, User } from '@prisma/client';
import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { DateTime } from 'luxon';
import { config } from '../config.js';
import { resolveCycle } from '../domain/cycle.js';
import { addDays } from '../domain/dates.js';
import { subscriptionInfo } from '../domain/subscription.js';
import { cycleTodayFor, todayISO, userCycleState } from '../domain/user-cycle.js';
import {
  dateFromISO,
  getOrAssignDailyWorkout,
} from '../services/workout-service.js';
import { getText } from '../texts.js';
import { dailyKeyboard, periodQuestionKeyboard, sendSafe } from './bot.js';

// Рассылки (§4.2–4.4): ежечасный тик, отправка в notifyHourLocal по таймзоне пользовательницы,
// идемпотентность через NotificationLog (userId, kind, локальная дата).

async function alreadySent(prisma: PrismaClient, userId: string, kind: string, dateISO: string) {
  const row = await prisma.notificationLog.findUnique({
    where: { userId_kind_date: { userId, kind, date: dateFromISO(dateISO) } },
  });
  return !!row;
}

async function markSent(prisma: PrismaClient, userId: string, kind: string, dateISO: string) {
  await prisma.notificationLog
    .create({ data: { userId, kind, date: dateFromISO(dateISO) } })
    .catch(() => {});
}

function localHour(user: User, now: Date): number {
  const dt = DateTime.fromJSDate(now).setZone(user.timezone);
  return dt.isValid ? dt.hour : DateTime.fromJSDate(now).setZone('Europe/Moscow').hour;
}

/** Утреннее сообщение (§4.2): только завершившим онбординг и с доступом. */
async function sendDaily(prisma: PrismaClient, bot: Bot, user: User, date: string): Promise<void> {
  if (await alreadySent(prisma, user.id, 'daily', date)) return;

  const cycle = cycleTodayFor(user);
  const assignment = await getOrAssignDailyWorkout(prisma, user, date, cycle.phase);
  if (!assignment) return;
  const workout = await prisma.workout.findUnique({ where: { id: assignment.workoutId } });
  if (!workout) return;

  const key = user.cycleMode === 'no_cycle' ? 'bot.daily.nocycle' : 'bot.daily';
  let text = await getText(prisma, key, {
    day: cycle.cycleDay,
    week: Math.floor((cycle.cycleDay - 1) / 7) + 1,
    phase: PHASE_NAMES_RU[cycle.phase].toLowerCase(),
    workout: workout.title,
    min: workout.durationMin,
  });

  // Вчера не выполнена — без укоров (§4.2)
  const yesterday = addDays(date, -1);
  const [yesterdayLog, yesterdayAssignment] = await Promise.all([
    prisma.workoutLog.findUnique({
      where: { userId_date: { userId: user.id, date: dateFromISO(yesterday) } },
    }),
    prisma.dailyAssignment.findUnique({
      where: { userId_date: { userId: user.id, date: dateFromISO(yesterday) } },
    }),
  ]);
  if (yesterdayAssignment && !yesterdayLog) {
    text += `\n\n${await getText(prisma, 'bot.daily.continue')}`;
  }

  const kb = dailyKeyboard(await getText(prisma, 'bot.daily.open'), config.publicUrl);
  if (await sendSafe(bot, prisma, user, text, kb)) {
    await markSent(prisma, user.id, 'daily', date);
  }
}

/** Подтверждение начала месячных (§4.3). */
async function sendPeriodConfirm(prisma: PrismaClient, bot: Bot, user: User, date: string): Promise<void> {
  if (user.cycleMode !== 'tracked' || !user.cycleStartDate) return;
  if (user.periodAskCount >= 3) return; // дальше ждём ручную отметку в Mini App
  if (await alreadySent(prisma, user.id, 'period_confirm', date)) return;

  const state = userCycleState(user);
  const { cycleDay } = resolveCycle(date, state);
  const startISO = user.cycleStartDate.toISOString().slice(0, 10);
  const confirmedToday = startISO === date; // только что подтвердила — не спрашиваем

  // Первый вопрос — за день до расчётной даты или в расчётный день.
  const firstAsk =
    user.periodAskCount === 0 && (cycleDay === user.cycleLength || (cycleDay === 1 && !confirmedToday));
  // Повтор — не чаще раза в 2 дня, максимум до 3 вопросов суммарно (§4.3).
  const isRetry =
    user.periodAskCount > 0 &&
    user.periodAskCount < 3 &&
    !!user.periodAskLastAt &&
    Date.now() - user.periodAskLastAt.getTime() >= 2 * 86_400_000;

  if (!firstAsk && !isRetry) return;

  const kb = periodQuestionKeyboard({
    today: await getText(prisma, 'bot.period.today'),
    yesterday: await getText(prisma, 'bot.period.yesterday'),
    beforeYesterday: await getText(prisma, 'bot.period.before_yesterday'),
    notYet: await getText(prisma, 'bot.period.not_yet'),
  });
  if (await sendSafe(bot, prisma, user, await getText(prisma, 'bot.period.question'), kb)) {
    await markSent(prisma, user.id, 'period_confirm', date);
    // Счётчик вопросов растёт при ОТПРАВКЕ (а не при ответе) — иначе игнор ⇒ вечный спам.
    await prisma.user.update({
      where: { id: user.id },
      data: { periodAskCount: { increment: 1 }, periodAskLastAt: new Date() },
    });
  }
}

/** Подписочные уведомления (§4.4). */
async function sendSubscriptionNudges(prisma: PrismaClient, bot: Bot, user: User, date: string): Promise<void> {
  const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
  if (!sub) return;
  const now = new Date();

  // За 2 дня до конца триала
  if (sub.status === 'trial' && sub.trialEndsAt) {
    const daysLeft = Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / 86_400_000);
    if (daysLeft === 2 && !(await alreadySent(prisma, user.id, 'trial_ending', date))) {
      const text = await getText(prisma, 'bot.trial.ending', {
        date: DateTime.fromJSDate(sub.trialEndsAt).setZone(user.timezone).toFormat('dd.MM'),
      });
      const kb = new InlineKeyboard().webApp(
        await getText(prisma, 'bot.trial.button'),
        `${config.publicUrl}/paywall`,
      );
      if (await sendSafe(bot, prisma, user, text, kb)) {
        await markSent(prisma, user.id, 'trial_ending', date);
      }
    }
  }

  // Win-back через 7 дней после истечения, привязан к фазе завтрашнего дня
  if (sub.status === 'expired') {
    const expiredAt = sub.currentPeriodEndsAt ?? sub.trialEndsAt;
    if (!expiredAt) return;
    const daysSince = Math.floor((now.getTime() - expiredAt.getTime()) / 86_400_000);
    if (daysSince === 7 && !(await alreadySent(prisma, user.id, 'winback', date))) {
      const tomorrow = resolveCycle(addDays(date, 1), userCycleState(user));
      const text = await getText(prisma, 'bot.winback', {
        phase: PHASE_NAMES_RU[tomorrow.phase].toLowerCase(),
      });
      const kb = new InlineKeyboard().webApp(
        await getText(prisma, 'bot.trial.button'),
        `${config.publicUrl}/paywall`,
      );
      if (await sendSafe(bot, prisma, user, text, kb)) {
        await markSent(prisma, user.id, 'winback', date);
      }
    }
  }
}

/** Ежечасный тик: батчами по пользовательницам, чей локальный час совпал с notifyHourLocal. */
export async function hourlyNotificationsTick(
  prisma: PrismaClient,
  bot: Bot,
  now: Date = new Date(),
): Promise<void> {
  const batchSize = 200;
  let cursor: string | undefined;

  for (;;) {
    const users: User[] = await prisma.user.findMany({
      where: { onboardingCompletedAt: { not: null }, botBlocked: false },
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (users.length === 0) break;
    cursor = users[users.length - 1].id;

    for (const user of users) {
      if (localHour(user, now) !== user.notifyHourLocal) continue;
      const date = todayISO(user.timezone, now);
      try {
        const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
        const hasAccess = subscriptionInfo(sub, now).hasAccess;
        if (hasAccess) await sendDaily(prisma, bot, user, date);
        await sendPeriodConfirm(prisma, bot, user, date);
        await sendSubscriptionNudges(prisma, bot, user, date);
      } catch (err) {
        console.error(`notification tick failed for user ${user.id}`, err);
      }
    }
    if (users.length < batchSize) break;
  }
}

/** Ежедневный перевод подписок: trial→expired, active→expired (§7). */
export async function expireSubscriptionsTick(prisma: PrismaClient, now: Date = new Date()): Promise<void> {
  await prisma.subscription.updateMany({
    where: { status: 'trial', trialEndsAt: { lt: now } },
    data: { status: 'expired' },
  });
  await prisma.subscription.updateMany({
    where: { status: 'active', currentPeriodEndsAt: { lt: now } },
    data: { status: 'expired' },
  });
}
