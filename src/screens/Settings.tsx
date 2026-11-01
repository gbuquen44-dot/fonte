import React, { useState } from 'react';
import { connectToken, DATA_REPO, disconnect, exportJson, getToken, importJson, pull, setProfile, updateProfile, useApp } from '../state/store';
import type { LiftKey, Phase, Profile } from '../core/types';
import { LIFT_LABEL, LIFTS } from '../core/lifting';
import { Choice, Keypad, kg, MultiChoice, Sheet, SheetHead } from '../ui/controls';
import { IconCopy, IconHeart, IconLink } from '../ui/icons';
import { longDate, todayISO } from '../core/dates';

const SYNC: Record<string, string> = {
  connecting: 'Connexion…',
  synced: 'Tout est sauvegardé',
  saving: 'Sauvegarde en cours',
  offline: 'Hors ligne. Tes données partiront au retour du réseau.',
  local: 'Pas de sauvegarde : tes données restent sur ce téléphone.',
  denied: 'Ton jeton ne marche plus. Crée-en un nouveau.',
};

const SIGNS = ['Fatigue forte', 'Frilosité', 'Faim permanente', 'Libido en baisse', 'Force en chute', 'Vertiges'];
const TOKEN_URL = `https://github.com/settings/personal-access-tokens/new?name=Fonte&description=${encodeURIComponent('Sauvegarde de Fonte')}&target_name=${DATA_REPO.owner}&expires_in=366&contents=write`;
const SHORTCUT_URL = './Fonte%20Sante.shortcut';

export function Connect({ onDone }: { onDone?(): void }) {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'idle' | 'busy' | 'denied' | 'network'>('idle');
  return (
    <div className="connect">
      <ol className="guide">
        <li>
          <span>
            <b>Crée ton jeton GitHub.</b> Il donne accès à tes données, rien d'autre.
          </span>
          <a className="btn ghost" href={TOKEN_URL} target="_blank" rel="noreferrer">
            <IconLink size={18} /> Ouvrir GitHub
          </a>
        </li>
        <li>
          <span>
            <b>Dans la page GitHub :</b> Repository access, Only select repositories, choisis <code>{DATA_REPO.repo}</code>. Vérifie que Contents est sur Read and write, puis Generate token.
          </span>
        </li>
        <li>
          <span>
            <b>Copie le jeton et colle-le ici.</b>
          </span>
          <input id="token" type="password" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
        </li>
      </ol>
      <button
        type="button"
        className="btn primary big"
        disabled={!token.trim() || status === 'busy'}
        onClick={async () => {
          setStatus('busy');
          const r = await connectToken(token);
          setStatus(r === 'ok' ? 'idle' : r);
          if (r === 'ok') onDone?.();
        }}
      >
        {status === 'busy' ? 'Connexion…' : 'Connecter'}
      </button>
      {status === 'denied' ? <p className="error">GitHub refuse ce jeton. Vérifie qu'il a accès à {DATA_REPO.repo} avec Contents en lecture et écriture.</p> : null}
      {status === 'network' ? <p className="error">Pas de réseau. Réessaie dans un instant.</p> : null}
    </div>
  );
}

function HealthGuide() {
  const healthAt = useApp((r) => r.healthAt);
  const [copied, setCopied] = useState(false);
  return (
    <div className="connect">
      <p className="muted">{healthAt ? `Dernier envoi reçu le ${new Date(healthAt).toLocaleDateString('fr-FR')} à ${new Date(healthAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.` : 'Aucun envoi reçu pour l\'instant.'}</p>
      <ol className="guide">
        <li>
          <span>
            <b>Yazio vers Santé.</b> Dans Réglages de l'iPhone, Santé, Accès aux données, Yazio : autorise tout ce qui concerne la nutrition.
          </span>
        </li>
        <li>
          <span>
            <b>Copie ton jeton</b> : le Raccourci te le demandera.
          </span>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              const t = getToken();
              if (t) void navigator.clipboard?.writeText(t).then(() => setCopied(true));
            }}
          >
            <IconCopy size={18} /> {copied ? 'Jeton copié' : 'Copier mon jeton'}
          </button>
        </li>
        <li>
          <span>
            <b>Installe le Raccourci</b> et colle le jeton quand il te le demande.
          </span>
          <a className="btn ghost" href={SHORTCUT_URL}>
            <IconHeart size={18} /> Installer Fonte Sante
          </a>
        </li>
        <li>
          <span>
            <b>Lance-le une fois à la main</b> dans l'app Raccourcis, et autorise l'accès à Santé.
          </span>
        </li>
        <li>
          <span>
            <b>Automatise.</b> App Raccourcis, Automatisation, +, App, Yazio, Est fermée, Exécuter immédiatement, puis choisis Fonte Sante. Refais la même avec Yazio, Est ouverte.
          </span>
        </li>
      </ol>
      <p className="muted">Tes pas viennent de l'iPhone, via Santé : StepsApp n'est pas nécessaire. Santé donne les totaux du jour, pas le nom des aliments.</p>
    </div>
  );
}

export function Settings({ open, onClose }: { open: boolean; onClose(): void }) {
  const data = useApp((r) => r.data);
  const sync = useApp((r) => r.sync);
  const p = data.profile;
  const [pad, setPad] = useState<LiftKey | null>(null);
  const [status, setStatus] = useState<string>();
  const [paste, setPaste] = useState('');
  const [view, setView] = useState<'main' | 'connect' | 'health'>('main');
  if (!p) return null;
  const linked = !!getToken();

  async function save() {
    try {
      await navigator.clipboard.writeText(exportJson());
      setStatus('Export copié.');
    } catch {
      setStatus('Copie impossible sur cet appareil.');
    }
  }

  const close = () => {
    setView('main');
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} label="Réglages" full>
      <SheetHead title={view === 'connect' ? 'Sauvegarde' : view === 'health' ? 'Santé et Yazio' : 'Réglages'} onClose={close} />
      {view === 'connect' ? (
        <>
          <Connect onDone={() => setView('main')} />
          <button type="button" className="link" onClick={() => setView('main')}>
            Retour
          </button>
        </>
      ) : view === 'health' ? (
        <>
          <HealthGuide />
          <button type="button" className="link" onClick={() => setView('main')}>
            Retour
          </button>
        </>
      ) : (
        <div className="settings">
          <h3>Sauvegarde</h3>
          <p className="muted">{SYNC[sync]}</p>
          {linked ? (
            <div className="two">
              <button type="button" className="btn ghost" onClick={() => void pull(true)}>
                Synchroniser
              </button>
              <button type="button" className="btn ghost" onClick={() => setView('connect')}>
                Changer de jeton
              </button>
            </div>
          ) : (
            <button type="button" className="btn primary" onClick={() => setView('connect')}>
              Connecter ma sauvegarde
            </button>
          )}

          <h3>Pas, calories et repas</h3>
          <p className="muted">Un Raccourci iPhone envoie Santé et Yazio tout seul. Il a besoin de ta sauvegarde.</p>
          <button type="button" className="btn ghost" disabled={!linked} onClick={() => setView('health')}>
            Brancher Santé et Yazio
          </button>

          <h3>Tes maxes</h3>
          <p className="muted">Toutes les charges du programme partent de ces chiffres.</p>
          <ul className="fields">
            {LIFTS.map((l) => (
              <li key={l}>
                <button type="button" onClick={() => setPad(l)}>
                  <span>{LIFT_LABEL[l]}</span>
                  <b className="num">{kg(p.tm[l])} kg</b>
                </button>
              </li>
            ))}
          </ul>

          <h3>Phase</h3>
          <Choice<Phase> label="Phase" columns={3} value={p.phase} onPick={(phase) => updateProfile({ phase })} options={[{ value: 'recuperation', label: 'Remontée' }, { value: 'stabilisation', label: 'Maintien' }, { value: 'prise', label: 'Prise douce' }]} />

          <h3>Signes encore présents</h3>
          <p className="muted">Tant qu'un signe est coché, le coach ne propose aucune sèche.</p>
          <MultiChoice label="Signes" value={p.symptoms} options={SIGNS} onChange={(symptoms) => updateProfile({ symptoms })} />

          <h3>Démarrage du programme</h3>
          <p className="muted">{longDate(p.programStart)}. Choisis un mardi.</p>
          <input id="program-start" type="date" value={p.programStart} onChange={(e) => e.target.value && updateProfile({ programStart: e.target.value })} />

          <h3>Exporter</h3>
          <button type="button" className="btn ghost" onClick={() => void save()}>
            Copier toutes mes données
          </button>
          {status ? <p className="muted">{status}</p> : null}
          <details>
            <summary>Restaurer un export</summary>
            <textarea id="import-box" rows={3} placeholder="Colle ton export ici" value={paste} onChange={(e) => setPaste(e.target.value)} />
            <button
              type="button"
              className="btn ghost"
              disabled={!paste.trim()}
              onClick={() => {
                setStatus(importJson(paste) ? 'Données restaurées.' : 'Ce texte n\'est pas un export valide.');
                setPaste('');
              }}
            >
              Restaurer
            </button>
          </details>
          {linked ? (
            <button type="button" className="link" onClick={disconnect}>
              Déconnecter ce téléphone
            </button>
          ) : null}
        </div>
      )}
      {pad ? (
        <Keypad
          title={LIFT_LABEL[pad]}
          unit="kg"
          decimals
          initial={p.tm[pad]}
          onCancel={() => setPad(null)}
          onDone={(n) => {
            updateProfile({ tm: { ...p.tm, [pad]: n } });
            setPad(null);
          }}
        />
      ) : null}
    </Sheet>
  );
}

const DEFAULT_MAXES: Record<LiftKey, number> = { squat: 100, bench: 70, deadlift: 120 };

/** First launch: bring the saved data, or start alone on this phone. */
export function Setup() {
  const [mode, setMode] = useState<'connect' | 'local'>('connect');
  const [tm, setTm] = useState(DEFAULT_MAXES);
  const [pad, setPad] = useState<LiftKey | null>(null);
  return (
    <div className="setup">
      <h1>Fonte</h1>
      {mode === 'connect' ? (
        <>
          <p>Connecte ta sauvegarde : ton programme, tes charges et tes données arrivent tout seuls. 2 minutes, une seule fois.</p>
          <Connect />
          <button type="button" className="link" onClick={() => setMode('local')}>
            Commencer sans sauvegarde
          </button>
        </>
      ) : (
        <>
          <p>Entre tes maxes actuels. Tu pourras connecter ta sauvegarde plus tard.</p>
          <ul className="fields">
            {LIFTS.map((l) => (
              <li key={l}>
                <button type="button" onClick={() => setPad(l)}>
                  <span>{LIFT_LABEL[l]}</span>
                  <b className="num">{kg(tm[l])} kg</b>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn primary big"
            onClick={() => {
              const today = todayISO();
              const profile: Profile = {
                tm,
                best: tm,
                bestEver: tm,
                goal: { squat: tm.squat + 40, bench: tm.bench + 20, deadlift: tm.deadlift + 40 },
                goalDate: today,
                milestones: [],
                programStart: today,
                maintenance: 2200,
                maintenanceLow: 1850,
                maintenanceHigh: 2550,
                phase: 'recuperation',
                gainPct: 0.25,
                kcalPlan: [{ from: today, kcal: 2000, reason: 'Départ' }],
                events: [],
                symptoms: [],
                onboarded: true,
                updatedAt: Date.now(),
              };
              setProfile(profile);
            }}
          >
            Commencer
          </button>
          <button type="button" className="link" onClick={() => setMode('connect')}>
            Retour
          </button>
        </>
      )}
      {pad ? (
        <Keypad
          title={LIFT_LABEL[pad]}
          unit="kg"
          decimals
          initial={tm[pad]}
          onCancel={() => setPad(null)}
          onDone={(n) => {
            setTm({ ...tm, [pad]: n });
            setPad(null);
          }}
        />
      ) : null}
    </div>
  );
}
