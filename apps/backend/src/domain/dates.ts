// Чистые функции работы с датами в формате YYYY-MM-DD (без таймзон —
// перевод «сейчас» в локальную дату пользовательницы делается в сервисном слое через Luxon).

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 86_400_000);
}

export function addDays(dateISO: string, days: number): string {
  const d = new Date(Date.parse(dateISO) + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function isValidISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}
