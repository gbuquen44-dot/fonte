import React, { useEffect, useRef, useState } from 'react';
import { activeSession, connectCloud, seedForPreview, useApp } from './state/store';
import { Today } from './screens/Today';
import { Programme } from './screens/Programme';
import { DayEntry, Nutrition } from './screens/Nutrition';
import { Progress } from './screens/Progress';
import { Coach } from './screens/Coach';
import { SessionScreen } from './screens/Session';
import { Checkin } from './screens/Checkin';
import { Settings, Setup } from './screens/Settings';
import { IconChart, IconCoach, IconFood, IconProgram, IconToday } from './ui/icons';
import { useToday } from './ui/hooks';

type Tab = 'today' | 'programme' | 'food' | 'progress' | 'coach';

const TABS: { id: Tab; label: string; Icon: (p: { size?: number }) => React.ReactElement }[] = [
  { id: 'today', label: 'Aujourd\'hui', Icon: IconToday },
  { id: 'programme', label: 'Programme', Icon: IconProgram },
  { id: 'food', label: 'Nutrition', Icon: IconFood },
  { id: 'progress', label: 'Progrès', Icon: IconChart },
  { id: 'coach', label: 'Coach', Icon: IconCoach },
];

function Aurora({ mood }: { mood?: string }) {
  return (
    <div className="aurora" data-mood={mood} aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  );
}

export function App() {
  const data = useApp((r) => r.data);
  const loaded = useApp((r) => r.loaded);
  const sync = useApp((r) => r.sync);
  const [tab, setTab] = useState<Tab>('today');
  const [sessionOpen, setSessionOpen] = useState(false);
  const [checkin, setCheckin] = useState(false);
  const [entry, setEntry] = useState(false);
  const [settings, setSettings] = useState(false);
  const today = useToday();
  const asked = useRef<string>();
  const main = useRef<HTMLElement>(null);
  const active = activeSession(data);

  useEffect(() => {
    const boot = async () => {
      if (import.meta.env.DEV) {
        const preview = await import('./state/preview');
        const url = new URLSearchParams(location.search);
        if (!url.has('blank')) seedForPreview(preview.PREVIEW_PROFILE, preview.previewDays(url.has('rich')), url.has('rich') ? preview.previewSessions() : {});
      }
      await connectCloud();
    };
    void boot();
  }, []);

  useEffect(() => {
    if (!loaded || !data.profile) return;
    if (active && asked.current === undefined) setSessionOpen(true);
    else if (!active && !data.days[today]?.checkinAt && asked.current !== today && new Date().getHours() < 12) setCheckin(true);
    asked.current = today;
  }, [loaded, data.profile, active, today, data.days]);

  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
  }, [tab]);

  if (!data.profile) {
    return (
      <>
        <Aurora />
        {loaded ? (
          <Setup />
        ) : (
          <div className="splash">
            <span>Fonte</span>
            {sync === 'offline' ? <small>Pas de réseau pour l'instant. Tes données reviendront avec lui.</small> : null}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="app">
      <Aurora mood={sessionOpen ? 'session' : undefined} />
      <main className="main" ref={main}>
        <div className="page" key={tab}>
          {tab === 'today' ? <Today onSession={() => setSessionOpen(true)} onSettings={() => setSettings(true)} onCheckin={() => setCheckin(true)} onEntry={() => setEntry(true)} /> : null}
          {tab === 'programme' ? <Programme onSession={() => setSessionOpen(true)} /> : null}
          {tab === 'food' ? <Nutrition onEntry={() => setEntry(true)} /> : null}
          {tab === 'progress' ? <Progress /> : null}
          {tab === 'coach' ? <Coach /> : null}
        </div>
      </main>
      <nav className="tabs" aria-label="Navigation" style={{ '--i': TABS.findIndex((t) => t.id === tab) } as React.CSSProperties}>
        <i className="tabs-pill" aria-hidden="true" />
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} type="button" className={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            <Icon size={23} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <Checkin date={today} open={checkin} onClose={() => setCheckin(false)} />
      <DayEntry today={today} open={entry} onClose={() => setEntry(false)} />
      <Settings open={settings} onClose={() => setSettings(false)} />
      {sessionOpen ? <SessionScreen onClose={() => setSessionOpen(false)} /> : null}
    </div>
  );
}
