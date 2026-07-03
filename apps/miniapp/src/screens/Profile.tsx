import type { Equipment, Level, Restriction, UpdateMeRequest } from '@cyclefit/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useMe } from '../App';
import { Button, Card } from '../ui';

const LEVEL_TITLES: Record<Level, string> = {
  beginner: 'Начинаю',
  intermediate: 'Занимаюсь иногда',
  advanced: 'Тренируюсь регулярно',
};

const EQUIPMENT_TITLES: Record<Equipment, string> = {
  none: 'Без инвентаря',
  basic: 'Коврик и резинки',
  dumbbells: 'Гантели',
};

const RESTRICTION_TITLES: Record<Restriction, string> = {
  knees: 'Колени',
  back: 'Спина',
  diastasis: 'Диастаз',
};

const SUB_TITLES: Record<string, string> = {
  trial: 'Пробный период',
  active: 'Активна',
  expired: 'Истекла',
  none: 'Нет подписки',
};

export default function Profile() {
  const { me, setMe } = useMe();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const [level, setLevel] = useState<Level>(me.level);
  const [equipment, setEquipment] = useState<Equipment>(me.equipment);
  const [restrictions, setRestrictions] = useState<Restriction[]>(me.restrictions);
  const [cycleLength, setCycleLength] = useState(me.cycleLength);
  const [periodLength, setPeriodLength] = useState(me.periodLength);
  const [notifyHour, setNotifyHour] = useState(me.notifyHourLocal);
  const [timezone, setTimezone] = useState(me.timezone);
  const [noCycle, setNoCycle] = useState(me.cycleMode === 'no_cycle');

  const dirty =
    level !== me.level ||
    equipment !== me.equipment ||
    restrictions.join() !== me.restrictions.join() ||
    cycleLength !== me.cycleLength ||
    periodLength !== me.periodLength ||
    notifyHour !== me.notifyHourLocal ||
    timezone !== me.timezone ||
    noCycle !== (me.cycleMode === 'no_cycle');

  async function save() {
    setSaving(true);
    setSaveError(false);
    const payload: UpdateMeRequest = {
      level,
      equipment,
      restrictions,
      cycleLength,
      periodLength,
      notifyHourLocal: notifyHour,
      timezone,
      cycleMode: noCycle ? 'no_cycle' : 'tracked',
    };
    try {
      setMe(await api.updateMe(payload));
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  const sub = me.subscription;
  const subEnds = sub.currentPeriodEndsAt ?? sub.trialEndsAt;

  return (
    <div className="px-5 pb-8 fade-in">
      <div className="flex items-center justify-between pt-5 mb-4">
        <Link to="/" className="text-sm font-medium text-peach-500">← Сегодня</Link>
        <h1 className="font-bold">Профиль</h1>
        <span className="w-12" />
      </div>

      {/* Подписка */}
      <Card className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-soft uppercase tracking-wide mb-1">Подписка</div>
            <div className="font-bold">{SUB_TITLES[sub.status]}</div>
            {subEnds && (
              <div className="text-xs text-soft mt-0.5">
                до {new Date(subEnds).toLocaleDateString('ru-RU')}
              </div>
            )}
          </div>
          <Button className="!w-auto px-5" variant="secondary" onClick={() => navigate('/paywall')}>
            Управлять
          </Button>
        </div>
      </Card>

      {/* Уровень */}
      <Card className="mb-3">
        <div className="text-sm font-medium mb-2">Уровень</div>
        <div className="flex flex-col gap-2">
          {(Object.keys(LEVEL_TITLES) as Level[]).map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`text-left px-4 py-2.5 rounded-xl text-sm transition ${
                level === l ? 'bg-peach-200 font-semibold' : 'bg-cream'
              }`}
            >
              {LEVEL_TITLES[l]}
            </button>
          ))}
        </div>
      </Card>

      {/* Инвентарь */}
      <Card className="mb-3">
        <div className="text-sm font-medium mb-2">Инвентарь</div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(EQUIPMENT_TITLES) as Equipment[]).map((e) => (
            <button
              key={e}
              onClick={() => setEquipment(e)}
              className={`px-4 py-2 rounded-full text-sm transition ${
                equipment === e ? 'bg-peach-400 text-white font-semibold' : 'bg-cream'
              }`}
            >
              {EQUIPMENT_TITLES[e]}
            </button>
          ))}
        </div>
      </Card>

      {/* Ограничения */}
      <Card className="mb-3">
        <div className="text-sm font-medium mb-2">Ограничения</div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(RESTRICTION_TITLES) as Restriction[]).map((r) => (
            <button
              key={r}
              onClick={() =>
                setRestrictions((prev) =>
                  prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
                )
              }
              className={`px-4 py-2 rounded-full text-sm transition ${
                restrictions.includes(r) ? 'bg-peach-400 text-white font-semibold' : 'bg-cream'
              }`}
            >
              {RESTRICTION_TITLES[r]}
            </button>
          ))}
        </div>
      </Card>

      {/* Цикл */}
      <Card className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">Параметры цикла</div>
          <label className="flex items-center gap-2 text-xs text-soft">
            <input
              type="checkbox"
              checked={noCycle}
              onChange={(e) => setNoCycle(e.target.checked)}
              className="accent-peach-400"
            />
            не отслеживаю
          </label>
        </div>
        {!noCycle && (
          <>
            <label className="text-xs text-soft block mb-1">
              Длина цикла: <b>{cycleLength} дней</b>
            </label>
            <input
              type="range"
              min={21}
              max={35}
              value={cycleLength}
              onChange={(e) => setCycleLength(Number(e.target.value))}
              className="w-full accent-peach-400 mb-3"
            />
            <label className="text-xs text-soft block mb-1">
              Длительность месячных: <b>{periodLength} дней</b>
            </label>
            <input
              type="range"
              min={3}
              max={7}
              value={periodLength}
              onChange={(e) => setPeriodLength(Number(e.target.value))}
              className="w-full accent-peach-400"
            />
            <p className="text-xs text-soft mt-2">
              Дату начала месячных можно отметить в{' '}
              <Link to="/calendar" className="text-peach-500 underline">календаре</Link>.
            </p>
          </>
        )}
      </Card>

      {/* Уведомления */}
      <Card className="mb-4">
        <div className="text-sm font-medium mb-2">Уведомления</div>
        <label className="text-xs text-soft block mb-1">
          Время утреннего сообщения: <b>{String(notifyHour).padStart(2, '0')}:00</b>
        </label>
        <input
          type="range"
          min={5}
          max={22}
          value={notifyHour}
          onChange={(e) => setNotifyHour(Number(e.target.value))}
          className="w-full accent-peach-400 mb-3"
        />
        <label className="text-xs text-soft block mb-1">Таймзона</label>
        <input
          type="text"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full p-2.5 rounded-xl border border-peach-100 bg-cream text-sm"
          placeholder="Europe/Moscow"
        />
      </Card>

      {saveError && (
        <p className="text-sm text-red-400 mb-3 text-center">Не получилось сохранить. Попробуй ещё раз.</p>
      )}
      {dirty && (
        <Button onClick={save} disabled={saving} className="mb-4">
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </Button>
      )}

      <div className="text-center text-xs text-soft leading-relaxed">
        CycleFit — wellness-рекомендации, не медицинская консультация.
        <br />
        При беременности и заболеваниях проконсультируйся с врачом.
      </div>
    </div>
  );
}
