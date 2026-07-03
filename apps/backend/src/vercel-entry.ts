import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { prisma } from './prisma.js';
import { buildFullApp } from './server.js';

// Вход serverless-функции Vercel. При сборке (pnpm build:vercel) бандлится esbuild'ом
// в api/index.js — один самодостаточный файл (кроме @prisma/client с нативным движком).

let appPromise: Promise<FastifyInstance> | null = null;

async function getApp(): Promise<FastifyInstance> {
  const { app } = buildFullApp(prisma, false);
  await app.ready();
  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  appPromise ??= getApp();
  const app = await appPromise;
  app.server.emit('request', req, res);
}
