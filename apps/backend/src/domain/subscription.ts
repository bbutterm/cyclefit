import type { SubscriptionInfo, SubscriptionPlan, SubscriptionStatus } from '@cyclefit/shared';

export const PLAN_MONTHS: Record<SubscriptionPlan, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

export const PLAN_DISCOUNTS: Record<SubscriptionPlan, number> = {
  monthly: 0,
  quarterly: 20,
  yearly: 40,
};

interface SubscriptionRow {
  status: SubscriptionStatus;
  plan: SubscriptionPlan | null;
  trialEndsAt: Date | null;
  currentPeriodEndsAt: Date | null;
}

export function subscriptionInfo(sub: SubscriptionRow | null, now: Date = new Date()): SubscriptionInfo {
  if (!sub) {
    return { status: 'none', plan: null, trialEndsAt: null, currentPeriodEndsAt: null, hasAccess: false };
  }
  const hasAccess =
    (sub.status === 'trial' && !!sub.trialEndsAt && sub.trialEndsAt > now) ||
    (sub.status === 'active' && !!sub.currentPeriodEndsAt && sub.currentPeriodEndsAt > now);
  return {
    status: sub.status,
    plan: sub.plan,
    trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
    currentPeriodEndsAt: sub.currentPeriodEndsAt?.toISOString() ?? null,
    hasAccess,
  };
}

export function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}
