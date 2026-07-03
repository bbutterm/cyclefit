import { describe, expect, it } from 'vitest';
import {
  computeStreak,
  conflictsWithRestrictions,
  equipmentChain,
  findSubstitute,
  pickLeastRecentlyShown,
  slotSearchOrder,
} from './selection.js';

describe('equipmentChain', () => {
  it('dumbbells включает basic и none', () => {
    expect(equipmentChain('dumbbells')).toEqual(['dumbbells', 'basic', 'none']);
    expect(equipmentChain('basic')).toEqual(['basic', 'none']);
    expect(equipmentChain('none')).toEqual(['none']);
  });
});

describe('slotSearchOrder', () => {
  it('сначала точный слот, затем упрощение инвентаря', () => {
    expect(slotSearchOrder('luteal', 'beginner', 'basic')).toEqual([
      { phase: 'luteal', level: 'beginner', equipment: 'basic' },
      { phase: 'luteal', level: 'beginner', equipment: 'none' },
    ]);
  });
});

describe('pickLeastRecentlyShown (ротация)', () => {
  const w = (id: string, createdAt: string, lastShownAt: string | null) => ({
    id,
    createdAt: new Date(createdAt),
    lastShownAt: lastShownAt ? new Date(lastShownAt) : null,
  });

  it('никогда не показанная — первой', () => {
    const pick = pickLeastRecentlyShown([
      w('a', '2026-01-01', '2026-06-01'),
      w('b', '2026-01-02', null),
    ]);
    expect(pick!.id).toBe('b');
  });

  it('иначе — показанная дольше всего назад', () => {
    const pick = pickLeastRecentlyShown([
      w('a', '2026-01-01', '2026-06-20'),
      w('b', '2026-01-02', '2026-06-01'),
    ]);
    expect(pick!.id).toBe('b');
  });

  it('детерминированный тай-брейк', () => {
    const list = [w('b', '2026-01-01', null), w('a', '2026-01-01', null)];
    expect(pickLeastRecentlyShown(list)!.id).toBe('a');
    expect(pickLeastRecentlyShown([...list].reverse())!.id).toBe('a');
  });

  it('пустой слот → null', () => {
    expect(pickLeastRecentlyShown([])).toBeNull();
  });
});

describe('противопоказания', () => {
  const squat = {
    id: '1',
    slug: 'squat',
    muscleGroups: ['legs', 'glutes'],
    equipment: 'none' as const,
    contraindications: ['knees'],
  };
  const bridge = {
    id: '2',
    slug: 'glute-bridge',
    muscleGroups: ['glutes'],
    equipment: 'none' as const,
    contraindications: [],
  };
  const legPressBand = {
    id: '3',
    slug: 'band-leg-press',
    muscleGroups: ['legs'],
    equipment: 'basic' as const,
    contraindications: [],
  };
  const plank = {
    id: '4',
    slug: 'plank',
    muscleGroups: ['core'],
    equipment: 'none' as const,
    contraindications: ['diastasis'],
  };

  it('определяет конфликт', () => {
    expect(conflictsWithRestrictions(squat, ['knees'])).toBe(true);
    expect(conflictsWithRestrictions(squat, ['back'])).toBe(false);
  });

  it('находит замену из той же группы мышц без конфликта', () => {
    const sub = findSubstitute(squat, [squat, bridge, plank], ['knees'], 'none');
    expect(sub!.slug).toBe('glute-bridge');
  });

  it('учитывает инвентарь слота: basic-упражнение доступно в basic-тренировке', () => {
    const sub = findSubstitute(squat, [squat, legPressBand, plank], ['knees'], 'basic');
    expect(sub!.slug).toBe('band-leg-press');
    // …но недоступно в none-тренировке
    expect(findSubstitute(squat, [squat, legPressBand, plank], ['knees'], 'none')).toBeNull();
  });

  it('нет альтернативы → null (упражнение будет пропущено с заметкой)', () => {
    expect(findSubstitute(plank, [squat, plank], ['diastasis'], 'none')).toBeNull();
  });
});

describe('computeStreak', () => {
  const logs = (entries: Record<string, string>) => new Map(Object.entries(entries));

  it('серия завершённых дней', () => {
    const m = logs({
      '2026-07-01': 'completed',
      '2026-07-02': 'replaced_easy',
      '2026-07-03': 'completed',
    });
    expect(computeStreak(m, '2026-07-03')).toBe(3);
  });

  it('сегодня ещё не тренировалась — стрик со вчера не сгорает', () => {
    const m = logs({ '2026-07-01': 'completed', '2026-07-02': 'completed' });
    expect(computeStreak(m, '2026-07-03')).toBe(2);
  });

  it('пропуск позавчера обрывает серию', () => {
    const m = logs({ '2026-07-01': 'completed', '2026-07-03': 'completed' });
    expect(computeStreak(m, '2026-07-03')).toBe(1);
  });

  it('осознанный отдых (rest) не ломает стрик', () => {
    const m = logs({
      '2026-07-01': 'completed',
      '2026-07-02': 'rest',
      '2026-07-03': 'completed',
    });
    expect(computeStreak(m, '2026-07-03')).toBe(3);
  });

  it('skipped ломает стрик', () => {
    const m = logs({ '2026-07-02': 'skipped', '2026-07-03': 'completed' });
    expect(computeStreak(m, '2026-07-03')).toBe(1);
  });

  it('нет логов → 0', () => {
    expect(computeStreak(new Map(), '2026-07-03')).toBe(0);
  });
});
