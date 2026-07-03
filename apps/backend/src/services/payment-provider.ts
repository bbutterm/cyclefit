import type { SubscriptionPlan } from '@cyclefit/shared';
import type { PrismaClient } from '@prisma/client';
import { addMonths, PLAN_MONTHS } from '../domain/subscription.js';

// Интерфейс платёжного провайдера (§7): позже подключается ЮKassa/Stars без переделки домена.

export type ProviderEvent =
  | { type: 'activated'; userId: string; plan: SubscriptionPlan }
  | { type: 'renewed'; userId: string }
  | { type: 'failed'; userId: string }
  | { type: 'cancelled'; userId: string };

export interface PaymentProvider {
  createSubscription(
    userId: string,
    plan: SubscriptionPlan,
  ): Promise<{ checkoutUrl?: string; status: 'pending' | 'active' }>;
  cancelSubscription(userId: string): Promise<void>;
  handleWebhook(payload: unknown): Promise<ProviderEvent | null>;
}

/** Заглушка: мгновенно активирует подписку на период плана. Оплата не списывается. */
export class StubPaymentProvider implements PaymentProvider {
  constructor(
    private prisma: PrismaClient,
    private log: (msg: string) => void = console.log,
  ) {}

  async createSubscription(userId: string, plan: SubscriptionPlan) {
    const now = new Date();
    const ends = addMonths(now, PLAN_MONTHS[plan]);
    await this.prisma.subscription.upsert({
      where: { userId },
      create: { userId, status: 'active', plan, currentPeriodEndsAt: ends, provider: 'stub' },
      update: { status: 'active', plan, currentPeriodEndsAt: ends, provider: 'stub' },
    });
    this.log(`STUB PAYMENT: activated ${plan} for user ${userId} until ${ends.toISOString()}`);
    return { status: 'active' as const };
  }

  async cancelSubscription(userId: string) {
    await this.prisma.subscription.updateMany({
      where: { userId },
      data: { status: 'expired' },
    });
    this.log(`STUB PAYMENT: cancelled for user ${userId}`);
  }

  async handleWebhook() {
    // stub: вебхуков нет
    return null;
  }
}
