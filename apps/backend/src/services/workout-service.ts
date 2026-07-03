import type {
  Equipment,
  ExerciseDto,
  Level,
  Phase,
  Restriction,
  WorkoutDto,
  WorkoutLogStatus,
  WorkoutPreviewDto,
} from '@cyclefit/shared';
import type { PrismaClient, User } from '@prisma/client';
import {
  computeStreak,
  conflictsWithRestrictions,
  findSubstitute,
  pickLeastRecentlyShown,
  slotSearchOrder,
} from '../domain/selection.js';
import { getText } from '../texts.js';

export function dateFromISO(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function levelSearchOrder(level: Level): Level[] {
  switch (level) {
    case 'beginner':
      return ['beginner', 'intermediate', 'advanced'];
    case 'intermediate':
      return ['intermediate', 'beginner', 'advanced'];
    case 'advanced':
      return ['advanced', 'intermediate', 'beginner'];
  }
}

/** Подбор тренировки для слота (§3.2): точный слот → упрощение инвентаря → соседний уровень. */
export async function findWorkoutForSlot(
  prisma: PrismaClient,
  userId: string,
  phase: Phase,
  level: Level,
  equipment: Equipment,
): Promise<{ id: string } | null> {
  for (const lvl of levelSearchOrder(level)) {
    for (const slot of slotSearchOrder(phase, lvl, equipment)) {
      const workouts = await prisma.workout.findMany({
        where: { phase: slot.phase, level: slot.level, equipment: slot.equipment, isPublished: true },
        select: { id: true, createdAt: true },
      });
      if (workouts.length === 0) continue;
      const shown = await prisma.userWorkoutShown.findMany({
        where: { userId, workoutId: { in: workouts.map((w) => w.id) } },
      });
      const shownMap = new Map(shown.map((s) => [s.workoutId, s.lastShownAt]));
      const pick = pickLeastRecentlyShown(
        workouts.map((w) => ({ ...w, lastShownAt: shownMap.get(w.id) ?? null })),
      );
      if (pick) return pick;
    }
  }
  return null;
}

async function markShown(prisma: PrismaClient, userId: string, workoutId: string): Promise<void> {
  await prisma.userWorkoutShown.upsert({
    where: { userId_workoutId: { userId, workoutId } },
    create: { userId, workoutId },
    update: { lastShownAt: new Date() },
  });
}

/** Тренировка дня: закрепляется за датой при первом запросе и стабильна в течение дня. */
export async function getOrAssignDailyWorkout(
  prisma: PrismaClient,
  user: User,
  dateISO: string,
  phase: Phase,
): Promise<{ workoutId: string; easyReplaced: boolean } | null> {
  const date = dateFromISO(dateISO);
  const existing = await prisma.dailyAssignment.findUnique({
    where: { userId_date: { userId: user.id, date } },
  });
  if (existing) return { workoutId: existing.workoutId, easyReplaced: existing.easyReplaced };

  const pick = await findWorkoutForSlot(prisma, user.id, phase, user.level, user.equipment);
  if (!pick) return null;
  try {
    await prisma.dailyAssignment.create({
      data: { userId: user.id, date, workoutId: pick.id },
    });
  } catch {
    // гонка: назначение уже создано параллельным запросом
    const raced = await prisma.dailyAssignment.findUnique({
      where: { userId_date: { userId: user.id, date } },
    });
    if (raced) return { workoutId: raced.workoutId, easyReplaced: raced.easyReplaced };
    return null;
  }
  await markShown(prisma, user.id, pick.id);
  return { workoutId: pick.id, easyReplaced: false };
}

/** «Плохое самочувствие» (§3.2 п.4): замена на мягкую практику из menstrual-слота. */
export async function replaceWithEasyWorkout(
  prisma: PrismaClient,
  user: User,
  dateISO: string,
): Promise<{ workoutId: string } | null> {
  const date = dateFromISO(dateISO);
  const easy = await findWorkoutForSlot(prisma, user.id, 'menstrual', user.level, user.equipment);
  if (!easy) return null;
  await prisma.dailyAssignment.upsert({
    where: { userId_date: { userId: user.id, date } },
    create: { userId: user.id, date, workoutId: easy.id, easyReplaced: true },
    update: { workoutId: easy.id, easyReplaced: true },
  });
  await markShown(prisma, user.id, easy.id);
  return { workoutId: easy.id };
}

type ExerciseWithImages = {
  id: string;
  slug: string;
  name: string;
  description: string;
  commonMistakes: string | null;
  safetyCue: string | null;
  muscleGroups: string[];
  equipment: Equipment;
  contraindications: string[];
  images: { id: string; order: number; url: string; caption: string | null }[];
};

function toExerciseDto(e: ExerciseWithImages): ExerciseDto {
  return {
    id: e.id,
    slug: e.slug,
    name: e.name,
    description: e.description,
    commonMistakes: e.commonMistakes,
    safetyCue: e.safetyCue,
    muscleGroups: e.muscleGroups,
    equipment: e.equipment,
    contraindications: e.contraindications as Restriction[],
    images: [...e.images].sort((a, b) => a.order - b.order),
  };
}

/** Состав тренировки с учётом ограничений (§3.3): конфликтные упражнения заменяются или пропускаются. */
export async function buildWorkoutDto(
  prisma: PrismaClient,
  workoutId: string,
  restrictions: Restriction[],
): Promise<WorkoutDto | null> {
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    include: {
      items: {
        orderBy: { order: 'asc' },
        include: { exercise: { include: { images: true } } },
      },
    },
  });
  if (!workout) return null;

  let pool: ExerciseWithImages[] | null = null;
  const skippedNote = await getText(prisma, 'workout.skipped_note');

  const items = [];
  for (const item of workout.items) {
    const exercise = item.exercise as unknown as ExerciseWithImages;
    let dtoExercise = exercise;
    let skipped = false;

    if (restrictions.length > 0 && conflictsWithRestrictions(exercise, restrictions)) {
      pool ??= (await prisma.exercise.findMany({ include: { images: true } })) as unknown as ExerciseWithImages[];
      const usedIds = new Set(workout.items.map((i) => i.exerciseId));
      const substitute = findSubstitute(
        exercise,
        pool.filter((e) => !usedIds.has(e.id) || e.id === exercise.id),
        restrictions,
        workout.equipment as Equipment,
      );
      if (substitute) {
        dtoExercise = pool.find((e) => e.id === substitute.id)!;
      } else {
        skipped = true;
      }
    }

    items.push({
      id: item.id,
      order: item.order,
      sets: item.sets,
      reps: item.reps,
      durationSec: item.durationSec,
      restSec: item.restSec,
      exercise: toExerciseDto(dtoExercise),
      ...(skipped ? { skippedNote } : {}),
    });
  }

  return {
    id: workout.id,
    title: workout.title,
    phase: workout.phase as Phase,
    level: workout.level as Level,
    equipment: workout.equipment as Equipment,
    durationMin: workout.durationMin,
    intensity: workout.intensity,
    description: workout.description,
    items,
  };
}

export async function workoutPreview(
  prisma: PrismaClient,
  workoutId: string,
  easyReplaced: boolean,
): Promise<WorkoutPreviewDto | null> {
  const w = await prisma.workout.findUnique({
    where: { id: workoutId },
    include: {
      items: {
        orderBy: { order: 'asc' },
        take: 1,
        include: { exercise: { include: { images: { orderBy: { order: 'asc' }, take: 1 } } } },
      },
    },
  });
  if (!w) return null;
  return {
    id: w.id,
    title: w.title,
    durationMin: w.durationMin,
    intensity: w.intensity,
    previewImageUrl: w.items[0]?.exercise.images[0]?.url ?? null,
    easyReplacement: easyReplaced,
  };
}

export async function logWorkout(
  prisma: PrismaClient,
  userId: string,
  dateISO: string,
  workoutId: string | null,
  status: WorkoutLogStatus,
  feltRating?: number,
): Promise<void> {
  const date = dateFromISO(dateISO);
  await prisma.workoutLog.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, workoutId, status, feltRating: feltRating ?? null },
    update: { workoutId, status, feltRating: feltRating ?? null },
  });
}

export async function getStreak(prisma: PrismaClient, userId: string, today: string): Promise<number> {
  const since = new Date(dateFromISO(today).getTime() - 400 * 86_400_000);
  const logs = await prisma.workoutLog.findMany({
    where: { userId, date: { gte: since } },
    select: { date: true, status: true },
  });
  const map = new Map(logs.map((l) => [l.date.toISOString().slice(0, 10), l.status as string]));
  return computeStreak(map, today);
}
