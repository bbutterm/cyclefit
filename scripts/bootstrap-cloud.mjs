// Одноразовая настройка облака (запускается в GitHub Actions, где открыта сеть):
//   1. Supabase: найти/создать проект, задать пароль БД, получить ключи, создать bucket
//   2. Vercel: найти/создать проект, залить env-переменные, задеплоить main, дождаться READY
//   3. Telegram: зарегистрировать webhook
//   4. GitHub: сохранить variable CRON_URL для cron-ping
// Секреты приходят через env (workflow inputs) и НЕ печатаются в лог.

import { createHash, randomBytes } from 'node:crypto';

const {
  SUPABASE_TOKEN,
  VERCEL_TOKEN,
  TELEGRAM_BOT_TOKEN,
  SUPABASE_PROJECT_REF,
  GITHUB_TOKEN,
  GITHUB_REPOSITORY,
} = process.env;

const REPO = GITHUB_REPOSITORY ?? 'bbutterm/cyclefit';

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

for (const [k, v] of Object.entries({ SUPABASE_TOKEN, VERCEL_TOKEN, TELEGRAM_BOT_TOKEN })) {
  if (!v) fail(`не задан ${k}`);
}

// Секреты приложения. Webhook/cron — детерминированные (выводятся из bot token),
// чтобы ссылки для ручной активации были известны заранее; JWT — случайный.
const derive = (salt) => createHash('sha256').update(`${TELEGRAM_BOT_TOKEN}:${salt}`).digest('hex').slice(0, 32);
const TELEGRAM_WEBHOOK_SECRET = derive('webhook');
const CRON_SECRET = derive('cron');
const JWT_SECRET = randomBytes(32).toString('hex');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || `cf-${randomBytes(6).toString('hex')}`;

async function call(url, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

const sup = (path, opts = {}) =>
  call(`https://api.supabase.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${SUPABASE_TOKEN}`, ...(opts.headers ?? {}) },
  });

const vc = (path, opts = {}) =>
  call(`https://api.vercel.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, ...(opts.headers ?? {}) },
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ---------- 1. Supabase ----------

async function setupSupabase() {
  console.log('=== Supabase ===');
  const list = await sup('/v1/projects');
  if (list.status !== 200) fail(`projects list: HTTP ${list.status} ${JSON.stringify(list.body)}`);
  console.log(`Найдено проектов: ${list.body.length} (${list.body.map((p) => `${p.name}[${p.id}] ${p.status}`).join(', ') || '—'})`);

  let project =
    (SUPABASE_PROJECT_REF && list.body.find((p) => p.id === SUPABASE_PROJECT_REF)) ||
    list.body.find((p) => /cycle/i.test(p.name)) ||
    list.body[0];

  const dbPassword = randomPassword();

  if (!project) {
    console.log('Проектов нет — создаю новый…');
    const orgs = await sup('/v1/organizations');
    if (orgs.status !== 200 || !orgs.body?.length) fail(`organizations: HTTP ${orgs.status}`);
    const created = await sup('/v1/projects', {
      method: 'POST',
      body: {
        name: 'cyclefit',
        organization_id: orgs.body[0].id,
        region: 'eu-central-1',
        db_pass: dbPassword,
      },
    });
    if (created.status >= 300) fail(`create project: HTTP ${created.status} ${JSON.stringify(created.body)}`);
    project = created.body;
    console.log(`Создан проект ${project.id}`);
  } else {
    console.log(`Использую проект: ${project.name} [${project.id}]`);
    // пароль БД неизвестен — сбрасываем на новый
    let reset = null;
    for (const method of ['PATCH', 'POST', 'PUT']) {
      reset = await sup(`/v1/projects/${project.id}/database/password`, {
        method,
        body: { password: dbPassword },
      });
      console.log(`reset password ${method}: HTTP ${reset.status}`);
      if (reset.status < 300) break;
    }
    if (!reset || reset.status >= 300) fail(`не удалось сбросить пароль БД: ${JSON.stringify(reset?.body)}`);
  }

  // ждём готовности
  for (let i = 0; i < 60; i++) {
    const p = await sup(`/v1/projects/${project.id}`);
    const status = p.body?.status;
    if (status === 'ACTIVE_HEALTHY') break;
    if (i === 59) fail(`проект не стал ACTIVE_HEALTHY (статус: ${status})`);
    console.log(`Статус проекта: ${status} — жду…`);
    await sleep(10_000);
  }

  const ref = project.id;
  const region = project.region ?? 'eu-central-1';
  const supabaseUrl = `https://${ref}.supabase.co`;

  // ключи API
  const keys = await sup(`/v1/projects/${ref}/api-keys?reveal=true`);
  if (keys.status !== 200) fail(`api-keys: HTTP ${keys.status} ${JSON.stringify(keys.body)}`);
  const serviceKey = keys.body.find((k) => k.name === 'service_role')?.api_key;
  if (!serviceKey) fail(`service_role ключ не найден (есть: ${keys.body.map((k) => k.name).join(', ')})`);
  console.log('Ключ service_role получен');

  // bucket для картинок
  const bucket = await call(`${supabaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${serviceKey}` },
    body: { id: 'exercise-images', name: 'exercise-images', public: true },
  });
  if (bucket.status < 300) console.log('Bucket exercise-images создан');
  else if (bucket.status === 409 || /already exists/i.test(JSON.stringify(bucket.body))) console.log('Bucket уже есть');
  else fail(`bucket: HTTP ${bucket.status} ${JSON.stringify(bucket.body)}`);

  // строки подключения через pooler (IPv4-совместимо)
  const pw = encodeURIComponent(dbPassword);
  const poolerHost = `aws-0-${region}.pooler.supabase.com`;
  const databaseUrl = `postgresql://postgres.${ref}:${pw}@${poolerHost}:6543/postgres?pgbouncer=true&connection_limit=1`;
  const directUrl = `postgresql://postgres.${ref}:${pw}@${poolerHost}:5432/postgres`;
  console.log(`Pooler: ${poolerHost} (пароль в лог не пишу)`);

  return { supabaseUrl, serviceKey, databaseUrl, directUrl };
}

// ---------- 2. Vercel ----------

async function setupVercel(supa) {
  console.log('=== Vercel ===');
  const list = await vc('/v9/projects');
  if (list.status !== 200) fail(`vercel projects: HTTP ${list.status} ${JSON.stringify(list.body)}`);
  const projects = list.body.projects ?? [];
  console.log(`Проектов: ${projects.length} (${projects.map((p) => p.name).join(', ') || '—'})`);

  // ВАЖНО: только точное совпадение привязанного репозитория — проекты с похожим
  // именем могут быть чужими (старый «cyclefit» указывал на другой репозиторий).
  let project = projects.find((p) => {
    const repo = p.link && `${p.link.org ?? p.link.owner ?? ''}/${p.link.repo ?? ''}`;
    return repo === REPO;
  });

  if (!project) {
    console.log(`Проекта, привязанного к ${REPO}, нет — создаю новый…`);
    for (const name of ['cyclefit-app', 'cyclefit-miniapp', `cyclefit-${Date.now() % 10000}`]) {
      const created = await vc('/v11/projects', {
        method: 'POST',
        body: { name, gitRepository: { type: 'github', repo: REPO } },
      });
      if (created.status < 300) {
        project = created.body;
        break;
      }
      console.log(`create ${name}: HTTP ${created.status} ${JSON.stringify(created.body).slice(0, 200)}`);
    }
    if (!project) fail('не удалось создать проект Vercel — проверь, что GitHub-репозиторий подключён к Vercel (vercel.com → Add New → Project должен видеть bbutterm/cyclefit)');
  }
  console.log(`Использую проект Vercel: ${project.name} [${project.id}]`);
  console.log(
    `Текущие настройки: framework=${project.framework ?? 'null'}, rootDirectory=${project.rootDirectory ?? 'null'}, buildCommand=${project.buildCommand ?? 'null'}, outputDirectory=${project.outputDirectory ?? 'null'}`,
  );

  // Сбрасываем переопределения дашборда (могли остаться от старого шаблона),
  // чтобы применялся vercel.json из репозитория
  const patched = await vc(`/v9/projects/${project.id}`, {
    method: 'PATCH',
    body: {
      framework: null,
      rootDirectory: null,
      buildCommand: null,
      outputDirectory: null,
      installCommand: null,
      devCommand: null,
    },
  });
  if (patched.status >= 300) {
    console.log(`настройки не сброшены: HTTP ${patched.status} ${JSON.stringify(patched.body).slice(0, 300)}`);
  } else {
    console.log('Настройки проекта сброшены (управление через vercel.json)');
  }

  // Реальный *.vercel.app-домен проекта (имя может быть занято → суффикс, напр. cyclefit-liard)
  let publicUrl = `https://${project.name}.vercel.app`;
  const domains = await vc(`/v9/projects/${project.id}/domains`);
  const vercelDomain = domains.body?.domains?.find((d) => d.name.endsWith('.vercel.app'))?.name;
  if (vercelDomain) publicUrl = `https://${vercelDomain}`;
  console.log(`Публичный домен: ${publicUrl}`);

  const envs = {
    DATABASE_URL: supa.databaseUrl,
    DIRECT_URL: supa.directUrl,
    SUPABASE_URL: supa.supabaseUrl,
    SUPABASE_SERVICE_KEY: supa.serviceKey,
    SUPABASE_BUCKET: 'exercise-images',
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET,
    JWT_SECRET,
    CRON_SECRET,
    PUBLIC_URL: publicUrl,
    ADMIN_EMAIL: 'admin@cyclefit.local',
    ADMIN_PASSWORD,
    PAYMENTS_MODE: 'stub',
    TRIAL_DAYS: '7',
    DEV_AUTH_BYPASS: 'false',
  };

  const payload = Object.entries(envs).map(([key, value]) => ({
    key,
    value: String(value),
    type: 'encrypted',
    target: ['production', 'preview'],
  }));
  const envRes = await vc(`/v10/projects/${project.id}/env?upsert=true`, { method: 'POST', body: payload });
  if (envRes.status >= 300) fail(`env upsert: HTTP ${envRes.status} ${JSON.stringify(envRes.body)}`);
  console.log(`Переменные окружения залиты: ${Object.keys(envs).join(', ')}`);

  // деплой main
  const repoId = project.link?.repoId ?? 1288178159; // числовой id bbutterm/cyclefit
  const deploy = await vc('/v13/deployments', {
    method: 'POST',
    body: {
      name: project.name,
      project: project.id,
      target: 'production',
      gitSource: { type: 'github', repoId, ref: 'main' },
    },
  });
  if (deploy.status >= 300) fail(`deploy: HTTP ${deploy.status} ${JSON.stringify(deploy.body)}`);
  const depId = deploy.body.id;
  console.log(`Деплой запущен: ${depId} → ${publicUrl}`);

  for (let i = 0; i < 90; i++) {
    await sleep(10_000);
    const d = await vc(`/v13/deployments/${depId}`);
    const state = d.body?.readyState ?? d.body?.state;
    console.log(`Деплой: ${state}`);
    if (state === 'READY') break;
    if (state === 'ERROR' || state === 'CANCELED') {
      // печатаем хвост лога сборки Vercel для диагностики
      const events = await vc(`/v3/deployments/${depId}/events?builds=1&limit=500`);
      if (Array.isArray(events.body)) {
        console.log('--- лог сборки Vercel (хвост) ---');
        const lines = events.body
          .map((e) => e?.payload?.text ?? e?.text ?? '')
          .filter(Boolean);
        for (const line of lines.slice(-80)) console.log(line);
        console.log('--- конец лога сборки ---');
      } else {
        console.log(`events: HTTP ${events.status} ${JSON.stringify(events.body).slice(0, 300)}`);
      }
      fail(`деплой упал (${state})`);
    }
    if (i === 89) fail('деплой не завершился за 15 минут');
  }
  console.log(`✓ Деплой готов: ${publicUrl}`);
  return { publicUrl };
}

// ---------- 3. Telegram webhook ----------

async function setupTelegram(publicUrl) {
  console.log('=== Telegram ===');
  const res = await call(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    body: {
      url: `${publicUrl}/api/webhooks/telegram`,
      secret_token: TELEGRAM_WEBHOOK_SECRET,
    },
  });
  if (!res.body?.ok) fail(`setWebhook: ${JSON.stringify(res.body)}`);
  console.log(`✓ Webhook зарегистрирован: ${publicUrl}/api/webhooks/telegram`);
}

// ---------- 4. GitHub variable для cron-ping ----------

async function setupGithubVariables(publicUrl) {
  if (!GITHUB_TOKEN) return console.log('GITHUB_TOKEN нет — пропускаю переменные для cron-ping');
  const gh = (path, opts = {}) =>
    call(`https://api.github.com${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        ...(opts.headers ?? {}),
      },
    });
  // CRON_SECRET хранится как variable (не secret): GITHUB_TOKEN не умеет писать
  // секреты; ценность утечки минимальна — эндпоинт лишь запускает идемпотентный тик.
  for (const [name, value] of [
    ['CRON_URL', publicUrl],
    ['CRON_SECRET', CRON_SECRET],
  ]) {
    const create = await gh(`/repos/${REPO}/actions/variables`, { method: 'POST', body: { name, value } });
    if (create.status === 201) {
      console.log(`✓ Variable ${name} создана`);
      continue;
    }
    const update = await gh(`/repos/${REPO}/actions/variables/${name}`, {
      method: 'PATCH',
      body: { name, value },
    });
    if (update.status < 300) console.log(`✓ Variable ${name} обновлена`);
    else console.log(`${name} не записана (HTTP ${create.status}/${update.status}) — добавь вручную в Settings → Actions → Variables`);
  }
}

// ---------- main ----------

const supa = await setupSupabase();
const { publicUrl } = await setupVercel(supa);
await setupTelegram(publicUrl);
await setupGithubVariables(publicUrl);

// финальная проверка API
const health = await call(`${publicUrl}/api/health`);
console.log(`healthcheck: HTTP ${health.status} ${JSON.stringify(health.body)}`);
console.log('\n=== ГОТОВО ===');
console.log(`Mini App:  ${publicUrl}`);
console.log(`Админка:   ${publicUrl}/admin  (логин admin@cyclefit.local, пароль: ${ADMIN_PASSWORD})`);
console.log(`API:       ${publicUrl}/api/health`);
