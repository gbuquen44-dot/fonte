import type { Origin } from '../core/rules';

export interface ScienceCard {
  id: string;
  title: string;
  body: string;
  origin: Origin;
  source: string;
}

export const SCIENCE: ScienceCard[] = [
  { id: 'top', origin: 'Étude', title: 'Le back-off fait le travail', body: 'Un single seul : +11,4 kg de total en 6 semaines. Single plus back-off : +33,7 kg. Petit essai de 16 hommes, mais c\'est déjà ta méthode.', source: 'Androulakis-Korakakis 2021' },
  { id: 'failure', origin: 'Étude', title: 'L\'échec n\'ajoute rien de net', body: 'À 1 ou 2 reps de marge, la croissance est la même sur 8 semaines. L\'échec coûte surtout de la récupération.', source: 'Refalo 2024' },
  { id: 'protein', origin: 'Étude', title: 'Le total de protéines d\'abord', body: 'Au-delà de 1,6 g/kg, le gain de masse maigre ne se voit plus en moyenne. Le plafond de 30 g par repas ne tient pas.', source: 'Morton 2018, Trommelen 2023' },
  { id: 'creatine', origin: 'Étude', title: 'Créatine et caféine, le reste attend', body: 'Ce sont les deux seuls compléments avec une recommandation générale pour la force.', source: 'Antonio 2021, Grgic 2018' },
  { id: 'cold', origin: 'Étude', title: 'Le bain froid freine les gains', body: 'Il réduit les courbatures, mais il diminue force et hypertrophie en routine après la séance.', source: 'Grgic 2023, Piñero 2024' },
  { id: 'freq', origin: 'Étude', title: 'Moins de séances, même résultat', body: '3 ou 6 séances à volume égal : +43,6 contre +46,5 kg de total sur 6 semaines. Ton passage à 5 jours ne coûte rien.', source: 'Colquhoun 2018' },
  { id: 'cv', origin: 'Étude', title: 'Un PR isolé prouve peu', body: 'Le 1RM varie d\'environ 2 % d\'une séance à l\'autre. Il faut une tendance sur plusieurs séances pour conclure.', source: 'Banyard 2017' },
  { id: 'stretch', origin: 'Étude', title: 'Le squat ne fait pas tout', body: 'Il ne fait grossir ni le droit fémoral ni les ischios. D\'où le leg extension et le leg curl.', source: 'Kubo 2019' },
  { id: 'lat', origin: 'Étude', title: 'Tes épaules ne viennent pas du bench', body: 'Le deltoïde latéral demande du travail direct, autour de 10 séries par semaine.', source: 'Larsen 2025' },
  { id: 'carbs', origin: 'Étude', title: 'Les glucides servent surtout au volume', body: 'Effet net sur les séances de plus de 45 minutes ou après un long jeûne, beaucoup moins sur le lourd court et nourri.', source: 'King 2022, Henselmans 2022' },
  { id: 'steps', origin: 'Étude', title: '7 000 pas pour la santé', body: 'Le gros du bénéfice est acquis vers 7 000 pas. Ce sont des données d\'observation, en population générale.', source: 'Ding 2025' },
  { id: 'evening', origin: 'Étude', title: 'S\'entraîner tard ne gâche pas la nuit', body: 'Sauf effort intense fini moins d\'une heure avant le coucher.', source: 'Stutz 2019' },
  { id: 'attempt', origin: 'Étude', title: 'Le dernier essai rate souvent', body: 'Au bench, la réussite tombe de 82 % à 49 % entre le 2e et le 3e essai. Un PR de 2,5 kg vaut un gros saut.', source: 'Darragh 2025' },
  { id: 'metab', origin: 'Étude', title: 'Ton métabolisme n\'est pas cassé', body: 'La baisse de dépense vient surtout du poids perdu. La part vraiment adaptative est faible et fond après le déficit.', source: 'Martins 2020' },
  { id: 'glyco', origin: 'Étude', title: 'Tes premiers gains seront de l\'eau', body: 'Le glycogène gonfle le muscle et améliore les photos sans nouveau tissu. Ne juge rien avant 4 semaines au maintien.', source: 'Bone 2017, de Moraes 2019' },
  { id: 'injury', origin: 'Étude', title: 'Adapter vaut mieux qu\'arrêter', body: 'Une charge tolérée, sous contrôle de la douleur, fait aussi bien que le repos sur les tendons.', source: 'Silbernagel 2007, Beyer 2015' },
];
