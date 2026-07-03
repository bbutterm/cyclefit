import { useEffect, useState } from 'react';
import {
  Admin,
  ArrayInput,
  AutocompleteInput,
  BooleanField,
  BooleanInput,
  Create,
  CustomRoutes,
  Datagrid,
  DateField,
  Edit,
  EditButton,
  List,
  NumberField,
  NumberInput,
  ReferenceInput,
  Resource,
  SelectArrayInput,
  SelectInput,
  SimpleForm,
  SimpleFormIterator,
  TextField,
  TextInput,
  required,
  useNotify,
  useRecordContext,
  useRefresh,
} from 'react-admin';
import { Link, Route } from 'react-router-dom';
import { authProvider, dataProvider, http } from './providers';

// --- Справочники ---

const PHASE_CHOICES = [
  { id: 'menstrual', name: 'Менструация' },
  { id: 'follicular', name: 'Фолликулярная' },
  { id: 'ovulatory', name: 'Овуляторная' },
  { id: 'luteal', name: 'Лютеиновая' },
];
const LEVEL_CHOICES = [
  { id: 'beginner', name: 'Начинающая' },
  { id: 'intermediate', name: 'Средний' },
  { id: 'advanced', name: 'Продвинутый' },
];
const EQUIPMENT_CHOICES = [
  { id: 'none', name: 'Без инвентаря' },
  { id: 'basic', name: 'Коврик + резинки' },
  { id: 'dumbbells', name: 'Гантели' },
];
const RESTRICTION_CHOICES = [
  { id: 'knees', name: 'Колени' },
  { id: 'back', name: 'Спина' },
  { id: 'diastasis', name: 'Диастаз' },
];
const MUSCLE_CHOICES = [
  { id: 'legs', name: 'Ноги' },
  { id: 'glutes', name: 'Ягодицы' },
  { id: 'core', name: 'Кор' },
  { id: 'back', name: 'Спина' },
  { id: 'posture', name: 'Осанка' },
  { id: 'mobility', name: 'Мобильность/растяжка' },
];

// --- Упражнения (§8.1) ---

function ExerciseImages() {
  const record = useRecordContext();
  const notify = useNotify();
  const refresh = useRefresh();
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');

  if (!record) return null;
  const images = (record.images ?? []) as { id: string; url: string; caption: string | null; order: number }[];

  async function upload() {
    if (!file || !record) return;
    const form = new FormData();
    form.append('order', String(images.length));
    form.append('caption', caption);
    form.append('file', file);
    try {
      await http(`/api/admin/exercises/${record.id}/images`, { method: 'POST', body: form });
      notify('Картинка загружена', { type: 'success' });
      setFile(null);
      setCaption('');
      refresh();
    } catch {
      notify('Не удалось загрузить', { type: 'error' });
    }
  }

  async function remove(imageId: string) {
    await http(`/api/admin/exercise-images/${imageId}`, { method: 'DELETE' });
    refresh();
  }

  return (
    <div style={{ margin: '16px 0' }}>
      <h4>Картинки (кадры: старт / движение / финиш)</h4>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {images.map((img) => (
          <figure key={img.id} style={{ margin: 0, width: 160 }}>
            <img src={img.url} alt={img.caption ?? ''} style={{ width: '100%', borderRadius: 8 }} />
            <figcaption style={{ fontSize: 12 }}>
              #{img.order + 1} {img.caption}
              <button type="button" onClick={() => remove(img.id)} style={{ marginLeft: 8 }}>
                ✕
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <input
          placeholder="Подпись кадра"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          style={{ padding: 6 }}
        />
        <button type="button" onClick={upload} disabled={!file}>
          Загрузить
        </button>
      </div>
    </div>
  );
}

const exerciseForm = (
  <>
    <TextInput source="slug" validate={required()} helperText="Уникальный код, латиницей" />
    <TextInput source="name" label="Название" validate={required()} fullWidth />
    <TextInput source="description" label="Техника выполнения" multiline rows={4} validate={required()} fullWidth />
    <TextInput source="commonMistakes" label="Частые ошибки" multiline rows={2} fullWidth />
    <TextInput source="safetyCue" label="Подсказка безопасности" fullWidth helperText="Коротко: «спина прямая…»" />
    <SelectArrayInput source="muscleGroups" label="Группы мышц" choices={MUSCLE_CHOICES} />
    <SelectInput source="equipment" label="Инвентарь" choices={EQUIPMENT_CHOICES} validate={required()} />
    <SelectArrayInput source="contraindications" label="Противопоказания" choices={RESTRICTION_CHOICES} />
  </>
);

const ExerciseList = () => (
  <List filters={[<TextInput key="q" source="q" label="Поиск" alwaysOn />]}>
    <Datagrid rowClick="edit">
      <TextField source="name" label="Название" />
      <TextField source="equipment" label="Инвентарь" />
      <TextField source="muscleGroups" label="Группы мышц" />
      <TextField source="contraindications" label="Противопоказания" />
    </Datagrid>
  </List>
);

const ExerciseEdit = () => (
  <Edit>
    <SimpleForm>
      {exerciseForm}
      <ExerciseImages />
    </SimpleForm>
  </Edit>
);

const ExerciseCreate = () => (
  <Create redirect="edit">
    <SimpleForm>{exerciseForm}</SimpleForm>
  </Create>
);

// --- Тренировки (§8.2) ---

const workoutTransform = (data: Record<string, unknown>) => ({
  ...data,
  items: ((data.items as Record<string, unknown>[]) ?? []).map((item, index) => ({
    exerciseId: item.exerciseId,
    sets: item.sets ?? 1,
    reps: item.reps ?? null,
    durationSec: item.durationSec ?? null,
    restSec: item.restSec ?? 30,
    order: index,
  })),
});

const workoutForm = (
  <>
    <TextInput source="title" label="Название" validate={required()} fullWidth />
    <SelectInput source="phase" label="Фаза" choices={PHASE_CHOICES} validate={required()} />
    <SelectInput source="level" label="Уровень" choices={LEVEL_CHOICES} validate={required()} />
    <SelectInput source="equipment" label="Инвентарь" choices={EQUIPMENT_CHOICES} validate={required()} />
    <NumberInput source="durationMin" label="Длительность, мин" validate={required()} min={5} max={60} />
    <NumberInput source="intensity" label="Интенсивность (1–5)" min={1} max={5} />
    <TextInput source="description" label="Описание" multiline fullWidth />
    <BooleanInput source="isPublished" label="Опубликована" />
    <ArrayInput source="items" label="Состав (порядок = порядок выполнения)">
      <SimpleFormIterator inline>
        <ReferenceInput source="exerciseId" reference="exercises">
          <AutocompleteInput label="Упражнение" optionText="name" validate={required()} sx={{ minWidth: 220 }} />
        </ReferenceInput>
        <NumberInput source="sets" label="Подходы" defaultValue={2} min={1} />
        <NumberInput source="reps" label="Повторы" helperText="или время" />
        <NumberInput source="durationSec" label="Время, сек" />
        <NumberInput source="restSec" label="Отдых, сек" defaultValue={30} min={0} />
      </SimpleFormIterator>
    </ArrayInput>
  </>
);

const WorkoutList = () => (
  <List
    filters={[
      <TextInput key="q" source="q" label="Поиск" alwaysOn />,
      <SelectInput key="phase" source="phase" label="Фаза" choices={PHASE_CHOICES} />,
      <SelectInput key="level" source="level" label="Уровень" choices={LEVEL_CHOICES} />,
      <SelectInput key="equipment" source="equipment" label="Инвентарь" choices={EQUIPMENT_CHOICES} />,
    ]}
  >
    <Datagrid rowClick="edit">
      <TextField source="title" label="Название" />
      <TextField source="phase" label="Фаза" />
      <TextField source="level" label="Уровень" />
      <TextField source="equipment" label="Инвентарь" />
      <NumberField source="durationMin" label="Мин" />
      <BooleanField source="isPublished" label="Опубл." />
    </Datagrid>
  </List>
);

const WorkoutEdit = () => (
  <Edit transform={workoutTransform} mutationMode="pessimistic">
    <SimpleForm>{workoutForm}</SimpleForm>
  </Edit>
);

const WorkoutCreate = () => (
  <Create transform={workoutTransform} redirect="list">
    <SimpleForm>{workoutForm}</SimpleForm>
  </Create>
);

// --- Фазовый контент (§8.3) ---

const PhaseContentList = () => (
  <List filters={[<SelectInput key="phase" source="phase" label="Фаза" choices={PHASE_CHOICES} alwaysOn />]}>
    <Datagrid rowClick="edit">
      <TextField source="phase" label="Фаза" />
      <NumberField source="order" label="Порядок" />
      <TextField source="nutritionTip" label="Питание" />
      <TextField source="bodyNote" label="Что с телом" />
    </Datagrid>
  </List>
);

const phaseContentForm = (
  <>
    <SelectInput source="phase" label="Фаза" choices={PHASE_CHOICES} validate={required()} />
    <NumberInput source="order" label="Порядок" defaultValue={0} />
    <NumberInput source="dayHintMin" label="С дня (опц.)" />
    <NumberInput source="dayHintMax" label="По день (опц.)" />
    <TextInput source="nutritionTip" label="Совет по питанию" multiline rows={3} validate={required()} fullWidth />
    <TextInput source="bodyNote" label="Что происходит с телом" multiline rows={3} validate={required()} fullWidth />
  </>
);

const PhaseContentEdit = () => (
  <Edit>
    <SimpleForm>{phaseContentForm}</SimpleForm>
  </Edit>
);
const PhaseContentCreate = () => (
  <Create redirect="list">
    <SimpleForm>{phaseContentForm}</SimpleForm>
  </Create>
);

// --- Пользователи (§8.4) ---

function GrantSubscriptionButton() {
  const record = useRecordContext();
  const notify = useNotify();
  const refresh = useRefresh();
  if (!record) return null;

  async function grant(plan: string) {
    try {
      await http(`/api/admin/users/${record!.id}/subscription`, {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
      notify('Подписка выдана', { type: 'success' });
      refresh();
    } catch {
      notify('Ошибка', { type: 'error' });
    }
  }

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => grant('monthly')}>+1 мес</button>{' '}
      <button type="button" onClick={() => grant('yearly')}>+1 год</button>
    </span>
  );
}

const UserList = () => (
  <List filters={[<TextInput key="q" source="q" label="Поиск" alwaysOn />]}>
    <Datagrid bulkActionButtons={false}>
      <TextField source="telegramId" label="Telegram ID" />
      <TextField source="firstName" label="Имя" />
      <TextField source="username" label="Username" />
      <BooleanField source="onboardingCompleted" label="Онбординг" />
      <TextField source="subscriptionStatus" label="Подписка" />
      <DateField source="subscriptionEndsAt" label="До" />
      <NumberField source="completedWorkouts" label="Тренировок" />
      <GrantSubscriptionButton />
    </Datagrid>
  </List>
);

// --- Тексты (§8.6) ---

const TextList = () => (
  <List perPage={50}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <TextField source="key" label="Ключ" />
      <TextField source="value" label="Текст" />
      <BooleanField source="isOverridden" label="Изменён" />
      <EditButton />
    </Datagrid>
  </List>
);

const TextEdit = () => (
  <Edit>
    <SimpleForm>
      <TextInput source="key" label="Ключ" disabled />
      <TextInput source="value" label="Текст" multiline rows={4} fullWidth validate={required()} />
    </SimpleForm>
  </Edit>
);

// --- Дашборд (§8.5) + матрица покрытия (§8.2) ---

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, minWidth: 180, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
      <div style={{ fontSize: 13, color: '#777' }}>{title}</div>
      <div style={{ fontSize: 32, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Dashboard() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    http('/api/admin/dashboard').then((r) => setStats(r.data)).catch(() => setStats(null));
  }, []);
  return (
    <div style={{ padding: 24 }}>
      <h2>CycleFit — дашборд</h2>
      {stats && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <StatCard title="Пользовательниц" value={stats.usersTotal} />
          <StatCard title="Активны за 7 дней" value={stats.activeLast7Days} />
          <StatCard title="Триалов" value={stats.trials} />
          <StatCard title="Активных подписок" value={stats.activeSubscriptions} />
          <StatCard title="Тренировок за неделю" value={stats.workoutsCompletedLast7Days} />
        </div>
      )}
      <Link to="/coverage">→ Матрица покрытия слотов</Link>
    </div>
  );
}

interface CoverageCell {
  phase: string;
  level: string;
  equipment: string;
  publishedCount: number;
}

function CoveragePage() {
  const [cells, setCells] = useState<CoverageCell[]>([]);
  useEffect(() => {
    http('/api/admin/workouts/coverage').then((r) => setCells(r.data)).catch(() => {});
  }, []);

  const phases = ['menstrual', 'follicular', 'ovulatory', 'luteal'];
  const levels = ['beginner', 'intermediate', 'advanced'];
  const equipments = ['none', 'basic', 'dumbbells'];
  const get = (p: string, l: string, e: string) =>
    cells.find((c) => c.phase === p && c.level === l && c.equipment === e)?.publishedCount ?? 0;
  const phaseName = (p: string) => PHASE_CHOICES.find((c) => c.id === p)?.name ?? p;
  const levelName = (l: string) => LEVEL_CHOICES.find((c) => c.id === l)?.name ?? l;
  const eqName = (e: string) => EQUIPMENT_CHOICES.find((c) => c.id === e)?.name ?? e;

  return (
    <div style={{ padding: 24 }}>
      <h2>Матрица покрытия слотов (4×3×3)</h2>
      <p style={{ color: '#777' }}>Число опубликованных тренировок; красным — слоты с &lt;2 тренировками.</p>
      <table style={{ borderCollapse: 'collapse', background: '#fff' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #ddd', padding: 8 }}>Фаза</th>
            {levels.map((l) =>
              equipments.map((e) => (
                <th key={l + e} style={{ border: '1px solid #ddd', padding: 8, fontSize: 12 }}>
                  {levelName(l)}
                  <br />
                  {eqName(e)}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {phases.map((p) => (
            <tr key={p}>
              <td style={{ border: '1px solid #ddd', padding: 8, fontWeight: 600 }}>{phaseName(p)}</td>
              {levels.map((l) =>
                equipments.map((e) => {
                  const count = get(p, l, e);
                  return (
                    <td
                      key={l + e}
                      style={{
                        border: '1px solid #ddd',
                        padding: 8,
                        textAlign: 'center',
                        fontWeight: 600,
                        background: count < 2 ? '#ffd6d6' : '#d9f2df',
                      }}
                    >
                      {count}
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  return (
    <Admin dataProvider={dataProvider} authProvider={authProvider} dashboard={Dashboard} title="CycleFit Admin">
      <Resource
        name="exercises"
        options={{ label: 'Упражнения' }}
        list={ExerciseList}
        edit={ExerciseEdit}
        create={ExerciseCreate}
      />
      <Resource
        name="workouts"
        options={{ label: 'Тренировки' }}
        list={WorkoutList}
        edit={WorkoutEdit}
        create={WorkoutCreate}
      />
      <Resource
        name="phase-content"
        options={{ label: 'Фазовый контент' }}
        list={PhaseContentList}
        edit={PhaseContentEdit}
        create={PhaseContentCreate}
      />
      <Resource name="users" options={{ label: 'Пользователи' }} list={UserList} />
      <Resource name="texts" options={{ label: 'Тексты' }} list={TextList} edit={TextEdit} />
      <CustomRoutes>
        <Route path="/coverage" element={<CoveragePage />} />
      </CustomRoutes>
    </Admin>
  );
}
