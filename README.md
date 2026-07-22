# otvt.fr

Site vitrine d'Olivier Thévet, développeur web indépendant. Bilingue (fr/en), thème clair/sombre.

## Stack

- **[Astro 7](https://astro.build)** — site 100% statique (`output: 'static'`, aucun adaptateur serveur, aucune route API).
- **Tailwind v4** (`@tailwindcss/vite`) — tokens de couleur sémantiques dans `src/styles/global.css`.
- **[Web3Forms](https://web3forms.com)** — formulaire de contact public.
- Déployé sur **Netlify** (déploiement automatique sur push vers `main`, build via `netlify.toml`).

## Démarrer en local

```sh
npm install
astro dev --background # voir AGENTS.md pour la gestion du serveur en arrière-plan
```

Commandes utiles :

| Commande         | Action                                    |
| :--------------- | :----------------------------------------- |
| `npm run dev`     | Serveur de dev (`localhost:4321`)          |
| `npm run build`   | Build de production dans `./dist/`         |
| `npm run preview` | Prévisualiser le build en local            |
| `npm run check`   | Typecheck Astro/TypeScript                 |
| `npm run lint`    | ESLint                                     |
| `npm run format`  | Prettier                                   |

## Structure du projet

```
src/
├── components/       # Header, Footer, HomeContent, ScrollIndicator (pas de composants partagés au-delà — chaque page duplique volontairement son propre balisage, voir docs/architecture.md)
├── layouts/Layout.astro
├── i18n/
│   ├── routes.ts     # une entrée par page, fr + en
│   └── ui.ts          # toutes les chaînes de texte, fr + en
├── pages/              # pages fr à la racine, jumelles en sous /en/
└── styles/global.css   # tokens Tailwind (@theme) + thème sombre
```

## Documentation

- **[docs/architecture.md](docs/architecture.md)** — comment le site est construit : i18n, thème, déploiement.
- **[AGENTS.md](AGENTS.md)** — instructions pour les agents IA travaillant sur ce repo (gestion du serveur de dev, etc.).
