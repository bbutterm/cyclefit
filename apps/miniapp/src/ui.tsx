import type { Phase } from '@cyclefit/shared';
import type { ReactNode } from 'react';

export const PHASE_COLORS: Record<Phase, string> = {
  menstrual: 'bg-phase-menstrual',
  follicular: 'bg-phase-follicular',
  ovulatory: 'bg-phase-ovulatory',
  luteal: 'bg-phase-luteal',
};

export const PHASE_EMOJI: Record<Phase, string> = {
  menstrual: '🌙',
  follicular: '🌱',
  ovulatory: '☀️',
  luteal: '🍂',
};

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white rounded-3xl p-5 shadow-sm ${className}`}>{children}</div>;
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  className?: string;
}) {
  const styles = {
    primary: 'bg-peach-400 text-white active:bg-peach-500',
    secondary: 'bg-lavender-100 text-ink active:bg-lavender-200',
    ghost: 'bg-transparent text-soft underline',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-3.5 px-5 rounded-2xl font-semibold text-base transition disabled:opacity-40 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function IntensityDots({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-1 items-center" aria-label={`Интенсивность ${value} из 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i <= value ? 'bg-peach-400' : 'bg-peach-100'}`}
        />
      ))}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center items-center min-h-[50vh]">
      <div className="w-8 h-8 border-4 border-peach-100 border-t-peach-400 rounded-full animate-spin" />
    </div>
  );
}

export function ErrorState({ onRetry, message }: { onRetry: () => void; message?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 px-6 text-center fade-in">
      <div className="text-4xl">🌧</div>
      <p className="text-soft">{message ?? 'Не получилось загрузить. Проверь интернет и попробуй ещё раз.'}</p>
      <Button onClick={onRetry} className="max-w-[200px]">
        Повторить
      </Button>
    </div>
  );
}

export function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-1.5 my-4">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-colors ${i < step ? 'bg-peach-400' : 'bg-peach-100'}`}
        />
      ))}
    </div>
  );
}
