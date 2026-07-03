import type { Phase } from '@cyclefit/shared';
import { addDays, daysBetween } from './dates.js';

// Ядро домена: расчёт дня цикла и фазы. Только чистые функции.
//
// Формулы (§3.1 спецификации, нормативна колонка «формула для произвольной длины L»):
//   ovulation_day = L − 14
//   menstrual:  1 … periodLength
//   follicular: periodLength+1 … ovulation_day−2
//   ovulatory:  ovulation_day−1 … ovulation_day+1
//   luteal:     ovulation_day+2 … L
// Приоритет при коротких циклах (окна могут пересекаться): menstrual > luteal > ovulatory > follicular.

export const CYCLE_LENGTH_MIN = 21;
export const CYCLE_LENGTH_MAX = 35;
export const PERIOD_LENGTH_MIN = 3;
export const PERIOD_LENGTH_MAX = 7;

export function clampCycleLength(l: number): number {
  return Math.min(CYCLE_LENGTH_MAX, Math.max(CYCLE_LENGTH_MIN, Math.round(l)));
}

export function clampPeriodLength(p: number): number {
  return Math.min(PERIOD_LENGTH_MAX, Math.max(PERIOD_LENGTH_MIN, Math.round(p)));
}

/** День цикла 1..L для произвольной даты (работает и для дат до cycleStartDate — по модулю). */
export function cycleDayFor(dateISO: string, cycleStartISO: string, cycleLength: number): number {
  const diff = daysBetween(cycleStartISO, dateISO);
  return ((diff % cycleLength) + cycleLength) % cycleLength + 1;
}

export function phaseForDay(day: number, cycleLength: number, periodLength: number): Phase {
  const ovulationDay = cycleLength - 14;
  if (day <= periodLength) return 'menstrual';
  if (day >= ovulationDay + 2) return 'luteal';
  if (day >= ovulationDay - 1) return 'ovulatory';
  return 'follicular';
}

/** Ближайшая дата (>= fromISO), когда день цикла равен 1 — расчётное начало следующих месячных. */
export function nextPeriodStartFrom(fromISO: string, cycleStartISO: string, cycleLength: number): string {
  const day = cycleDayFor(fromISO, cycleStartISO, cycleLength);
  if (day === 1) return fromISO;
  return addDays(fromISO, cycleLength - day + 1);
}

// --- Режим no_cycle: стандартная 4-недельная волнообразная программа ---
// нед.1 — лёгкая (слот menstrual), нед.2 — follicular, нед.3 — ovulatory, нед.4 — разгрузка (luteal).

const NO_CYCLE_WEEK_PHASES: Phase[] = ['menstrual', 'follicular', 'ovulatory', 'luteal'];

export function noCycleStateFor(dateISO: string, anchorISO: string): { day: number; phase: Phase } {
  const diff = Math.max(0, daysBetween(anchorISO, dateISO));
  const day = (diff % 28) + 1;
  const week = Math.floor((day - 1) / 7);
  return { day, phase: NO_CYCLE_WEEK_PHASES[week] };
}

// --- Универсальный резолвер ---

export interface CycleUserState {
  cycleMode: 'tracked' | 'no_cycle';
  cycleStartDate: string | null;
  cycleLength: number;
  periodLength: number;
  /** Якорь для no_cycle-программы: дата завершения онбординга (или регистрации). */
  anchorDate: string;
}

export function resolveCycle(dateISO: string, s: CycleUserState): { cycleDay: number; phase: Phase } {
  if (s.cycleMode === 'tracked' && s.cycleStartDate) {
    const cycleDay = cycleDayFor(dateISO, s.cycleStartDate, s.cycleLength);
    return { cycleDay, phase: phaseForDay(cycleDay, s.cycleLength, s.periodLength) };
  }
  const { day, phase } = noCycleStateFor(dateISO, s.anchorDate);
  return { cycleDay: day, phase };
}
