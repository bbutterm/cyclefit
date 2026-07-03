import type { Equipment, Goal, Level, Restriction, UpdateMeRequest } from '@cyclefit/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useMe } from '../App';
import { hapticSuccess } from '../telegram';
import { Button, Card, ProgressBar } from '../ui';

const GOALS: { value: Goal; title: string; emoji: string; hint: string }[] = [
  { value: 'tone', title: 'Тонус', emoji: '✨', hint: 'Подтянуть тело и почувствовать силу' },
  { value: 'weight_loss', title: 'Снижение веса', emoji: '🌿', hint: 'Мягко и без изнурительных марафонов' },
  { value: 'energy', title: 'Энергия', emoji: '⚡️', hint: 'Больше сил в течение дня' },
  { value: 'recovery', title: 'Восстановление', emoji: '🌸', hint: 'Вернуться к движению бережно' },
];

const LEVELS: { value: Level; title: string; hint: string }[] = [
  { value: 'beginner', title: 'Начинаю', hint: 'Давно не тренировалась или впервые' },
  { value: 'intermediate', title: 'Занимаюсь иногда', hint: 'Тренируюсь время от времени' },
  { value: 'advanced', title: 'Тренируюсь регулярно', hint: 'Движение — часть моей жизни' },
];

const RESTRICTIONS: { value: Restriction; title: string }[] = [
  { value: 'knees', title: 'Колени' },
  { value: 'back', title: 'Спина' },
  { value: 'diastasis', title: 'Диастаз' },
];

const EQUIPMENT: { value: Equipment; title: string; hint: string }[] = [
  { value: 'none', title: 'Ничего', hint: 'Только собственный вес' },
  { value: 'basic', title: 'Коврик и резинки', hint: 'Минимальный набор' },
  { value: 'dumbbells', title: 'Есть гантели', hint: 'Плюс коврик и резинки' },
];

function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Onboarding() {
  const { setMe } = useMe();
  const navigate = useNavigate();
  const [step, setStep] = useState(0); // 0 = дисклеймер
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const [noCycle, setNoCycle] = useState(false);
  const [cycleStartDate, setCycleStartDate] = useState('');
  const [cycleLength, setCycleLength] = useState(28);
  const [periodLength, setPeriodLength] = useState(5);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [equipment, setEquipment] = useState<Equipment | null>(null);

  const TOTAL_STEPS = 5;

  async function finish() {
    setSaving(true);
    setSaveError(false);
    const payload: UpdateMeRequest = {
      goal: goal ?? 'tone',
      level: level ?? 'beginner',
      restrictions,
      equipment: equipment ?? 'none',
      cycleMode: noCycle ? 'no_cycle' : 'tracked',
      cycleStartDate: noCycle ? null : cycleStartDate,
      cycleLength,
      periodLength,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow',
      disclaimerAccepted: true,
      onboardingCompleted: true,
    };
    try {
      const me = await api.updateMe(payload);
      setMe(me);
      hapticSuccess();
      navigate('/', { replace: true });
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  function toggleRestriction(r: Restriction) {
    setRestrictions((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  return (
    <div className="max-w-md mx-auto min-h-screen safe-px px-5 pb-8">
      {step > 0 && <ProgressBar step={step} total={TOTAL_STEPS} />}

      {step === 0 && (
        <div className="fade-in pt-10">
          <div className="text-5xl mb-4">🌸</div>
          <h1 className="text-2xl font-bold mb-3">Прежде чем начать</h1>
          <Card className="mb-4">
            <p className="text-sm leading-relaxed text-soft">
              CycleFit — это wellness-рекомендации, а не медицинская консультация. Приложение не является
              медицинским сервисом и не подходит при беременности и в первые месяцы после родов. При
              заболеваниях, недавних операциях или сомнениях о нагрузке — проконсультируйся с врачом.
            </p>
          </Card>
          <label className="flex items-start gap-3 mb-6 px-1">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 w-5 h-5 accent-peach-400"
            />
            <span className="text-sm">Я понимаю и согласна с условиями</span>
          </label>
          <Button onClick={() => setStep(1)} disabled={!agreed}>
            Продолжить
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className="fade-in">
          <h1 className="text-2xl font-bold mb-1">Твой цикл</h1>
          <p className="text-soft text-sm mb-5">Это нужно, чтобы подстроить тренировки под твои фазы.</p>

          {!noCycle && (
            <>
              <Card className="mb-3">
                <label className="text-sm font-medium block mb-2">Первый день последних месячных</label>
                <input
                  type="date"
                  value={cycleStartDate}
                  max={todayLocalISO()}
                  onChange={(e) => setCycleStartDate(e.target.value)}
                  className="w-full p-3 rounded-xl border border-peach-100 bg-cream text-base"
                />
              </Card>
              <Card className="mb-3">
                <label className="text-sm font-medium block mb-2">
                  Длина цикла: <span className="text-peach-500 font-bold">{cycleLength} дней</span>
                </label>
                <input
                  type="range"
                  min={21}
                  max={35}
                  value={cycleLength}
                  onChange={(e) => setCycleLength(Number(e.target.value))}
                  className="w-full accent-peach-400"
                />
              </Card>
              <Card className="mb-4">
                <label className="text-sm font-medium block mb-2">
                  Длительность месячных: <span className="text-peach-500 font-bold">{periodLength} дней</span>
                </label>
                <input
                  type="range"
                  min={3}
                  max={7}
                  value={periodLength}
                  onChange={(e) => setPeriodLength(Number(e.target.value))}
                  className="w-full accent-peach-400"
                />
              </Card>
              <Button onClick={() => setStep(2)} disabled={!cycleStartDate} className="mb-3">
                Дальше
              </Button>
            </>
          )}

          {noCycle ? (
            <div className="fade-in">
              <Card className="mb-4 border border-lavender-200">
                <p className="text-sm text-soft">
                  Хорошо! Ты получишь мягкую 4-недельную программу с чередованием нагрузки — без привязки к
                  фазам.
                </p>
              </Card>
              <Button onClick={() => setStep(2)} className="mb-3">
                Дальше
              </Button>
              <Button variant="ghost" onClick={() => setNoCycle(false)}>
                Вернуться к отслеживанию цикла
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setNoCycle(true)}>
              Не отслеживаю / нерегулярный цикл
            </Button>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="fade-in">
          <h1 className="text-2xl font-bold mb-5">Что для тебя главное?</h1>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {GOALS.map((g) => (
              <button
                key={g.value}
                onClick={() => {
                  setGoal(g.value);
                  setStep(3);
                }}
                className={`text-left p-4 rounded-3xl transition ${
                  goal === g.value ? 'bg-peach-200 ring-2 ring-peach-400' : 'bg-white'
                }`}
              >
                <div className="text-3xl mb-2">{g.emoji}</div>
                <div className="font-semibold">{g.title}</div>
                <div className="text-xs text-soft mt-1">{g.hint}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="fade-in">
          <h1 className="text-2xl font-bold mb-5">Твой уровень</h1>
          <div className="flex flex-col gap-3">
            {LEVELS.map((l) => (
              <button
                key={l.value}
                onClick={() => {
                  setLevel(l.value);
                  setStep(4);
                }}
                className={`text-left p-4 rounded-3xl transition ${
                  level === l.value ? 'bg-peach-200 ring-2 ring-peach-400' : 'bg-white'
                }`}
              >
                <div className="font-semibold">{l.title}</div>
                <div className="text-sm text-soft mt-1">{l.hint}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="fade-in">
          <h1 className="text-2xl font-bold mb-1">Ограничения и инвентарь</h1>
          <p className="text-soft text-sm mb-5">Заменим упражнения, которые тебе не подходят.</p>

          <div className="text-sm font-medium mb-2">Есть ли зоны, которые стоит беречь?</div>
          <div className="flex flex-wrap gap-2 mb-6">
            {RESTRICTIONS.map((r) => (
              <button
                key={r.value}
                onClick={() => toggleRestriction(r.value)}
                className={`px-4 py-2.5 rounded-full text-sm font-medium transition ${
                  restrictions.includes(r.value) ? 'bg-peach-400 text-white' : 'bg-white text-ink'
                }`}
              >
                {r.title}
              </button>
            ))}
            <button
              onClick={() => setRestrictions([])}
              className={`px-4 py-2.5 rounded-full text-sm font-medium transition ${
                restrictions.length === 0 ? 'bg-peach-400 text-white' : 'bg-white text-ink'
              }`}
            >
              Нет
            </button>
          </div>

          <div className="text-sm font-medium mb-2">Какой инвентарь под рукой?</div>
          <div className="flex flex-col gap-3 mb-6">
            {EQUIPMENT.map((e) => (
              <button
                key={e.value}
                onClick={() => setEquipment(e.value)}
                className={`text-left p-4 rounded-3xl transition ${
                  equipment === e.value ? 'bg-peach-200 ring-2 ring-peach-400' : 'bg-white'
                }`}
              >
                <div className="font-semibold">{e.title}</div>
                <div className="text-sm text-soft">{e.hint}</div>
              </button>
            ))}
          </div>
          <Button onClick={() => setStep(5)} disabled={!equipment}>
            Дальше
          </Button>
        </div>
      )}

      {step === 5 && (
        <div className="fade-in pt-8 text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold mb-2">Твой план готов!</h1>
          <p className="text-soft mb-6">
            Тренировки будут подстраиваться под {noCycle ? '4-недельную программу' : 'фазы твоего цикла'}: мягче
            в дни отдыха, сильнее — на пике энергии. Первая неделя — в подарок.
          </p>
          {saveError && (
            <p className="text-sm text-red-400 mb-3">Не получилось сохранить. Проверь интернет и попробуй ещё раз.</p>
          )}
          <Button onClick={finish} disabled={saving}>
            {saving ? 'Секунду…' : 'Начать'}
          </Button>
        </div>
      )}
    </div>
  );
}
