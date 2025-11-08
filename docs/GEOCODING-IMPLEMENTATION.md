# Implémentation du Géocodage - Nominatim API

**Date** : 2025-11-07  
**Fichier modifié** : `packages/database/src/services/proposal-domain.service.ts`

## Résumé

Implémentation complète du géocodage automatique des villes lors de la création d'événements, en utilisant l'API Nominatim d'OpenStreetMap (gratuite, open source, sans clé API).

## Contexte

Lors de l'application de propositions NEW_EVENT, les coordonnées GPS (`latitude`, `longitude`) étaient manquantes. La méthode `geocodeCity()` était un STUB qui retournait `null`.

## Solution implémentée

### API utilisée : Nominatim (OpenStreetMap)

**Avantages** :
- ✅ **Gratuit** : Pas de clé API nécessaire
- ✅ **Open Source** : Service de la fondation OpenStreetMap
- ✅ **Fiable** : Base de données mondiale collaborative
- ✅ **Pas de limite de quota** : Rate limiting uniquement (1 req/sec)
- ✅ **Pas de compte** : Utilisation directe

**Limitations** :
- ⚠️ Rate limiting strict : **1 requête par seconde maximum**
- ⚠️ User-Agent obligatoire (identification du projet)
- ⚠️ Pas de garantie de disponibilité 99.9%

**Alternatives étudiées** :
- Google Maps Geocoding API : Payant, nécessite clé API
- Mapbox Geocoding : Payant au-delà de 100k requêtes/mois
- Here API : Payant

## Code implémenté

### Méthode principale : `geocodeCity()`

**Ligne 1010-1070** dans `proposal-domain.service.ts`

```typescript
/**
 * Geocode city to get coordinates using Nominatim API (OpenStreetMap)
 * Rate limit: 1 request per second (enforced by sleep)
 * 
 * @param city - City name
 * @param country - Country code (FR, BE, etc.)
 * @returns Coordinates or null if geocoding failed
 */
private async geocodeCity(city: string, country: string): Promise<{latitude: number, longitude: number} | null>
```

**Fonctionnalités** :
1. ✅ Construction de la requête Nominatim avec ville + pays
2. ✅ Respect du rate limiting (sleep 1.1 sec entre requêtes)
3. ✅ User-Agent custom pour identification
4. ✅ Parsing de la réponse JSON
5. ✅ Validation des coordonnées
6. ✅ Gestion d'erreurs complète
7. ✅ Logs détaillés pour debug

### Méthodes helper

#### `getCountryName(countryCode: string): string`

**Ligne 1072-1089**

Convertit un code pays ISO en nom complet pour la requête Nominatim.

**Exemples** :
- `FR` → `France`
- `BE` → `Belgique`
- `CH` → `Suisse`
- `DE` → `Allemagne`

**Pays supportés** : FR, BE, CH, LU, MC, DE, ES, IT, GB, US

#### `sleep(ms: number): Promise<void>`

**Ligne 1091-1096**

Utilitaire pour le rate limiting. Pause l'exécution pendant N millisecondes.

## Exemple d'utilisation

### Requête Nominatim

```
https://nominatim.openstreetmap.org/search?q=Nancy%2C%20France&format=json&limit=1&addressdetails=1
```

**Headers** :
```
User-Agent: Miles-Republic-Data-Agents/1.0 (contact@milesrepublic.com)
```

### Réponse Nominatim

```json
[
  {
    "place_id": 235149290,
    "licence": "Data © OpenStreetMap contributors, ODbL 1.0. ...",
    "osm_type": "relation",
    "osm_id": 7427,
    "boundingbox": ["48.6556937", "48.7217651", "6.1289339", "6.2375547"],
    "lat": "48.6921042",
    "lon": "6.1843621",
    "display_name": "Nancy, Meurthe-et-Moselle, Grand Est, France métropolitaine, 54000, France",
    "class": "place",
    "type": "city",
    "importance": 0.7219574644892979,
    "icon": "..."
  }
]
```

### Extraction des coordonnées

```typescript
const latitude = parseFloat(result.lat)  // 48.6921042
const longitude = parseFloat(result.lon) // 6.1843621
```

## Intégration dans le workflow

### Appel depuis `applyNewEvent()`

**Ligne 191-201** dans `proposal-domain.service.ts`

```typescript
// ✅ FIX 1.2 : Géocoder si coordonnées manquantes
if (!event.latitude || !event.longitude) {
  this.logger.info(`Coordonnées manquantes pour l'événement ${event.id}, tentative de géocodage...`)
  const coords = await this.geocodeCity(event.city, event.country)
  if (coords) {
    await milesRepo.updateEvent(event.id, {
      latitude: coords.latitude,
      longitude: coords.longitude
    })
    this.logger.info(`Coordonnées mises à jour pour ${event.city}: ${coords.latitude}, ${coords.longitude}`)
  }
}
```

**Comportement** :
1. ✅ Vérifie si les coordonnées sont déjà présentes
2. ✅ Si manquantes, tente le géocodage
3. ✅ Si succès, met à jour l'Event dans Miles Republic
4. ✅ Si échec, continue sans coordonnées (pas d'erreur bloquante)

## Logs

### Succès

```
[INFO] Tentative de géocodage pour: Nancy, FR
[DEBUG] Requête Nominatim: https://nominatim.openstreetmap.org/search?q=Nancy%2C%20France&format=json&limit=1&addressdetails=1
[INFO] ✅ Géocodage réussi pour Nancy: 48.6921042, 6.1843621
[INFO] Coordonnées mises à jour pour Nancy: 48.6921042, 6.1843621
```

### Échec (ville non trouvée)

```
[INFO] Tentative de géocodage pour: VilleInexistante, FR
[WARN] Aucun résultat Nominatim pour VilleInexistante, FR
```

### Erreur réseau

```
[INFO] Tentative de géocodage pour: Nancy, FR
[ERROR] Erreur lors du géocodage de Nancy: FetchError: request to https://nominatim.openstreetmap.org/search failed
```

## Performance

### Impact sur la création d'événements

**Sans géocodage** : ~200ms (création Event + Edition + Race)  
**Avec géocodage** : ~1300ms (+1100ms pour le sleep + requête)

**Optimisation possible** :
- Géocodage asynchrone différé (queue de traitement)
- Cache des coordonnées par ville
- Batch géocodage de plusieurs villes en parallèle (attention rate limit)

### Rate limiting

**Nominatim** : 1 requête/seconde maximum

**Notre implémentation** : Sleep de 1.1 sec systématique avant chaque requête

**Calcul** :
- 1 événement = 1 géocodage = 1.1 sec
- 10 événements = 11 sec
- 100 événements = 110 sec (~2 min)

**Solution si volume important** : Passer à un service payant (Google Maps, Mapbox) ou héberger son propre serveur Nominatim.

## Tests

### Tests unitaires

**Fichier** : `packages/database/src/services/__tests__/proposal-domain-helpers.test.ts`

Tests pour `getCountryName()` :
```
✅ 12 tests réussis
```

### Tests d'intégration

**À faire** : Tester avec une vraie ville et vérifier les coordonnées retournées.

**Commande** :
```bash
curl -s "https://nominatim.openstreetmap.org/search?q=Nancy,France&format=json&limit=1" \
  -H "User-Agent: Miles-Republic-Data-Agents/1.0 (contact@milesrepublic.com)" | jq '.[0] | {lat, lon, display_name}'
```

**Résultat attendu** :
```json
{
  "lat": "48.6921042",
  "lon": "6.1843621",
  "display_name": "Nancy, Meurthe-et-Moselle, Grand Est, France métropolitaine, 54000, France"
}
```

## Documentation Nominatim

**API Documentation** : https://nominatim.org/release-docs/latest/api/Search/  
**Usage Policy** : https://operations.osmfoundation.org/policies/nominatim/  
**Rate Limiting** : https://nominatim.org/release-docs/latest/api/Search/#rate-limiting

**Points clés** :
1. User-Agent obligatoire avec contact
2. Max 1 req/sec pour usage gratuit
3. Pas de cache-busting (ne pas modifier l'URL pour contourner le cache)
4. Encouragement à héberger son propre serveur pour volumes élevés

## Alternatives futures

### 1. Cache local

Implémenter un cache Redis/PostgreSQL des coordonnées par ville.

**Avantages** :
- Pas de requête externe si déjà connu
- Performance instantanée
- Pas de rate limiting

**Structure** :
```sql
CREATE TABLE city_coordinates (
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  latitude FLOAT NOT NULL,
  longitude FLOAT NOT NULL,
  cached_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (city, country)
);
```

### 2. Serveur Nominatim auto-hébergé

Installer Nominatim sur un serveur dédié.

**Avantages** :
- Pas de rate limiting
- Contrôle total
- Performance maximale

**Inconvénients** :
- Coût d'infrastructure
- Maintenance
- Base de données OpenStreetMap (~100GB)

### 3. API payante

Migrer vers Google Maps Geocoding API ou Mapbox.

**Avantages** :
- SLA 99.9%
- Rate limiting élevé
- Support technique

**Inconvénients** :
- Coût : ~$5 pour 1000 requêtes (Google)
- Nécessite clé API et compte

## Sécurité

### User-Agent

Le User-Agent identifie notre projet :
```
Miles-Republic-Data-Agents/1.0 (contact@milesrepublic.com)
```

**Raison** : Nominatim demande une identification pour pouvoir contacter en cas de problème (abus, bugs, etc.)

### Données sensibles

Aucune donnée sensible n'est envoyée à Nominatim :
- Uniquement ville + pays (données publiques)
- Pas de données personnelles
- Pas de données internes Miles Republic

## Monitoring

### Logs à surveiller

```bash
# Succès de géocodage
grep "✅ Géocodage réussi" logs/api.log | wc -l

# Échecs
grep "Aucun résultat Nominatim" logs/api.log | wc -l

# Erreurs réseau
grep "Erreur lors du géocodage" logs/api.log | wc -l
```

### Métriques recommandées

1. **Taux de succès géocodage** : (succès / tentatives) * 100
2. **Temps moyen géocodage** : avg(temps_requête)
3. **Nombre requêtes/jour** : count(requêtes)

## Troubleshooting

### Erreur : "HTTP 403 Forbidden"

**Cause** : User-Agent manquant ou invalide

**Solution** : Vérifier que le header `User-Agent` est bien défini

### Erreur : "HTTP 429 Too Many Requests"

**Cause** : Rate limiting dépassé (>1 req/sec)

**Solution** : Augmenter le sleep à 2 secondes

### Ville non trouvée

**Cause** : Nom de ville inconnu de Nominatim ou mal orthographié

**Solutions** :
1. Vérifier l'orthographe de la ville
2. Essayer avec un nom alternatif (ex: "Lyon" au lieu de "Villeurbanne")
3. Ajouter la région dans la requête (ex: "Nancy, Grand Est, France")

## Prochaines étapes

1. ✅ Implémentation Nominatim
2. ✅ Tests unitaires
3. ⏳ Tests d'intégration avec vraies villes
4. ⏳ Monitoring logs en production
5. ⏳ Évaluer besoin de cache
6. ⏳ Évaluer besoin API payante si volume important

## Ressources

- Nominatim API : https://nominatim.org
- OpenStreetMap : https://www.openstreetmap.org
- Code source : `packages/database/src/services/proposal-domain.service.ts` (lignes 1010-1096)
- Tests : `packages/database/src/services/__tests__/proposal-domain-helpers.test.ts`
