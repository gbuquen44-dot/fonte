import { describe, expect, it } from 'vitest';
import { applyBrain, blockMinutes, byProject, clock, formatMinutes, runningBlock, setProjectNames, PROJECT_LABEL, todayList, workMinutes, type BrainOut, type Note, type Todo } from './head';

const note: Note = { id: 'n1', text: 'x', at: Date.parse('2026-11-25T11:20:00'), date: '2026-11-25', source: 'app', status: 'pending', updatedAt: 0 };
const empty: BrainOut = { resume: '', taches: [], idees: [], forme: { energie: null, humeur: null, concentration: null }, travail: [], faits: [], terminees: [] };

describe('applyBrain', () => {
  it('turns a note into tasks, ideas, form, work and facts', () => {
    const out: BrainOut = {
      ...empty,
      resume: 'Une tâche, une idée.',
      taches: [{ titre: '  Rappeler le prof pour le stage. ', projet: 'ecole', etapes: ['Trouver son numéro', ''], minutes: 10, echeance: '2026-11-27', aujourdhui: false }],
      idees: [{ titre: 'Vidéo 3 erreurs', projet: 'biz' }],
      forme: { energie: 5.4, humeur: null, concentration: 14 },
      travail: [{ projet: 'biz', minutes: 120 }, { projet: 'biz', minutes: 0 }],
      faits: ['A mangé à 14 h.'],
      terminees: ['t-old', 'inconnu'],
    };
    const r = applyBrain(note, out, [{ id: 't-old' }], 1000, '2026-11-25');
    expect(r.todos.map((t) => [t.title, t.kind, t.project])).toEqual([
      ['Rappeler le prof pour le stage', 'task', 'ecole'],
      ['Vidéo 3 erreurs', 'idea', 'biz'],
    ]);
    expect(r.todos[0].steps).toEqual([{ text: 'Trouver son numéro' }]);
    expect(r.todos[0].due).toBe('2026-11-27');
    expect(r.todos[0].day).toBeUndefined();
    expect(r.doneIds).toEqual(['t-old']);
    expect(r.pulse).toEqual({ at: note.at, energy: 5, mood: undefined, focus: 10 });
    expect(r.blocks).toHaveLength(1);
    expect(blockMinutes(r.blocks[0], 0)).toBe(120);
    expect(r.facts).toEqual(['A mangé à 14 h']);
  });

  it('pins a task due today to today', () => {
    const r = applyBrain(note, { ...empty, taches: [{ titre: 'Rendre le devoir', projet: 'ecole', etapes: [], minutes: null, echeance: '2026-11-25', aujourdhui: false }] }, [], 1, '2026-11-25');
    expect(r.todos[0].day).toBe('2026-11-25');
  });

  it('keeps nothing from an empty answer', () => {
    const r = applyBrain(note, empty, [], 1, '2026-11-25');
    expect(r.todos).toEqual([]);
    expect(r.pulse).toBeUndefined();
    expect(r.made).toEqual([]);
  });
});

describe('to-do lists', () => {
  const t = (id: string, extra: Partial<Todo>): Todo => ({ id, title: id, project: 'biz', kind: 'task', steps: [], createdAt: 1, updatedAt: 1, ...extra });
  const start = Date.parse('2026-11-25T00:00:00');
  const todos = [t('a', { day: '2026-11-25' }), t('b', { due: '2026-11-24' }), t('c', { day: '2026-11-25', doneAt: start + 10 }), t('d', {}), t('e', { day: '2026-11-24', doneAt: start - 10 }), t('i', { kind: 'idea' })];

  it("shows today's tasks, late ones first, done ones last", () => {
    expect(todayList(todos, '2026-11-25', start).map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('groups the rest by project', () => {
    const g = byProject(todos, 'task', new Set(['a', 'b', 'c']));
    expect(g.biz.map((x) => x.id)).toEqual(['d']);
    expect(byProject(todos, 'idea', new Set()).biz.map((x) => x.id)).toEqual(['i']);
  });
});

describe('Lock-in', () => {
  it('adds timed and told work, and finds the running block', () => {
    const now = Date.parse('2026-11-25T12:00:00');
    const day = { date: '2026-11-25', updatedAt: 0, blocks: [{ project: 'biz' as const, start: now - 30 * 60_000, source: 'lockin' as const }, { project: 'ecole' as const, start: 0, end: 0, minutes: 45, source: 'dicte' as const }] };
    expect(workMinutes(day, now)).toEqual({ total: 75, by: { biz: 30, ecole: 45, salle: 0, perso: 0 } });
    expect(runningBlock({ '2026-11-25': day }, '2026-11-25')?.index).toBe(0);
    expect(runningBlock({ '2026-11-24': day }, '2026-11-25')?.date).toBe('2026-11-24');
  });

  it('formats time plainly', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(130)).toBe('2 h 10');
    expect(clock(42 * 60_000 + 18_000)).toBe('42:18');
    expect(clock(3_909_000)).toBe('1:05:09');
  });

  it('takes the business name from the private profile', () => {
    setProjectNames({ biz: { label: 'Ma boîte', short: 'Boîte' } });
    expect(PROJECT_LABEL.biz).toBe('Ma boîte');
    setProjectNames({ biz: { label: 'Business' } });
  });
});
