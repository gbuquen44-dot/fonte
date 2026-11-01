import React, { useMemo, useState } from 'react';
import { doneSessions, getData, useApp } from '../state/store';
import { addDays, dateRange, type ISODate } from '../core/dates';
import { plannedFor } from '../core/program';
import { buildLinks, type Link, type Side } from '../core/links';
import { weekPair } from '../core/review';
import { tipOfDay } from '../core/rules';
import { currentE1rm, LIFTS } from '../core/lifting';
import { macrosFor, targetKcal } from '../core/energy';
import { plural } from '../core/labels';
import { useToday } from '../ui/hooks';
import { fr1, hours, int } from '../ui/controls';
import { IconCopy } from '../ui/icons';
import { SCIENCE } from '../data/science';
import type { AppData } from '../state/store';

function value(l: Link, s: Side) {
  if (s.mean === null) return '–';
  if (l.unit === 'pct') return `${s.mean > 0 ? '+' : ''}${fr1(s.mean)} %`;
  if (l.unit === 'heures') return hours(Math.round(s.mean * 2) / 2);
  if (l.unit === 'forme') return `${fr1(s.mean)}/10`;
  return `${fr1(s.mean)}/5`;
}

function scale(l: Link, s: Side) {
  if (s.mean === null) return 0;
  if (l.unit === 'pct') return Math.min(1, Math.max(0.06, (s.mean + 6) / 12));
  if (l.unit === 'heures') return Math.min(1, s.mean / 10);
  return Math.min(1, s.mean / (l.unit === 'forme' ? 10 : 5));
}

function LinkCard({ l }: { l: Link }) {
  return (
    <li className="link" data-state={l.state}>
      <div className="link-head">
        <strong>{l.title}</strong>
        <small>{l.state === 'tendance' ? 'Tendance' : l.state === 'apercu' ? 'Premier aperçu' : `Encore ${l.needed} ${plural(l.needed, 'point')}`}</small>
      </div>
      {l.state === 'attente' ? (
        <p className="muted">
          {l.hi.label} : {l.hi.n}. {l.lo.label} : {l.lo.n}.
        </p>
      ) : (
        <>
          <p className="link-out">{l.outcome}</p>
          {(['hi', 'lo'] as const).map((k) => (
            <div className="link-bar" key={k} data-best={l.better === k ? 'true' : undefined}>
              <span>{l[k].label}</span>
              <b className="num">{value(l, l[k])}</b>
              <i>
                <em style={{ transform: `scaleX(${scale(l, l[k])})` }} />
              </i>
            </div>
          ))}
          <p className="muted">{l.better ? `Mieux avec « ${l[l.better].label.toLowerCase()} », sur ${l.hi.n + l.lo.n} points.` : `Pas de vraie différence pour l'instant, sur ${l.hi.n + l.lo.n} points.`}</p>
        </>
      )}
    </li>
  );
}

/** A compact summary to paste in a Claude conversation. */
function summary(d: AppData, today: ISODate): string {
  const p = d.profile;
  if (!p) return '';
  const sessions = doneSessions(d);
  const jours = dateRange(today, 14).flatMap((date) => {
    const x = d.days[date];
    return x ? [{ date, poids: x.weight, sommeil: x.sleepH, forme: x.recovery, stress: x.stress, kcal: x.kcal, proteines: x.protein, glucides: x.carbs, lipides: x.fat, pas: x.steps }] : [];
  });
  const seances = sessions.slice(-6).map((s) => ({ date: s.date, titre: s.title, bloc: s.block, semaine: s.week, series: s.sets.filter((x) => x.type !== 'ramp').map((x) => `${x.exId} ${x.load}x${x.reps}${x.rpe ? ` RPE${x.rpe}` : ''}`).slice(0, 16), apres: s.post, avant: s.pre }));
  return `Tu es mon coach de powerbuilding. Réponds en français, direct et concret. N'invente aucun chiffre et ne présente aucune corrélation comme une preuve.\n\nMes données :\n${JSON.stringify({ aujourdhui: today, maxEstimes: Object.fromEntries(LIFTS.map((l) => [l, Math.round(currentE1rm(sessions, l, p.tm[l]))])), objectifs: p.goal, caloriesCible: targetKcal(p.kcalPlan, today), macros: macrosFor(targetKcal(p.kcalPlan, today) ?? 2000, 68), jours, seances })}\n\nMa question : `;
}

export function Coach() {
  const data = useApp((r) => r.data);
  const p = data.profile!;
  const today = useToday();
  const sessions = useMemo(() => doneSessions(data), [data.sessions]);
  const planned = plannedFor(today, p);
  const tip = useMemo(() => tipOfDay({ today, profile: p, days: data.days, sessions, planned }), [today, p, data.days, sessions, planned]);
  const links = useMemo(() => buildLinks(sessions, data.days, p, today), [sessions, data.days, p, today]);
  const { current, previous } = useMemo(() => weekPair(today, data.days, sessions), [today, data.days, sessions]);
  const [all, setAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const readable = links.filter((l) => l.state !== 'attente');
  const waiting = links.filter((l) => l.state === 'attente');
  const fmt = (v: number | null, f: (n: number) => string) => (v === null ? '–' : f(v));
  const rows: [string, string, string][] = [
    ['Séances', `${current.sessions}`, `${previous.sessions}`],
    ['Séries dures', `${current.hardSets}`, `${previous.hardSets}`],
    ['Kilos soulevés', int(current.tonnage), int(previous.tonnage)],
    ['Sommeil', fmt(current.sleep, (n) => `${fr1(n)} h`), fmt(previous.sleep, (n) => `${fr1(n)} h`)],
    ['Forme', fmt(current.recovery, fr1), fmt(previous.recovery, fr1)],
    ['Calories', fmt(current.kcal, int), fmt(previous.kcal, int)],
    ['Protéines', fmt(current.protein, (n) => `${int(n)} g`), fmt(previous.protein, (n) => `${int(n)} g`)],
    ['Pas', fmt(current.steps, int), fmt(previous.steps, int)],
    ['Poids', fmt(current.weight, fr1), fmt(previous.weight, fr1)],
  ];
  const science = SCIENCE.slice(((new Date(`${addDays(today, 0)}T12:00:00`).getDate() % 6) * 3) % SCIENCE.length).concat(SCIENCE).slice(0, 3);

  return (
    <div className="screen">
      <header className="head">
        <div>
          <p>Il lit tout, tu décides</p>
          <h1>Coach</h1>
        </div>
      </header>

      <section className="card explain">
        <p>Le coach lit tes séances, ton sommeil, tes repas et tes pas. Il sert à trois choses : te dire quoi faire aujourd'hui, faire le bilan de ta semaine, et trouver ce qui marche pour toi.</p>
      </section>

      <section className={`card tip${tip.urgent ? ' urgent' : ''}`}>
        <small className="tag">Aujourd'hui</small>
        <h2>{tip.title}</h2>
        <p>{tip.body}</p>
      </section>

      <section className="card">
        <h2>Ce qui marche pour toi</h2>
        <p className="muted">Il compare tes bons et tes mauvais jours : sommeil, calories, pas, repas, caféine, stress. Un écart montre un lien, pas une preuve.</p>
        {readable.length ? (
          <ul className="links">
            {readable.map((l) => (
              <LinkCard key={l.id} l={l} />
            ))}
          </ul>
        ) : (
          <p className="link-empty">Il faut au moins 3 jours de chaque côté pour comparer. Les premiers liens arrivent en 1 à 2 semaines.</p>
        )}
        {waiting.length ? (
          <>
            <button type="button" className="legend-toggle" aria-expanded={all} onClick={() => setAll(!all)}>
              {waiting.length} {plural(waiting.length, 'lien')} en attente de données
            </button>
            {all ? (
              <ul className="links">
                {waiting.map((l) => (
                  <LinkCard key={l.id} l={l} />
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="card">
        <h2>Ta semaine</h2>
        <table className="review">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr">Mesure</span>
              </th>
              <th scope="col">7 jours</th>
              <th scope="col">Avant</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, a, b]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td className="num">{a}</td>
                <td className="num">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Poser une question à Claude</h2>
        <p className="muted">Copie ton résumé, colle-le dans Claude, puis écris ta question à la suite.</p>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            void navigator.clipboard?.writeText(summary(getData(), today)).then(() => setCopied(true));
          }}
        >
          <IconCopy size={18} /> {copied ? 'Résumé copié' : 'Copier mon résumé'}
        </button>
      </section>

      <section className="card">
        <h2>À savoir</h2>
        <ul className="science">
          {science.map((c) => (
            <li key={c.id}>
              <strong>{c.title}</strong>
              <p>{c.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
