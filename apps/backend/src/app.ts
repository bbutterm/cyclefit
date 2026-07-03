import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync, mkdirSync } from 'node:fs';
import { config } from './config.js';
import { subscriptionInfo } from './domain/subscription.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { contentRoutes } from './routes/content.js';
import { meRoutes } from './routes/me.js';
import { subscriptionRoutes } from './routes/subscription.js';
import type { PaymentProvider } from './services/payment-provider.js';
import { StubPaymentProvider } from './services/payment-provider.js';

export interface AppDeps {
  prisma: PrismaClient;
  paymentProvider?: PaymentProvider;
  logger?: boolean;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: deps.logger ?? true,
    trustProxy: true,
  });

  app.decorate('prisma', deps.prisma);
  app.decorate('paymentProvider', deps.paymentProvider ?? new StubPaymentProvider(deps.prisma));

  app.register(cors, { origin: true });
  app.register(jwt, { secret: config.jwtSecret });
  app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });

  // Локальное хранилище картинок — только там, где диск записываемый (dev/self-hosted).
  // На Vercel файловая система read-only, картинки живут в Supabase Storage.
  try {
    mkdirSync(config.uploadsDir, { recursive: true });
  } catch {
    // read-only ФС — пропускаем
  }
  if (existsSync(config.uploadsDir)) {
    app.register(fastifyStatic, { root: config.uploadsDir, prefix: '/uploads/' });
  }

  // --- auth-декораторы ---
  app.decorate('authenticate', async (req: any, reply: any) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    if (req.user.kind !== 'user') return reply.code(401).send({ error: 'unauthorized' });
    const user = await app.prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    req.currentUser = user;
  });

  app.decorate('authenticateAdmin', async (req: any, reply: any) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    if (req.user.kind !== 'admin') return reply.code(403).send({ error: 'forbidden' });
    req.adminId = req.user.sub;
  });

  // Источник истины по доступу к тренировкам — backend (§6)
  app.decorate('requireSubscription', async (req: any, reply: any) => {
    const sub = await app.prisma.subscription.findUnique({ where: { userId: req.currentUser.id } });
    if (!subscriptionInfo(sub).hasAccess) {
      return reply.code(402).send({ error: 'subscription_required' });
    }
  });

  app.get('/api/health', async () => ({ ok: true, ts: new Date().toISOString() }));

  app.register(authRoutes);
  app.register(meRoutes);
  app.register(contentRoutes);
  app.register(subscriptionRoutes);
  app.register(adminRoutes);

  return app;
}
