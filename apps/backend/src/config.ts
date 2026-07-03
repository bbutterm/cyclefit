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

export const config = {
  port: num('PORT', 3000),
  publicUrl: (process.env.PUBLIC_URL ?? 'http://localhost:8080').replace(/\/$/, ''),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret',
  botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? 'dev-webhook-secret',
  adminEmail: process.env.ADMIN_EMAIL ?? 'admin@cyclefit.local',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'admin12345',
  paymentsMode: (process.env.PAYMENTS_MODE ?? 'stub') as 'stub' | 'real',
  trialDays: num('TRIAL_DAYS', 7),
  prices: {
    monthly: num('PRICE_MONTHLY', 499),
    quarterly: num('PRICE_QUARTERLY', 1190),
    yearly: num('PRICE_YEARLY', 3590),
  },
  devAuthBypass: process.env.DEV_AUTH_BYPASS === 'true',
  uploadsDir: resolve(process.cwd(), 'uploads'),
};
