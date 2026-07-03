# CycleFit — Telegram Mini App: циклический фитнес для женщин

Тренировки 15–30 минут дома, адаптированные под фазу менструального цикла.
Monorepo: backend (Fastify + Prisma + grammY), Mini App (React + Tailwind), админка (React-Admin).

## Стек

| Компонент | Технология |
|---|---|
| Backend | Node.js 20+, TypeScript, Fastify, Prisma, PostgreSQL 15+ |
| Бот | grammY (webhook), node-cron для рассылок |
| Mini App | React 18 + Vite + Tailwind CSS + @telegram-apps/sdk |
| Admin | React-Admin |
| Деплой | Docker Compose (postgres, backend, nginx) |

## Быстрый старт (dev)

```bash
cp .env.example .env          # заполни TELEGRAM_BOT_TOKEN и секреты
pnpm install
pnpm --filter @cyclefit/backend prisma:generate

# PostgreSQL: docker compose up -d postgres (или локальный)
pnpm --filter @cyclefit/backend exec prisma migrate dev

pnpm seed                     # демо-контент: 72 тренировки на 36 слотов, тексты, админ
pnpm dev:backend              # API на :3000
pnpm dev:miniapp              # Mini App на :5173 (проксирует /api)
pnpm dev:admin                # Админка на :5174/admin/
```

В dev без Telegram поставь `DEV_AUTH_BYPASS=true` — Mini App авторизуется мок-пользователем.
Админка: логин/пароль из `ADMIN_EMAIL` / `ADMIN_PASSWORD` (создаётся сидом).

## Продакшен

```bash
cp .env.example .env          # PUBLIC_URL=https://твой-домен, DEV_AUTH_BYPASS=false
pnpm install && pnpm --filter @cyclefit/miniapp build && pnpm --filter @cyclefit/admin build
docker compose up -d          # postgres + backend (мигрирует сам) + nginx на :8080
docker compose exec backend pnpm seed
```

nginx отдаёт Mini App на `/`, админку на `/admin`, проксирует `/api` и `/uploads`.
Нужен HTTPS (Telegram требует) — поставь перед nginx любой TLS-терминатор или доверь это платформе.

## Настройка бота (BotFather)

1. `/newbot` → получи токен → положи в `TELEGRAM_BOT_TOKEN`.
2. `/setmenubutton` → выбери бота → укажи URL Mini App (`https://твой-домен`) и подпись («Открыть»).
3. Webhook регистрируется автоматически при старте backend, если `PUBLIC_URL` начинается с `https://`
   (эндпоинт `POST /api/webhooks/telegram`, защищён `TELEGRAM_WEBHOOK_SECRET`).

## Тесты

```bash
pnpm test        # юнит (модуль цикла, подбор) + API smoke (нужен Postgres + сид)
pnpm typecheck
```

## Структура

```
apps/backend    Fastify API, Prisma-схема, бот, кроны, seed/
apps/miniapp    Mini App (онбординг, «Сегодня», календарь, плеер, профиль, пейвол)
apps/admin      React-Admin (упражнения, тренировки, матрица слотов, тексты, пользователи)
packages/shared общие типы API
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
- **Рассылки**: ежечасный cron, отправка в `notifyHourLocal` таймзоны пользовательницы,
  идемпотентность через `NotificationLog`, 403 от Telegram → `botBlocked`.

## Приватность

Данные цикла — чувствительные: не логируются, не попадают в список пользователей админки.
Дисклеймер с фиксацией согласия обязателен в онбординге. Это wellness-продукт, не медицинский сервис.
