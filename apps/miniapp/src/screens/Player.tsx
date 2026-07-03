import type { WorkoutDto, WorkoutItemDto } from '@cyclefit/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { hapticLight, hapticSuccess } from '../telegram';
import { Button, Card, ErrorState, Spinner } from '../ui';

type Stage =
  | { kind: 'resume-prompt'; index: number }
  | { kind: 'exercise'; index: number; set: number }
  | { kind: 'rest'; index: number; set: number; secondsLeft: number }
  | { kind: 'done' };

function progressKey(id: string): string {
  return `cf_progress_${id}`;
}

export default function Player() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [workout, setWorkout] = useState<WorkoutDto | null>(null);
  const [error, setError] = useState<'paywall' | 'network' | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'exercise', index: 0, set: 1 });
  const [frame, setFrame] = useState(0);
  const [rating, setRating] = useState(0);
  const [saving, setSaving] = useState(false);
  const [logged, setLogged] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const w = await api.workout(id);
      setWorkout(w);
      const saved = Number(localStorage.getItem(progressKey(id)) ?? 0);
      if (saved > 0 && saved < w.items.length) {
        setStage({ kind: 'resume-prompt', index: saved });
      }
    } catch (err) {
      setError(err instanceof ApiError && err.status === 402 ? 'paywall' : 'network');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // тикающий таймер отдыха (автостарт, можно пропустить)
  useEffect(() => {
    if (stage.kind !== 'rest') return;
    timerRef.current = setInterval(() => {
      setStage((s) => {
        if (s.kind !== 'rest') return s;
        if (s.secondsLeft <= 1) return { kind: 'exercise', index: s.index, set: s.set };
        return { ...s, secondsLeft: s.secondsLeft - 1 };
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stage.kind]);

  useEffect(() => {
    setFrame(0);
  }, [stage.kind === 'exercise' ? stage.index : -1]);

  if (error === 'paywall') {
    return (
      <div className="px-5 pt-16 text-center fade-in">
        <div className="text-5xl mb-4">🔒</div>
        <p className="text-soft mb-6">Тренировки доступны по подписке</p>
        <Button onClick={() => navigate('/paywall')}>Посмотреть тарифы</Button>
      </div>
    );
  }
  if (error) return <ErrorState onRetry={load} />;
  if (!workout) return <Spinner />;

  const items = workout.items;

  function advance(index: number, set: number) {
    const item = items[index];
    hapticLight();
    if (set < item.sets) {
      // следующий подход — через отдых
      setStage({ kind: 'rest', index, set: set + 1, secondsLeft: item.restSec });
    } else if (index + 1 < items.length) {
      localStorage.setItem(progressKey(id), String(index + 1));
      setStage({ kind: 'rest', index: index + 1, set: 1, secondsLeft: item.restSec });
    } else {
      localStorage.removeItem(progressKey(id));
      hapticSuccess();
      setStage({ kind: 'done' });
    }
  }

  async function finish() {
    setSaving(true);
    try {
      await api.logWorkout(id, { status: 'completed', feltRating: rating || undefined });
      setLogged(true);
      hapticSuccess();
      navigate('/', { replace: true });
    } catch {
      setSaving(false);
    }
  }

  // --- Экран «продолжить?» ---
  if (stage.kind === 'resume-prompt') {
    return (
      <div className="px-5 pt-16 text-center fade-in">
        <div className="text-4xl mb-4">⏸</div>
        <h1 className="text-xl font-bold mb-2">С возвращением!</h1>
        <p className="text-soft mb-6">Продолжить с упражнения {stage.index + 1}?</p>
        <Button onClick={() => setStage({ kind: 'exercise', index: stage.index, set: 1 })} className="mb-2">
          Продолжить
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            localStorage.removeItem(progressKey(id));
            setStage({ kind: 'exercise', index: 0, set: 1 });
          }}
        >
          Начать сначала
        </Button>
      </div>
    );
  }

  // --- Финал ---
  if (stage.kind === 'done') {
    return (
      <div className="px-5 pt-16 text-center fade-in">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold mb-2">Готово!</h1>
        <p className="text-soft mb-6">Как самочувствие после тренировки?</p>
        <div className="flex justify-center gap-2 mb-8">
          {[1, 2, 3, 4, 5].map((r) => (
            <button
              key={r}
              onClick={() => setRating(r)}
              className={`w-12 h-12 rounded-full text-xl transition ${
                rating >= r ? 'bg-peach-400' : 'bg-white'
              }`}
              aria-label={`Оценка ${r}`}
            >
              {rating >= r ? '💛' : '🤍'}
            </button>
          ))}
        </div>
        <Button onClick={finish} disabled={saving || logged}>
          {saving ? 'Сохраняю…' : 'Завершить'}
        </Button>
      </div>
    );
  }

  // --- Отдых ---
  if (stage.kind === 'rest') {
    const next = items[stage.index];
    return (
      <div className="px-5 pt-16 text-center fade-in">
        <div className="text-sm text-soft uppercase tracking-wide mb-2">Отдых</div>
        <div className="text-6xl font-bold mb-4 tabular-nums">{stage.secondsLeft}</div>
        <p className="text-soft mb-8">
          Дальше: {next.exercise.name}
          {next.sets > 1 ? ` · подход ${stage.set} из ${next.sets}` : ''}
        </p>
        <Button variant="secondary" onClick={() => setStage({ kind: 'exercise', index: stage.index, set: stage.set })}>
          Пропустить отдых
        </Button>
      </div>
    );
  }

  // --- Упражнение ---
  const item: WorkoutItemDto = items[stage.index];
  const ex = item.exercise;
  const images = ex.images;

  if (item.skippedNote) {
    return (
      <div className="px-5 pt-16 text-center fade-in">
        <div className="text-4xl mb-4">🤍</div>
        <h1 className="text-xl font-bold mb-2">{ex.name}</h1>
        <p className="text-soft mb-8">{item.skippedNote}</p>
        <Button onClick={() => advance(stage.index, item.sets)}>Дальше</Button>
      </div>
    );
  }

  return (
    <div className="px-5 pb-8 fade-in">
      <div className="flex items-center justify-between pt-5 mb-3">
        <Link to="/" className="text-sm text-soft">✕ Выйти</Link>
        <div className="text-sm font-medium text-soft">
          {stage.index + 1} / {items.length}
        </div>
      </div>

      {/* Картинки: свайп/тап для перелистывания */}
      <div
        className="relative rounded-3xl overflow-hidden bg-white mb-1 aspect-[3/2]"
        onClick={() => setFrame((f) => (f + 1) % Math.max(1, images.length))}
      >
        {images.length > 0 ? (
          <img src={images[frame]?.url} alt={images[frame]?.caption ?? ex.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl">🧘‍♀️</div>
        )}
        {images.length > 1 && (
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
            {images.map((img, i) => (
              <span key={img.id} className={`w-1.5 h-1.5 rounded-full ${i === frame ? 'bg-peach-500' : 'bg-white'}`} />
            ))}
          </div>
        )}
      </div>
      {images[frame]?.caption && (
        <div className="text-center text-xs text-soft mb-3">{images[frame].caption}</div>
      )}

      <h1 className="text-xl font-bold mb-1">{ex.name}</h1>
      <div className="text-peach-500 font-semibold mb-2">
        {item.durationSec
          ? `${item.durationSec} сек`
          : `${item.sets} × ${item.reps ?? '—'}`}
        {item.sets > 1 && ` · подход ${stage.set} из ${item.sets}`}
      </div>

      {ex.safetyCue && (
        <Card className="mb-3 !py-3.5 border-l-4 border-peach-400">
          <p className="font-semibold text-base">☝️ {ex.safetyCue}</p>
        </Card>
      )}

      <details className="mb-4 text-sm text-soft">
        <summary className="font-medium text-ink cursor-pointer py-1">Как выполнять</summary>
        <p className="leading-relaxed mt-1">{ex.description}</p>
        {ex.commonMistakes && (
          <p className="leading-relaxed mt-2">
            <span className="font-medium text-ink">Частые ошибки:</span> {ex.commonMistakes}
          </p>
        )}
      </details>

      <Button onClick={() => advance(stage.index, stage.set)}>Дальше</Button>
    </div>
  );
}
