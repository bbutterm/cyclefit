import { config } from '../src/config.js';

// Регистрирует webhook Telegram для PUBLIC_URL (запускать после деплоя на Vercel):
//   pnpm --filter @cyclefit/backend webhook:set

async function main(): Promise<void> {
  if (!config.botToken) throw new Error('TELEGRAM_BOT_TOKEN не задан');
  if (!config.publicUrl.startsWith('https://')) throw new Error('PUBLIC_URL должен быть https://');

  const url = `${config.publicUrl}/api/webhooks/telegram`;
  const res = await fetch(`https://api.telegram.org/bot${config.botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, secret_token: config.webhookSecret }),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`setWebhook failed: ${JSON.stringify(body)}`);
  console.log(`✓ Webhook зарегистрирован: ${url}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
