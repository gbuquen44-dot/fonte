import type { ISODate } from './dates';

export type LiftKey = 'squat' | 'bench' | 'deadlift';

export type Muscle =
  | 'pecs'
  | 'dos'
  | 'deltLat'
  | 'deltPost'
  | 'deltAnt'
  | 'traps'
  | 'triceps'
  | 'biceps'
  | 'quads'
  | 'ischios'
  | 'fessiers'
  | 'mollets'
  | 'abdos'
  | 'erecteurs';

export type EquipKind = 'barbell' | 'smith' | 'machine' | 'cable' | 'dumbbell' | 'bodyweight';

export interface ExerciseDef {
  id: string;
  name: string;
  kind: EquipKind;
  /** Comp lift this exercise counts for in e1RM and PR tracking. */
  lift?: LiftKey;
  /** Max this exercise's percentages refer to, when different from `lift`. */
  tm?: LiftKey;
  muscles: Partial<Record<Muscle, 1 | 0.5>>;
  step: number;
  rest: number;
}

export type SetType = 'ramp' | 'top' | 'work' | 'drop' | 'test' | 'acc';

export interface PlannedSet {
  id: string;
  type: SetType;
  reps: number;
  repsMax?: number;
  pct?: number;
  rpe?: number;
  /** The fixed load used to read the form of the day. */
  ref?: boolean;
  /** As many reps as he can. */
  max?: boolean;
}

export interface PlannedExercise {
  exId: string;
  /** Exercises sharing a group run as a superset. */
  group?: string;
  note?: string;
  /** Set schemes he picks from in the session, the first one planned. */
  schemes?: Scheme[];
  sets: PlannedSet[];
}

export interface Scheme {
  sets: number;
  reps: number;
}

export type SessionKey = 'mon' | 'tue' | 'wed' | 'fri' | 'sat' | 'sun';

export interface PlannedSession {
  key: SessionKey;
  title: string;
  subtitle: string;
  block: number;
  week: number;
  exercises: PlannedExercise[];
}

export interface LoggedSet {
  plannedId: string;
  exId: string;
  type: SetType;
  load: number;
  reps: number;
  rpe?: number;
  failed?: boolean;
  at: number;
}

export interface PreCheck {
  mealDelay: 'lt1' | '1-2' | '2-3' | '3-4' | '4p' | 'fasted';
  carbs: 'low' | 'mid' | 'high';
  caffeineMg: number;
  food?: string;
  /** The usual pre-session meal, confirmed in one tap. */
  usual?: boolean;
}

export interface PostCheck {
  srpe: number;
  vsPlan: number;
  painZone?: string;
  painLevel?: number;
  unusual: string[];
  note?: string;
}

export interface UsualMeal {
  label: string;
  mealDelay: PreCheck['mealDelay'];
  carbs: PreCheck['carbs'];
}

export interface PRBadge {
  lift: LiftKey;
  kind: '1RM' | 'e1RM';
  value: number;
  previous: number;
  recovery: boolean;
}

export interface SessionLog {
  id: string;
  date: ISODate;
  block: number;
  week: number;
  key: SessionKey;
  title: string;
  startedAt: number;
  endedAt?: number;
  status: 'active' | 'done';
  plan: PlannedExercise[];
  sets: LoggedSet[];
  skipped: string[];
  /** Load multiplier per exercise after a form-of-the-day adjustment. */
  adjust: Record<string, number>;
  pre?: PreCheck;
  post?: PostCheck;
  prs: PRBadge[];
  restUntil?: number;
  restTotal?: number;
  updatedAt: number;
}

export interface DayLog {
  date: ISODate;
  weight?: number;
  sleepH?: number;
  sleepQ?: number;
  dayFeel?: number;
  stress?: number;
  recovery?: number;
  tags?: string[];
  note?: string;
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  steps?: number;
  waist?: number;
  checkinAt?: number;
  /** When the iPhone last sent Health numbers for this day. */
  healthAt?: number;
  /** The day was typed by hand: Health no longer overwrites these fields. */
  manualFood?: boolean;
  manualSteps?: boolean;
  updatedAt: number;
}

export interface KcalStep {
  from: ISODate;
  kcal: number;
  reason: string;
}

export interface EnergyEvent {
  date: ISODate;
  kind: 'illness' | 'travel' | 'creatine';
}

export type Phase = 'remontee' | 'recuperation' | 'prise' | 'stabilisation';

export interface Profile {
  name?: string;
  sex?: 'h' | 'f';
  birthYear?: number;
  age?: number;
  heightCm?: number;
  tm: Record<LiftKey, number>;
  best: Record<LiftKey, number>;
  bestEver: Record<LiftKey, number>;
  goal: Record<LiftKey, number>;
  goalDate: ISODate;
  milestones: { label: string; total: number }[];
  programStart: ISODate;
  /** A session done on another day than planned, or a day without the gym. */
  moves?: Record<ISODate, SessionKey | 'off'>;
  maintenance: number;
  maintenanceLow: number;
  maintenanceHigh: number;
  phase: Phase;
  gainPct: number;
  kcalCapUntil?: ISODate;
  kcalPlan: KcalStep[];
  events: EnergyEvent[];
  symptoms: string[];
  usualMeal?: UsualMeal;
  usualCaffeineMg?: number;
  /** Set once the profile comes from the repository, so a local one never replaces it. */
  linked?: boolean;
  onboarded: boolean;
  updatedAt: number;
}
