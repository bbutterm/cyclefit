import type { PrismaClient } from '@prisma/client';
import type { Bot } from 'grammy';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { createBot } from './bot/bot.js';
import { expireSubscriptionsTick, hourlyNotificationsTick } from './bot/notifications.js';
import { config } from './config.js';

// Полное приложение: API + вебхук Telegram + cron-эндпоинты.
// Используется и долгоживущим сервером (index.ts), и serverless-функцией Vercel (api/index.ts).

export interface FullApp {
  app: FastifyInstance;
  bot: Bot | null;
}

export function buildFullApp(prisma: PrismaClient, logger = true): FullApp {
  const app = buildApp({ prisma, logger });
  const bot = createBot(prisma);

  if (bot) {
    // Идемпотентная обработка телеграм-апдейтов (§4.5): update_id фиксируется до обработки
    app.post('/api/webhooks/telegram', async (req, reply) => {
      const secret = req.headers['x-telegram-bot-api-secret-token'];
      if (secret !== config.webhookSecret) return reply.code(401).send();

      const update = req.body as { update_id?: number };
      if (typeof update?.update_id !== 'number') return reply.code(400).send();
      try {
        await prisma.processedUpdate.create({ data: { updateId: BigInt(update.update_id) } });
      } catch {
        return reply.send({ ok: true }); // дубликат — уже обработан
      }
      try {
        if (!bot.isInited()) await bot.init();
        await bot.handleUpdate(update as never);
      } catch (err) {
        app.log.error({ err }, 'bot update failed');
      }
      return reply.send({ ok: true });
    });
  }

  // --- Cron-эндпоинты (Vercel Cron или внешний пингер) ---
  const cronGuard = async (req: { headers: Record<string, unknown> }, reply: { code: (n: number) => { send: (b?: unknown) => unknown } }) => {
    if (!config.cronSecret) return reply.code(503).send({ error: 'cron_secret_not_configured' });
    if (req.headers.authorization !== `Bearer ${config.cronSecret}`) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  };

  // Ежечасно: утренние сообщения по таймзонам, подтверждение месячных, подписочные уведомления
  app.get('/api/cron/hourly', { preHandler: [cronGuard as never] }, async () => {
    if (bot) {
      if (!bot.isInited()) await bot.init();
      await hourlyNotificationsTick(prisma, bot);
    }
    await expireSubscriptionsTick(prisma);
    return { ok: true };
  });

  // Ежедневно: перевод подписок trial/active → expired (§7)
  app.get('/api/cron/daily', { preHandler: [cronGuard as never] }, async () => {
    await expireSubscriptionsTick(prisma);
    return { ok: true };
  });

  return { app, bot };
}
