import { expect, test } from '@playwright/test';

// E2E админки (React-Admin на :5174). Логин из seed: admin@cyclefit.local / admin12345.

test.use({ baseURL: 'http://localhost:5174' });

test('Админка: логин, дашборд, матрица покрытия, списки', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/admin/');
  // форма логина React-Admin
  await page.getByLabel(/Username|Логин|email/i).first().fill('admin@cyclefit.local');
  await page.getByLabel(/Password|Пароль/i).first().fill('admin12345');
  await page.getByRole('button', { name: /Sign in|Войти|Connexion/i }).click();

  // дашборд
  await expect(page.getByText('CycleFit — дашборд')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Пользовательниц')).toBeVisible();
  await page.screenshot({ path: 'artifacts/admin-dashboard.png', fullPage: true });

  // матрица покрытия слотов
  await page.goto('/admin/#/coverage');
  await expect(page.getByText('Матрица покрытия слотов')).toBeVisible();
  // все 36 слотов покрыты (нет красных <2): проверяем, что есть ячейки с числами ≥2
  await expect(page.getByRole('cell', { name: '2', exact: true }).first()).toBeVisible();
  await page.screenshot({ path: 'artifacts/admin-coverage.png', fullPage: true });

  // список упражнений
  await page.goto('/admin/#/exercises');
  await expect(page.getByText('Приседания').first()).toBeVisible({ timeout: 15_000 });

  // список тренировок
  await page.goto('/admin/#/workouts');
  await expect(page.getByRole('cell', { name: /Баланс и тонус|Спокойная сила|Пик энергии/ }).first()).toBeVisible({
    timeout: 15_000,
  });

  expect(errors, errors.join('\n')).toEqual([]);
});
