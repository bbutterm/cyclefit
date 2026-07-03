import type { PrismaClient, User } from '@prisma/client';
import { Bot, InlineKeyboard } from 'grammy';
import { config } from '../config.js';
import { addDays } from '../domain/dates.js';
import { cycleTodayFor, todayISO } from '../domain/user-cycle.js';
import { getOrCreateUser } from '../services/user-service.js';
import { dateFromISO, replaceWithEasyWorkout } from '../services/workout-service.js';
import { getText } from '../texts.js';

export function createBot(prisma: PrismaClient): Bot | null {
  if (!config.botToken) return null;
  const bot = new Bot(config.botToken);

  const webAppKeyboard = (text: string, path = '') =>
    new InlineKeyboard().webApp(text, `${config.publicUrl}${path}`);

  // Онбординг (§4.1): одно тёплое сообщение + кнопка WebApp, опросник — в Mini App
  bot.command('start', async (ctx) => {
    if (!ctx.from) return;
    await getOrCreateUser(prisma, {
      id: ctx.from.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
    });
    await ctx.reply(await getText(prisma, 'bot.welcome'), {
      reply_markup: webAppKeyboard(await getText(prisma, 'bot.welcome.button')),
    });
  });

  async function userFromCallback(ctx: { from?: { id: number } }): Promise<User | null> {
    if (!ctx.from) return null;
    return prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
  }

  async function saveCheckin(userId: string, date: string, mood: 'good' | 'ok' | 'bad') {
    await prisma.dailyCheckin.upsert({
      where: { userId_date: { userId, date: dateFromISO(date) } },
      create: { userId, date: dateFromISO(date), mood },
      update: { mood },
    });
  }

  // Чекин самочувствия (§4.2)
  bot.callbackQuery(/^mood:(good|ok|bad)$/, async (ctx) => {
    const mood = ctx.match[1] as 'good' | 'ok' | 'bad';
    const user = await userFromCallback(ctx);
    if (!user) return ctx.answerCallbackQuery();
    const date = todayISO(user.timezone);
    await saveCheckin(user.id, date, mood);

    if (mood === 'bad') {
      // 🥱 «тяжело» → замена на мягкую практику (§3.2 п.4, §4.2)
      const replaced = await replaceWithEasyWorkout(prisma, user, date);
      if (replaced) {
        const workout = await prisma.workout.findUnique({ where: { id: replaced.workoutId } });
        await ctx.reply(
          await getText(prisma, 'bot.mood.bad', {
            workout: workout?.title ?? 'мягкая практика',
            min: workout?.durationMin ?? 15,
          }),
          { reply_markup: webAppKeyboard(await getText(prisma, 'bot.daily.open')) },
        );
      } else {
        await ctx.reply(await getText(prisma, 'bot.mood.bad.noworkout'));
      }
    } else {
      await ctx.reply(await getText(prisma, mood === 'good' ? 'bot.mood.good' : 'bot.mood.ok'));
    }
    await ctx.answerCallbackQuery();
  });

  // Подтверждение начала месячных (§4.3)
  bot.callbackQuery(/^period:(today|yesterday|before_yesterday|not_yet)$/, async (ctx) => {
    const answer = ctx.match[1];
    const user = await userFromCallback(ctx);
    if (!user) return ctx.answerCallbackQuery();

    if (answer === 'not_yet') {
      await prisma.user.update({
        where: { id: user.id },
        data: { periodAskCount: { increment: 1 }, periodAskLastAt: new Date() },
      });
      await ctx.reply(await getText(prisma, 'bot.period.not_yet.reply'));
    } else {
      const today = todayISO(user.timezone);
      const offset = answer === 'today' ? 0 : answer === 'yesterday' ? -1 : -2;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          cycleStartDate: dateFromISO(addDays(today, offset)),
          cycleMode: 'tracked',
          periodAskCount: 0,
          periodAskLastAt: null,
        },
      });
      await prisma.dailyCheckin.upsert({
        where: { userId_date: { userId: user.id, date: dateFromISO(today) } },
        create: { userId: user.id, date: dateFromISO(today), periodStartedConfirmed: true },
        update: { periodStartedConfirmed: true },
      });
      await ctx.reply(await getText(prisma, 'bot.period.confirmed'));
    }
    await ctx.answerCallbackQuery();
  });

  return bot;
}

/** Отправка с обработкой блокировки бота (403 → botBlocked, §11 этап 6). */
export async function sendSafe(
  bot: Bot,
  prisma: PrismaClient,
  user: { id: string; telegramId: bigint },
  text: string,
  replyMarkup?: InlineKeyboard,
): Promise<boolean> {
  try {
    await bot.api.sendMessage(user.telegramId.toString(), text, {
      reply_markup: replyMarkup,
    });
    return true;
  } catch (err: unknown) {
    const code = (err as { error_code?: number }).error_code;
    if (code === 403) {
      await prisma.user.update({ where: { id: user.id }, data: { botBlocked: true } });
    }
    return false;
  }
}

export function periodQuestionKeyboard(texts: {
  today: string;
  yesterday: string;
  beforeYesterday: string;
  notYet: string;
}): InlineKeyboard {
  return new InlineKeyboard()
    .text(texts.today, 'period:today')
    .row()
    .text(texts.yesterday, 'period:yesterday')
    .text(texts.beforeYesterday, 'period:before_yesterday')
    .row()
    .text(texts.notYet, 'period:not_yet');
}

export function dailyKeyboard(openText: string, publicUrl: string): InlineKeyboard {
  return new InlineKeyboard()
    .webApp(openText, publicUrl)
    .row()
    .text('😄', 'mood:good')
    .text('😐', 'mood:ok')
    .text('🥱', 'mood:bad');
}

export { cycleTodayFor };
