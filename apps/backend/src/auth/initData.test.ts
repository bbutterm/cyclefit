import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateInitData } from './initData.js';

const BOT_TOKEN = '123456:TEST-TOKEN';

/** Эталонная сборка initData по алгоритму из документации Telegram. */
function buildInitData(fields: Record<string, string>, botToken = BOT_TOKEN): string {
  const dataCheckString = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const params = new URLSearchParams(fields);
  params.set('hash', hash);
  return params.toString();
}

const NOW = 1_750_000_000;

const validFields = {
  auth_date: String(NOW - 60),
  query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
  user: JSON.stringify({ id: 279058397, first_name: 'Анна', username: 'anna', language_code: 'ru' }),
};

describe('validateInitData', () => {
  it('принимает корректную подпись (эталонный пример)', () => {
    const initData = buildInitData(validFields);
    const result = validateInitData(initData, BOT_TOKEN, NOW);
    expect(result).not.toBeNull();
    expect(result!.user.id).toBe(279058397);
    expect(result!.user.first_name).toBe('Анна');
  });

  it('отклоняет подпись с чужим bot token', () => {
    const initData = buildInitData(validFields, 'другой:токен');
    expect(validateInitData(initData, BOT_TOKEN, NOW)).toBeNull();
  });

  it('отклоняет подделанные данные', () => {
    const initData = buildInitData(validFields);
    const tampered = initData.replace('279058397', '1');
    expect(validateInitData(tampered, BOT_TOKEN, NOW)).toBeNull();
  });

  it('отклоняет устаревший auth_date (> 24 ч)', () => {
    const initData = buildInitData({ ...validFields, auth_date: String(NOW - 25 * 3600) });
    expect(validateInitData(initData, BOT_TOKEN, NOW)).toBeNull();
  });

  it('отклоняет мусор и пустую строку', () => {
    expect(validateInitData('', BOT_TOKEN, NOW)).toBeNull();
    expect(validateInitData('hash=deadbeef', BOT_TOKEN, NOW)).toBeNull();
    expect(validateInitData('foo=bar', BOT_TOKEN, NOW)).toBeNull();
  });
});
