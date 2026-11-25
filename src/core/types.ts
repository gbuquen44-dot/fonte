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

/** One exercise of a muscle-building day, as he edits it in the app. */
export interface Slot {
  exId: string;
  sets: number;
  reps: number;
  repsMax: number;
  /** Reps left in the tank as an RPE; 10 is failure. Unset: close to failure. */
  rpe?: number;
  /** As many reps as he can. */
  max?: boolean;
  /** Slots sharing a group next to each other run as a superset. */
  group?: string;
  note?: string;
}

export interface DayPlan {
  title: string;
  subtitle: string;
  slots: Slot[];
}

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
  /** Morning check-in, the precise version: lights out and up, as "HH:MM". */
  bedAt?: string;
  wakeAt?: string;
  /** 0 up at the first ring, 1 after 5-10 min, 2 snooze 15-30 min, 3 snooze 30 min+, 4 before the alarm. */
  wakeStyle?: number;
  /** Times he woke up in the night: 0, 1, 2, 3 (3 or more). */
  nightWakes?: number;
  /** Will to work, 1 (none) to 5 (all in). */
  motivation?: number;
  /** Soreness 0 none to 3 strong, and where. */
  soreness?: number;
  soreAreas?: string[];
  /** Belly on waking: 0 light, 1 normal, 2 heavy, 3 bloated. */
  belly?: number;
  /** Hunger on waking: 0 none to 3 very hungry. */
  hunger?: number;
  /** Head on waking: 0 clear, 1 a bit foggy, 2 foggy, 3 headache. */
  head?: number;
  /** Mood 1 irritable to 5 euphoric. */
  mood?: number;
  /** On a training day, the will to go: 1 none to 4 can't wait. */
  gymWant?: number;
  /** Joint pains (not soreness): where. */
  pains?: string[];
  /** Thirst on waking: 0 none, 1 dry mouth, 2 very thirsty. */
  thirst?: number;
  /** The evening before: end of dinner (0 before 19 h … 4 after 22 h), last caffeine (0 none, 1 before 12 h … 4 after 16 h), screen in bed (0 none … 3 over 45 min). */
  dinnerEnd?: number;
  lastCaffeine?: number;
  screenBed?: number;
  /** Energy, mood and focus he gave in his notes, with the time he said it. */
  pulses?: { at: number; energy?: number; mood?: number; focus?: number }[];
  /** Short facts Claude kept from his notes: meal times, caffeine, how a session went. */
  facts?: { at: number; text: string }[];
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
  /** His edits to the muscle-building days, every week. */
  muscu?: Partial<Record<SessionKey, DayPlan>>;
  /** A change for one date only. */
  muscuDays?: Record<ISODate, Slot[]>;
  /** Exercises he created himself. */
  customExercises?: ExerciseDef[];
  /** Who he is and what he aims for, sent with each note so Claude sorts it well. Private data only. */
  about?: string;
  /** His names for the four projects, such as the name of his business. */
  projects?: Partial<Record<'biz' | 'ecole' | 'salle' | 'perso', { label: string; short?: string }>>;
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
