# Guide d'utilisation de /admin

Guide pratique pour gérer clients, projets, factures et messages depuis le back-office du site. Pour le fonctionnement technique, voir [architecture.md](architecture.md).

## Se connecter

1. Allez sur **otvt.fr/admin**.
2. Cliquez "Se connecter" → ça vous envoie sur la page de connexion classique.
3. Entrez **contact@otvt.fr** (c'est le seul email reconnu comme administrateur).
4. Vous recevez un code par email — **pensez à vérifier vos spams** si rien n'arrive après quelques minutes.
5. Entrez le code → vous êtes redirigé automatiquement vers `/admin`.

Si vous entrez un autre email que `contact@otvt.fr`, vous atterrirez sur l'espace client normal, pas sur l'admin.

## Vue d'ensemble

Quatre onglets en haut de la page : **Clients**, **Projets**, **Factures**, **Messages**. Chaque onglet a la même logique : un formulaire d'ajout en haut, une liste en dessous.

## Clients

- **Ajouter** : nom + email dans le formulaire du haut, "Ajouter". L'email doit être celui que le client utilisera pour se connecter à son espace (`/compte`) — c'est le seul lien entre un compte et un client, pas de mot de passe à définir.
- **Supprimer** : bouton "Supprimer" sur la ligne du client. ⚠️ Ça supprime aussi **tous ses projets et factures** (mais pas les fichiers déjà uploadés dans le Storage — voir la note plus bas).

## Projets

- **Ajouter** : choisissez le client dans la liste déroulante, nom du projet, statut (En cours / Terminé), notes optionnelles.
- **Changer le statut** : cliquez directement sur le badge de statut dans la liste (bascule En cours ↔ Terminé).
- **Supprimer** : bouton "Supprimer" sur la ligne.

Le client voit ses projets et leur statut dans son espace, en lecture seule.

## Factures

- **Ajouter** : client, projet (optionnel), libellé (ex. "Facture n°003"), montant, date, et **le fichier PDF** à uploader (10 Mo max).
- **Supprimer** : supprime la ligne et le fichier associé.

Le client voit ses factures dans son espace et peut télécharger le PDF (lien valable 90 secondes, régénéré à chaque clic).

## Messages

- Colonne de gauche : liste de tous les clients, avec un point vert si un message non lu vous attend. Un badge apparaît aussi sur l'onglet "Messages" lui-même avec le nombre total de messages non lus.
- Cliquez sur un client pour ouvrir le fil de discussion.
- Zone de réponse en bas : texte et/ou fichier joint (PDF ou image, 10 Mo max) — vous pouvez envoyer l'un, l'autre, ou les deux.
- Le client reçoit un email automatique dès que vous répondez (via Resend). Si les messages n'apparaissent pas instantanément côté client sans recharger la page, c'est normal — voir [architecture.md](architecture.md#temps-réel) pour activer l'option "temps réel" côté Supabase si vous le souhaitez.

## Notes utiles

- **Suppression de client et fichiers orphelins** : supprimer un client efface ses lignes en base (projets, factures, messages) mais pas les fichiers déjà uploadés dans le Storage Supabase. Si vous voulez vraiment tout nettoyer, il faut aussi supprimer manuellement le dossier correspondant dans le bucket `invoices` et `message-attachments` depuis le dashboard Supabase.
- **Un seul fichier par message** : pas de pièce jointe multiple sur un même envoi. Envoyez plusieurs messages si besoin.
- **Formats acceptés en pièce jointe** (facture et message) : PDF et images (PNG, JPEG, WebP, GIF), 10 Mo maximum. Un autre format est rejeté automatiquement, même si son nom de fichier a été modifié pour ressembler à un PDF.
