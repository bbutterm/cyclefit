import type { PlansResponse } from '@cyclefit/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { PLAN_DISCOUNTS, PLAN_MONTHS } from '../domain/subscription.js';
import { getText } from '../texts.js';

const checkoutSchema = z.object({
  plan: z.enum(['monthly', 'quarterly', 'yearly']),
});

export async function subscriptionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/plans', async () => {
    const claims = await Promise.all(
      ['paywall.claim.1', 'paywall.claim.2', 'paywall.claim.3'].map((k) => getText(app.prisma, k)),
    );
    const response: PlansResponse = {
      plans: [
        { plan: 'monthly', title: 'Месяц', priceRub: config.prices.monthly, discountPercent: PLAN_DISCOUNTS.monthly, periodMonths: PLAN_MONTHS.monthly },
        { plan: 'quarterly', title: '3 месяца', priceRub: config.prices.quarterly, discountPercent: PLAN_DISCOUNTS.quarterly, periodMonths: PLAN_MONTHS.quarterly },
        { plan: 'yearly', title: 'Год', priceRub: config.prices.yearly, discountPercent: PLAN_DISCOUNTS.yearly, periodMonths: PLAN_MONTHS.yearly },
      ],
      paymentsMode: config.paymentsMode,
      marketingClaims: claims,
    };
    return response;
  });

  app.post('/api/subscription/checkout', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const result = await app.paymentProvider.createSubscription(req.currentUser.id, parsed.data.plan);
    return result;
  });

  app.post('/api/subscription/cancel', { preHandler: [app.authenticate] }, async (req) => {
    await app.paymentProvider.cancelSubscription(req.currentUser.id);
    return { ok: true };
  });

  // Вебхук платёжного провайдера (stub — no-op, §9). Идемпотентность обеспечивает провайдер.
  app.post('/api/webhooks/payment', async (req) => {
    const event = await app.paymentProvider.handleWebhook(req.body);
    if (event) app.log.info({ event }, 'payment webhook event');
    return { ok: true };
  });
}
