import type {
  CalendarDay,
  CheckoutResponse,
  LogWorkoutRequest,
  MeResponse,
  PlansResponse,
  StatsResponse,
  TodayResponse,
  UpdateMeRequest,
  WorkoutDto,
} from '@cyclefit/shared';
import { getInitDataRaw } from './telegram';

let token: string | null = sessionStorage.getItem('cf_token');

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

let authInFlight: Promise<void> | null = null;

// Single-flight: параллельные запросы (StrictMode, несколько экранов) ждут одну авторизацию,
// а не запускают несколько /api/auth/telegram одновременно.
function authenticate(): Promise<void> {
  authInFlight ??= doAuthenticate().finally(() => {
    authInFlight = null;
  });
  return authInFlight;
}

async function doAuthenticate(): Promise<void> {
  const initData = getInitDataRaw();
  const body: Record<string, unknown> = {};
  if (initData) {
    body.initData = initData;
  } else if (import.meta.env.DEV) {
    // dev-режим вне Telegram (требует DEV_AUTH_BYPASS=true на backend)
    const stored = localStorage.getItem('cf_dev_id');
    const id = stored ? Number(stored) : Math.floor(Math.random() * 1_000_000) + 900_000_000;
    localStorage.setItem('cf_dev_id', String(id));
    body.devUser = { id, firstName: 'Dev' };
  } else {
    throw new ApiError(401, 'no_telegram_context');
  }

  const res = await fetch('/api/auth/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, 'auth_failed');
  token = (await res.json()).token;
  sessionStorage.setItem('cf_token', token!);
}

/** Запрос с ретраями сетевых ошибок и повторной авторизацией на 401 (§11 этап 8). */
async function request<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  if (!token) await authenticate();

  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
  } catch (err) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      return request(path, init, attempt + 1);
    }
    throw err;
  }

  if (res.status === 401 && attempt < 2) {
    token = null;
    sessionStorage.removeItem('cf_token');
    return request(path, init, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? 'request_failed');
  }
  return res.json();
}

export const api = {
  me: () => request<MeResponse>('/api/me'),
  updateMe: (data: UpdateMeRequest) =>
    request<MeResponse>('/api/me', { method: 'PUT', body: JSON.stringify(data) }),
  periodStart: (date: string) =>
    request<MeResponse>('/api/me/cycle/period-start', { method: 'POST', body: JSON.stringify({ date }) }),
  today: () => request<TodayResponse>('/api/today'),
  restToday: () => request<{ ok: boolean }>('/api/today/rest', { method: 'POST', body: '{}' }),
  calendar: (month: string) => request<{ month: string; days: CalendarDay[] }>(`/api/calendar?month=${month}`),
  workout: (id: string) => request<WorkoutDto>(`/api/workouts/${id}`),
  logWorkout: (id: string, data: LogWorkoutRequest) =>
    request<{ ok: boolean; streak: number }>(`/api/workouts/${id}/log`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  stats: () => request<StatsResponse>('/api/stats'),
  plans: () => request<PlansResponse>('/api/plans'),
  checkout: (plan: string) =>
    request<CheckoutResponse>('/api/subscription/checkout', { method: 'POST', body: JSON.stringify({ plan }) }),
};
