import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { getImageStorage } from '../src/services/storage.js';
import { DEFAULT_TEXTS } from '../src/texts.js';
import { SEED_EXERCISES, type SeedExercise } from './exercises.js';
import { SEED_PHASE_CONTENT } from './phase-content.js';

const prisma = new PrismaClient();

type Phase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';
type Level = 'beginner' | 'intermediate' | 'advanced';
type Equipment = 'none' | 'basic' | 'dumbbells';

const PHASES: Phase[] = ['menstrual', 'follicular', 'ovulatory', 'luteal'];
const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced'];
const EQUIPMENTS: Equipment[] = ['none', 'basic', 'dumbbells'];

// --- SVG-заглушки картинок (§10): реальные иллюстрации загружаются через админку ---

const GROUP_COLORS: Record<string, string> = {
  legs: '#FFDAB9',
  glutes: '#FFD1DC',
  core: '#E6E6FA',
  back: '#D4F0DB',
  mobility: '#FFF3C4',
  posture: '#CDEFF5',
};

function svgPlaceholder(name: string, caption: string, color: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <rect width="600" height="400" rx="24" fill="${color}"/>
  <circle cx="300" cy="150" r="52" fill="#ffffff" opacity="0.7"/>
  <rect x="270" y="205" width="60" height="90" rx="28" fill="#ffffff" opacity="0.7"/>
  <text x="300" y="330" text-anchor="middle" font-family="sans-serif" font-size="26" font-weight="bold" fill="#6b5b73">${esc(name)}</text>
  <text x="300" y="365" text-anchor="middle" font-family="sans-serif" font-size="17" fill="#6b5b73">${esc(caption)}</text>
</svg>\n`;
}

async function seedExercises(): Promise<Map<string, string>> {
  const storage = getImageStorage();
  const idBySlug = new Map<string, string>();

  for (const ex of SEED_EXERCISES) {
    const { frames, ...fields } = ex;
    const exercise = await prisma.exercise.upsert({
      where: { slug: ex.slug },
      create: fields,
      update: fields,
    });
    idBySlug.set(ex.slug, exercise.id);

    const existingImages = await prisma.exerciseImage.count({ where: { exerciseId: exercise.id } });
    if (existingImages === 0) {
      const color = GROUP_COLORS[ex.muscleGroups[0]] ?? '#FFE4E1';
      for (let i = 0; i < frames.length; i++) {
        const filename = `seed-${ex.slug}-${i + 1}.svg`;
        const url = await storage.save(
          filename,
          Buffer.from(svgPlaceholder(ex.name, frames[i], color)),
          'image/svg+xml',
        );
        await prisma.exerciseImage.create({
          data: { exerciseId: exercise.id, order: i, url, caption: frames[i] },
        });
      }
    }
  }
  console.log(`✓ Упражнения: ${SEED_EXERCISES.length}`);
  return idBySlug;
}

// --- Тренировки: 2 варианта в каждом из 36 слотов (§3.2, §10) ---

const TIMED = new Set(['plank', 'side-plank-knees', 'cat-cow', 'childs-pose', 'hip-flexor-stretch']);

const PHASE_VARIANTS: Record<Phase, { title: string; slugs: string[]; intensity: number }[]> = {
  menstrual: [
    { title: 'Мягкое восстановление', slugs: ['cat-cow', 'dead-bug', 'hip-flexor-stretch', 'childs-pose'], intensity: 1 },
    { title: 'Нежная разминка', slugs: ['cat-cow', 'side-leg-raise', 'bird-dog', 'childs-pose'], intensity: 2 },
  ],
  follicular: [
    { title: 'Возвращение к тонусу', slugs: ['squat', 'glute-bridge', 'plank', 'bird-dog'], intensity: 3 },
    { title: 'Утренний заряд', slugs: ['lunges', 'side-leg-raise', 'dead-bug', 'superman'], intensity: 3 },
  ],
  ovulatory: [
    { title: 'Пик энергии', slugs: ['squat', 'lunges', 'plank', 'superman', 'glute-bridge'], intensity: 4 },
    { title: 'Сила и драйв', slugs: ['squat', 'side-leg-raise', 'bird-dog', 'dead-bug', 'lunges'], intensity: 5 },
  ],
  luteal: [
    { title: 'Спокойная сила', slugs: ['glute-bridge', 'side-leg-raise', 'cat-cow', 'dead-bug'], intensity: 2 },
    { title: 'Баланс и тонус', slugs: ['bird-dog', 'glute-bridge', 'hip-flexor-stretch', 'side-plank-knees'], intensity: 3 },
  ],
};

const LEVEL_PARAMS: Record<Level, { sets: number; reps: number; durationSec: number; restSec: number }> = {
  beginner: { sets: 2, reps: 10, durationSec: 25, restSec: 40 },
  intermediate: { sets: 3, reps: 12, durationSec: 35, restSec: 30 },
  advanced: { sets: 3, reps: 15, durationSec: 45, restSec: 25 },
};

/** Слоты с инвентарём получают вариацию: резинки/гантели вместо части базовых упражнений. */
function slugsForEquipment(baseSlugs: string[], equipment: Equipment, variant: number, phase: Phase): string[] {
  const slugs = [...baseSlugs];
  if (equipment === 'basic' || equipment === 'dumbbells') {
    // заменяем одно из упражнений на упражнение с резинкой
    const band = variant === 0 ? 'band-row' : 'band-pull-apart';
    slugs[slugs.length - 1] = band;
  }
  if (equipment === 'dumbbells' && phase !== 'menstrual') {
    slugs.push('dumbbell-rdl');
  }
  return slugs;
}

function estimateDuration(count: number, sets: number, restSec: number): number {
  const perSet = 45 + restSec;
  const min = Math.round((count * sets * perSet) / 60);
  return Math.max(15, Math.min(30, min));
}

async function seedWorkouts(idBySlug: Map<string, string>): Promise<void> {
  let created = 0;
  for (const phase of PHASES) {
    for (const level of LEVELS) {
      for (const equipment of EQUIPMENTS) {
        for (let variant = 0; variant < PHASE_VARIANTS[phase].length; variant++) {
          const spec = PHASE_VARIANTS[phase][variant];
          const title = spec.title;

          const existing = await prisma.workout.findFirst({
            where: { title, phase, level, equipment },
          });
          if (existing) continue;

          const p = LEVEL_PARAMS[level];
          const slugs = slugsForEquipment(spec.slugs, equipment, variant, phase);
          // в мягких тренировках отдых короче и подходов меньше
          const sets = phase === 'menstrual' ? Math.max(1, p.sets - 1) : p.sets;

          const items = slugs
            .filter((slug) => idBySlug.has(slug))
            .map((slug, i) => ({
              exerciseId: idBySlug.get(slug)!,
              order: i,
              sets,
              reps: TIMED.has(slug) ? null : p.reps,
              durationSec: TIMED.has(slug) ? p.durationSec : null,
              restSec: phase === 'menstrual' ? 20 : p.restSec,
            }));

          await prisma.workout.create({
            data: {
              title,
              phase,
              level,
              equipment,
              intensity: spec.intensity,
              durationMin: estimateDuration(items.length, sets, p.restSec),
              description:
                phase === 'menstrual'
                  ? 'Мягкая практика: двигайся в комфортном темпе, любой пункт можно пропустить.'
                  : null,
              isPublished: true,
              items: { create: items },
            },
          });
          created++;
        }
      }
    }
  }
  console.log(`✓ Тренировки: создано ${created} (36 слотов × 2 варианта)`);
}

async function seedPhaseContent(): Promise<void> {
  const count = await prisma.phaseContent.count();
  if (count > 0) {
    console.log('✓ Фазовый контент уже есть — пропускаю');
    return;
  }
  await prisma.phaseContent.createMany({ data: SEED_PHASE_CONTENT });
  console.log(`✓ Фазовый контент: ${SEED_PHASE_CONTENT.length} записей`);
}

async function seedTexts(): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULT_TEXTS)) {
    await prisma.appText.upsert({ where: { key }, create: { key, value }, update: {} });
  }
  console.log(`✓ Тексты: ${Object.keys(DEFAULT_TEXTS).length} ключей`);
}

async function seedAdmin(): Promise<void> {
  const passwordHash = await bcrypt.hash(config.adminPassword, 10);
  await prisma.adminUser.upsert({
    where: { email: config.adminEmail },
    create: { email: config.adminEmail, passwordHash },
    update: {},
  });
  console.log(`✓ Админ: ${config.adminEmail}`);
}

async function main(): Promise<void> {
  const idBySlug = await seedExercises();
  await seedWorkouts(idBySlug);
  await seedPhaseContent();
  await seedTexts();
  await seedAdmin();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
