import type { Phase } from '@cyclefit/shared';
import type { PrismaClient } from '@prisma/client';

/**
 * Контент дня (§3.3 PhaseContent): сначала записи, привязанные к диапазону дней,
 * иначе общие по фазе. Выбор детерминированный — ротация по дню цикла.
 */
export async function phaseContentFor(
  prisma: PrismaClient,
  phase: Phase,
  cycleDay: number,
): Promise<{ nutritionTip: string | null; bodyNote: string | null }> {
  const rows = await prisma.phaseContent.findMany({
    where: { phase },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  });
  if (rows.length === 0) return { nutritionTip: null, bodyNote: null };

  const daySpecific = rows.filter(
    (r) => r.dayHintMin != null && r.dayHintMax != null && cycleDay >= r.dayHintMin && cycleDay <= r.dayHintMax,
  );
  const generic = rows.filter((r) => r.dayHintMin == null && r.dayHintMax == null);
  const pool = daySpecific.length > 0 ? daySpecific : generic.length > 0 ? generic : rows;
  const pick = pool[(cycleDay - 1) % pool.length];
  return { nutritionTip: pick.nutritionTip, bodyNote: pick.bodyNote };
}
