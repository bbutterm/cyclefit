import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { config } from '../src/config.js';
import { getImageStorage } from '../src/services/storage.js';

// Импорт реальных иллюстраций упражнений из assets/exercise-images/<slug>-<n>.webp:
// загружает в Storage и заменяет placeholder-картинки. Идемпотентен (перезаливает).
// Запускается в build:vercel после seed.

const prisma = new PrismaClient();

const CAPTIONS: Record<string, string[]> = {
  'cat-cow': ['Прогиб (корова)', 'Округление (кошка)'],
  'childs-pose': ['Опускание к пяткам', 'Расслабление'],
  'hip-flexor-stretch': ['Выпад, колено на полу', 'Таз вперёд, натяжение'],
  superman: ['Старт, лёжа на животе', 'Руки и ноги вверх', 'Опускание'],
  'band-row': ['Старт, резинка на стопах', 'Тяга к поясу', 'Возврат'],
  'band-pull-apart': ['Резинка перед грудью', 'Развести в стороны', 'Возврат'],
  'dead-bug': ['Старт, руки и ноги вверх', 'Разноимённые рука и нога', 'Возврат'],
  'side-plank-knees': ['Старт на боку, опора на предплечье', 'Таз поднят'],
  'bird-dog': ['Старт, четвереньки', 'Рука и нога в линию', 'Возврат'],
  squat: ['Старт стоя', 'Присед', 'Подъём'],
  'glute-bridge': ['Старт лёжа', 'Таз вверх', 'Опускание'],
  lunges: ['Старт стоя', 'Выпад, оба колена 90°', 'Возврат'],
  'dumbbell-rdl': ['Старт, гантели у бёдер', 'Таз назад, спина прямая', 'Подъём через ягодицы'],
  'side-leg-raise': ['Старт лёжа на боку', 'Нога вверх', 'Опускание'],
  plank: ['Упор на предплечья', 'Удержание, тело в линию'],
};

const ASSETS_DIR = resolve(process.cwd(), '../../assets/exercise-images');

async function main(): Promise<void> {
  if (!existsSync(ASSETS_DIR)) {
    console.log(`Папки ${ASSETS_DIR} нет — пропускаю импорт картинок`);
    return;
  }
  const storage = getImageStorage();
  let imported = 0;

  for (const [slug, captions] of Object.entries(CAPTIONS)) {
    const exercise = await prisma.exercise.findUnique({ where: { slug } });
    if (!exercise) {
      console.log(`Упражнение ${slug} не найдено — пропускаю`);
      continue;
    }

    const frames: { order: number; caption: string; buffer: Buffer }[] = [];
    for (let i = 0; i < captions.length; i++) {
      const path = resolve(ASSETS_DIR, `${slug}-${i + 1}.webp`);
      if (!existsSync(path)) continue;
      frames.push({ order: i, caption: captions[i], buffer: readFileSync(path) });
    }
    if (frames.length === 0) continue;

    // заменяем placeholder'ы
    await prisma.exerciseImage.deleteMany({ where: { exerciseId: exercise.id } });
    for (const f of frames) {
      const url = await storage.save(`${slug}-${f.order + 1}.webp`, f.buffer, 'image/webp');
      await prisma.exerciseImage.create({
        data: { exerciseId: exercise.id, order: f.order, caption: f.caption, url },
      });
      imported++;
    }
    console.log(`✓ ${slug}: ${frames.length} кадр(ов)`);
  }
  console.log(`Импортировано картинок: ${imported} (режим storage: ${config.supabaseUrl ? 'supabase' : 'local'})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
