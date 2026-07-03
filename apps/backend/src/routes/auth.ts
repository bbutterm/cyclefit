import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validateInitData } from '../auth/initData.js';
import { config } from '../config.js';
import { getOrCreateUser } from '../services/user-service.js';

const bodySchema = z.object({
  initData: z.string().optional(),
  // только для DEV_AUTH_BYPASS=true (локальная разработка без Telegram)
  devUser: z.object({ id: z.number(), firstName: z.string().optional() }).optional(),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/telegram', async (req, reply) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const { initData, devUser } = parsed.data;

    let tg: { id: number; username?: string | null; firstName?: string | null } | null = null;

    if (initData) {
      const validated = validateInitData(initData, config.botToken);
      if (!validated) return reply.code(401).send({ error: 'invalid_init_data' });
      tg = {
        id: validated.user.id,
        username: validated.user.username ?? null,
        firstName: validated.user.first_name ?? null,
      };
    } else if (config.devAuthBypass && devUser) {
      tg = { id: devUser.id, firstName: devUser.firstName ?? 'Dev' };
    }

    if (!tg) return reply.code(401).send({ error: 'invalid_init_data' });

    const user = await getOrCreateUser(app.prisma, tg);
    const token = app.jwt.sign({ sub: user.id, kind: 'user' }, { expiresIn: '1h' });
    return { token };
  });
}
