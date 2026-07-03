import type { TodayResponse } from '@cyclefit/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useMe } from '../App';
import { hapticLight } from '../telegram';
import { Button, Card, ErrorState, IntensityDots, PHASE_COLORS, PHASE_EMOJI, Spinner } from '../ui';

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export default function Today() {
  const { me } = useMe();
  const navigate = useNavigate();
  const [data, setData] = useState<TodayResponse | null>(null);
  const [error, setError] = useState(false);
  const [resting, setResting] = useState(false);
  const [restError, setRestError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setData(await api.today());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState onRetry={load} />;
  if (!data) return <Spinner />;

  const { cycle, workout, workoutLocked, bodyNote, nutritionTip, restDayAvailable, todayLog, streak } = data;

  async function restToday() {
    setResting(true);
    setRestError(false);
    try {
      await api.restToday();
      hapticLight();
      await load();
    } catch {
      setRestError(true);
    } finally {
      setResting(false);
    }
  }

  // мини-календарь недели вокруг сегодняшнего дня
  const weekDates = (() => {
    const today = new Date(`${cycle.date}T00:00:00`);
    const dow = (today.getDay() + 6) % 7; // пн = 0
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - dow + i);
      return d;
    });
  })();

  return (
    <div className="px-5 pb-8 fade-in">
      {/* Шапка */}
      <div className="flex items-center justify-between pt-5 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${PHASE_COLORS[cycle.phase]}`} />
            <h1 className="text-xl font-bold">
              День {cycle.cycleDay} · {cycle.phaseNameRu}
            </h1>
          </div>
          {bodyNote && <p className="text-sm text-soft mt-1.5 leading-relaxed">{bodyNote}</p>}
        </div>
        <Link to="/profile" className="text-2xl p-2" aria-label="Профиль">
          ⚙️
        </Link>
      </div>

      {/* Карточка тренировки дня */}
      {workoutLocked ? (
        <Card className="mb-4 text-center">
          <div className="text-4xl mb-2">🔒</div>
          <h2 className="font-bold text-lg mb-1">Тренировки по подписке</h2>
          <p className="text-sm text-soft mb-4">
            Календарь фаз остаётся бесплатным. Тренировки под твой цикл — по подписке.
          </p>
          <Button onClick={() => navigate('/paywall')}>Посмотреть тарифы</Button>
        </Card>
      ) : workout ? (
        <Card className="mb-4">
          {workout.easyReplacement && (
            <span className="inline-block text-xs font-semibold bg-lavender-100 text-lavender-500 px-3 py-1 rounded-full mb-2">
              Облегчённый день 💛
            </span>
          )}
          <div className="flex gap-4">
            <div className="w-20 h-20 rounded-2xl bg-peach-100 overflow-hidden shrink-0">
              {workout.previewImageUrl && (
                <img src={workout.previewImageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-lg leading-tight">{workout.title}</h2>
              <p className="text-sm text-soft mt-1">{workout.durationMin} мин</p>
              <div className="mt-1.5">
                <IntensityDots value={workout.intensity} />
              </div>
            </div>
          </div>
          {todayLog === 'completed' || todayLog === 'replaced_easy' ? (
            <div className="mt-4 text-center text-sm font-medium text-peach-500 bg-peach-100/60 rounded-2xl py-3">
              Тренировка выполнена — ты молодец! ✨
            </div>
          ) : todayLog === 'rest' ? (
            <div className="mt-4 text-center text-sm font-medium text-lavender-500 bg-lavender-100 rounded-2xl py-3">
              Сегодня — осознанный отдых 🌙
            </div>
          ) : (
            <>
              <Button className="mt-4" onClick={() => navigate(`/workout/${workout.id}`)}>
                Начать
              </Button>
              {restDayAvailable && (
                <Button variant="ghost" className="mt-1" onClick={restToday} disabled={resting}>
                  Сегодня отдыхаю
                </Button>
              )}
              {restError && (
                <p className="text-xs text-red-400 text-center mt-1">Не получилось. Попробуй ещё раз.</p>
              )}
            </>
          )}
        </Card>
      ) : (
        <Card className="mb-4 text-center text-soft text-sm py-8">
          На сегодня тренировки нет — загляни позже 🌸
        </Card>
      )}

      {/* Питание дня */}
      {nutritionTip && (
        <Card className="mb-4">
          <div className="flex gap-3">
            <div className="text-2xl">🥗</div>
            <div>
              <div className="text-xs font-semibold text-soft uppercase tracking-wide mb-1">Питание сегодня</div>
              <p className="text-sm leading-relaxed">{nutritionTip}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Стрик + неделя */}
      <Card className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            <div>
              <div className="font-bold text-lg leading-none">{streak}</div>
              <div className="text-xs text-soft">
                {streak === 1 ? 'день подряд' : streak >= 2 && streak <= 4 ? 'дня подряд' : 'дней подряд'}
              </div>
            </div>
          </div>
          <Link to="/calendar" className="text-sm font-medium text-peach-500">
            Календарь →
          </Link>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {weekDates.map((d, i) => {
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const isToday = iso === cycle.date;
            return (
              <div key={iso}>
                <div className="text-[10px] text-soft mb-1">{WEEKDAYS[i]}</div>
                <div
                  className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center text-sm ${
                    isToday ? 'bg-peach-400 text-white font-bold' : 'text-ink'
                  }`}
                >
                  {d.getDate()}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="text-center text-xs text-soft flex items-center justify-center gap-1">
        <span>{PHASE_EMOJI[cycle.phase]}</span>
        <span>CycleFit заботится, а не подгоняет</span>
      </div>
    </div>
  );
}
