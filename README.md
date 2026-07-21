# otvt.fr

Site vitrine + espace client d'Olivier Thévet, développeur web indépendant. Bilingue (fr/en), thème clair/sombre, espace client avec projets/factures/messagerie, back-office admin.

## Stack

- **[Astro 7](https://astro.build)** — site 100% statique (`output: 'static'`, aucun adaptateur serveur). Toute la logique dynamique (auth, données) passe par des appels `supabase-js` côté navigateur.
- **Tailwind v4** (`@tailwindcss/vite`) — tokens de couleur sémantiques dans `src/styles/global.css`.
- **[Supabase](https://supabase.com)** — Postgres (RLS), Auth (email OTP), Storage (factures + pièces jointes), Edge Functions.
- **[Resend](https://resend.com)** — emails transactionnels (SMTP pour Supabase Auth, API pour la notification "nouveau message").
- **[Web3Forms](https://web3forms.com)** — formulaire de contact public et notification "message client" (ne peut notifier que le propriétaire du compte, voir `docs/architecture.md`).
- Déployé sur **Netlify** (déploiement automatique sur push vers `main`, build via `netlify.toml`).

## Démarrer en local

```sh
npm install
cp .env.example .env   # renseigner PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY
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
├── lib/supabase.ts    # client supabase-js (clé anon uniquement)
├── pages/              # pages fr à la racine, jumelles en sous /en/
│   ├── compte.astro, connexion.astro   # espace client (fr)
│   ├── en/account.astro, en/login.astro # jumelles anglaises
│   └── admin.astro     # back-office, français uniquement, hors i18n
└── styles/global.css   # tokens Tailwind (@theme) + thème sombre

supabase/
├── schema.sql          # schéma de référence complet (à jour, pour lecture humaine)
├── migrations/          # migrations versionnées, appliquées via `supabase db push`
└── functions/notify-client-message/  # Edge Function (notification email au client)
```

## Documentation

- **[docs/architecture.md](docs/architecture.md)** — comment le site est construit : i18n, thème, auth, RLS, messagerie, back-office, déploiement.
- **[docs/admin-guide.md](docs/admin-guide.md)** — guide pratique pour utiliser `/admin` au quotidien (clients, projets, factures, messages).
- **[AGENTS.md](AGENTS.md)** — instructions pour les agents IA travaillant sur ce repo (gestion du serveur de dev, etc.).
