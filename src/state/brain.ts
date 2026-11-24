/* Sorting a dictated note with Claude. Loaded only when a note is sent, so the app stays light. */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import type { BrainOut } from '../core/head';

const projet = z.enum(['biz', 'ecole', 'salle', 'perso']);

const Schema = z.object({
  resume: z.string(),
  taches: z.array(
    z.object({
      titre: z.string(),
      projet,
      etapes: z.array(z.string()),
      minutes: z.number().nullable(),
      echeance: z.string().nullable(),
      aujourdhui: z.boolean(),
    }),
  ),
  idees: z.array(z.object({ titre: z.string(), projet })),
  forme: z.object({ energie: z.number().nullable(), humeur: z.number().nullable(), concentration: z.number().nullable() }),
  travail: z.array(z.object({ projet, minutes: z.number() })),
  faits: z.array(z.string()),
  terminees: z.array(z.string()),
});

const SYSTEM = `Tu ranges les notes dictées de l'utilisateur de l'appli Lock-in. Il dicte vite, en vrac, avec des fautes de dictée : comprends ce qu'il veut dire. Ce qu'il faut savoir de lui est donné juste après, avec ses projets.

Range chaque note ainsi :
- taches : ce qu'il doit faire. Titre court qui commence par un verbe, avec ses mots, sans point final. Projet : biz (son entreprise, ses clients, ses vidéos, sa prospection), ecole (cours, devoirs, contrôles, stage, profs), salle (entraînement, nutrition, santé), perso (tout le reste). Étapes seulement si la tâche en a vraiment plusieurs (2 à 5, très courtes), sinon une liste vide. minutes : durée s'il la donne, sinon null. echeance : date AAAA-MM-JJ s'il en donne une (calcule "vendredi", "demain"... à partir de la date du jour), sinon null. aujourdhui : vrai seulement s'il dit que c'est pour aujourd'hui ou maintenant.
- idees : les idées à garder pour plus tard (idées de vidéo, de produit, d'amélioration). Une idée n'est pas une tâche.
- forme : énergie, humeur et concentration de 1 à 10. Prends le chiffre s'il en donne un. S'il dit seulement un mot clair (cramé, épuisé, en feu, au top), estime le chiffre. Sinon null.
- travail : le temps qu'il dit avoir travaillé ("j'ai bossé 2 h sur ma boîte"), en minutes, par projet. Rien s'il ne le dit pas.
- faits : faits courts utiles pour comprendre sa journée et faire des liens plus tard (heure d'un repas, ce qu'il a mangé avant la séance, café, heure de coucher ou de lever, comment s'est passée une séance, une douleur). Une phrase courte chacun, au passé, en français.
- terminees : les identifiants des tâches ouvertes (liste fournie) qu'il dit avoir faites.
- resume : une phrase courte qui dit ce que tu as rangé.

N'invente rien. Si la note ne contient rien d'un type, renvoie une liste vide. N'en fais pas une tâche si c'est juste une pensée.`;

export type BrainError = 'cle' | 'reseau' | 'limite' | 'refus' | 'autre';

export class SortError extends Error {
  constructor(public kind: BrainError) {
    super(kind);
  }
}

export async function sortWithClaude(
  apiKey: string,
  note: { text: string; at: number },
  context: { today: string; weekday: string; about?: string; open: { id: string; title: string }[] },
): Promise<BrainOut> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 60_000 });
  const time = new Date(note.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const open = context.open.length ? context.open.map((t) => `${t.id} : ${t.title}`).join('\n') : 'aucune';
  try {
    const res = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(Schema) },
      system: context.about ? `${SYSTEM}\n\nCe qu'il faut savoir de lui :\n${context.about}` : SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Date du jour : ${context.weekday} ${context.today}, il est ${time}.\n\nTâches ouvertes :\n${open}\n\nNote dictée :\n${note.text}`,
        },
      ],
    });
    if (res.stop_reason === 'refusal') throw new SortError('refus');
    if (!res.parsed_output) throw new SortError('autre');
    return res.parsed_output as BrainOut;
  } catch (e) {
    if (e instanceof SortError) throw e;
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new SortError('cle');
    if (e instanceof Anthropic.RateLimitError) throw new SortError('limite');
    if (e instanceof Anthropic.APIConnectionError) throw new SortError('reseau');
    throw new SortError('autre');
  }
}
