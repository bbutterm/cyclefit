import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// .env ищем в apps/backend, затем в корне монорепо
for (const p of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(p)) {
    loadEnv({ path: p });
    break;
  }
}

function num(name: string, def: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : def;
  return Number.isFinite(n) ? n : def;
}

const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

/** В проде секрет обязателен; в dev допускается дефолт. */
function requiredSecret(name: string, devDefault: string): string {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  if (isProd) {
    throw new Error(`${name} не задан — обязателен в production (fail-fast, безопасность)`);
  }
  return devDefault;
}

export const config = {
  port: num('PORT', 3000),
  publicUrl: (process.env.PUBLIC_URL ?? 'http://localhost:8080').replace(/\/$/, ''),
  jwtSecret: requiredSecret('JWT_SECRET', 'dev-secret'),
  botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  webhookSecret: requiredSecret('TELEGRAM_WEBHOOK_SECRET', 'dev-webhook-secret'),
  adminEmail: process.env.ADMIN_EMAIL ?? 'admin@cyclefit.local',
  adminPassword: requiredSecret('ADMIN_PASSWORD', 'admin12345'),
  isProd,
  paymentsMode: (process.env.PAYMENTS_MODE ?? 'stub') as 'stub' | 'real',
  trialDays: num('TRIAL_DAYS', 7),
  prices: {
    monthly: num('PRICE_MONTHLY', 499),
    quarterly: num('PRICE_QUARTERLY', 1190),
    yearly: num('PRICE_YEARLY', 3590),
  },
  devAuthBypass: process.env.DEV_AUTH_BYPASS === 'true',
  uploadsDir: resolve(process.cwd(), 'uploads'),
  // Supabase Storage для картинок упражнений (если не задан — локальная папка uploads/)
  supabaseUrl: (process.env.SUPABASE_URL ?? '').replace(/\/$/, ''),
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY ?? '',
  supabaseBucket: process.env.SUPABASE_BUCKET ?? 'exercise-images',
  // Секрет cron-эндпоинтов (Vercel Cron шлёт Authorization: Bearer $CRON_SECRET)
  cronSecret: process.env.CRON_SECRET ?? '',
};
