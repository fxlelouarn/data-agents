# Règles d'inférence des catégories de courses

## Vue d'ensemble

Les champs `categoryLevel1` et `categoryLevel2` sont essentiels pour classifier les courses dans Miles Republic. Ces règles permettent d'inférer ces catégories automatiquement à partir du nom de la course, de la distance et du type.

## Distribution des catégories (par fréquence)

**CategoryLevel1 principales** :
- `TRAIL` : Trails et randonnées pédestres
- `RUNNING` : Courses à pied  
- `WALK` : Marches nordiques et randonnées pédestres
- `CYCLING` : Vélo (gravel, routes, VTT)
- `TRIATHLON` : Triathlon, duathlon, aquathlon
- `FUN` : Courses fun (obstacle, color run, etc.)
- `OTHER` : Autres sports

## Règles de catégorisation

### RUNNING (Courses à pied)

**CategoryLevel2 possibles** :
- `LESS_THAN_5_KM` : < 5 km
- `KM5` : 5 km
- `KM10` : 10 km (le plus fréquent : 15300)
- `KM15` : 15 km
- `KM20` : 20 km
- `HALF_MARATHON` : 21 km
- `MARATHON` : 42 km
- `ULTRA_RUNNING` : > 50 km
- `EKIDEN` : Relais (mot-clé : ekiden)
- `CROSS` : Cross-country (mot-clé : cross)
- `VERTICAL_KILOMETER` : Montée verticale (mot-clé : vertical km)

**Règles** :
1. **Par distance** (prioritaire) :
   ```
   distance < 5 → LESS_THAN_5_KM
   5 ≤ distance < 7.5 → KM5
   7.5 ≤ distance < 12.5 → KM10
   12.5 ≤ distance < 17.5 → KM15
   17.5 ≤ distance < 30 → KM20
   30 ≤ distance < 35 → HALF_MARATHON
   35 ≤ distance < 50 → MARATHON
   distance ≥ 50 → ULTRA_RUNNING
   ```

2. **Par mot-clé** (combiné avec distance) :
   - "marathon" (insensible à la casse) + "semi/half/1/2" → `HALF_MARATHON`
   - "marathon" (seul) → `MARATHON`
   - "ekiden" → `EKIDEN`
   - "cross" (sauf crossfit) → `CROSS`
   - "vertical" ou "km vertical" → `VERTICAL_KILOMETER`

### TRAIL (Trails pédestres)

**CategoryLevel2 possibles** :
- `DISCOVERY_TRAIL` : < 13 km (le plus fréquent : 46629)
- `SHORT_TRAIL` : 13-25 km
- `LONG_TRAIL` : 25-50 km
- `ULTRA_TRAIL` : ≥ 50 km
- `VERTICAL_KILOMETER` : Montée verticale
- `KM5`, `KM10`, `KM15`, `KM20` : Distances standards avec élévation

**Règles** :
1. **Par distance et élévation** :
   ```
   distance < 13 km → DISCOVERY_TRAIL
   13 km ≤ distance < 25 km → SHORT_TRAIL
   25 km ≤ distance < 50 km → LONG_TRAIL
   distance ≥ 50 km → ULTRA_TRAIL
   ```

2. **Par mot-clé et distance** :
   - "trail" + distance → Classifier par distance (ci-dessus)
   - "vertical" + "km" → `VERTICAL_KILOMETER`
   - Avec mot-clé "km" (ex: "trail 10km") → `KM10`, `KM15`, etc.

### WALK (Marches et randonnées)

**CategoryLevel2 possibles** :
- `HIKING` : Randonnée pédestre (le plus fréquent : 16082)
- `NORDIC_WALK` : Marche nordique
- `CROSS_COUNTRY_SKIING` : Ski de fond
- `DISCOVERY_TRAIL`, `KM10`, etc. : Avec élévation

**Règles** :
1. **Par mot-clé** (ordre d'importance) :
   - "marche nordique" ou "nordic walk" → `NORDIC_WALK`
   - "randonnée" ou "rando" ou "hiking" ou "rando" → `HIKING`
   - "ski de fond" ou "cross country skiing" → `CROSS_COUNTRY_SKIING`
   - Sinon (marche seule) → `HIKING` (par défaut)

### CYCLING (Vélo)

**CategoryLevel2 possibles** :
- `GRAVEL_RIDE` : Gravel/route (le plus fréquent : 1652)
- `GRAVEL_RACE` : Gravel race
- `GRAN_FONDO` : Gran fondo
- `ROAD_CYCLING_TOUR` : Tour routier
- `MOUNTAIN_BIKE_RIDE` : VTT (5001)
- `XC_MOUNTAIN_BIKE` : Cross-country VTT
- `ENDURO_MOUNTAIN_BIKE` : Enduro VTT
- `ULTRA_CYCLING` : Ultracycling
- `BIKEPACKING` : Bikepacking
- `CYCLE_TOURING` : Cycle touring
- `TIME_TRIAL` : Contre-la-montre
- `RUN_BIKE` : Parcours mixte run+bike

**Règles** :
1. **Par mot-clé** (ordre d'importance) :
   - "gravel" + "race" → `GRAVEL_RACE`
   - "gravel" (seul) → `GRAVEL_RIDE`
   - "gran fondo" ou "granfondo" → `GRAN_FONDO`
   - "vélo" ou "velo" ou "cyclisme" ou "bike" ou "cycling" :
     - Si mention "VTT" ou "mountain" → `MOUNTAIN_BIKE_RIDE`
     - Si mention "enduro" → `ENDURO_MOUNTAIN_BIKE`
     - Si mention "XC" → `XC_MOUNTAIN_BIKE`
     - Si mention "ultra" → `ULTRA_CYCLING`
     - Si mention "bikepacking" → `BIKEPACKING`
     - Si mention "touring" → `CYCLE_TOURING`
     - Si mention "contre-la-montre" ou "CLM" ou "TT" → `TIME_TRIAL`
     - Sinon → `ROAD_CYCLING_TOUR`

2. **Par distance** (fallback) :
   ```
   distance > 100 km → GRAN_FONDO
   distance > 200 km → ULTRA_CYCLING
   ```

### TRIATHLON (Triathlon et variants)

**CategoryLevel2 possibles** :
- `TRIATHLON_KIDS` : Enfants (1621)
- `TRIATHLON_XS` : Extra-short (1222)
- `TRIATHLON_S` : Short (1834)
- `TRIATHLON_M` : Medium (1396)
- `TRIATHLON_L` : Long (677)
- `TRIATHLON_XXL` : Ultra (101)
- `DUATHLON` : Duathlon (1963)
- `AQUATHLON` : Aquathlon (1287)
- `RUN_BIKE` : Run+bike (1280)
- `SWIM_RUN` : Swim+run (891)
- `SWIM_BIKE` : Swim+bike (31)
- `CROSS_TRIATHLON` : Cross-triathlon (664)
- `ULTRA_TRIATHLON` : Ultra-triathlon (108)

**Règles** :
1. **Par mot-clé** (ordre d'importance) :
   - "swim_run" ou "swimrun" ou "nage et course" → `SWIM_RUN`
   - "swim_bike" ou "swimbike" → `SWIM_BIKE`
   - "run_bike" ou "runbike" ou "raid" (si run+bike) → `RUN_BIKE`
   - "cross triathlon" ou "cross-triathlon" → `CROSS_TRIATHLON`
   - "ultra triathlon" → `ULTRA_TRIATHLON`
   - "duathlon" → `DUATHLON`
   - "aquathlon" → `AQUATHLON`
   - "triathlon" :
     - Si mention "enfant" ou "kids" ou "triathlon_kids" → `TRIATHLON_KIDS`
     - Si mention "XS" → `TRIATHLON_XS`
     - Si mention "S" (seul) → `TRIATHLON_S`
     - Si mention "M" (seul) → `TRIATHLON_M`
     - Si mention "L" (seul) → `TRIATHLON_L`
     - Si mention "XXL" ou "ultra" → `TRIATHLON_XXL`
     - Si distances détectées :
       ```
       swim ≤ 0.75 km, bike ≤ 20 km, run ≤ 5 km → TRIATHLON_XS
       swim ≤ 1.5 km, bike ≤ 40 km, run ≤ 10 km → TRIATHLON_S
       swim ≤ 2 km, bike ≤ 90 km, run ≤ 21 km → TRIATHLON_M
       swim ≤ 3 km, bike ≤ 180 km, run ≤ 42 km → TRIATHLON_L
       ```

### FUN (Courses fun)

**CategoryLevel2 possibles** :
- `OBSTACLE_RACE` : Obstacle course (1109)
- `COLOR_RUN` : Color run (235)
- `SPARTAN_RACE` : Spartan race (55)
- `MUD_DAY` : Mud day (14)

**Règles** :
1. **Par mot-clé** :
   - "obstacle" → `OBSTACLE_RACE`
   - "spartan" → `SPARTAN_RACE`
   - "color" → `COLOR_RUN`
   - "mud" → `MUD_DAY`

### OTHER (Autres)

**CategoryLevel2 possibles** :
- `CANICROSS` : Course avec chien
- `ORIENTEERING` : Orientation
- `RAID` : Raid multisport
- `BIATHLON` : Course + ski
- `CROSS_COUNTRY_SKIING` : Ski de fond
- `SWIMMING` : Natation
- `FREE_FLIGHT` : Vol libre
- `YOGA` : Yoga
- `BACKYARD` : Compétition de jardin

**Règles** :
1. **Par mot-clé** :
   - "canicross" → `CANICROSS`
   - "orientation" ou "orienteering" → `ORIENTEERING`
   - "raid" (non-duathlon) → `RAID`
   - "biathlon" (course + ski) → `BIATHLON`
   - "ski de fond" ou "cross country skiing" → `CROSS_COUNTRY_SKIING`
   - "natation" ou "swimming" → `SWIMMING`
   - "vol libre" ou "free flight" → `FREE_FLIGHT`
   - "yoga" → `YOGA`

## Détection automatique des distances

Patterns pour extraire les distances du nom :
- `\d+(?:\.\d+)?\s*km` : Distance en km
- `\d+(?:\.\d+)?\s*m` : Distance en mètres
- Mots-clés : "marathon" (42), "semi"/"half"/"1/2" (21), "10k", "5k", etc.

## Algorithme d'inférence

```typescript
function inferRaceCategories(raceName: string, runDistance?: number, swimDistance?: number, bikeDistance?: number, walkDistance?: number): [string, string | undefined]

1. Normaliser le nom : minuscules, accents supprimés, espaces multiples réduits
2. Déterminer le type primaire (categoryLevel1) :
   a. Chercher les mots-clés de type
   b. Si aucun mot-clé, déduire du nom/distances
3. Déterminer le sous-type (categoryLevel2) :
   a. Chercher les mots-clés spécifiques
   b. Si aucun mot-clé, utiliser les distances
4. Retourner [categoryLevel1, categoryLevel2]
```

## Cas d'usage

### Exemple 1 : Semi-Marathon du Grand Nancy
- Nom : "1/2 Marathon"
- Distance : 21 km
- **Résultat** : `RUNNING` / `HALF_MARATHON`
- **Raison** : Mot-clé "marathon" + "1/2" et distance 21km

### Exemple 2 : Trail des Loups
- Nom : "Trail Des Loups"
- Distance : 25 km
- Élévation : 800m
- **Résultat** : `TRAIL` / `LONG_TRAIL`
- **Raison** : Mot-clé "trail", distance 25km

### Exemple 3 : La Ronde de St Jans
- Nom : "La ronde de St Jans"
- Distance : 21 km
- **Résultat** : `TRAIL` / `DISCOVERY_TRAIL`
- **Raison** : "ronde" (peu clue), distance 21km → chercher contexte (trail par défaut si pas clair)

### Exemple 4 : Gravel 70km
- Nom : "Gravel 70 km"
- Distance vélo : 70 km
- **Résultat** : `CYCLING` / `GRAVEL_RIDE`
- **Raison** : Mot-clé "gravel", distance vélo 70km

### Exemple 5 : Triathlon S
- Nom : "Triathlon S"
- Swim : 1.5 km, Bike : 40 km, Run : 10 km
- **Résultat** : `TRIATHLON` / `TRIATHLON_S`
- **Raison** : Mot-clé "triathlon" + "S" et distances standard S
