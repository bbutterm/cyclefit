import type { CalendarDay, Phase } from '@cyclefit/shared';
import { PHASE_NAMES_RU } from '@cyclefit/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useMe } from '../App';
import { Button, Card, ErrorState, PHASE_COLORS, Spinner } from '../ui';

const PHASE_LOAD_HINT: Record<Phase, string> = {
  menstrual: 'Мягкие практики и отдых',
  follicular: 'Наращивание нагрузки, тонус',
  ovulatory: 'Пик энергии — самые сильные тренировки',
  luteal: 'Спокойная сила, баланс',
};

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function CalendarScreen() {
  const { refreshMe } = useMe();
  const [cursor, setCursor] = useState(() => new Date());
  const [days, setDays] = useState<CalendarDay[] | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<CalendarDay | null>(null);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    setDays(null);
    try {
      const res = await api.calendar(monthKey(cursor));
      setDays(res.days);
      setSelected(res.days.find((d) => d.isToday) ?? null);
    } catch {
      setError(true);
    }
  }, [cursor]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markPeriodToday() {
    setMarking(true);
    try {
      const today = days?.find((d) => d.isToday);
      if (today) await api.periodStart(today.date);
      await refreshMe();
      await load();
    } finally {
      setMarking(false);
    }
  }

  function shiftMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  const firstDow = days ? (new Date(`${days[0].date}T00:00:00`).getDay() + 6) % 7 : 0;

  return (
    <div className="px-5 pb-8 fade-in">
      <div className="flex items-center justify-between pt-5 mb-4">
        <Link to="/" className="text-sm font-medium text-peach-500">
          ← Сегодня
        </Link>
        <div className="flex items-center gap-3">
          <button onClick={() => shiftMonth(-1)} className="p-2 text-soft" aria-label="Прошлый месяц">‹</button>
          <h1 className="font-bold">
            {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
          </h1>
          <button onClick={() => shiftMonth(1)} className="p-2 text-soft" aria-label="Следующий месяц">›</button>
        </div>
      </div>

      {error && <ErrorState onRetry={load} />}
      {!error && !days && <Spinner />}
      {days && (
        <>
          <Card className="mb-4">
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-soft mb-2">
              {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDow }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {days.map((d) => {
                const dayNum = Number(d.date.slice(8));
                const done = d.workoutStatus === 'completed' || d.workoutStatus === 'replaced_easy';
                return (
                  <button
                    key={d.date}
                    onClick={() => setSelected(d)}
                    className={`relative aspect-square rounded-xl flex items-center justify-center text-sm transition
                      ${d.phase ? PHASE_COLORS[d.phase] : 'bg-cream'} ${d.phase ? 'bg-opacity-40' : ''}
                      ${d.isToday ? 'ring-2 ring-peach-500 font-bold' : ''}
                      ${selected?.date === d.date ? 'ring-2 ring-lavender-400' : ''}`}
                  >
                    {dayNum}
                    {done && <span className="absolute bottom-0.5 text-[8px]">✓</span>}
                  </button>
                );
              })}
            </div>
            {/* Легенда */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4">
              {(Object.keys(PHASE_NAMES_RU) as Phase[]).map((p) => (
                <span key={p} className="flex items-center gap-1.5 text-xs text-soft">
                  <span className={`w-2.5 h-2.5 rounded-full ${PHASE_COLORS[p]} bg-opacity-60`} />
                  {PHASE_NAMES_RU[p]}
                </span>
              ))}
            </div>
          </Card>

          {selected && selected.phase && (
            <Card className="mb-4 fade-in">
              <div className="text-sm font-semibold mb-1">
                {selected.date.split('-').reverse().join('.')} · День {selected.cycleDay} ·{' '}
                {PHASE_NAMES_RU[selected.phase]}
              </div>
              <p className="text-sm text-soft">{PHASE_LOAD_HINT[selected.phase]}</p>
            </Card>
          )}

          <Button variant="secondary" onClick={markPeriodToday} disabled={marking}>
            {marking ? 'Секунду…' : 'Месячные начались сегодня'}
          </Button>
        </>
      )}
    </div>
  );
}
