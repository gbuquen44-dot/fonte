/** The morning check-in: precise answers with concrete words, so he always knows where he stands. */

export type Opt = { value: number; label: string; sub?: string };

export const WAKE_STYLE: Opt[] = [
  { value: 0, label: 'Debout à la 1re sonnerie' },
  { value: 1, label: 'Après 5 à 10 min au lit' },
  { value: 2, label: 'Snooze, 15 à 30 min' },
  { value: 3, label: 'Snooze, plus de 30 min' },
  { value: 4, label: 'Réveillé avant l\'alarme' },
];

export const NIGHT_WAKES: Opt[] = [
  { value: 0, label: 'Aucun' },
  { value: 1, label: '1 fois' },
  { value: 2, label: '2 fois' },
  { value: 3, label: '3 fois ou plus' },
];

/** Stored in `recovery` (out of 10), like before, so the old charts keep working. */
export const ENERGY: Opt[] = [
  { value: 2, label: 'Vidé', sub: 'Je pourrais me recoucher direct' },
  { value: 4, label: 'Fatigué', sub: 'Lourd, mais ça va passer' },
  { value: 6, label: 'Normal', sub: 'Ni plus ni moins que d\'habitude' },
  { value: 8, label: 'Bien réveillé', sub: 'Prêt à attaquer' },
  { value: 10, label: 'En feu', sub: 'Je déborde d\'énergie' },
];

export const MOTIVATION: Opt[] = [
  { value: 1, label: 'Aucune', sub: 'Je vais devoir me forcer' },
  { value: 2, label: 'Faible', sub: 'Je sens que je vais traîner' },
  { value: 3, label: 'Moyenne', sub: 'Je vais faire le job' },
  { value: 4, label: 'Forte', sub: 'J\'ai hâte de m\'y mettre' },
  { value: 5, label: 'À fond', sub: 'Je veux tout défoncer' },
];

export const SORENESS: Opt[] = [
  { value: 0, label: 'Aucune' },
  { value: 1, label: 'Légères', sub: 'Je les sens seulement en touchant ou en étirant' },
  { value: 2, label: 'Moyennes', sub: 'Je les sens en bougeant' },
  { value: 3, label: 'Fortes', sub: 'Ça me gêne pour bouger' },
];

export const SORE_AREAS = ['Pecs', 'Dos', 'Épaules', 'Biceps', 'Triceps', 'Quadriceps', 'Ischios', 'Fessiers', 'Abdos', 'Lombaires'];

export const BELLY: Opt[] = [
  { value: 0, label: 'Léger', sub: 'Ventre plat, vide' },
  { value: 1, label: 'Normal' },
  { value: 2, label: 'Lourd', sub: 'Encore plein du repas d\'hier' },
  { value: 3, label: 'Ballonné', sub: 'Gonflé, tendu' },
];

export const HUNGER: Opt[] = [
  { value: 0, label: 'Pas faim du tout' },
  { value: 1, label: 'Un peu', sub: 'Je peux attendre' },
  { value: 2, label: 'Faim', sub: 'Je mangerais maintenant' },
  { value: 3, label: 'Très faim', sub: 'Le ventre crie' },
];

export const HEAD: Opt[] = [
  { value: 0, label: 'Claire' },
  { value: 1, label: 'Un peu dans le brouillard' },
  { value: 2, label: 'Complètement dans le brouillard' },
  { value: 3, label: 'Mal de tête' },
];

export const MOOD: Opt[] = [
  { value: 1, label: 'Irritable', sub: 'Tout m\'agace' },
  { value: 2, label: 'À plat', sub: 'Rien ne me fait envie' },
  { value: 3, label: 'Normal' },
  { value: 4, label: 'Content', sub: 'Positif, de bonne humeur' },
  { value: 5, label: 'Euphorique', sub: 'Tout me motive' },
];

export const GYM_WANT: Opt[] = [
  { value: 1, label: 'Aucune', sub: 'Je vais me forcer' },
  { value: 2, label: 'Moyenne' },
  { value: 3, label: 'Forte' },
  { value: 4, label: 'J\'ai hâte', sub: 'Je compte les heures' },
];

export const PAIN_AREAS = ['Épaule', 'Coude', 'Poignet', 'Genou', 'Bas du dos', 'Pec'];

export const THIRST: Opt[] = [
  { value: 0, label: 'Pas soif' },
  { value: 1, label: 'Bouche un peu sèche' },
  { value: 2, label: 'Très soif' },
];

/** Stored in `stress` (0 to 3). */
export const STRESS: Opt[] = [
  { value: 0, label: 'Journée tranquille' },
  { value: 1, label: '1 ou 2 moments tendus' },
  { value: 2, label: 'Tendu une bonne partie du jour' },
  { value: 3, label: 'Sous pression toute la journée' },
];

export const DINNER_END: Opt[] = [
  { value: 0, label: 'Avant 19 h' },
  { value: 1, label: 'Entre 19 h et 20 h' },
  { value: 2, label: 'Entre 20 h et 21 h' },
  { value: 3, label: 'Entre 21 h et 22 h' },
  { value: 4, label: 'Après 22 h' },
];

export const CAFFEINE: Opt[] = [
  { value: 0, label: 'Pas de caféine' },
  { value: 1, label: 'Avant 12 h' },
  { value: 2, label: 'Entre 12 h et 14 h' },
  { value: 3, label: 'Entre 14 h et 16 h' },
  { value: 4, label: 'Après 16 h' },
];

export const SCREEN: Opt[] = [
  { value: 0, label: 'Pas d\'écran' },
  { value: 1, label: 'Moins de 15 min' },
  { value: 2, label: '15 à 45 min' },
  { value: 3, label: 'Plus de 45 min' },
];

export const EVENING = ['Douche le soir', 'Gros dîner', 'Séance après 18 h', 'Sieste', 'Alcool', 'Malade', 'Bruit ou chaleur'];

/** Clock minutes, from "HH:MM". */
export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return ((h * 60 + m) % 1440 + 1440) % 1440;
};

/** "HH:MM", from clock minutes (any number, wrapped to the day). */
export const toClock = (minutes: number) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** French reading of a clock time: "22 h", "3 h 25". */
export const clockFr = (minutes: number) => {
  const [h, m] = toClock(minutes).split(':').map(Number);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
};

/** Hours slept between lights out and getting up, across midnight. */
export function sleptHours(bedAt: string, wakeAt: string): number {
  const span = (toMinutes(wakeAt) - toMinutes(bedAt) + 1440) % 1440;
  return Math.round((span / 60) * 100) / 100;
}

/** Bed wheel: 20 h to 2 h; wake wheel: 2 h to 10 h, every 5 minutes. Bed values go past 24 h so the wheel stays in order. */
export const BED_VALUES = Array.from({ length: 73 }, (_, i) => 1200 + i * 5);
export const WAKE_VALUES = Array.from({ length: 97 }, (_, i) => 120 + i * 5);

/** Where the bed wheel starts for a stored "HH:MM" (times after midnight sit after 24 h). */
export const bedValue = (hhmm: string) => {
  const m = toMinutes(hhmm);
  return m < 720 ? m + 1440 : m;
};

/** First guess for getting up: now, rounded down to 5 minutes, if it is a morning hour. */
export function guessWake(now: Date, fallback: string): number {
  const m = now.getHours() * 60 + now.getMinutes();
  return m >= 120 && m <= 600 ? m - (m % 5) : toMinutes(fallback);
}
