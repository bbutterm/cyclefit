import type { IncomingMessage, ServerResponse } from 'node:http';

// Вход serverless-функции Vercel (бандлится esbuild'ом в api/index.js).
// Вся инициализация — через динамический импорт внутри обработчика: если что-то
// падает при загрузке (env, Prisma, бандл), ошибка возвращается текстом в ответе,
// а не превращается в немой FUNCTION_INVOCATION_FAILED.

type App = { server: { emit: (event: string, req: IncomingMessage, res: ServerResponse) => void } };

let appPromise: Promise<App> | null = null;

async function getApp(): Promise<App> {
  const { prisma } = await import('./prisma.js');
  const { buildFullApp } = await import('./server.js');
  const { app } = buildFullApp(prisma, false);
  await app.ready();
  return app as unknown as App;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    appPromise ??= getApp();
    const app = await appPromise;
    app.server.emit('request', req, res);
  } catch (err) {
    appPromise = null; // следующая попытка — с чистого листа
    const detail = err instanceof Error ? `${err.stack ?? err.message}` : String(err);
    res.statusCode = 500;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(`CYCLEFIT INIT ERROR\n${detail}`);
  }
}
