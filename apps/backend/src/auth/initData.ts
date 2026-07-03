import { createHmac, timingSafeEqual } from 'node:crypto';

// Валидация Telegram WebApp initData (HMAC-SHA-256, стандартный алгоритм):
// secret_key = HMAC_SHA256(key="WebAppData", data=bot_token)
// hash = hex(HMAC_SHA256(key=secret_key, data=data_check_string))
// data_check_string — пары key=value (кроме hash), отсортированные по ключу, через \n.

export interface TelegramInitUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface ValidatedInitData {
  user: TelegramInitUser;
  authDate: number;
}

const MAX_AGE_SECONDS = 24 * 60 * 60;

export function validateInitData(
  initData: string,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): ValidatedInitData | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }

  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || nowSeconds - authDate > MAX_AGE_SECONDS) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;
  try {
    const user = JSON.parse(userRaw) as TelegramInitUser;
    if (!user || typeof user.id !== 'number') return null;
    return { user, authDate };
  } catch {
    return null;
  }
}
