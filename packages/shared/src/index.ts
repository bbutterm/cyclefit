// Общие типы CycleFit: используются backend, Mini App и админкой.

export type Phase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';
export type Level = 'beginner' | 'intermediate' | 'advanced';
export type Equipment = 'none' | 'basic' | 'dumbbells';
export type Goal = 'tone' | 'weight_loss' | 'energy' | 'recovery';
export type Restriction = 'knees' | 'back' | 'diastasis';
export type CycleMode = 'tracked' | 'no_cycle';
export type Mood = 'good' | 'ok' | 'bad';
export type WorkoutLogStatus = 'completed' | 'skipped' | 'replaced_easy' | 'rest';
export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'none';
export type SubscriptionPlan = 'monthly' | 'quarterly' | 'yearly';

export const PHASES: Phase[] = ['menstrual', 'follicular', 'ovulatory', 'luteal'];
export const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced'];
export const EQUIPMENTS: Equipment[] = ['none', 'basic', 'dumbbells'];

export const PHASE_NAMES_RU: Record<Phase, string> = {
  menstrual: 'Менструация',
  follicular: 'Фолликулярная фаза',
  ovulatory: 'Овуляторная фаза',
  luteal: 'Лютеиновая фаза',
};

export interface MeResponse {
  id: string;
  telegramId: string;
  firstName: string | null;
  level: Level;
  equipment: Equipment;
  goal: Goal;
  restrictions: Restriction[];
  cycleMode: CycleMode;
  cycleStartDate: string | null; // YYYY-MM-DD
  cycleLength: number;
  periodLength: number;
  timezone: string;
  notifyHourLocal: number;
  onboardingCompleted: boolean;
  subscription: SubscriptionInfo;
  today: CycleToday | null;
}

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  plan: SubscriptionPlan | null;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  hasAccess: boolean; // trial|active и не истёк
}

export interface CycleToday {
  date: string; // YYYY-MM-DD (в таймзоне пользовательницы)
  cycleDay: number;
  phase: Phase;
  phaseNameRu: string;
}

export interface UpdateMeRequest {
  level?: Level;
  equipment?: Equipment;
  goal?: Goal;
  restrictions?: Restriction[];
  cycleMode?: CycleMode;
  cycleStartDate?: string | null;
  cycleLength?: number;
  periodLength?: number;
  timezone?: string;
  notifyHourLocal?: number;
  onboardingCompleted?: boolean;
  disclaimerAccepted?: boolean;
}

export interface CalendarDay {
  date: string;
  cycleDay: number | null;
  phase: Phase | null;
  isToday: boolean;
  workoutStatus: WorkoutLogStatus | null;
}

export interface ExerciseImageDto {
  id: string;
  order: number;
  url: string;
  caption: string | null;
}

export interface ExerciseDto {
  id: string;
  slug: string;
  name: string;
  description: string;
  commonMistakes: string | null;
  safetyCue: string | null;
  muscleGroups: string[];
  equipment: Equipment;
  contraindications: Restriction[];
  images: ExerciseImageDto[];
}

export interface WorkoutItemDto {
  id: string;
  order: number;
  sets: number;
  reps: number | null;
  durationSec: number | null;
  restSec: number;
  exercise: ExerciseDto;
  skippedNote?: string; // упражнение пропущено из-за ограничений и нет альтернативы
}

export interface WorkoutDto {
  id: string;
  title: string;
  phase: Phase;
  level: Level;
  equipment: Equipment;
  durationMin: number;
  intensity: number;
  description: string | null;
  items: WorkoutItemDto[];
}

export interface WorkoutPreviewDto {
  id: string;
  title: string;
  durationMin: number;
  intensity: number;
  previewImageUrl: string | null;
  easyReplacement: boolean; // «облегчённый день»
}

export interface TodayResponse {
  cycle: CycleToday;
  bodyNote: string | null;
  nutritionTip: string | null;
  workout: WorkoutPreviewDto | null; // null → пейвол / нет контента
  workoutLocked: boolean; // true если нет подписки
  restDayAvailable: boolean; // menstrual: кнопка «Сегодня отдыхаю»
  todayLog: WorkoutLogStatus | null;
  streak: number;
}

export interface LogWorkoutRequest {
  status: WorkoutLogStatus;
  feltRating?: number; // 1–5
}

export interface StatsResponse {
  streak: number;
  month: { date: string; status: WorkoutLogStatus }[];
  completedTotal: number;
}

export interface PlanDto {
  plan: SubscriptionPlan;
  title: string;
  priceRub: number;
  discountPercent: number;
  periodMonths: number;
}

export interface PlansResponse {
  plans: PlanDto[];
  paymentsMode: 'stub' | 'real';
  marketingClaims: string[];
}

export interface CheckoutResponse {
  status: 'pending' | 'active';
  checkoutUrl?: string;
}

// --- Admin ---

export interface SlotCoverageCell {
  phase: Phase;
  level: Level;
  equipment: Equipment;
  publishedCount: number;
}

export interface AdminDashboard {
  usersTotal: number;
  activeLast7Days: number;
  trials: number;
  activeSubscriptions: number;
  workoutsCompletedLast7Days: number;
}
