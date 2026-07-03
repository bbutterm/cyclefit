# CycleFit — Telegram Mini App: циклический фитнес для женщин

Тренировки 15–30 минут дома, адаптированные под фазу менструального цикла.
Monorepo: backend (Fastify + Prisma + grammY), Mini App (React + Tailwind), админка (React-Admin).

**Целевая архитектура: Vercel (фронты + serverless API + cron) · Supabase (Postgres + Storage) · Telegram (бот + Mini App).**

## Стек

| Компонент | Технология |
|---|---|
| Backend | Node.js 20+, TypeScript, Fastify (serverless-функция на Vercel), Prisma |
| БД | Supabase Postgres (локально — любой PostgreSQL 15+) |
| Картинки | Supabase Storage (локально — папка `uploads/`) |
| Бот | grammY (webhook), рассылки через Vercel Cron |
| Mini App | React 18 + Vite + Tailwind CSS + @telegram-apps/sdk |
| Admin | React-Admin |

---

## Деплой: пошагово

### Шаг 1. Supabase

1. Создай проект на [supabase.com](https://supabase.com) (регион ближе к пользователям, например `eu-central-1`).
2. **Строки подключения**: Project Settings → Database → Connection string:
   - **Transaction pooler** (порт `6543`) → это `DATABASE_URL`, допиши в конец `?pgbouncer=true&connection_limit=1`;
   - **Direct connection** (порт `5432`) → это `DIRECT_URL`.
3. **Ключи API**: Project Settings → API:
   - `Project URL` → это `SUPABASE_URL`;
   - `service_role` ключ → это `SUPABASE_SERVICE_KEY` (секретный, только для backend).
4. **Storage**: Storage → New bucket → имя `exercise-images`, включи **Public bucket**.

### Шаг 2. Миграции и сид (один раз, локально)

```bash
pnpm install
cp .env.example .env    # заполни DATABASE_URL, DIRECT_URL, SUPABASE_*, TELEGRAM_BOT_TOKEN, ADMIN_*
pnpm --filter @cyclefit/backend prisma:generate
pnpm --filter @cyclefit/backend prisma:migrate     # применяет миграции к Supabase
pnpm seed                                          # 72 тренировки, контент, тексты, админ; SVG → Storage
```

### Шаг 3. Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → импортируй этот репозиторий.
2. Настройки проекта (обычно подхватываются из `vercel.json` автоматически, проверь):
   - **Framework Preset**: `Other`;
   - **Root Directory**: корень репозитория (не менять);
   - **Build Command**: `pnpm build:vercel`;
   - **Output Directory**: `public`;
   - **Install Command**: `pnpm install`.
3. **Settings → Environment Variables** — добавь (Production + Preview):

   | Переменная | Что вставить |
   |---|---|
   | `DATABASE_URL` | pooler-строка Supabase (порт 6543, с `?pgbouncer=true&connection_limit=1`) |
   | `DIRECT_URL` | прямая строка Supabase (порт 5432) |
   | `SUPABASE_URL` | Project URL из Supabase |
   | `SUPABASE_SERVICE_KEY` | ключ `service_role` |
   | `SUPABASE_BUCKET` | `exercise-images` |
   | `TELEGRAM_BOT_TOKEN` | токен от @BotFather |
   | `TELEGRAM_WEBHOOK_SECRET` | случайная строка (например `openssl rand -hex 16`) |
   | `JWT_SECRET` | случайная длинная строка |
   | `CRON_SECRET` | случайная строка — Vercel Cron сам шлёт её в `Authorization` |
   | `PUBLIC_URL` | `https://<твой-проект>.vercel.app` (или свой домен) |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | логин админки (как в сиде) |
   | `PAYMENTS_MODE` | `stub` |
   | `TRIAL_DAYS` | `7` |
   | `PRICE_MONTHLY` / `PRICE_QUARTERLY` / `PRICE_YEARLY` | `499` / `1190` / `3590` |
   | `DEV_AUTH_BYPASS` | `false` |

4. **Deploy**. После деплоя: Mini App — `https://домен/`, админка — `https://домен/admin`, API — `https://домен/api/health`.
5. **Cron**: `vercel.json` объявляет два крона (`/api/cron/hourly` ежечасно — рассылки, `/api/cron/daily` — истечение подписок). ⚠️ На плане **Hobby** Vercel запускает крон не чаще раза в день — для ежечасных рассылок нужен план Pro **или** бесплатный внешний пингер (например cron-job.org): дёргать `GET https://домен/api/cron/hourly` каждый час с заголовком `Authorization: Bearer <CRON_SECRET>`.

### Шаг 4. Telegram

```bash
# регистрирует webhook на PUBLIC_URL (переменные берёт из .env)
pnpm --filter @cyclefit/backend webhook:set
```

В @BotFather: `/setmenubutton` → выбери бота → URL `https://<домен>` → подпись «Открыть».
Готово: `/start` в боте → кнопка открывает Mini App.

---

## Локальная разработка

```bash
docker compose up -d postgres          # или локальный Postgres
cp .env.example .env                   # DEV_AUTH_BYPASS=true, DATABASE_URL/DIRECT_URL на localhost
pnpm install && pnpm --filter @cyclefit/backend prisma:generate
pnpm --filter @cyclefit/backend exec prisma migrate dev
pnpm seed
pnpm dev:backend       # API :3000 (долгоживущий сервер + node-cron)
pnpm dev:miniapp       # Mini App :5173
pnpm dev:admin         # Админка :5174/admin/
```

`DEV_AUTH_BYPASS=true` позволяет открывать Mini App в браузере без Telegram.
Docker Compose с nginx остаётся как запасной self-hosted вариант (`docker compose up -d`).

## Тесты

```bash
pnpm test        # 77 тестов: юнит (цикл, подбор) + API smoke (нужен Postgres + сид)
pnpm typecheck
```

## Структура

```
api/index.ts    serverless-вход Vercel (весь Fastify через одну функцию)
apps/backend    Fastify API, Prisma-схема, бот, cron-эндпоинты, seed/
apps/miniapp    Mini App (онбординг, «Сегодня», календарь, плеер, профиль, пейвол)
apps/admin      React-Admin (упражнения, тренировки, матрица слотов, тексты, пользователи)
packages/shared общие типы API
vercel.json     сборка, rewrites (/, /admin, /api), крон-расписания
```

## Ключевая логика

- **Фазы** (`apps/backend/src/domain/cycle.ts`): `ovulation_day = L − 14`; menstrual 1…P,
  follicular P+1…ov−2, ovulatory ov−1…ov+1, luteal ov+2…L. Режим `no_cycle` — 4-недельная волна.
- **Тренировка дня** (`src/services/workout-service.ts`): слот `(фаза, уровень, инвентарь)`,
  ротация по «дольше всего не показывалась», фолбэк инвентаря/уровня, закрепление за датой.
- **Противопоказания**: конфликтные упражнения заменяются альтернативой той же группы мышц,
  иначе пропускаются с заметкой.
- **Подписка**: триал 7 дней с онбординга; `expired` — календарь фаз остаётся, тренировки под пейволом.
  Платежи — заглушка (`PAYMENTS_MODE=stub`), интерфейс `PaymentProvider` готов под ЮKassa/Stars.
- **Рассылки**: `/api/cron/hourly` с учётом таймзоны каждой пользовательницы,
  идемпотентность через `NotificationLog`, 403 от Telegram → `botBlocked`.

## Приватность

Данные цикла — чувствительные: не логируются, не попадают в список пользователей админки.
Дисклеймер с фиксацией согласия обязателен в онбординге. Это wellness-продукт, не медицинский сервис.
