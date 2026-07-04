import type { MeResponse, Restriction } from '@cyclefit/shared';
import type { PrismaClient, User } from '@prisma/client';
import { config } from '../config.js';
import { cycleTodayFor, dateToISO } from '../domain/user-cycle.js';
import { subscriptionInfo } from '../domain/subscription.js';

export async function getOrCreateUser(
  prisma: PrismaClient,
  tg: { id: number | bigint; username?: string | null; firstName?: string | null },
): Promise<User> {
  const telegramId = BigInt(tg.id);
  // upsert — идемпотентно при параллельных вызовах (StrictMode double-mount, две вкладки).
  // update: {} — существующую запись не трогаем (профиль правится через /api/me).
  return prisma.user.upsert({
    where: { telegramId },
    create: {
      telegramId,
      username: tg.username ?? null,
      firstName: tg.firstName ?? null,
    },
    update: {},
  });
}

export async function startTrialIfNone(prisma: PrismaClient, userId: string): Promise<void> {
  const existing = await prisma.subscription.findUnique({ where: { userId } });
  if (existing && existing.status !== 'none') return;
  const trialEndsAt = new Date(Date.now() + config.trialDays * 86_400_000);
  await prisma.subscription.upsert({
    where: { userId },
    create: { userId, status: 'trial', trialEndsAt },
    update: { status: 'trial', trialEndsAt },
  });
}

export async function toMeResponse(prisma: PrismaClient, user: User): Promise<MeResponse> {
  const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
  const onboardingCompleted = !!user.onboardingCompletedAt;
  return {
    id: user.id,
    telegramId: user.telegramId.toString(),
    firstName: user.firstName,
    level: user.level,
    equipment: user.equipment,
    goal: user.goal,
    restrictions: user.restrictions as Restriction[],
    cycleMode: user.cycleMode,
    cycleStartDate: user.cycleStartDate ? dateToISO(user.cycleStartDate) : null,
    cycleLength: user.cycleLength,
    periodLength: user.periodLength,
    timezone: user.timezone,
    notifyHourLocal: user.notifyHourLocal,
    onboardingCompleted,
    subscription: subscriptionInfo(sub),
    today: onboardingCompleted ? cycleTodayFor(user) : null,
  };
}
