import type { IncomingMessage, ServerResponse } from 'node:http';
import { prisma } from '../apps/backend/src/prisma.js';
import { buildFullApp } from '../apps/backend/src/server.js';

// Serverless-вход Vercel: весь Fastify-бэкенд в одной функции.
// vercel.json перенаправляет /api/* сюда; статика Mini App/админки отдаётся Vercel напрямую.

type App = ReturnType<typeof buildFullApp>['app'];

let appPromise: Promise<App> | null = null;

async function getApp(): Promise<App> {
  const { app } = buildFullApp(prisma, false);
  await app.ready();
  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  appPromise ??= getApp();
  const app = await appPromise;
  app.server.emit('request', req, res);
}
