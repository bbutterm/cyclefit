import { describe, expect, it } from 'vitest';
import {
  cycleDayFor,
  nextPeriodStartFrom,
  noCycleStateFor,
  phaseForDay,
  resolveCycle,
} from './cycle.js';

describe('cycleDayFor', () => {
  it('день 1 в дату начала цикла', () => {
    expect(cycleDayFor('2026-07-01', '2026-07-01', 28)).toBe(1);
  });

  it('переход через границу месяца', () => {
    // старт 20 июня, длина 28: 17 июля — день 28, 18 июля — снова день 1
    expect(cycleDayFor('2026-07-17', '2026-06-20', 28)).toBe(28);
    expect(cycleDayFor('2026-07-18', '2026-06-20', 28)).toBe(1);
  });

  it('несколько циклов спустя (mod)', () => {
    expect(cycleDayFor('2026-09-12', '2026-06-20', 28)).toBe(85 % 28); // 84 дня → день 1? проверим явно
    expect(cycleDayFor('2026-09-12', '2026-06-20', 28)).toBe(1);
  });

  it('дата раньше начала цикла — по модулю, без отрицательных', () => {
    const d = cycleDayFor('2026-06-19', '2026-06-20', 28);
    expect(d).toBe(28);
  });

  it('сдвиг при фактическом начале месячных: обновлённый старт меняет день', () => {
    // расчётно день 3, но месячные начались сегодня → старт = сегодня → день 1
    expect(cycleDayFor('2026-07-03', '2026-07-01', 28)).toBe(3);
    expect(cycleDayFor('2026-07-03', '2026-07-03', 28)).toBe(1);
  });
});

describe('phaseForDay: L=28, P=5', () => {
  // ovulation_day = 14 → menstrual 1–5, follicular 6–12, ovulatory 13–15, luteal 16–28
  it.each([
    [1, 'menstrual'],
    [5, 'menstrual'],
    [6, 'follicular'],
    [12, 'follicular'],
    [13, 'ovulatory'],
    [14, 'ovulatory'],
    [15, 'ovulatory'],
    [16, 'luteal'],
    [28, 'luteal'],
  ])('день %i → %s', (day, phase) => {
    expect(phaseForDay(day as number, 28, 5)).toBe(phase);
  });
});

describe('phaseForDay: L=21, P=5 (короткий цикл, окна пересекаются)', () => {
  // ovulation_day = 7 → menstrual 1–5, ovulatory 6–8, luteal 9–21 (follicular схлопывается)
  it.each([
    [5, 'menstrual'],
    [6, 'ovulatory'],
    [8, 'ovulatory'],
    [9, 'luteal'],
    [21, 'luteal'],
  ])('день %i → %s', (day, phase) => {
    expect(phaseForDay(day as number, 21, 5)).toBe(phase);
  });

  it('менструация имеет приоритет над овуляторным окном (P=7)', () => {
    // ovulation_day=7, окно 6–8, но дни 6–7 всё ещё менструация
    expect(phaseForDay(6, 21, 7)).toBe('menstrual');
    expect(phaseForDay(7, 21, 7)).toBe('menstrual');
    expect(phaseForDay(8, 21, 7)).toBe('ovulatory');
  });
});

describe('phaseForDay: L=35, P=5', () => {
  // ovulation_day = 21 → menstrual 1–5, follicular 6–19, ovulatory 20–22, luteal 23–35
  it.each([
    [5, 'menstrual'],
    [6, 'follicular'],
    [19, 'follicular'],
    [20, 'ovulatory'],
    [22, 'ovulatory'],
    [23, 'luteal'],
    [35, 'luteal'],
  ])('день %i → %s', (day, phase) => {
    expect(phaseForDay(day as number, 35, 5)).toBe(phase);
  });
});

describe('nextPeriodStartFrom', () => {
  it('сегодня день 1 → сегодня', () => {
    expect(nextPeriodStartFrom('2026-07-01', '2026-07-01', 28)).toBe('2026-07-01');
  });
  it('середина цикла → старт + L', () => {
    // старт 1 июля, день 15 июля = 15 → следующее начало 29 июля
    expect(nextPeriodStartFrom('2026-07-15', '2026-07-01', 28)).toBe('2026-07-29');
  });
  it('день 28 → завтра', () => {
    expect(nextPeriodStartFrom('2026-07-28', '2026-07-01', 28)).toBe('2026-07-29');
  });
});

describe('no_cycle: 4-недельная волна', () => {
  it('нед.1 → menstrual (лёгкая), нед.2 → follicular, нед.3 → ovulatory, нед.4 → luteal', () => {
    expect(noCycleStateFor('2026-07-01', '2026-07-01')).toEqual({ day: 1, phase: 'menstrual' });
    expect(noCycleStateFor('2026-07-08', '2026-07-01')).toEqual({ day: 8, phase: 'follicular' });
    expect(noCycleStateFor('2026-07-15', '2026-07-01')).toEqual({ day: 15, phase: 'ovulatory' });
    expect(noCycleStateFor('2026-07-22', '2026-07-01')).toEqual({ day: 22, phase: 'luteal' });
  });
  it('день 29 → снова нед.1', () => {
    expect(noCycleStateFor('2026-07-29', '2026-07-01')).toEqual({ day: 1, phase: 'menstrual' });
  });
  it('дата раньше якоря не даёт отрицательных дней', () => {
    expect(noCycleStateFor('2026-06-01', '2026-07-01').day).toBe(1);
  });
});

describe('resolveCycle', () => {
  const base = {
    cycleLength: 28,
    periodLength: 5,
    anchorDate: '2026-07-01',
  };

  it('tracked с датой старта', () => {
    const r = resolveCycle('2026-07-03', { ...base, cycleMode: 'tracked' as const, cycleStartDate: '2026-07-01' });
    expect(r).toEqual({ cycleDay: 3, phase: 'menstrual' });
  });

  it('tracked без даты старта → откат к волновой программе', () => {
    const r = resolveCycle('2026-07-03', { ...base, cycleMode: 'tracked' as const, cycleStartDate: null });
    expect(r.phase).toBe('menstrual');
  });

  it('no_cycle игнорирует дату старта', () => {
    const r = resolveCycle('2026-07-10', {
      ...base,
      cycleMode: 'no_cycle' as const,
      cycleStartDate: '2026-07-09',
    });
    expect(r).toEqual({ cycleDay: 10, phase: 'follicular' });
  });
});
