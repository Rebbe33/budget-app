# Budget app

Appli de budget ultra simple : saisie en un champ (`12,50 leclerc`), catégories devinées automatiquement,
import du relevé CIC (PDF de la page Opérations, CSV ou OFX), bilan avec le solde réel de la banque.

Stack : Next.js + Supabase + Vercel. Tables Supabase préfixées `budget_`.

## Mise en route

1. **Supabase** : ouvre le projet (celui de Vanya / bullet / sport) > SQL Editor > colle `supabase/schema.sql` > Run.
2. **GitHub** : crée le repo `budget-app`, pousse ce dossier.
3. **Vercel** : importe le repo, ajoute les variables d'environnement
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (Supabase > Project Settings > API), puis déploie.
4. Ouvre l'appli, crée ton compte, puis (optionnel) Supabase > Authentication > Providers > Email > désactive
   « Allow new users to sign up » pour que personne d'autre ne puisse s'inscrire.
5. Sur le téléphone : « Ajouter à l'écran d'accueil » pour l'avoir comme une vraie appli.

En local : copie `.env.example` en `.env.local`, renseigne les 2 valeurs, puis `npm install && npm run dev`.

## Mise à jour (si tu avais déjà exécuté le SQL)

Relance `supabase/schema.sql` en entier dans le SQL Editor : il est sans risque et ajoute le type de catégorie « Épargne / transfert ».

## Utilisation

- **Accueil** : saisis une dépense (`12,50 leclerc`) ou un revenu (`+80 petit boulot`). Le « reste à vivre » et les jauges se mettent à jour.
- **Opérations** : liste du mois, touche une ligne pour la corriger. « Importer un relevé » pour déposer le CSV du CIC.
- **Bilan** : entre le solde de ta banque, l'appli le compare à son calcul et t'explique l'écart.
- **Réglages** : revenu de base, jour de début du mois, charges récurrentes, catégories et budgets.
