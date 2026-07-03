import type { PrismaClient, User } from '@prisma/client';
import type { PaymentProvider } from './services/payment-provider.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    paymentProvider: PaymentProvider;
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireSubscription: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    currentUser: User;
    adminId: string;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; kind: 'user' | 'admin' };
    user: { sub: string; kind: 'user' | 'admin' };
  }
}
