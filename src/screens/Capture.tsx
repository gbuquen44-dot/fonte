import React, { useEffect, useRef, useState } from 'react';
import { addNote, getClaudeKey, useApp } from '../state/store';
import { Sheet, SheetHead } from '../ui/controls';
import { IconMic, IconStop } from '../ui/icons';

/* Dictating a note: the browser's own speech recognition when the phone allows it, the keyboard's microphone otherwise. */

interface Rec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

const Recognition = (): (new () => Rec) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export function Capture({ open, onClose }: { open: boolean; onClose(): void }) {
  const [text, setText] = useState('');
  const [live, setLive] = useState('');
  const [listening, setListening] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const base = useRef('');
  const box = useRef<HTMLTextAreaElement>(null);
  const note = useApp((r) => (sentId ? r.data.notes[sentId] : undefined));
  const sorting = useApp((r) => (sentId ? r.sorting.includes(sentId) : false));
  const hasKey = !!getClaudeKey();
  const canListen = !!Recognition();

  useEffect(() => {
    if (!open) return;
    setText('');
    setLive('');
    setSentId(null);
    const id = setTimeout(() => (canListen ? start() : box.current?.focus()), 350);
    return () => {
      clearTimeout(id);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function start() {
    const R = Recognition();
    if (!R) {
      box.current?.focus();
      return;
    }
    try {
      const r = new R();
      r.lang = 'fr-FR';
      r.continuous = true;
      r.interimResults = true;
      base.current = box.current?.value ?? '';
      r.onresult = (e) => {
        let final = '';
        let interim = '';
        for (let i = 0; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) final += t;
          else interim += t;
        }
        const joined = [base.current, final].filter(Boolean).join(base.current && final ? ' ' : '');
        setText(joined);
        setLive(interim);
      };
      r.onend = () => {
        setListening(false);
        setLive('');
      };
      r.onerror = () => setListening(false);
      r.start();
      rec.current = r;
      setListening(true);
    } catch {
      setListening(false);
      box.current?.focus();
    }
  }

  function stop() {
    rec.current?.stop();
    rec.current = null;
    setListening(false);
  }

  const full = [text, live].filter(Boolean).join(' ').trim();

  function send() {
    stop();
    if (!full) return;
    const n = addNote(full);
    setSentId(n.id);
  }

  const close = () => {
    stop();
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} label="Dicter une note" full>
      <SheetHead title={sentId ? 'Note envoyée' : 'Dis-moi tout'} onClose={close} />
      {!sentId ? (
        <div className="cap">
          <p className="cap-hint">{listening ? 'J\'écoute. Parle en vrac : tâches, idées, forme, ce que tu as fait.' : canListen ? 'Touche le micro pour parler, ou écris.' : 'Touche la zone de texte, puis le micro du clavier pour dicter.'}</p>
          <textarea
            ref={box}
            className="cap-text"
            rows={7}
            value={listening ? full : text}
            placeholder="Idée pour ma boîte : … / Faut que je … / Là je suis à 6 sur 10…"
            onChange={(e) => {
              if (listening) stop();
              setText(e.target.value);
            }}
          />
          <div className="cap-actions">
            {canListen ? (
              <button type="button" className={`cap-mic${listening ? ' on' : ''}`} onClick={() => (listening ? stop() : start())} aria-label={listening ? 'Arrêter la dictée' : 'Dicter'}>
                {listening ? <IconStop size={26} /> : <IconMic size={28} />}
              </button>
            ) : null}
            <button type="button" className="btn primary big" disabled={!full} onClick={send}>
              Envoyer
            </button>
          </div>
        </div>
      ) : (
        <div className="cap">
          <blockquote className="cap-quote">{note?.text}</blockquote>
          {!hasKey ? (
            <p className="cap-status">Ta note est gardée. Ajoute ta clé Claude dans Réglages et je la range tout de suite.</p>
          ) : sorting || note?.status === 'pending' ? (
            <p className="cap-status working">
              <i aria-hidden="true" /> Je range ta note…
            </p>
          ) : note?.status === 'error' ? (
            <p className="cap-status">{note.error} Ta note est gardée dans Vie.</p>
          ) : (
            <>
              <p className="cap-status">{note?.summary}</p>
              <ul className="cap-made">
                {(note?.made ?? []).map((m) => (
                  <li key={m}>{m}</li>
                ))}
                {!note?.made?.length ? <li>Rien à ranger, c'est noté dans ton journal.</li> : null}
              </ul>
            </>
          )}
          <div className="cap-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setSentId(null);
                setText('');
                setTimeout(() => (canListen ? start() : box.current?.focus()), 200);
              }}
            >
              Une autre
            </button>
            <button type="button" className="btn primary" onClick={close}>
              OK
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
