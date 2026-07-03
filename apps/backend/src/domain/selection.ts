import type { Equipment, Level, Phase, Restriction } from '@cyclefit/shared';

// Чистая логика подбора тренировки дня (§3.2). Работа с БД — в services/workout-service.ts.

/** Инвентарь включает более простой: dumbbells ⊃ basic ⊃ none. */
export function equipmentChain(eq: Equipment): Equipment[] {
  switch (eq) {
    case 'dumbbells':
      return ['dumbbells', 'basic', 'none'];
    case 'basic':
      return ['basic', 'none'];
    default:
      return ['none'];
  }
}

/** Порядок слотов для поиска: точный слот, затем более простой инвентарь. */
export function slotSearchOrder(phase: Phase, level: Level, equipment: Equipment): Array<{
  phase: Phase;
  level: Level;
  equipment: Equipment;
}> {
  return equipmentChain(equipment).map((eq) => ({ phase, level, equipment: eq }));
}

export interface RotatableWorkout {
  id: string;
  createdAt: Date;
  lastShownAt: Date | null;
}

/**
 * Ротация: та, что не показывалась дольше всего; никогда не показанные — первыми.
 * Тай-брейк детерминированный — по createdAt, затем по id.
 */
export function pickLeastRecentlyShown<T extends RotatableWorkout>(workouts: T[]): T | null {
  if (workouts.length === 0) return null;
  const sorted = [...workouts].sort((a, b) => {
    const at = a.lastShownAt?.getTime() ?? -1;
    const bt = b.lastShownAt?.getTime() ?? -1;
    if (at !== bt) return at - bt;
    const ac = a.createdAt.getTime();
    const bc = b.createdAt.getTime();
    if (ac !== bc) return ac - bc;
    return a.id < b.id ? -1 : 1;
  });
  return sorted[0];
}

export interface SubstitutableExercise {
  id: string;
  slug: string;
  muscleGroups: string[];
  equipment: Equipment;
  contraindications: string[];
}

export function conflictsWithRestrictions(
  exercise: Pick<SubstitutableExercise, 'contraindications'>,
  restrictions: Restriction[],
): boolean {
  return exercise.contraindications.some((c) => (restrictions as string[]).includes(c));
}

/**
 * Замена упражнения по противопоказаниям (§3.3): альтернатива из того же слота/группы мышц,
 * доступная по инвентарю и без конфликтов. Детерминированно (по slug). Нет альтернативы → null.
 */
export function findSubstitute(
  original: SubstitutableExercise,
  pool: SubstitutableExercise[],
  restrictions: Restriction[],
  workoutEquipment: Equipment,
): SubstitutableExercise | null {
  const allowedEq = equipmentChain(workoutEquipment);
  const candidates = pool
    .filter(
      (e) =>
        e.id !== original.id &&
        !conflictsWithRestrictions(e, restrictions) &&
        allowedEq.includes(e.equipment) &&
        e.muscleGroups.some((g) => original.muscleGroups.includes(g)),
    )
    .sort((a, b) => (a.slug < b.slug ? -1 : 1));
  return candidates[0] ?? null;
}

/** Статусы, которые засчитываются как «день в плане» для стрика. */
const STREAK_STATUSES = new Set(['completed', 'replaced_easy', 'rest']);

/**
 * Стрик: непрерывная серия зачтённых дней, заканчивающаяся сегодня или вчера
 * (сегодняшняя тренировка ещё может быть впереди — стрик не сгорает до конца дня).
 */
export function computeStreak(logs: Map<string, string>, todayISO: string): number {
  const dayMs = 86_400_000;
  let start = Date.parse(todayISO);
  const todayStatus = logs.get(todayISO);
  if (!todayStatus || !STREAK_STATUSES.has(todayStatus)) {
    start -= dayMs; // сегодня ещё не закрыт — считаем от вчера
  }
  let streak = 0;
  for (let t = start; ; t -= dayMs) {
    const iso = new Date(t).toISOString().slice(0, 10);
    const status = logs.get(iso);
    if (status && STREAK_STATUSES.has(status)) streak += 1;
    else break;
  }
  return streak;
}
