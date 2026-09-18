# Documentation technique — API et webhooks

Cette documentation décrit les routes effectivement exposées par ce client et les champs qu’il utilise. Elle ne constitue pas le catalogue exhaustif de l’API myNativ. Les exemples sont fictifs. Les structures de réponse myNativ, ses validations métier et ses énumérations complètes ne sont pas vérifiées ici sur un serveur réel.

## 1. Adresses et authentification

| Interface | URL de base | Authentification |
| --- | --- | --- |
| API myNativ appelée par le serveur | `{MYNATIV_URL}/api/v1/connectors` | `Authorization: Bearer <jeton partenaire>` |
| Proxy métier Partner Desk | `{DESK_URL}/api/partner` | Accès public, sans connexion utilisateur |
| Administration Partner Desk | `{DESK_URL}/api` | Accès public, sans connexion utilisateur |
| Réception webhook | `{DESK_URL}/api/webhooks` | `X-token: <jeton webhook enregistré>` |

Les seuls hôtes myNativ acceptés par la configuration sont `https://preprod.mynativ.app`, `https://www.mynativ.app` et `https://mynativ.app`.

Les mutations métier (`POST`, `PUT`) exigent un en-tête `Origin` égal à l’origine de Partner Desk, par exemple `https://desk.example.test`. Les webhooks n’exigent ni session ni `Origin`. Le Bearer myNativ est ajouté côté serveur aux appels vers myNativ.

Le serveur ajoute `Accept: application/json` et le Bearer aux appels myNativ. Les secrets sont conservés chiffrés en base et ne sont jamais retournés par l’API de configuration. Les réponses des handlers portent `Cache-Control: no-store` et `X-Content-Type-Options: nosniff`.

## 2. Endpoints métier

Les chemins suivants sont relatifs à `/api/partner` dans Partner Desk et à `/api/v1/connectors` pour les appels directs à myNativ.

| Méthode | Chemin | Entrée | Résultat utilisé par le client |
| --- | --- | --- | --- |
| GET | `/users` | Aucun paramètre transmis | Liste des conseillers |
| GET | `/travel-requests` | `page`, entier ≥ 1, défaut `1` | Liste paginée des dossiers |
| GET | `/travel-requests/{commercial_id}` | Identifiant commercial | Détail du dossier |
| PUT | `/travel-requests/{commercial_id}` | JSON `user_id` | Attribution d’un conseiller |
| GET | `/travel-requests/{commercial_id}/messages` | — | Historique des messages |
| POST | `/travel-requests/{commercial_id}/messages` | JSON `consultant_id`, `message` | Message créé |
| GET | `/travel-requests/{commercial_id}/quotations` | — | Liste des devis |
| POST | `/travel-requests/{commercial_id}/quotations` | Multipart avec PDF | Devis créé |
| POST | `/travel-requests/{commercial_id}/propositions` | Multipart avec PDF | Proposition de modification créée |

`commercial_id` accepte uniquement les lettres ASCII, chiffres, `_` et `-`. Utiliser par exemple `MAR2026-0421`, et non l’identifiant numérique interne du dossier. Le proxy ne fournit ni suppression, ni liste des propositions, ni modification générique d’un dossier.

En mode réel, la liste transmet toujours `page=<page>&per_page=20&sort=-created_at`. Les autres paramètres sont ignorés ; les autres routes ne transmettent aucun paramètre de query. En démo, la liste retourne tous les dossiers sur une seule page et ignore `page`.

### Attribution

```json
{ "user_id": 11 }
```

`user_id` doit être un entier JSON positif sûr. Une chaîne `"11"` ou `null` est refusée. Seul ce champ est transmis. En démo, le conseiller doit exister dans la liste fictive ; en réel, myNativ contrôle son admissibilité.

### Message

```json
{
  "consultant_id": 11,
  "message": "Bonjour, voici les précisions pour votre voyage."
}
```

`consultant_id` doit être un entier JSON positif sûr. `message` doit être une chaîne de 3 caractères minimum après retrait des espaces aux extrémités, et de 20 000 caractères maximum avant retrait. La chaîne originale est envoyée, avec ses espaces. Les champs supplémentaires sont retirés.

### Devis et propositions : multipart/form-data

Les nombres sont envoyés comme champs texte. Le champ fichier s’appelle **`quotation` pour les deux opérations**. Laisser le client HTTP générer le `Content-Type` et sa boundary.

| Champ | Devis | Proposition | Format utilisé |
| --- | --- | --- | --- |
| `quotation` | Oui | Oui | Fichier PDF, interface limitée à 30 Mio |
| `price` | Oui | Oui | Montant en euros, de 1 à 1 000 000 dans l’interface/démo ; pas en centimes |
| `expiration_date` | Oui | Oui | `YYYY-MM-DD HH:mm:ss`, sans fuseau |
| `travel_name` | Oui | — | Nom du voyage, 80 caractères maximum |
| `departure_date` | Oui | — | `YYYY-MM-DD` |
| `return_date` | Oui | — | `YYYY-MM-DD`, strictement après le départ en démo |
| `pax_adults` | Oui | — | Entier de 1 à 100 |
| `pax_kids` | Oui | — | Entier de 0 à 100 |
| `message` | — | Oui | Description, 3 à 100 caractères |
| `price_mode` | — | Oui | `modification` : supplément ; `travel_request` : nouveau total |

Ces contraintes décrivent les formulaires et le simulateur. En réel, le proxy transmet le multipart en streaming sans valider ses champs ou la signature du PDF : les validations définitives relèvent de myNativ. Le plafond technique du corps multipart est de 32 Mio (33 554 432 octets), incluant son enveloppe. En démo, le fichier doit être non vide, porter une extension `.pdf`, commencer par `%PDF-` et peser au plus 30 Mio ; seul son nom et les métadonnées sont conservés. Le simulateur accepte aussi `price_local` si `price` est absent, sans que cela établisse un contrat myNativ.

L’interface indique qu’une proposition nécessite un devis déjà validé dans myNativ ; le simulateur ne vérifie pas cette condition. Le fuseau attendu pour l’expiration reste à confirmer auprès de myNativ : l’interface ne fait pas de conversion UTC.

### Exemples d’appels directs à myNativ

Ces commandes utilisent le contrat consommé par Partner Desk et contournent son proxy. Définir `MYNATIV_URL` et `MYNATIV_TOKEN` dans l’environnement d’exécution.

```sh
curl "$MYNATIV_URL/api/v1/connectors/travel-requests?page=1&per_page=20&sort=-created_at" \
  -H "Authorization: Bearer $MYNATIV_TOKEN" -H 'Accept: application/json'

curl -X PUT "$MYNATIV_URL/api/v1/connectors/travel-requests/MAR2026-0421" \
  -H "Authorization: Bearer $MYNATIV_TOKEN" -H 'Accept: application/json' \
  -H 'Content-Type: application/json' --data '{"user_id":11}'

curl "$MYNATIV_URL/api/v1/connectors/travel-requests/MAR2026-0421/messages" \
  -H "Authorization: Bearer $MYNATIV_TOKEN" -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  --data '{"consultant_id":11,"message":"Bonjour, votre devis est disponible."}'

curl "$MYNATIV_URL/api/v1/connectors/travel-requests/MAR2026-0421/quotations" \
  -H "Authorization: Bearer $MYNATIV_TOKEN" -H 'Accept: application/json' \
  -F 'quotation=@devis.pdf;type=application/pdf' -F 'travel_name=Voyage dans l’Atlas' \
  -F 'price=4800' -F 'expiration_date=2027-01-01 18:00:00' \
  -F 'departure_date=2027-02-01' -F 'return_date=2027-02-10' \
  -F 'pax_adults=2' -F 'pax_kids=0'

curl "$MYNATIV_URL/api/v1/connectors/travel-requests/MAR2026-0421/propositions" \
  -H "Authorization: Bearer $MYNATIV_TOKEN" -H 'Accept: application/json' \
  -F 'quotation=@modification.pdf;type=application/pdf' \
  -F 'price=200' -F 'price_mode=modification' \
  -F 'message=Une nuit supplémentaire' -F 'expiration_date=2027-01-01 18:00:00'
```

### Réponses métier

En réel, le proxy conserve le statut HTTP et le corps JSON amont, sans normaliser son schéma. L’interface accepte une ressource brute ou enveloppée dans `data`. Le simulateur retourne des réponses `200` avec `data` ; ce statut ne préjuge pas des statuts de création myNativ.

Exemple fictif de liste :

```json
{
  "data": [{
    "id": 421,
    "commercial_id": "MAR2026-0421",
    "user_id": 11,
    "status": "NEW",
    "main_traveler": { "firstname": "Camille", "lastname": "Laurent", "email": "camille@example.test" },
    "departure_date": "2027-02-01",
    "pax_adults": 2,
    "pax_kids": 0,
    "budget": 4800,
    "is_deposit_paid": false
  }],
  "meta": { "current_page": 1, "last_page": 1 }
}
```

Les types locaux utilisent notamment :

| Ressource | Champs lus ou typés |
| --- | --- |
| Conseiller | `id` numérique, `fullname`, `email` facultatif |
| Dossier | `id`, `commercial_id` ; champs facultatifs : `user_id` nullable, `status`, `main_traveler`, `travel_detail`, `departure_date`, `pax_adults`, `pax_kids`, `budget`, `is_deposit_paid`, `created_at` |
| Devis | `id` numérique ou chaîne, `travel_name`, `price` ; facultatifs : `is_validated`, `active`, `media_url`, `expiration_date` |
| Message | `id` numérique ou chaîne ; facultatifs : `message`, `body`, `content`, `created_at`, `consultant_id`, `user_id` |

Ces types ne sont pas une validation des réponses amont. Les statuts présents dans la démo ne constituent pas une énumération complète des statuts métier.

## 3. Webhooks disponibles

Tous les événements utilisent `POST`, un corps JSON représentant directement la ressource et l’en-tête `X-token`. Ne pas envelopper la ressource dans `data`. La connexion doit être en mode `live` avec un jeton webhook enregistré.

| Événement | Endpoint Partner Desk | Signification | Réglage myNativ indiqué dans le README |
| --- | --- | --- | --- |
| `new-request` | `/api/webhooks/new-request` | Nouvelle demande de voyage | `webhook_new_request_url` |
| `payment` | `/api/webhooks/payment` | Nouveau paiement | `webhook_new_payment_url` |
| `proposition` | `/api/webhooks/proposition` | Mise à jour d’une proposition | Incohérence de nom signalée ci-dessous |
| `message` | `/api/webhooks/message` | Nouveau message | `webhook_new_message_url` |

### Contrat minimal accepté

Le corps doit être un objet JSON, non un tableau, avec `id` non nul. Il doit permettre de retrouver au moins une référence de dossier :

- Référence commerciale : `travel_request.commercial_id`, sinon `commercial_id`.
- Référence numérique : `travel_request.id`, sinon `travel_request_id`, sinon `id` uniquement pour `new-request`.

La sélection utilise la première valeur non nulle. Le validateur ne contrôle pas les types de ces références, les champs métier, les montants ou les statuts ; utiliser des identifiants cohérents avec myNativ. Les exemples suivants illustrent les formes exploitées par le client et la démo, sans prétendre reproduire les ressources amont exhaustives.

**Nouvelle demande**

```json
{
  "id": 421,
  "commercial_id": "MAR2026-0421",
  "status": "NEW",
  "main_traveler": { "firstname": "Camille", "lastname": "Laurent" },
  "departure_date": "2027-02-01",
  "pax_adults": 2,
  "pax_kids": 0
}
```

**Paiement**

```json
{
  "id": 9001,
  "amount": 1200,
  "paid_at": "2026-09-18T12:00:00.000Z",
  "is_first_payment": true,
  "travel_request": { "id": 421, "commercial_id": "MAR2026-0421" }
}
```

Le client ne valide ni ne convertit `amount` ; son unité et les autres champs de paiement doivent être confirmés dans la ressource myNativ déployée.

**Mise à jour de proposition**

```json
{
  "id": 7001,
  "travel_request_id": 421,
  "status": "VALIDATED",
  "price": 200,
  "price_mode": "modification",
  "message": "Une nuit supplémentaire",
  "travel_request": { "id": 421, "commercial_id": "MAR2026-0421" }
}
```

`VALIDATED` est un exemple de la simulation. Le récepteur accepte et conserve tout statut ; un webhook `proposition` ne signifie pas systématiquement validation.

**Message**

```json
{
  "id": 8001,
  "travel_request_id": 421,
  "message": "Bonjour, pouvons-nous ajouter une nuit ?",
  "created_at": "2026-09-18T12:00:00.000Z"
}
```

Ici, `commercial_id` sera nul dans le journal puisque seul l’identifiant numérique est fourni.

### Exemple d’envoi et accusé de réception

Définir `DESK_URL` et `WEBHOOK_TOKEN` dans l’environnement. Cet appel enregistre réellement un événement dans le journal de l’environnement actif.

```sh
curl "$DESK_URL/api/webhooks/payment" \
  -H "X-token: $WEBHOOK_TOKEN" -H 'Content-Type: application/json' \
  --data '{"id":9001,"amount":1200,"travel_request":{"id":421,"commercial_id":"MAR2026-0421"}}'
```

Réponse `200` après écriture en D1, y compris pour un doublon :

```json
{
  "received": true,
  "id": "live:https://preprod.mynativ.app:<sha256-hexadecimal>",
  "duplicate": false
}
```

L’identifiant est composé de la source et du SHA-256 de `type + ":" + payload_canonique`. La canonisation trie récursivement les clés des objets mais conserve l’ordre des tableaux. Deux payloads identiques pour le même type et le même environnement ne créent qu’une ligne ; le second renvoie `duplicate: true`. Tout changement de contenu, notamment de statut, produit une nouvelle ligne. Le dédoublonnage ne repose donc pas uniquement sur `payload.id`.

La taille maximale du corps est 1 Mio (1 048 576 octets). Le handler parse le JSON mais ne vérifie pas explicitement son en-tête `Content-Type`. L’authentification est un secret partagé `X-token`, sans signature HMAC ni contrôle d’horodatage. Aucune politique d’ordre de livraison ou de retries de l’émetteur n’est établie par ce dépôt.

Les webhooks réels enregistrent un événement ; ils ne modifient pas directement un dossier local. L’interface consulte le journal toutes les 15 secondes et recharge les dossiers lorsqu’elle détecte un nouvel événement.

### Point à vérifier côté myNativ

Le README rapporte une incohérence dans `PartnerWebhookService.php` : `triggerNewProposition()` vérifie `webhook_modification_proposition_update_url` mais utilise `webhook_new_travel_request_modification_proposition_update_url` pour l’envoi. Ce constat historique n’a pas été revérifié dans le backend pendant cette rédaction. Vérifier la version déployée avant de configurer l’émission des propositions. Le README identifie `ModificationRequestPropositionResource` comme ressource attendue.

## 4. API interne de configuration et de journal

Toutes ces routes exigent la session propriétaire ; leurs mutations exigent également `Origin`.

| Méthode | Endpoint | Entrée | Réponse de succès |
| --- | --- | --- | --- |
| GET | `/api/config` | — | Configuration publique ci-dessous |
| PUT | `/api/config` | JSON de configuration | `200 {"saved":true}` |
| POST | `/api/config/test` | Aucun corps requis | `200 {"success":true}` après un `GET /users` réel |
| GET | `/api/events` | Aucun filtre/pagination | `200 {"data":[...]}` |
| POST | `/api/demo/event` | `type`, `commercial_id` | `200 {"id":"demo:<hash>","duplicate":false}` |

Configuration publique :

```json
{
  "mode": "live",
  "baseUrl": "https://preprod.mynativ.app",
  "hasApiToken": true,
  "hasWebhookToken": true,
  "email": "operateur@example.test"
}
```

Corps de mise à jour :

```json
{
  "mode": "live",
  "baseUrl": "https://preprod.mynativ.app",
  "apiToken": "<jeton partenaire>",
  "webhookToken": "<secret webhook>"
}
```

`mode` (`demo` ou `live`) et `baseUrl` sont requis. Les jetons sont facultatifs, limités à 12 000 caractères chacun avant suppression des espaces aux extrémités. Un jeton vide ou omis conserve l’ancien, sauf le jeton API lors d’un changement d’hôte. Activer `live` exige un jeton API. Le jeton webhook est conservé même lors d’un changement d’hôte s’il n’est pas remplacé ; cette route ne permet pas de supprimer un secret en envoyant une chaîne vide.

Le test de connexion appelle réellement myNativ, même si le mode enregistré est `demo`.

Le journal retourne les 100 événements les plus récemment reçus de la source active (`demo` ou `live:<baseUrl>`). Exemple d’une ligne :

```json
{
  "id": "live:https://preprod.mynativ.app:<hash>",
  "event_type": "message",
  "commercial_id": null,
  "travel_id": 421,
  "payload": "{\"id\":8001,\"travel_request_id\":421,\"message\":\"Bonjour\"}",
  "received_at": "2026-09-18T12:00:00.000Z",
  "source": "live:https://preprod.mynativ.app"
}
```

`payload` est une **chaîne JSON sérialisée**, à parser séparément. `received_at` est la date de réception du serveur, pas la date métier. La limite de lecture à 100 ne constitue pas une politique de purge.

Simulation : `{"type":"payment","commercial_id":"MAR2026-0421"}`. Les quatre types webhook sont disponibles uniquement en mode démo. Le dossier doit exister ; `new-request` crée ensuite un nouveau dossier fictif. `proposition` exige une proposition préalablement créée sur le dossier (sinon `409`).

## 5. Erreurs et limites opérationnelles

Les erreurs locales utilisent la forme suivante ; `errors` est omis lorsqu’il n’est pas défini :

```json
{ "message": "Choisissez un conseiller." }
```

Les erreurs JSON myNativ sont transmises telles quelles avec leur statut, y compris un éventuel objet Laravel `errors`. Le test de connexion remplace toutefois le corps d’une erreur amont par son propre message.

| Statut | Cas locaux représentatifs |
| --- | --- |
| 400 | Corps JSON invalide |
| 401 | Session absente ou mauvais `X-token` |
| 403 | Compte non autorisé, `Origin` absent/invalide, simulation en mode réel |
| 404 | Chemin métier non autorisé, dossier démo introuvable |
| 409 | Jeton API absent lors d’un appel amont, aucune proposition à simuler |
| 413 | Corps JSON > 1 Mio ou taille multipart annoncée > 32 Mio |
| 415 | Création de devis/proposition sans multipart et boundary |
| 422 | Champs invalides, type webhook inconnu, événement sans `id` ou référence de dossier |
| 502 | Échec réseau/délai amont, redirection myNativ, réponse amont non JSON |
| 503 | Webhooks désactivés, stockage/chiffrement indisponible ou erreur interne non classée |

Le flux multipart est aussi interrompu au-delà de 32 Mio en cours de lecture. Dans ce cas, selon la propagation de l’erreur du transport, la réponse peut devenir `502`/`503` plutôt que `413`.

Le fetch amont dispose d’un délai de 45 secondes. Le proxy ne réessaie pas automatiquement les mutations et n’ajoute pas de clé d’idempotence. Après une interruption, vérifier l’état du dossier avant de renvoyer un message ou un PDF : l’action peut avoir été traitée en amont.

## 6. Sources locales et vérification

- [Routes et validations autorisées](../lib/contracts.mjs)
- [Proxy métier](../app/api/partner/%5B...path%5D/route.ts)
- [Récepteur webhook](../app/api/webhooks/%5Bevent%5D/route.ts)
- [Authentification, transport, chiffrement et dédoublonnage](../lib/server.ts)
- [Types consommés par l’interface](../lib/types.ts)
- [Formulaires](../app/desk.tsx) et [simulateur](../lib/demo.ts)
- [Configuration](../app/api/config/route.ts), [test de connexion](../app/api/config/test/route.ts), [journal](../app/api/events/route.ts), [simulation](../app/api/demo/event/route.ts)
- [Tests de contrats](../test/contracts.test.mjs) et [tests d’intégration](../test/integration.test.mjs)

Les tests utilisent SQLite et un transport myNativ simulé. Pour confirmer le contrat de production, confronter ces exemples aux ressources et validations du backend déployé, puis tester les quatre événements sur un environnement de préproduction. Les références backend historiques sont regroupées dans le [README](../README.md#sources-du-contrat).
