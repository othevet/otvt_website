# Architecture

Comment ce site est construit, et pourquoi. Destiné à quiconque reprend ce code (vous dans six mois, ou un autre développeur).

## Principe général : site statique, pas de serveur

`astro.config.mjs` n'a pas d'adaptateur (`output` par défaut = `static`). Il n'y a **aucune route serveur/API** dans ce projet, et **aucune donnée dynamique** — le seul point de contact avec l'extérieur est le formulaire de contact, qui poste directement vers l'API Web3Forms depuis le navigateur (`src/pages/contact.astro`).

## Internationalisation (fr/en)

- `src/i18n/routes.ts` : un objet `routes.fr`/`routes.en` avec une entrée par page (ex. `routes.fr.contact = '/contact'`, `routes.en.contact = '/en/contact'`). `astro.config.mjs` a `i18n.routing.prefixDefaultLocale: false` donc le français n'a pas de préfixe `/fr/`.
- `src/i18n/ui.ts` : toutes les chaînes de texte du site, `ui.fr.*` / `ui.en.*`. Une page lit `const t = ui.fr.nav` (ou `ui.en.nav`) dans son frontmatter.
- **Chaque page publique existe en deux fichiers distincts** (`src/pages/contact.astro` et `src/pages/en/contact.astro`, etc.) plutôt qu'un seul composant paramétré par la langue. C'est un choix assumé, pas un oubli : il n'y a **aucun composant de page partagé** dans tout le projet (seuls `Header`/`Footer`/`HomeContent`/`ScrollIndicator` sont des composants réutilisés, et uniquement pour de la mise en page, pas du contenu). Ajouter une page ou modifier une page existante veut donc dire toucher aux deux fichiers fr/en en parallèle.

## Thème clair/sombre

Tokens de couleur sémantiques déclarés une fois dans `src/styles/global.css` via `@theme` (`--color-bg`, `--color-surface`, `--color-surface-alt`, `--color-ink`, `--color-amber-ink`, `--color-danger`, `--color-hairline`, en plus des couleurs de marque `--color-vert`/`--color-jaune`). Chaque token a une valeur claire par défaut et une valeur sombre sous `:root[data-theme='dark']` et `@media (prefers-color-scheme: dark)`. Les classes Tailwind (`bg-surface`, `text-ink/70`, etc.) s'adaptent donc automatiquement — **aucune classe `dark:` n'est utilisée nulle part**, y compris pour les variantes d'opacité (`/NN`), qui fonctionnent via `color-mix()` sur la variable CSS.

- Bouton de bascule dans `Header.astro`, persistance via `localStorage`, pas de flash au chargement (script `is:inline` en tout début de `<head>` dans `Layout.astro`).
- Comme Astro utilise les View Transitions (`<ClientRouter />`), le `data-theme` posé sur `<html>` est effacé à chaque navigation par la resynchronisation DOM d'Astro — il est donc réappliqué sur l'événement `astro:after-swap`, pas seulement au chargement initial.
- Trois exceptions volontairement **non** tokenisées : les pastilles de style macOS des cartes "terminal" (`#ff5f56`/`#ffbd2e`/`#28c840`) doivent rester identiques dans les deux thèmes.

## Déploiement

- **Site** : push sur `main` → build Netlify automatique (config dans `netlify.toml` — `npm run build`, publie `dist/`).
- Aucune base de données, aucune fonction serveur à déployer : le site n'a plus de dépendance backend depuis le retrait du portail client (voir historique git si besoin de retrouver cette ancienne architecture).
