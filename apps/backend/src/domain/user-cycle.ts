import { DateTime } from 'luxon';
import { PHASE_NAMES_RU, type CycleToday } from '@cyclefit/shared';
import { resolveCycle, type CycleUserState } from './cycle.js';

interface UserCycleFields {
  cycleMode: 'tracked' | 'no_cycle';
  cycleStartDate: Date | null;
  cycleLength: number;
  periodLength: number;
  timezone: string;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
}

export function isValidTimezone(tz: string): boolean {
  return DateTime.now().setZone(tz).isValid;
}

/** Текущая дата (YYYY-MM-DD) в таймзоне пользовательницы. */
export function todayISO(timezone: string, now: Date = new Date()): string {
  const dt = DateTime.fromJSDate(now).setZone(timezone);
  return (dt.isValid ? dt : DateTime.fromJSDate(now).setZone('Europe/Moscow')).toISODate()!;
}

export function dateToISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function userCycleState(u: UserCycleFields): CycleUserState {
  return {
    cycleMode: u.cycleMode,
    cycleStartDate: u.cycleStartDate ? dateToISO(u.cycleStartDate) : null,
    cycleLength: u.cycleLength,
    periodLength: u.periodLength,
    anchorDate: dateToISO(u.onboardingCompletedAt ?? u.createdAt),
  };
}

export function cycleTodayFor(u: UserCycleFields, now: Date = new Date()): CycleToday {
  const date = todayISO(u.timezone, now);
  const { cycleDay, phase } = resolveCycle(date, userCycleState(u));
  return { date, cycleDay, phase, phaseNameRu: PHASE_NAMES_RU[phase] };
}
