# myNativ · Partner Desk

Mini-client web partenaire dans un projet indépendant. Interface française, adaptée au mobile, avec démonstration persistante et connexion réelle à l’API `/api/v1/connectors`.

## Documentation technique

Voir la [référence API et webhooks](docs/api-webhooks.md) : endpoints, authentification, payloads, événements disponibles, exemples cURL et codes d’erreur.

## Fonctionnalités

- Liste paginée des demandes de voyage, détail et conseiller attribué.
- Attribution d’un conseiller via `PUT /travel-requests/{commercial_id}` avec `user_id`.
- Création d’un devis PDF : nom, prix en euros, dates, adultes/enfants et expiration.
- Création d’une proposition de modification PDF : supplément ou nouveau prix total, description et expiration.
- Historique des messages et envoi au nom d’un conseiller.
- Réception des événements : nouvelle demande, paiement, mise à jour d’une proposition et nouveau message.
- Journal des 100 derniers événements de l’environnement, avec rattachement au dossier et payload consultable.
- Mode démo : dossiers fictifs persistants, attribution, devis, propositions, messages et simulation des quatre événements.
- Configuration de la connexion dans l’interface ; test de connexion en lecture seule.

## Architecture

- React / Vinext, interface utilisant les composants accessibles du starter Sites.
- Cloudflare Worker pour les appels à myNativ et les webhooks.
- D1 : configuration chiffrée, données de démonstration et événements reçus.
- Les fichiers réels sont transmis en streaming à myNativ. Le client ne conserve pas de copie des PDF. En démo, seuls les métadonnées du devis sont conservées.
- Aucun jeton myNativ dans le code, les ressources publiques ou le stockage du navigateur.
- Accès public à l’interface et aux API métier, sans connexion utilisateur.
- Les webhooks utilisent un jeton dédié ; les appels myNativ utilisent le jeton API conservé côté serveur.

## État de livraison

Le projet et les tests sont présents. Le site Sites est enregistré, avec sa clé de chiffrement et son adresse propriétaire autorisée configurées côté hébergement.

La publication n’a pas encore eu lieu : l’installation des dépendances et l’accès Git distant étaient refusés par le réseau de la session. Il reste à terminer l’installation, générer et vérifier les migrations, compiler, vérifier l’interface et publier. Aucune URL de production n’est encore annoncée.

Vérifications réalisées hors réseau : syntaxe des sources TypeScript/TSX, tests unitaires de contrats et tests d’intégration des véritables handlers avec D1 SQLite et myNativ simulés. Cela ne constitue pas une validation de bout en bout avec myNativ réel. La validation WebMCP en navigateur n’était pas disponible ; cet enrichissement est optionnel et ne conditionne pas les parcours manuels.

## Démarrage local

Node.js 22.13+ (Node 24 recommandé), npm et accès au registre npm.

```sh
npm ci
cp .env.example .env
```

Renseigner `.env` :

- `ENCRYPTION_KEY` : 64 caractères hexadécimaux aléatoires, soit 32 octets. Génération : `python3 -c 'import secrets; print(secrets.token_hex(32))'`.

```sh
npm run db:generate
npm run build
```

Le hook `prebuild` génère aussi les migrations manquantes. Les SQL et snapshots produits dans `drizzle/` doivent être inspectés et commités avant publication. Les migrations déjà appliquées ne doivent pas être modifiées.

Appliquer chaque migration générée localement, dans l’ordre, par exemple (remplacer le nom du fichier par celui réellement généré) :

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_NOM_GENERE.sql
npm run dev
```

Ouvrir l’URL affichée : l’espace partenaire est accessible directement, sans connexion.

## Connexion réelle

Dans **Connexion** :

1. Choisir l’environnement myNativ (préproduction ou production).
2. Saisir le Bearer token du partenaire et, pour recevoir les webhooks, le `X-token` utilisé par myNativ.
3. Activer « Connexion réelle à myNativ » et enregistrer.
4. Tester la connexion enregistrée. Le test appelle uniquement `GET /users`.

Un changement d’hôte exige un nouveau jeton API, pour éviter d’envoyer le jeton d’un environnement à un autre. Les champs laissés vides conservent les secrets existants sur le même environnement.

Les secrets sont chiffrés AES-GCM dans D1. `ENCRYPTION_KEY` reste un secret d’hébergement : la remplacer sans migration de la configuration chiffrée rendrait celle-ci illisible. L’interface affiche seulement la présence des jetons, jamais leur valeur enregistrée.

## Webhooks

Après publication, l’interface affiche les URL absolues à copier dans les réglages du partenaire myNativ. Méthode `POST`, corps JSON, en-tête `X-token`.

| Réglage myNativ | Chemin du client |
| --- | --- |
| `webhook_new_request_url` | `/api/webhooks/new-request` |
| `webhook_new_payment_url` | `/api/webhooks/payment` |
| Mise à jour d’une proposition, voir ci-dessous | `/api/webhooks/proposition` |
| `webhook_new_message_url` | `/api/webhooks/message` |

Le mode réel et un jeton webhook enregistré sont nécessaires. Les routes refusent un mauvais jeton et limitent le JSON à 1 Mo. La réponse 200 est renvoyée après l’écriture durable en base. Une contrainte unique sur le hash canonique du type et du payload élimine les répétitions identiques. Un changement de statut du même objet produit bien un nouvel événement. Le journal se rafraîchit toutes les 15 secondes et recharge les dossiers lorsqu’un événement arrive.

Les événements de la démo sont isolés des événements réels. Aucune simulation ne peut être déclenchée en mode réel.

### Incohérence relevée côté myNativ

Dans `app/Services/PartnerWebhook/PartnerWebhookService.php`, `triggerNewProposition()` vérifie `webhook_modification_proposition_update_url`, puis transmet `webhook_new_travel_request_modification_proposition_update_url` à l’envoi. Ces deux noms diffèrent. Vérifier/corriger ce point dans myNativ avant le test de notification d’une proposition validée. Le client est prêt à recevoir le payload `ModificationRequestPropositionResource` ; il ne peut pas corriger un événement que myNativ n’émet pas.

Le schéma utilisateur représente « proposition validée ». L’événement réel transmet un statut : le client conserve et affiche ce statut, sans supposer que toute mise à jour est une validation.

## Tests

```sh
npm test
npm run typecheck
npm run build
```

Les tests d’intégration remplacent uniquement les bindings de plateforme et le transport externe : ils exécutent les handlers de l’application contre SQLite en mémoire. Aucun appel myNativ réel. Le compilateur TypeScript du projet est utilisé par le loader de test.

Tests couverts : accès sans session, routes autorisées, attribution, PDF, messages, propositions, simulations, chiffrement, absence de restitution des secrets, `X-token`, dédoublonnage, changement de statut, séparation démo/réel, pagination et transmission multipart avec Bearer serveur, erreurs Laravel, origines, hôtes et limites de taille.

## Publication Sites

Réutiliser le `project_id` de `.openai/hosting.json`, sans recréer de site. Bindings : `DB`, aucun R2. Conserver `ENCRYPTION_KEY` dans les variables d’hébergement, jamais dans le manifeste.

Après installation, migrations et compilation réussies : pousser les sources exactes, sauvegarder la version compilée et la publier. L’accès plateforme et les API métier sont publics, sans connexion utilisateur. Les webhooks restent protégés par leur jeton dédié.

Le chemin de publication reste celui des skills Sites du projet. Les credentials du dépôt source sont temporaires et ne sont pas stockés dans ce projet.

## Sources du contrat

- [Déclarations des routes](https://gitlab.com/bynativ/mynativ.bynativ.com/-/blob/develop/routes/api/api_v1.php)
- [Validation des requêtes partenaires](https://gitlab.com/bynativ/mynativ.bynativ.com/-/tree/develop/app/Http/Requests/Api/V1/Connector)
- [Service de webhooks](https://gitlab.com/bynativ/mynativ.bynativ.com/-/blob/develop/app/Services/PartnerWebhook/PartnerWebhookService.php)
- [Envoi et authentification des webhooks](https://gitlab.com/bynativ/mynativ.bynativ.com/-/blob/develop/app/Jobs/SendDataToPartnerWebhookJob.php)
