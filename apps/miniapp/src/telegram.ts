import { retrieveLaunchParams } from '@telegram-apps/sdk';

// Обёртка над Telegram WebApp: работает и в обычном браузере (dev-режим).

interface TgWebApp {
  initData?: string;
  colorScheme?: 'light' | 'dark';
  expand?: () => void;
  ready?: () => void;
  HapticFeedback?: {
    notificationOccurred?: (type: 'success' | 'warning' | 'error') => void;
    impactOccurred?: (style: 'light' | 'medium' | 'heavy') => void;
  };
}

function tgWebApp(): TgWebApp | null {
  return (window as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp ?? null;
}

export function getInitDataRaw(): string | null {
  try {
    const { initDataRaw } = retrieveLaunchParams();
    if (initDataRaw) return initDataRaw;
  } catch {
    // не в Telegram
  }
  return tgWebApp()?.initData || null;
}

export function tgReady(): void {
  const wa = tgWebApp();
  try {
    wa?.ready?.();
    wa?.expand?.();
  } catch {
    // необязательно
  }
}

export function hapticSuccess(): void {
  try {
    tgWebApp()?.HapticFeedback?.notificationOccurred?.('success');
  } catch {
    // необязательно
  }
}

export function hapticLight(): void {
  try {
    tgWebApp()?.HapticFeedback?.impactOccurred?.('light');
  } catch {
    // необязательно
  }
}
