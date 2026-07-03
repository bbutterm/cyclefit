import type { PrismaClient } from '@prisma/client';

// Все тексты бота и пейвола (§4.5, §8.6): дефолты здесь, переопределяются в БД (AppText)
// через админку. Подстановки — {placeholder}.

export const DEFAULT_TEXTS: Record<string, string> = {
  'bot.welcome':
    'Привет! Я CycleFit 🌸\n\nПомогу тренироваться в ритме твоего цикла: мягко в дни менструации, в полную силу — когда энергия на пике.\n\nОткрой приложение, ответь на пару вопросов — и твой план будет готов.',
  'bot.welcome.button': 'Открыть приложение',
  'bot.daily':
    'День {day} цикла, {phase}.\nСегодня: {workout}, {min} мин.',
  'bot.daily.nocycle': 'Неделя {week} программы.\nСегодня: {workout}, {min} мин.',
  'bot.daily.continue': 'Вчера не получилось — ничего страшного. Продолжим сегодня?',
  'bot.daily.open': 'Открыть тренировку',
  'bot.daily.mood': 'Как самочувствие?',
  'bot.mood.good': 'Отлично! Пусть день будет в твоём ритме 💫',
  'bot.mood.ok': 'Принято 🤍 Если что — тренировку всегда можно сделать короче.',
  'bot.mood.bad':
    'Заменила на мягкую практику {workout}, {min} мин. Отдых — тоже часть плана 💛',
  'bot.mood.bad.noworkout': 'Сегодня можно просто отдохнуть. Отдых — тоже часть плана 💛',
  'bot.period.question': 'Месячные начались?',
  'bot.period.today': 'Да, сегодня',
  'bot.period.yesterday': 'Начались вчера',
  'bot.period.before_yesterday': 'Начались позавчера',
  'bot.period.not_yet': 'Ещё нет',
  'bot.period.confirmed':
    'Записала 🌸 План пересчитан — в ближайшие дни будут мягкие практики. Береги себя.',
  'bot.period.not_yet.reply': 'Хорошо, спрошу позже. Если начнутся — отметь в приложении.',
  'bot.trial.ending':
    'Пробная неделя заканчивается {date}. Чтобы план продолжал подстраиваться под твой цикл, оформи подписку 💛',
  'bot.trial.button': 'Оформить подписку',
  'bot.winback':
    'Завтра у тебя начинается {phase} — лучшее время вернуться к тренировкам. Мы всё сохранили 🌸',
  'paywall.claim.1': 'План под твой цикл, пересчитывается каждый месяц',
  'paywall.claim.2': 'Составлено с участием сертифицированного тренера',
  'paywall.claim.3': '15–30 минут дома, без сложного инвентаря',
  'paywall.testmode': 'Тестовый режим: оплата не списывается',
  'workout.skipped_note':
    'Упражнение пропущено из-за твоих ограничений — безопасность важнее. Просто переходи к следующему 🤍',
  'workout.easy_day': 'Облегчённый день',
};

export async function getText(
  prisma: PrismaClient,
  key: string,
  vars: Record<string, string | number> = {},
): Promise<string> {
  const row = await prisma.appText.findUnique({ where: { key } }).catch(() => null);
  let text = row?.value ?? DEFAULT_TEXTS[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{${k}}`, String(v));
  }
  return text;
}
