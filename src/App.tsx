import React, { useEffect, useRef, useState } from 'react';
import { activeSession, connectCloud, isStale, seedForPreview, useApp } from './state/store';
import { Home } from './screens/Home';
import { Head } from './screens/Head';
import { Life } from './screens/Life';
import { Sport, type SportView } from './screens/Sport';
import { DayEntry } from './screens/Nutrition';
import { SessionScreen } from './screens/Session';
import { Checkin } from './screens/Checkin';
import { Capture } from './screens/Capture';
import { Settings, Setup } from './screens/Settings';
import { IconList, IconMic, IconPulse, IconToday, IconWeight } from './ui/icons';
import { registerCustom } from './core/edit';
import { setProjectNames } from './core/head';
import { useToday } from './ui/hooks';

type Tab = 'today' | 'head' | 'life' | 'sport';

const TABS: { id: Tab; label: string; Icon: (p: { size?: number }) => React.ReactElement }[] = [
  { id: 'today', label: 'Aujourd\'hui', Icon: IconToday },
  { id: 'head', label: 'Tête', Icon: IconList },
  { id: 'life', label: 'Vie', Icon: IconPulse },
  { id: 'sport', label: 'Sport', Icon: IconWeight },
];

/** The home-screen shortcut opens the app on the dictation: …/fonte/#dicter */
const wantsCapture = () => location.hash === '#dicter' || new URLSearchParams(location.search).has('dicter');

export function App() {
  const data = useApp((r) => r.data);
  const loaded = useApp((r) => r.loaded);
  const sync = useApp((r) => r.sync);
  const [tab, setTab] = useState<Tab>('today');
  const [sportView, setSportView] = useState<SportView>('programme');
  const [sessionOpen, setSessionOpen] = useState(false);
  const [checkin, setCheckin] = useState(false);
  const [entry, setEntry] = useState(false);
  const [settings, setSettings] = useState(false);
  const [capture, setCapture] = useState(wantsCapture);
  const today = useToday();
  const asked = useRef<string>();
  const main = useRef<HTMLElement>(null);
  const active = activeSession(data);

  useEffect(() => {
    const boot = async () => {
      if (import.meta.env.DEV) {
        const preview = await import('./state/preview');
        const url = new URLSearchParams(location.search);
        if (!url.has('blank')) seedForPreview(preview.PREVIEW_PROFILE, preview.previewDays(url.has('rich')), url.has('rich') ? preview.previewSessions() : {}, url.has('rich') ? preview.previewHead() : {});
      }
      await connectCloud();
    };
    void boot();
    const onHash = () => wantsCapture() && setCapture(true);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!loaded || !data.profile || capture) return;
    // He works late: a launch at 1 a.m. is not his morning.
    const hour = new Date().getHours();
    const morning = hour >= 5 && hour < 14;
    if (active && asked.current === undefined && !isStale(active)) setSessionOpen(true);
    else if (!active && !data.days[today]?.checkinAt && asked.current !== today && morning) setCheckin(true);
    asked.current = morning ? today : (asked.current ?? '');
  }, [loaded, data.profile, active, today, data.days, capture]);

  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
  }, [tab, sportView]);

  registerCustom(data.profile?.customExercises);
  setProjectNames(data.profile?.projects);

  const closeCapture = () => {
    setCapture(false);
    if (location.hash === '#dicter') history.replaceState(null, '', location.pathname + location.search);
  };

  if (!data.profile) {
    return loaded ? (
      <Setup />
    ) : (
      <div className="splash">
        <span>Lock-in</span>
        {sync === 'offline' ? <small>Pas de réseau pour l'instant. Tes données reviendront avec lui.</small> : null}
      </div>
    );
  }

  return (
    <div className="app">
      <main className="main" ref={main}>
        <div className="page" key={tab === 'sport' ? `sport-${sportView}` : tab}>
          {tab === 'today' ? (
            <Home
              onSession={() => setSessionOpen(true)}
              onSettings={() => setSettings(true)}
              onCheckin={() => setCheckin(true)}
              onHead={() => setTab('head')}
              onFood={() => {
                setSportView('food');
                setTab('sport');
              }}
            />
          ) : null}
          {tab === 'head' ? <Head /> : null}
          {tab === 'life' ? <Life onSettings={() => setSettings(true)} /> : null}
          {tab === 'sport' ? <Sport view={sportView} onView={setSportView} onSession={() => setSessionOpen(true)} onEntry={() => setEntry(true)} /> : null}
        </div>
      </main>
      <button type="button" className="fab" onClick={() => setCapture(true)} aria-label="Dicter une note">
        <IconMic size={26} />
      </button>
      <nav className="tabs" aria-label="Navigation" style={{ '--i': TABS.findIndex((t) => t.id === tab), '--n': TABS.length } as React.CSSProperties}>
        <i className="tabs-pill" aria-hidden="true" />
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'on' : ''}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => {
              if (tab === id) main.current?.scrollTo({ top: 0, behavior: 'smooth' });
              setTab(id);
            }}
          >
            <Icon size={23} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <Capture open={capture} onClose={closeCapture} />
      <Checkin date={today} open={checkin} onClose={() => setCheckin(false)} />
      <DayEntry today={today} open={entry} onClose={() => setEntry(false)} />
      <Settings open={settings} onClose={() => setSettings(false)} />
      {sessionOpen ? <SessionScreen onClose={() => setSessionOpen(false)} /> : null}
    </div>
  );
}
