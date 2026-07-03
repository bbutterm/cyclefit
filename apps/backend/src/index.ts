import cron from 'node-cron';
import { buildApp } from './app.js';
import { createBot } from './bot/bot.js';
import { expireSubscriptionsTick, hourlyNotificationsTick } from './bot/notifications.js';
import { config } from './config.js';
import { prisma } from './prisma.js';

async function main(): Promise<void> {
  const app = buildApp({ prisma });
  const bot = createBot(prisma);

  if (bot) {
    // init с таймаутом: недоступность Telegram API не должна блокировать запуск API
    await Promise.race([
      bot.init(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('bot init timeout')), 8000)),
    ]).catch((err) => {
      app.log.warn({ err: String(err) }, 'bot init failed — продолжаем без него');
    });

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
        await bot.handleUpdate(update as never);
      } catch (err) {
        app.log.error({ err }, 'bot update failed');
      }
      return reply.send({ ok: true });
    });

    // Рассылки: ежечасно в :05 (по таймзонам пользовательниц, §4.2)
    cron.schedule('5 * * * *', () => {
      hourlyNotificationsTick(prisma, bot).catch((err) => app.log.error({ err }, 'notifications tick failed'));
    });
  } else {
    app.log.warn('TELEGRAM_BOT_TOKEN не задан — бот выключен');
  }

  // Истечение подписок: ежедневно в 03:10 UTC + при старте (§7)
  cron.schedule('10 3 * * *', () => {
    expireSubscriptionsTick(prisma).catch((err) => app.log.error({ err }, 'expire tick failed'));
  });
  await expireSubscriptionsTick(prisma).catch(() => {});

  await app.listen({ port: config.port, host: '0.0.0.0' });

  // Регистрация вебхука Telegram (если задан публичный URL)
  if (bot && config.publicUrl.startsWith('https://') && !config.publicUrl.includes('example.com')) {
    await bot.api
      .setWebhook(`${config.publicUrl}/api/webhooks/telegram`, {
        secret_token: config.webhookSecret,
        drop_pending_updates: false,
      })
      .then(() => app.log.info('telegram webhook зарегистрирован'))
      .catch((err) => app.log.warn({ err: String(err) }, 'не удалось зарегистрировать webhook'));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
