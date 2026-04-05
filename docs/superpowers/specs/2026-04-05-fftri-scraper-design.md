# FFTRI Scraper Agent - Design Spec

## Objectif

Créer un agent de scraping du calendrier FFTRI (Fédération Française de Triathlon) sur `fftri.t2area.com` pour extraire les événements multisport (triathlon, duathlon, aquathlon, swim&run, etc.) et les matcher avec la base Miles Republic.

Pattern identique au FFA Scraper existant.

## Architecture

```
apps/agents/src/
├── fftri/
│   ├── types.ts          # Types, config, constantes (ligues, mapping catégories)
│   ├── scraper.ts         # HTTP : fetch listing paginé + fetch détail événement
│   ├── parser.ts          # Cheerio : parse listing HTML + parse détail HTML
│   ├── matcher.ts         # Adaptateur vers EventMatchInput du framework
│   ├── deduplication.ts   # Détection doublons proposals
│   └── distances.ts       # Table distances standard par format et discipline
├── FFTRIScraperAgent.ts   # Orchestration : rotation ligues/mois, scrape, match, proposals
└── registry/
    └── fftri-scraper.ts   # Enregistrement registry (FFTRI_SCRAPER)
```

## Scraping

### Source

- **URL base listing** : `https://fftri.t2area.com/calendrier.html`
- **Filtres** : query params `filter[league_xxx]=on&filter[month_xxx]=on`
- **Pagination** : `layout=new&limitstart=N` (pas de 10)
- **Fin de pagination** : quand la réponse contient moins de 10 résultats

### Données du listing (par événement)

- Nom (`div.nomEvent`)
- Date(s) (`div.jourEvent`, `div.moisEvent`)
- Ville + code postal (`div.lieuEvent`)
- URL détail (attribut `href` du `a.blocEvent`)
- ID événement FFTRI (`blocEvent_XXXX`)
- Épreuves : type (`div.sportEvent`), format (`div.distEvent`), catégorie (classe CSS `national`/`youth`/`challenge`)

### Données de la page détail (1 requête par événement unique)

- Organisateur (nom, site web)
- Coordonnées GPS (lat, lng)
- On ne scrape PAS les pages individuelles d'épreuves

### Rythme

- Délai entre requêtes : 2s ±20%
- 2 ligues par run
- Fenêtre : 6 mois dans le futur
- Rescan : tous les 30 jours
- Fréquence agent : toutes les 12h

## Ligues FFTRI

18 ligues, mappées vers les mêmes codes régions que le FFA :

| Filtre query param | Code région | Nom |
|---|---|---|
| `league_auvergne_rhone_alpes` | ARA | Auvergne-Rhône-Alpes |
| `league_bourgogne_franche_comte` | BFC | Bourgogne-Franche-Comté |
| `league_bretagne` | BRE | Bretagne |
| `league_centre_val_de_loire` | CVL | Centre-Val de Loire |
| `league_corse` | COR | Corse |
| `league_grand_est` | GES | Grand Est |
| `league_guadeloupe` | GP | Guadeloupe |
| `league_hauts_de_france` | HDF | Hauts-de-France |
| `league_ile_de_france` | IDF | Île-de-France |
| `league_martinique` | MQ | Martinique |
| `league_normandie` | NOR | Normandie |
| `league_nouvelle_caledonie` | NC | Nouvelle-Calédonie |
| `league_nouvelle_aquitaine` | NAQ | Nouvelle-Aquitaine |
| `league_occitanie` | OCC | Occitanie |
| `league_pays_de_la_loire` | PDL | Pays de la Loire |
| `league_provence_alpes_cote_d_azur` | PAC | Provence-Alpes-Côte d'Azur |
| `league_reunion` | RE | Réunion |
| `league_federation_tahitienne` | PF | Fédération Tahitienne |

## Mapping catégories

### Type épreuve FFTRI → categoryLevel1/2 Miles Republic

| FFTRI `sportEvent` | categoryLevel1 | categoryLevel2 |
|---|---|---|
| TRI (format XXS) | TRIATHLON | TRIATHLON_XS |
| TRI (format XS) | TRIATHLON | TRIATHLON_XS |
| TRI (format S) | TRIATHLON | TRIATHLON_S |
| TRI (format M) | TRIATHLON | TRIATHLON_M |
| TRI (format L) | TRIATHLON | TRIATHLON_L |
| TRI (format XL) | TRIATHLON | TRIATHLON_XL |
| TRI (format XXL) | TRIATHLON | TRIATHLON_XXL |
| DUA, X-DUA | TRIATHLON | DUATHLON |
| AQUA | TRIATHLON | AQUATHLON |
| X-TRI | TRIATHLON | CROSS_TRIATHLON |
| S&R | TRIATHLON | SWIM_RUN |
| S&B | TRIATHLON | SWIM_BIKE |
| B&R | TRIATHLON | RUN_BIKE |
| RAID | TRIATHLON | OTHER |
| *-JEUNES (tout suffixe) | TRIATHLON | TRIATHLON_KIDS |

### Disciplines ignorées

- CYCL (cyclathlon) : pas de catégorie correspondante, ignoré

## Distances standard (distances.ts)

Distances de référence par format et discipline FFTRI. Utilisées pour remplir les champs `swimDistance`, `bikeDistance`, `runDistance` des courses.

### Triathlon

| Format | Swim (m) | Bike (km) | Run (km) |
|---|---|---|---|
| XXS | 100 | 4 | 1 |
| XS | 400 | 10 | 2.5 |
| S | 750 | 20 | 5 |
| M | 1500 | 40 | 10 |
| L | 3000 | 80 | 30 |
| XL | 3000 | 120 | 30 |
| XXL | 3800 | 180 | 42.195 |

### Duathlon

| Format | Run1 (km) | Bike (km) | Run2 (km) |
|---|---|---|---|
| XS | 2.5 | 10 | 1.25 |
| S | 5 | 20 | 2.5 |
| M | 10 | 40 | 5 |
| L | 10 | 60 | 10 |

### Aquathlon

| Format | Swim (m) | Run (km) |
|---|---|---|
| XS | 250 | 1.5 |
| S | 750 | 5 |
| M | 1500 | 10 |

### Swim & Run

| Format | Swim+Run total |
|---|---|
| XS-L | Variable, distances non standardisées → null |

### Cross-triathlon, Raids, Bike&Run

Distances non standardisées → `null`. Les distances réelles seront éventuellement ajoutées manuellement ou via un scraper futur.

## Matching

### Stratégie

Utilise le service mutualisé du `agent-framework` :

1. **Meilisearch** : pré-filtre pour trouver les événements candidats MR (par nom + ville)
2. **LLM** (`LLMMatchingService`) : décision finale match/no-match

Le `matcher.ts` est un simple adaptateur qui convertit les types FFTRI (`FFTRICompetition`) en `EventMatchInput` du framework.

### Prompt LLM

Le prompt LLM pour le matching événement est critique car les noms FFTRI peuvent différer significativement des noms MR (ex. "Triathlon du Dauphiné (26)" vs "Triathlon du Dauphiné"). Le prompt devra :
- Ignorer les suffixes de département "(XX)"
- Comparer la ville et le département
- Tenir compte des variantes de noms (avec/sans article, abréviations)

### Matching courses

Plus simple que le matching événement : on compare le `categoryLevel2` et le format (S/M/L). Pas besoin de LLM pour les courses.

### Confiance

- Base : **0.9** (source fédérale officielle)
- Ajustée selon qualité du matching (identique au FFA)

## Proposals

### Types générés

| Cas | Proposal type |
|---|---|
| Pas de match → nouvel événement | NEW_EVENT |
| Match événement, pas d'édition pour l'année | EDITION_UPDATE |
| Match événement + édition, différences détectées | EDITION_UPDATE |
| Match complet, différences sur courses | RACE_UPDATE |

### Déduplication

Avant de créer une proposal, vérifier qu'il n'y a pas déjà une proposal identique pending (même événement/édition, mêmes changements).

## Agent Registry

- **Identifiant** : `FFTRI_SCRAPER`
- **Type** : `EXTRACTOR`
- **Fréquence** : `0 */12 * * *` (toutes les 12h)
- **Config par défaut** :
  - `liguesPerRun: 2`
  - `monthsPerRun: 1`
  - `scrapingWindowMonths: 6`
  - `rescanDelayDays: 30`
  - `humanDelayMs: 2000`
  - `similarityThreshold: 0.75`
  - `confidenceBase: 0.9`
