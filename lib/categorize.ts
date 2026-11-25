import type { Category, Rule } from './types';

/** minuscules + sans accents */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const NOISE = new Set([
  'carte', 'cb', 'paiement', 'prlv', 'prelevement', 'vir', 'virement', 'sepa', 'facture', 'achat',
  'retrait', 'dab', 'pmt', 'des', 'les', 'inst', 'recu', 'emis', 'sans', 'contact', 'ref', 'mandat',
  'num', 'cart', 'the', 'and', 'sas', 'sarl', 'www', 'com', 'fr',
]);

/** Mots « utiles » d'un libellé bancaire (sans chiffres, ni mots de bruit). */
export function cleanWords(label: string): string[] {
  return norm(label)
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !NOISE.has(w));
}

/** Mot-clé retenu pour apprendre une règle : le premier mot utile du libellé. */
export function keywordOf(label: string): string | null {
  return cleanWords(label)[0] ?? null;
}

/** Dictionnaire de départ, par NOM de catégorie (celles créées par défaut). */
const DEFAULT_KEYWORDS: Record<string, string[]> = {
  Courses: [
    'leclerc', 'carrefour', 'intermarche', 'lidl', 'auchan', 'casino', 'monoprix', 'aldi', 'biocoop',
    'picard', 'grand frais', 'super u', 'systeme u', 'hyper u', 'u express', 'netto', 'cora', 'boulangerie',
    'boucherie', 'primeur', 'drive', 'epicerie', 'marche', 'supermarche', 'franprix', 'spar', 'vival',
  ],
  Transports: [
    'sncf', 'totalenergies', 'total access', 'esso', 'shell', 'avia', 'essence', 'carburant', 'station',
    'peage', 'autoroute', 'vinci', 'sanef', 'parking', 'uber', 'blablacar', 'navigo', 'ratp', 'garage',
    'norauto', 'midas', 'feu vert', 'euromaster', 'controle technique', 'ouigo', 'flixbus',
  ],
  Animaux: [
    'vetoquinox', 'veterinaire', 'clinique veto', 'veto', 'zooplus', 'animalis', 'maxi zoo', 'croquette',
    'toilettage', 'medor', 'wamiz', 'tom&co', 'tomandco', 'point vert',
  ],
  'Sorties & resto': [
    'restaurant', 'resto', 'mcdo', 'mcdonald', 'burger', 'kfc', 'quick', 'pizza', 'pizzeria', 'brasserie',
    'cafe', 'bistrot', 'cinema', 'ugc', 'pathe', 'deliveroo', 'uber eats', 'just eat', 'subway', 'sushi',
    'kebab', 'creperie', 'glacier', 'bar ', 'pub ', 'concert', 'billetterie', 'fnac spectacle',
  ],
  Santé: [
    'pharmacie', 'pharma', 'docteur', 'medecin', 'dentiste', 'kine', 'osteo', 'opticien', 'optic',
    'laboratoire', 'hopital', 'clinique', 'doctolib', 'cpam', 'ameli', 'radiologie',
  ],
  Loisirs: [
    'amazon', 'fnac', 'cultura', 'decathlon', 'steam', 'netflix', 'spotify', 'disney', 'canal', 'action ',
    'gifi', 'ikea', 'leroy merlin', 'castorama', 'brico', 'jardinerie', 'truffaut', 'hema', 'cdiscount',
    'aliexpress', 'temu', 'vinted', 'leboncoin', 'librairie', 'cultura', 'rougier', 'oxybul', 'maison du monde',
  ],
  'Logement & charges': [
    'loyer', 'edf', 'engie', 'veolia', 'suez', 'saur', 'assurance', 'maif', 'macif', 'axa', 'pacifica',
    'groupama', 'matmut', 'free mobile', 'free ', 'orange', 'sfr', 'bouygues', 'internet', 'mutuelle',
    'dgfip', 'impots', 'taxe', 'syndic', 'foncia', 'sosh', 'red by', 'ovh',
  ],
  Salaire: ['salaire', 'paie ', 'remuneration'],
};

/**
 * Devine la catégorie d'une opération.
 * 1) règles apprises (le mot-clé le plus long gagne), 2) dictionnaire de départ.
 */
export function suggestCategory(
  label: string,
  amount: number,
  cats: Category[],
  rules: Rule[],
): string | null {
  const n = norm(label);
  if (!n.trim()) return null;

  let best: { len: number; id: string } | null = null;
  for (const r of rules) {
    if (!n.includes(r.keyword)) continue;
    if (!cats.some((c) => c.id === r.category_id)) continue;
    if (!best || r.keyword.length > best.len) best = { len: r.keyword.length, id: r.category_id };
  }
  if (best) return best.id;

  const isIncome = amount > 0;
  for (const cat of cats) {
    const kws = DEFAULT_KEYWORDS[cat.name];
    if (!kws) continue;
    if (isIncome !== (cat.kind === 'revenu')) continue;
    for (const kw of kws) {
      if (n.includes(kw) && (!best || kw.length > best.len)) best = { len: kw.length, id: cat.id };
    }
  }
  return best ? best.id : null;
}
