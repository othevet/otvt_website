# Architecture

Comment ce site est construit, et pourquoi. Destiné à quiconque reprend ce code (vous dans six mois, ou un autre développeur) — pas un guide d'utilisation (voir [admin-guide.md](admin-guide.md) pour ça).

## Principe général : site statique, pas de serveur

`astro.config.mjs` n'a pas d'adaptateur (`output` par défaut = `static`). Il n'y a **aucune route serveur/API** dans ce projet. Toute la logique dynamique — authentification, lecture/écriture de données, upload de fichiers — passe par des appels `supabase-js` **directement depuis le navigateur**, avec la clé publique `anon`. La sécurité n'est donc jamais "côté serveur" : elle est intégralement portée par les policies **Row Level Security (RLS)** de Postgres. C'est le fil conducteur de toute l'architecture — avant d'ajouter une fonctionnalité qui touche aux données, la question à se poser est "quelle policy RLS autorise/bloque ça", pas "quel contrôle fait le backend".

La seule exception est la Edge Function `notify-client-message` (voir plus bas), qui est le seul bout de code qui tourne côté serveur dans tout le projet.

## Internationalisation (fr/en)

- `src/i18n/routes.ts` : un objet `routes.fr`/`routes.en` avec une entrée par page (ex. `routes.fr.contact = '/contact'`, `routes.en.contact = '/en/contact'`). `astro.config.mjs` a `i18n.routing.prefixDefaultLocale: false` donc le français n'a pas de préfixe `/fr/`.
- `src/i18n/ui.ts` : toutes les chaînes de texte du site, `ui.fr.*` / `ui.en.*`. Une page lit `const t = ui.fr.account` (ou `ui.en.account`) dans son frontmatter.
- **Chaque page publique existe en deux fichiers distincts** (`src/pages/contact.astro` et `src/pages/en/contact.astro`, etc.) plutôt qu'un seul composant paramétré par la langue. C'est un choix assumé, pas un oubli : il n'y a **aucun composant de page partagé** dans tout le projet (seuls `Header`/`Footer`/`HomeContent`/`ScrollIndicator` sont des composants réutilisés, et uniquement pour de la mise en page, pas du contenu). Ajouter une page ou modifier une page existante veut donc dire toucher aux deux fichiers fr/en en parallèle.
- `/admin` est la seule exception : une page unique, français uniquement, volontairement absente de `routes.ts` (outil interne, pas de raison d'avoir une version anglaise ni d'apparaître dans le sélecteur de langue).

## Thème clair/sombre

Tokens de couleur sémantiques déclarés une fois dans `src/styles/global.css` via `@theme` (`--color-bg`, `--color-surface`, `--color-surface-alt`, `--color-ink`, `--color-amber-ink`, `--color-danger`, `--color-hairline`, en plus des couleurs de marque `--color-vert`/`--color-jaune`). Chaque token a une valeur claire par défaut et une valeur sombre sous `:root[data-theme='dark']` et `@media (prefers-color-scheme: dark)`. Les classes Tailwind (`bg-surface`, `text-ink/70`, etc.) s'adaptent donc automatiquement — **aucune classe `dark:` n'est utilisée nulle part**, y compris pour les variantes d'opacité (`/NN`), qui fonctionnent via `color-mix()` sur la variable CSS.

- Bouton de bascule dans `Header.astro`, persistance via `localStorage`, pas de flash au chargement (script `is:inline` en tout début de `<head>` dans `Layout.astro`).
- Comme Astro utilise les View Transitions (`<ClientRouter />`), le `data-theme` posé sur `<html>` est effacé à chaque navigation par la resynchronisation DOM d'Astro — il est donc réappliqué sur l'événement `astro:after-swap`, pas seulement au chargement initial.
- Trois exceptions volontairement **non** tokenisées : les pastilles de style macOS des cartes "terminal" (`#ff5f56`/`#ffbd2e`/`#28c840`) doivent rester identiques dans les deux thèmes.

## Espace client : authentification

Un seul mécanisme d'auth pour tout le monde (clients **et** admin) : email + code de connexion à usage unique via `supabase.auth.signInWithOtp()` / `verifyOtp()` (implémenté dans `connexion.astro` / `en/login.astro`). Il n'y a pas de mot de passe, pas de distinction de "rôle" côté Supabase Auth — n'importe quel email peut obtenir une session (`shouldCreateUser: true`). La distinction client / admin / personne-non-autorisée se fait entièrement **après coup**, via les policies RLS :

- Un utilisateur est "un client" si son email (en minuscules) correspond à une ligne de la table `clients`.
- L'admin est reconnu par un **email littéral en dur dans le SQL** (`lower(auth.jwt() ->> 'email') = 'contact@otvt.fr'`), jamais par un rôle ou une table.

`connexion.astro` accepte un paramètre `?redirect=` (avec garde anti-open-redirect : doit commencer par `/`) pour permettre à `/admin` de réutiliser le même formulaire de connexion plutôt que d'en dupliquer un.

`compte.astro` (et son jumeau `en/account.astro`) affiche l'un de trois états mutuellement exclusifs (`hidden`/visible sur des `<div>`) : session en cours de vérification, invité (pas connecté OU connecté mais aucune ligne `clients` associée), contenu du compte. `admin.astro` suit le même pattern à trois états (vérification / non autorisé / contenu), avec la vérification "non autorisé" faite côté client **pour le confort d'affichage seulement** — la vraie barrière est RLS : même si quelqu'un d'autre atteint cette page, les policies clients existantes limitent tout ce qu'il pourrait voir/écrire à son propre `client_id`.

### Durcissement de l'auth (audit du 2026-07-14)

- **Déconnexion** : `signOut({ scope: 'global' })` explicite partout (déjà le défaut de supabase-js v2, mais rendu explicite pour ne pas dépendre d'un défaut implicite sur une action de sécurité) — un logout invalide toutes les sessions actives, sur tous les appareils.
- **Cooldown de renvoi de code** : `login-flow.ts` refuse un renvoi de code moins de 30s après le précédent (défense en profondeur côté client — Supabase applique déjà un cooldown serveur d'environ 60s par adresse email sur `signInWithOtp`).
- **Détection de nouvel appareil** (`supabase/functions/log-login-device/`, table `login_events`) : appelée en best-effort juste après un `verifyOtp()` réussi. `verify_jwt = false` — mais pas pour la même raison que `notify-client-message` : cette fonction est appelée depuis le navigateur, dont la requête préliminaire CORS (`OPTIONS`) n'a pas d'`Authorization` ; avec `verify_jwt = true`, la plateforme rejetterait cette requête avant même d'atteindre le handler `OPTIONS`. Le JWT est donc vérifié manuellement dans le code via `getUser()` — tout aussi strict (signature vérifiée par le SDK), juste déplacé du niveau plateforme au niveau applicatif. L'email vient de ce JWT vérifié, jamais d'un paramètre client, donc impossible de forger un faux événement pour quelqu'un d'autre. Un "appareil" = `hash(user-agent + ip)` calculé côté fonction (pas par le client, pour éviter qu'un fingerprint falsifié échappe à la détection dans le cas où l'appelant serait malveillant plutôt que simplement le navigateur légitime d'un attaquant ayant intercepté un code). Si l'appareil n'a jamais été vu pour cet email, un email est envoyé via Resend (même compte que `notify-client-message`). Cette heuristique n'est pas infalsifiable (un attaquant déterminé pourrait forger les en-têtes), mais couvre le scénario réaliste visé : quelqu'un utilise un code de connexion intercepté depuis son propre navigateur normal, qui exécute notre JS sans le modifier.
- **RGPD en libre-service** (`compte.astro`/`en/account.astro`, carte "Mes données") : export JSON de ses propres projets/factures(métadonnées)/messages (entièrement côté client, aucune nouvelle route — les données sont déjà accessibles via les requêtes RLS existantes). La suppression de compte reste **volontairement semi-automatisée** : un bouton envoie une demande par email plutôt que de supprimer directement, car les factures sont soumises à une obligation légale de conservation comptable (~10 ans) qui empêche une suppression immédiate et automatique. Cette notification passe par `supabase/functions/request-account-deletion/` (Resend, même pattern que `log-login-device` : `verify_jwt=false` + vérification manuelle du JWT via `getUser()`, CORS géré explicitement), pas par Web3Forms — son filtre anti-spam (plan gratuit, non désactivable) classait systématiquement cette notification précise en spam. La messagerie continue d'utiliser Web3Forms (avec un champ honeypot `botcheck` ajouté en atténuation), ce n'est que cette notification précise qui a migré.

## Modèle de données et RLS

Schéma de référence : `supabase/schema.sql` (à jour, généré à partir des migrations dans `supabase/migrations/`, qui sont la source de vérité appliquée réellement en base). Sept tables : `clients`, `projects`, `invoices`, `messages`, `prospects`, `tasks`, `login_events`.

`prospects`, `tasks` et `login_events` sont strictement internes à l'admin : contrairement aux quatre premières tables, elles n'ont **aucune** policy client, seulement une policy "admin full access" — rien de ce qu'elles contiennent n'est exposé à l'espace client, même indirectement.

Principe RLS constant dans tout le projet : **les policies s'additionnent, elles ne se remplacent jamais**. Postgres combine plusieurs policies permissives pour une même action par un OU logique — donc chaque nouvelle capacité (l'admin peut tout faire, un client peut marquer un message comme lu, etc.) est ajoutée comme une policy **supplémentaire**, avec un nom distinct, jamais en modifiant une policy client existante. C'est ce qui a permis d'ajouter progressivement l'admin complet et la messagerie sans jamais casser le comportement client déjà en prod.

Deux subtilités à connaître si vous touchez à ce schéma :

- **RLS ne protège pas les colonnes, seulement les lignes.** Pour empêcher un client de modifier le *contenu* d'un message d'Olivier tout en lui permettant de marquer `read_at`, il a fallu combiner RLS avec un `revoke update on messages from authenticated; grant update (read_at) on messages to authenticated;` — un vrai grant/revoke Postgres, pas une policy.
- **Un `with check` d'insertion qui combine plusieurs conditions doit être une seule policy**, pas plusieurs. Exemple : la policy d'insertion cliente sur `messages` vérifie `sender = 'client' AND client_id = <soi-même>` dans un seul `with check`. Si c'était deux policies séparées, Postgres les combinerait par OU et l'une des deux garanties pourrait être contournée.

### Storage

Deux buckets privés, RLS sur `storage.objects` filtrée par premier segment du chemin (`(storage.foldername(name))[1]::uuid`) :

- `invoices` — `<client_id>/facture.pdf`. Le client peut **seulement lire** (les factures sont ajoutées par Olivier depuis `/admin`).
- `message-attachments` — `<client_id>/<timestamp>-<nom-slugifié>`. Le client peut **lire et écrire** dans son propre dossier (les deux sens du chat peuvent joindre un fichier). PDF + images uniquement, 10 Mo max, appliqué au niveau du bucket (`allowed_mime_types`/`file_size_limit`), pas seulement par l'attribut `accept` du `<input>` — un contournement du champ HTML ne suffit pas à uploader autre chose.

## Messagerie et notifications par email

Deux directions, **deux mécanismes différents** — ne pas les confondre en cas de bug :

1. **Client → Olivier** : à l'insertion d'un message côté client (`compte.astro`), un POST direct vers l'API Web3Forms (côté navigateur, best-effort, n'importe quelle erreur est avalée silencieusement). Web3Forms **ne peut pas** envoyer vers une adresse arbitraire — la clé d'accès est toujours liée à l'adresse du propriétaire du compte. C'est pour ça que ce mécanisme ne pouvait pas être réutilisé pour l'autre sens.
2. **Olivier → client** : un trigger Postgres (`notify_client_message_trigger`, table `messages`, `after insert`) appelle `net.http_post` (extension `pg_net`) vers la Edge Function `supabase/functions/notify-client-message`, qui appelle l'API Resend pour envoyer un email au client. Le compte Resend est le même que celui déjà configuré comme SMTP personnalisé pour les emails de connexion Supabase Auth (domaine déjà vérifié).
   - La fonction a `verify_jwt = false` (voir `supabase/config.toml`) : ce projet Supabase n'expose pas l'UI "Database Webhooks" habituelle (absente du dashboard même après activation de `pg_net` — la page Triggers ne liste que les fonctions retournant `trigger`), et stocker une service-role key dans un trigger SQL versionné aurait fuité un secret dans git. Le compromis retenu : pas d'authentification sur cet endpoint, risque résiduel jugé acceptable (il faudrait deviner un `client_id` — un UUID aléatoire — pour déclencher un email générique non sensible). Si ce risque devient un problème, l'alternative propre est Supabase Vault pour stocker un secret partagé référencé depuis le trigger.
   - `RESEND_API_KEY` est un secret de fonction (`supabase secrets set`), jamais commité. `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` sont injectées automatiquement par la plateforme dans le runtime de la fonction.

### Lu / non-lu

Colonne `messages.read_at`. Un badge (point vert) apparaît sur l'icône compte du header — visible sur **tout le site**, pas seulement `/compte` — tant qu'il existe un message d'Olivier non lu (`Header.astro` interroge Supabase à chaque `astro:page-load`). Côté admin, les compteurs par client et le badge total de l'onglet Messages sont calculés depuis la base au chargement (pas seulement via les événements Realtime reçus pendant la session en cours).

### Temps réel

Les deux côtés s'abonnent à `postgres_changes` sur `messages` (`supabase.channel(...).on('postgres_changes', ...)`). Cela ne fonctionne que si la réplication Realtime est activée sur la table côté Supabase (dashboard, ou `alter publication supabase_realtime add table messages;`) — **optionnel** : le code fonctionne correctement avec ou sans (dédoublonnage par id entre l'affichage optimiste à l'envoi et l'écho Realtime), donc l'absence de Realtime dégrade juste l'expérience (il faut recharger la page pour voir un nouveau message) sans rien casser.

## Back-office `/admin`

Un seul fichier (`src/pages/admin.astro`), onglets Clients / Projets / Factures / Messages / Prospects / Tâches basculés en JS (`hidden`/visible), pas de framework, pas de composants partagés — même style que le reste du site : DOM manipulé directement (`document.getElementById`, `<template>` clonés pour les listes répétées), formulaires avec un `dataset.initialized` pour éviter les doubles écouteurs lors des re-render Astro (View Transitions).

CRUD complet sur `clients`/`projects`/`invoices`/`messages`/`prospects`/`tasks`, en s'appuyant entièrement sur les policies admin `for all` ajoutées au schéma (voir plus haut) — aucune route serveur, les mêmes appels `supabase-js` que partout ailleurs.

Prospects et Tâches suivent le même pattern formulaire-en-haut/liste-en-dessous que les autres onglets, avec deux ajouts : un menu de filtre (par statut pour Prospects, par projet pour Tâches — `<select>` simple, pas de multi-sélection) et une mise en évidence des échéances dépassées (`next_follow_up` / `due_date` comparés à la date du jour en chaîne ISO, qui se compare correctement lexicographiquement). Le sélecteur de projet du formulaire Tâches est peuplé depuis un tableau `projects` désormais gardé en mémoire au niveau module (alimenté par `loadProjects()`), plutôt que rechargé séparément.

## Déploiement

- **Site** : push sur `main` → build Netlify automatique (config dans `netlify.toml` — `npm run build`, publie `dist/`).
- **Base de données / fonctions** : ne sont **pas** déployées par Netlify. Le repo est lié au projet Supabase "otvt" (`supabase link --project-ref quylkiyusujqkluhhwgs`, réf visible dans `supabase/migrations/20260711135914_notify_client_message_trigger.sql`). Nouvelle migration : `supabase migration new <nom>`, écrire le SQL, `supabase db push`. Nouvelle version de la Edge Function : `supabase functions deploy notify-client-message`.
- Le fichier `supabase/schema.sql` est un **document de référence humain** (à jour, lu d'un coup pour comprendre le schéma) — les migrations dans `supabase/migrations/` sont la source de vérité réellement appliquée. En cas de divergence, faire confiance aux migrations et corriger `schema.sql`.
