import { addDays, dateRange, diffDays, type ISODate } from './dates';
import type { DayLog, PlannedSession, Profile, SessionLog } from './types';
import { gelEnd, mean7, nextStep, targetKcal } from './energy';
import { SCIENCE } from '../data/science';

export type Origin = 'Étude' | 'Terrain' | 'Conception' | 'Tes données' | 'Sécurité';

export interface Tip {
  id: string;
  title: string;
  body: string;
  origin: Origin;
  urgent?: boolean;
}

export interface TipContext {
  today: ISODate;
  profile: Profile;
  days: Record<ISODate, DayLog>;
  sessions: SessionLog[];
  planned: PlannedSession | null;
}

const fmt = (n: number) => n.toLocaleString('fr-FR');

function lastDone(sessions: SessionLog[]): SessionLog | undefined {
  return sessions.filter((s) => s.status === 'done').sort((a, b) => b.startedAt - a.startedAt)[0];
}

export function tipOfDay(c: TipContext): Tip {
  const { today, days, profile, planned, sessions } = c;
  const h = days[today]?.sleepH;
  const last = lastDone(sessions);

  if (last?.post?.painLevel !== undefined && diffDays(today, last.date) <= 7) {
    const lvl = last.post.painLevel;
    const zone = last.post.painZone ?? 'cette zone';
    if (lvl >= 7) {
      return { id: 'pain-high', urgent: true, origin: 'Sécurité', title: `Douleur à ${lvl}/10 : stop`, body: `Arrête le mouvement qui charge ${zone}. Claquement, hématome ou perte de force : consulte vite.` };
    }
    if (lvl >= 4) {
      return { id: 'pain-mid', origin: 'Conception', title: `${zone} à ${lvl}/10`, body: 'Baisse la charge de 10 à 20 % ou change de variante pendant 1 à 2 semaines. Pas besoin d\'arrêter complètement.' };
    }
  }

  if (typeof h === 'number' && h < 3 && planned) {
    return { id: 'sleep-3', origin: 'Sécurité', title: 'Moins de 3 h de sommeil', body: 'Sur squat et bench, mets les sécurités ou prends un pareur.' };
  }

  const plan = [...profile.kcalPlan].sort((a, b) => a.from.localeCompare(b.from));
  const stepIndex = plan.findIndex((s) => s.from === today);
  const step = stepIndex > 0 && plan[stepIndex].kcal > plan[stepIndex - 1].kcal ? plan[stepIndex] : undefined;
  if (step) {
    return { id: 'kcal-step', origin: 'Conception', title: `Aujourd'hui, ${fmt(step.kcal)} kcal`, body: 'La hausse va surtout dans les glucides. Mets-en une part dans ta crème de riz d\'avant séance.' };
  }

  const gel = gelEnd(profile, today);
  const w = days[today]?.weight;
  const avg = mean7(days, addDays(today, -1), 'weight');
  if (gel && typeof w === 'number' && avg !== null && w - avg >= 0.5) {
    return { id: 'gel-jump', origin: 'Conception', title: 'Ce saut est normal', body: 'C\'est de l\'eau et du glycogène, pas du gras. Tu ne compenses pas.' };
  }

  const protein = mean7(days, addDays(today, -1), 'protein');
  if (protein !== null && protein < 120) {
    return { id: 'protein', origin: 'Étude', title: `${Math.round(protein)} g de protéines par jour`, body: 'Ton repère est 140 g, en au moins 4 prises sur la journée.' };
  }

  const fat = mean7(days, addDays(today, -1), 'fat');
  if (fat !== null && fat < 40) {
    return { id: 'fat', origin: 'Terrain', title: `${Math.round(fat)} g de lipides par jour`, body: 'Vise au moins 50 g. En remontée, garder un peu de gras aide tes hormones et ton énergie.' };
  }

  const stress = dateRange(today, 7).filter((d) => (days[d]?.stress ?? 0) >= 3).length;
  if (stress >= 3) {
    return { id: 'stress', origin: 'Conception', title: 'Semaine chargée hors salle', body: 'Garde les charges, pas d\'échec. Si tu récupères mal, enlève d\'abord de l\'isolation.' };
  }

  if (planned && planned.exercises.length > 3) {
    return { id: 'carbs-pre', origin: 'Étude', title: 'Ta crème de riz, 1 h avant', body: 'C\'est le bon repas. Banane et crème de riz font le travail. Garde peanut butter et chocolat légers, le gras ralentit la digestion.' };
  }

  const next = nextStep(profile.kcalPlan, today);
  const target = targetKcal(profile.kcalPlan, today);
  if (next && target !== undefined && diffDays(next.from, today) === 1) {
    return { id: 'kcal-tomorrow', origin: 'Conception', title: `Demain, ${fmt(next.kcal)} kcal`, body: `Aujourd'hui, tu restes à ${fmt(target)} kcal.` };
  }

  const dayNumber = diffDays(today, '2026-01-01');
  const s = SCIENCE[((dayNumber % SCIENCE.length) + SCIENCE.length) % SCIENCE.length];
  return { id: `science-${s.id}`, origin: s.origin, title: s.title, body: s.body };
}
