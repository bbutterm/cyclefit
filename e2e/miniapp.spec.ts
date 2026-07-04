import { expect, test, type Page } from '@playwright/test';

// Полный E2E Mini App: все режимы онбординга, все фазы цикла, плеер, календарь,
// профиль, пейвол. Каждый сценарий — свежий контекст (свой dev-пользователь).

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Собираем ошибки страницы (uncaught) — на них падаем.
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // игнорируем сетевые 404 ресурсов (favicon) и шум Telegram SDK — это не ошибки приложения
    if (
      m.type() === 'error' &&
      !/favicon|initData|Telegram|Failed to load resource/i.test(m.text())
    ) {
      errors.push(`console.error: ${m.text()}`);
    }
  });
  return errors;
}

async function passDisclaimer(page: Page) {
  await expect(page.getByText('Прежде чем начать')).toBeVisible();
  await page.locator('input[type=checkbox]').check();
  await page.getByRole('button', { name: 'Продолжить' }).click();
}

interface OnboardOpts {
  mode: 'tracked' | 'no_cycle';
  daysAgo?: number;
  goal?: string;
  level?: string;
  equipment?: string;
  restrictions?: string[];
}

async function onboard(page: Page, opts: OnboardOpts) {
  await page.goto('/');
  await passDisclaimer(page);

  // шаг 1 — цикл
  if (opts.mode === 'no_cycle') {
    await page.getByText('Не отслеживаю / нерегулярный').click();
    await page.getByRole('button', { name: 'Дальше' }).click();
  } else {
    await page.locator('input[type=date]').fill(isoDaysAgo(opts.daysAgo ?? 0));
    await page.getByRole('button', { name: 'Дальше' }).click();
  }

  // шаг 2 — цель
  await page.getByText(opts.goal ?? 'Тонус', { exact: true }).click();
  // шаг 3 — уровень
  await page.getByText(opts.level ?? 'Начинаю', { exact: true }).click();
  // шаг 4 — ограничения + инвентарь
  for (const r of opts.restrictions ?? []) await page.getByRole('button', { name: r }).click();
  await page.getByText(opts.equipment ?? 'Коврик и резинки', { exact: true }).click();
  await page.getByRole('button', { name: 'Дальше' }).click();
  // шаг 5 — финал
  await expect(page.getByText('Твой план готов!')).toBeVisible();
  await page.getByRole('button', { name: 'Начать' }).click();

  // главный экран
  await expect(page.getByRole('heading', { name: /День \d+/ })).toBeVisible();
}

const PHASE_CASES = [
  { name: 'менструация', daysAgo: 0, phase: 'Менструация', rest: true },
  { name: 'фолликулярная', daysAgo: 7, phase: 'Фолликулярная', rest: false },
  { name: 'овуляторная', daysAgo: 13, phase: 'Овуляторная', rest: false },
  { name: 'лютеиновая', daysAgo: 18, phase: 'Лютеиновая', rest: false },
];

test.describe('Онбординг + фазы цикла (tracked)', () => {
  for (const c of PHASE_CASES) {
    test(`фаза: ${c.name}`, async ({ page }) => {
      const errors = trackErrors(page);
      await onboard(page, { mode: 'tracked', daysAgo: c.daysAgo });

      await expect(page.getByRole('heading', { name: new RegExp(c.phase) })).toBeVisible();
      // карточка тренировки дня
      await expect(page.getByRole('button', { name: 'Начать' })).toBeVisible();
      // питание дня
      await expect(page.getByText('Питание сегодня')).toBeVisible();
      // кнопка «Сегодня отдыхаю» только в менструацию
      const restBtn = page.getByRole('button', { name: 'Сегодня отдыхаю' });
      if (c.rest) await expect(restBtn).toBeVisible();
      else await expect(restBtn).toHaveCount(0);

      await page.screenshot({ path: `artifacts/today-${c.name}.png`, fullPage: true });
      expect(errors, errors.join('\n')).toEqual([]);
    });
  }
});

test('Режим no_cycle (волновая программа)', async ({ page }) => {
  const errors = trackErrors(page);
  await onboard(page, { mode: 'no_cycle' });
  await expect(page.getByRole('heading', { name: /День \d+/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Начать' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/today-no_cycle.png', fullPage: true });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Плеер тренировки: полный путь до завершения и стрик', async ({ page }) => {
  const errors = trackErrors(page);
  await onboard(page, { mode: 'tracked', daysAgo: 7 }); // фолликулярная — точно есть силовая
  await page.getByRole('button', { name: 'Начать' }).click();

  // проходим все упражнения: жмём «Дальше» / пропускаем отдых, пока не «Готово!»
  await expect(page.getByText(/\d+ \/ \d+/)).toBeVisible();
  for (let i = 0; i < 60; i++) {
    if (await page.getByText('Готово!').isVisible().catch(() => false)) break;
    const skip = page.getByRole('button', { name: 'Пропустить отдых' });
    const next = page.getByRole('button', { name: 'Дальше' });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    else if (await next.isVisible().catch(() => false)) await next.click();
    else await page.waitForTimeout(300);
  }

  await expect(page.getByText('Готово!')).toBeVisible();
  // оценка самочувствия
  await page.getByRole('button', { name: 'Оценка 4' }).click();
  await page.getByRole('button', { name: 'Завершить' }).click();

  // вернулись на «Сегодня», тренировка отмечена выполненной
  await expect(page.getByText('Тренировка выполнена')).toBeVisible();
  await page.screenshot({ path: 'artifacts/player-done.png', fullPage: true });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Календарь фаз: сетка, легенда, навигация по месяцам', async ({ page }) => {
  const errors = trackErrors(page);
  await onboard(page, { mode: 'tracked', daysAgo: 3 });
  await page.getByRole('link', { name: /Календарь/ }).click();
  await expect(page.getByText('Менструация').first()).toBeVisible(); // легенда
  await expect(page.getByText('Овуляторная фаза').first()).toBeVisible();
  // навигация на следующий месяц
  await page.getByRole('button', { name: 'Следующий месяц' }).click();
  await expect(page.getByRole('button', { name: 'Месячные начались сегодня' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/calendar.png', fullPage: true });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Профиль: редактирование и сохранение', async ({ page }) => {
  const errors = trackErrors(page);
  await onboard(page, { mode: 'tracked', daysAgo: 7, level: 'Начинаю' });
  await page.getByRole('link', { name: 'Профиль' }).click();
  await expect(page.getByText('Подписка')).toBeVisible();
  await expect(page.getByText('Пробный период')).toBeVisible();
  // меняем уровень → появляется «Сохранить»
  await page.getByRole('button', { name: 'Тренируюсь регулярно' }).click();
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await page.screenshot({ path: 'artifacts/profile.png', fullPage: true });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Пейвол: тарифы и stub-оплата', async ({ page }) => {
  const errors = trackErrors(page);
  await onboard(page, { mode: 'tracked', daysAgo: 7 });
  await page.goto('/#/paywall');
  await expect(page.getByText('CycleFit Plus')).toBeVisible();
  await expect(page.getByText('Тестовый режим: оплата не списывается')).toBeVisible();
  // три тарифа
  await expect(page.getByText('Месяц', { exact: true })).toBeVisible();
  await expect(page.getByText('3 месяца')).toBeVisible();
  await expect(page.getByText('Год', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/paywall.png', fullPage: true });
  await page.getByRole('button', { name: 'Оформить' }).click();
  await expect(page.getByRole('heading', { name: /День \d+/ })).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});
