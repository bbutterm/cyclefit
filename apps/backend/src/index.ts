import cron from 'node-cron';
import { expireSubscriptionsTick, hourlyNotificationsTick } from './bot/notifications.js';
import { config } from './config.js';
import { prisma } from './prisma.js';
import { buildFullApp } from './server.js';

// Долгоживущий сервер (Docker/VPS/локальная разработка).
// Для Vercel вместо этого используется api/index.ts + Vercel Cron.

async function main(): Promise<void> {
  const { app, bot } = buildFullApp(prisma);

  if (bot) {
    // init с таймаутом: недоступность Telegram API не должна блокировать запуск API
    await Promise.race([
      bot.init(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('bot init timeout')), 8000)),
    ]).catch((err) => {
      app.log.warn({ err: String(err) }, 'bot init failed — продолжаем без него');
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
