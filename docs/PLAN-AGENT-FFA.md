# Plan de Création - Agent FFA Scraper

## 📋 Vue d'ensemble

Création d'un agent de scraping du calendrier FFA (Fédération Française d'Athlétisme) pour extraire automatiquement les informations des compétitions de course à pied et créer des propositions de création/modification d'événements dans Miles Republic.

**Type d'agent** : `EXTRACTOR`  
**Source** : https://www.athle.fr/base/calendrier  
**Inspiration** : `GoogleSearchDateAgent`

---

## 🎯 Objectifs

1. **Scraper** le calendrier FFA par ligues et par mois de manière déterministe
2. **Extraire** les informations des compétitions (événement, éditions, courses)
3. **Matcher** les compétitions FFA avec les événements existants dans Miles Republic
4. **Créer des propositions** :
   - `EDITION_UPDATE` : Mise à jour d'éditions existantes
   - `EVENT_CREATE` : Création de nouveaux événements
   - `RACE_UPDATE` : Mise à jour de courses existantes
   - `RACE_CREATE` : Création de nouvelles courses

---

## 📂 Structure des fichiers à créer

```
apps/agents/src/
├── FFAScraperAgent.ts                      # Classe principale de l'agent
├── FFAScraperAgent.configSchema.ts         # Schéma de configuration
└── ffa/                                     # Dossier utilitaires
    ├── scraper.ts                          # Logique de scraping
    ├── parser.ts                           # Parsing HTML
    ├── matcher.ts                          # Matching avec DB existante
    └── types.ts                            # Types TypeScript

test-environment/configs/
└── ffa-scraper.json                        # Configuration de test

apps/agents/src/index.ts                    # Enregistrement de l'agent
```

---

## 🔧 Étape 1 : Créer les types TypeScript

**Fichier** : `apps/agents/src/ffa/types.ts`

```typescript
// Configuration de l'agent
export interface FFAScraperConfig {
  sourceDatabase: string           // ID de la base Miles Republic
  liguesPerRun: number             // Nombre de ligues à traiter par run (défaut: 2)
  monthsPerRun: number             // Nombre de mois à traiter par run (défaut: 1)
  levels: string[]                 // Niveaux: ['Départemental', 'Régional', 'National', 'International']
  scrapingWindowMonths: number    // Fenêtre de scraping en mois (défaut: 6)
  rescanDelayDays: number          // Délai avant de rescanner (défaut: 30)
  humanDelayMs: number             // Délai entre requêtes HTTP (défaut: 2000)
  similarityThreshold: number      // Seuil de similarité pour matching (défaut: 0.75)
  distanceTolerancePercent: number // Tolérance distance courses (défaut: 0.1)
  confidenceBase: number           // Confiance de base pour données FFA (défaut: 0.9)
}

// Compétition FFA extraite
export interface FFACompetition {
  ffaId: string                    // Numéro de compétition FFA
  name: string                     // Nom de la compétition
  date: Date                       // Date de début
  city: string                     // Ville
  department: string               // Département (ex: "074")
  ligue: string                    // Ligue (ex: "ARA")
  level: string                    // Niveau (Départemental, Régional, National)
  type: string                     // Type (Running, Trail, etc.)
  detailUrl: string                // URL de la fiche descriptive
}

// Détails d'une compétition FFA
export interface FFACompetitionDetails {
  competition: FFACompetition
  organizerName?: string
  organizerAddress?: string
  organizerEmail?: string
  organizerWebsite?: string
  organizerPhone?: string
  registrationClosingDate?: Date
  races: FFARace[]                 // Liste des courses/épreuves
  services?: string[]              // Services disponibles
  additionalInfo?: string
}

// Course FFA extraite
export interface FFARace {
  name: string                     // Nom de l'épreuve
  startTime?: string               // Heure de départ (ex: "10:00")
  distance?: number                // Distance en mètres
  positiveElevation?: number       // D+ en mètres
  categories?: string              // Catégories autorisées (ex: "CA->MA")
  type: 'running' | 'trail' | 'walk' | 'other'
}

// Résultat du matching avec Miles Republic
export interface MatchResult {
  type: 'EXACT_MATCH' | 'FUZZY_MATCH' | 'NO_MATCH'
  event?: {
    id: string
    name: string
    city: string
    similarity: number
  }
  edition?: {
    id: string
    year: string
    startDate: Date | null
  }
  races?: Array<{
    id: string
    name: string
    distance: number
    similarity: number
  }>
  confidence: number
}

// État de progression du scraping
export interface ScrapingProgress {
  currentLigue: string
  currentMonth: string              // Format: "YYYY-MM"
  currentPage: number
  completedLigues: string[]
  completedMonths: Record<string, string[]>  // { "ARA": ["2025-11", "2025-12"] }
  lastCompletedAt?: Date
  totalCompetitionsScraped: number
}
```

---

## 🔧 Étape 2 : Créer le schéma de configuration

**Fichier** : `apps/agents/src/FFAScraperAgent.configSchema.ts`

```typescript
import { ConfigSchema } from '@data-agents/agent-framework'

export const FFAScraperAgentConfigSchema: ConfigSchema = {
  title: "Configuration FFA Scraper Agent",
  description: "Agent qui scrape le calendrier FFA pour extraire les compétitions de course à pied",
  categories: [
    {
      id: "database",
      label: "Base de données",
      description: "Configuration de la source de données"
    },
    {
      id: "scraping",
      label: "Scraping",
      description: "Paramètres de scraping du calendrier FFA"
    },
    {
      id: "filtering",
      label: "Filtrage",
      description: "Filtres sur les compétitions à scraper"
    },
    {
      id: "matching",
      label: "Matching",
      description: "Configuration du matching avec Miles Republic"
    },
    {
      id: "advanced",
      label: "Avancé",
      description: "Options avancées"
    }
  ],
  fields: [
    // Base de données
    {
      name: "sourceDatabase",
      label: "Base de données source",
      type: "select",
      category: "database",
      required: true,
      description: "Base de données Miles Republic",
      helpText: "Base de données contenant les événements existants pour le matching",
      options: [],
      validation: { required: true }
    },

    // Scraping
    {
      name: "liguesPerRun",
      label: "Ligues par exécution",
      type: "number",
      category: "scraping",
      required: true,
      defaultValue: 2,
      description: "Nombre de ligues à traiter par run",
      helpText: "Plus la valeur est élevée, plus l'exécution sera longue",
      validation: { required: true, min: 1, max: 21 }
    },
    {
      name: "monthsPerRun",
      label: "Mois par exécution",
      type: "number",
      category: "scraping",
      required: true,
      defaultValue: 1,
      description: "Nombre de mois à traiter par run",
      helpText: "Recommandé: 1 mois par run pour éviter les timeouts",
      validation: { required: true, min: 1, max: 12 }
    },
    {
      name: "scrapingWindowMonths",
      label: "Fenêtre de scraping (mois)",
      type: "number",
      category: "scraping",
      required: true,
      defaultValue: 6,
      description: "Fenêtre temporelle à scraper (mois dans le futur)",
      helpText: "Ex: 6 = scraper les 6 prochains mois",
      validation: { required: true, min: 1, max: 24 }
    },
    {
      name: "rescanDelayDays",
      label: "Délai de rescan (jours)",
      type: "number",
      category: "scraping",
      required: true,
      defaultValue: 30,
      description: "Délai avant de rescanner la même période",
      helpText: "Après avoir couvert toute la fenêtre, attendre X jours avant de recommencer",
      validation: { required: true, min: 1, max: 365 }
    },
    {
      name: "humanDelayMs",
      label: "Délai entre requêtes (ms)",
      type: "number",
      category: "scraping",
      required: true,
      defaultValue: 2000,
      description: "Délai entre chaque requête HTTP",
      helpText: "Simule un comportement humain (recommandé: 1500-3000ms)",
      validation: { required: true, min: 500, max: 10000 }
    },

    // Filtrage
    {
      name: "levels",
      label: "Niveaux de compétition",
      type: "multiselect",
      category: "filtering",
      required: true,
      defaultValue: ["Départemental", "Régional"],
      description: "Niveaux de compétition à inclure",
      helpText: "Sélectionner les niveaux à scraper",
      options: [
        { value: "Départemental", label: "Départemental" },
        { value: "Régional", label: "Régional" },
        { value: "National", label: "National" },
        { value: "International", label: "International" }
      ],
      validation: { required: true }
    },

    // Matching
    {
      name: "similarityThreshold",
      label: "Seuil de similarité",
      type: "slider",
      category: "matching",
      required: true,
      defaultValue: 0.75,
      description: "Seuil minimum de similarité pour matcher un événement",
      helpText: "75% = correspondance acceptable, 90% = correspondance forte",
      validation: { min: 0.5, max: 1.0, step: 0.05 }
    },
    {
      name: "distanceTolerancePercent",
      label: "Tolérance distance (%)",
      type: "slider",
      category: "matching",
      required: true,
      defaultValue: 0.1,
      description: "Tolérance pour matcher les distances de courses",
      helpText: "10% = 10km FFA match avec 9-11km Miles Republic",
      validation: { min: 0, max: 0.5, step: 0.05 }
    },

    // Avancé
    {
      name: "confidenceBase",
      label: "Confiance de base",
      type: "slider",
      category: "advanced",
      required: true,
      defaultValue: 0.9,
      description: "Confiance de base pour les données FFA",
      helpText: "Données officielles FFA = haute confiance (0.9)",
      validation: { min: 0.5, max: 1.0, step: 0.05 }
    },
    {
      name: "maxCompetitionsPerMonth",
      label: "Compétitions max par mois/ligue",
      type: "number",
      category: "advanced",
      required: false,
      defaultValue: 500,
      description: "Limite le nombre de compétitions à traiter",
      helpText: "Sécurité pour éviter les boucles infinies",
      validation: { min: 10, max: 1000 }
    }
  ]
}
```

---

## 🔧 Étape 3 : Créer les utilitaires de scraping

### 3.1 Scraper HTTP

**Fichier** : `apps/agents/src/ffa/scraper.ts`

**Fonctions à implémenter** :

```typescript
/**
 * Récupère la liste des compétitions pour une ligue et un mois donnés
 */
export async function fetchCompetitionsList(
  ligue: string,
  startDate: Date,
  endDate: Date,
  levels: string[],
  page: number = 0,
  humanDelayMs: number = 2000
): Promise<{ competitions: FFACompetition[], hasNextPage: boolean, totalResults: number }>

/**
 * Récupère les détails d'une compétition depuis sa fiche
 */
export async function fetchCompetitionDetails(
  detailUrl: string,
  humanDelayMs: number = 2000
): Promise<FFACompetitionDetails | null>

/**
 * Calcule la saison FFA à partir d'une date
 * Ex: 31 décembre 2025 -> saison 2026
 */
export function calculateFFASeason(date: Date): string

/**
 * Construit l'URL de listing FFA
 */
export function buildListingURL(
  ligue: string,
  startDate: Date,
  endDate: Date,
  season: string,
  page: number = 0
): string

/**
 * Simule un délai humain entre requêtes
 */
export async function humanDelay(ms: number): Promise<void>
```

**Détails d'implémentation** :
- Utiliser `axios` ou `node-fetch` pour les requêtes HTTP
- Ajouter User-Agent réaliste : `Mozilla/5.0 ...`
- Gérer les erreurs HTTP (404, 500, timeouts)
- Parser le HTML avec `cheerio`
- Extraire pagination du sélecteur : `<div class="select-options" id="optionsPagination">`
- Filtrer par `frmtype1=Running`

### 3.2 Parser HTML

**Fichier** : `apps/agents/src/ffa/parser.ts`

**Fonctions à implémenter** :

```typescript
/**
 * Parse le listing de compétitions (table HTML)
 */
export function parseCompetitionsList(html: string): FFACompetition[]

/**
 * Parse la fiche détaillée d'une compétition
 */
export function parseCompetitionDetails(html: string, competition: FFACompetition): FFACompetitionDetails

/**
 * Extrait les courses/épreuves depuis la section "Liste des épreuves"
 */
export function parseRaces(html: string): FFARace[]

/**
 * Parse une date française "30 Novembre 2025"
 */
export function parseFrenchDate(dateStr: string): Date | undefined

/**
 * Parse une distance "10 km" ou "10000 m"
 */
export function parseDistance(distanceStr: string): number | undefined

/**
 * Parse un dénivelé "500 m" ou "D+ 500m"
 */
export function parseElevation(elevationStr: string): number | undefined

/**
 * Nettoie un nom d'événement (retire "3ème édition", etc.)
 */
export function cleanEventName(name: string): string
```

**Détails d'implémentation** :
- Utiliser `cheerio` pour parser HTML
- Table compétitions : `<table class="reveal-table base-table" id="ctnCalendrier">`
- Chaque compétition : `<tr class="clickable">` avec attribut `title="Compétition numéro : XXXXX"`
- Détails dans `<td>` : Date, Libellé, Lieu, Type, Niveau
- Lien fiche : `<a href="/competitions/...">+</a>`
- Section épreuves : `<section id="epreuves">`

### 3.3 Matcher avec Miles Republic

**Fichier** : `apps/agents/src/ffa/matcher.ts`

**Fonctions à implémenter** :

```typescript
/**
 * Match une compétition FFA avec un événement Miles Republic existant
 */
export async function matchCompetition(
  competition: FFACompetitionDetails,
  sourceDb: any,
  config: FFAScraperConfig,
  logger: any
): Promise<MatchResult>

/**
 * Calcule la similarité entre deux noms (trigramme ou Levenshtein)
 */
export function calculateSimilarity(name1: string, name2: string): number

/**
 * Match une course FFA avec une course Miles Republic existante
 */
export function matchRace(
  ffaRace: FFARace,
  milesRaces: Array<{ id: string, name: string, distance: number }>,
  tolerancePercent: number
): { matched: boolean, raceId?: string, similarity?: number }

/**
 * Recherche des événements candidats par nom + ville + période
 */
export async function findCandidateEvents(
  name: string,
  city: string,
  date: Date,
  sourceDb: any
): Promise<Array<{ id: string, name: string, city: string, editions: any[] }>>
```

**Détails d'implémentation** :
- Utiliser `string-similarity` pour algorithme trigramme
- Ou implémenter Levenshtein distance
- Nettoyer les noms avant comparaison (lowercase, trim, retirer accents)
- Chercher dans Miles Republic avec tolérance temporelle (±60 jours)
- Seuil de similarité configurable (défaut: 0.75)
- Pour courses : comparer distances avec tolérance (±10%)

---

## 🔧 Étape 4 : Créer la classe principale

**Fichier** : `apps/agents/src/FFAScraperAgent.ts`

**Structure de la classe** :

```typescript
export class FFAScraperAgent extends BaseAgent {
  private dbManager: DatabaseManager
  private sourceDb: any
  private stateService: IAgentStateService
  private prisma: typeof prisma

  constructor(config: any, db?: any, logger?: any) {
    // Initialisation similaire à GoogleSearchDateAgent
  }

  /**
   * Méthode principale d'exécution
   */
  async run(context: AgentContext): Promise<AgentRunResult> {
    // 1. Charger l'état de progression
    // 2. Déterminer ligues et mois à scraper
    // 3. Pour chaque ligue/mois :
    //    - Scraper les compétitions (avec pagination)
    //    - Récupérer les détails de chaque compétition
    //    - Matcher avec Miles Republic
    //    - Créer les propositions
    // 4. Sauvegarder l'état de progression
    // 5. Retourner le résultat
  }

  /**
   * Initialise la connexion à Miles Republic
   */
  private async initializeSourceConnection(config: FFAScraperConfig): Promise<void>

  /**
   * Charge l'état de progression depuis AgentState
   */
  private async loadProgress(): Promise<ScrapingProgress>

  /**
   * Sauvegarde l'état de progression
   */
  private async saveProgress(progress: ScrapingProgress): Promise<void>

  /**
   * Détermine les prochaines ligues/mois à scraper
   */
  private async getNextTargets(
    progress: ScrapingProgress,
    config: FFAScraperConfig
  ): Promise<{ ligues: string[], months: string[] }>

  /**
   * Scrape une ligue pour un mois donné
   */
  private async scrapeLigueMonth(
    ligue: string,
    month: string,
    config: FFAScraperConfig,
    context: AgentContext
  ): Promise<FFACompetitionDetails[]>

  /**
   * Crée les propositions pour une compétition
   */
  private async createProposalsForCompetition(
    competition: FFACompetitionDetails,
    matchResult: MatchResult,
    config: FFAScraperConfig
  ): Promise<ProposalData[]>

  /**
   * Calcule la confiance ajustée (comme GoogleSearchDateAgent)
   */
  private calculateAdjustedConfidence(
    baseConfidence: number,
    competition: FFACompetitionDetails,
    matchResult: MatchResult
  ): number

  /**
   * Validation de la configuration
   */
  async validate(): Promise<boolean>
}
```

**Logique de progression** :

```typescript
// Structure état dans AgentState
{
  "currentLigue": "ARA",
  "currentMonth": "2025-11",
  "currentPage": 0,
  "completedLigues": ["ARA", "BFC"],
  "completedMonths": {
    "ARA": ["2025-11", "2025-12"],
    "BFC": ["2025-11"]
  },
  "lastCompletedAt": "2025-10-31T12:00:00Z",
  "totalCompetitionsScraped": 145
}
```

**Algorithme de sélection** :
1. Si première exécution : démarrer avec première ligue + premier mois
2. Si en cours : continuer ligue/mois en cours
3. Si ligue terminée : passer à la ligue suivante
4. Si toutes ligues terminées ET délai de rescan écoulé : recommencer
5. Si toutes ligues terminées ET délai non écoulé : attendre

---

## 🔧 Étape 5 : Créer les propositions

**Types de propositions à créer** :

### 5.1 EVENT_CREATE (nouvel événement)

```typescript
{
  type: 'EVENT_CREATE',
  changes: {
    name: "Trail de la Raye",
    city: "La Baume Cornillane",
    country: "France",
    countrySubdivisionNameLevel1: "Auvergne-Rhône-Alpes",
    countrySubdivisionDisplayCodeLevel1: "ARA",
    countrySubdivisionNameLevel2: "Drôme",
    countrySubdivisionDisplayCodeLevel2: "026",
    websiteUrl: "http://...",
    dataSource: "FEDERATION",
    edition: {
      year: "2025",
      startDate: new Date("2025-11-01"),
      calendarStatus: "CONFIRMED",
      races: [
        {
          name: "Trail 10 km",
          startDate: new Date("2025-11-01T10:00:00"),
          runDistance: 10000,
          runPositiveElevation: 500,
          type: "TRAIL"
        }
      ]
    }
  },
  justification: [{
    type: 'text',
    content: `Nouvelle compétition FFA détectée: Trail de la Raye`,
    metadata: {
      ffaId: "296095",
      confidence: 0.9,
      source: "https://www.athle.fr/competitions/...",
      level: "Départemental",
      organizerName: "...",
      organizerEmail: "..."
    }
  }]
}
```

### 5.2 EDITION_UPDATE (mise à jour édition)

```typescript
{
  type: 'EDITION_UPDATE',
  eventId: "123",
  editionId: "456",
  changes: {
    startDate: {
      old: new Date("2025-11-02"),
      new: new Date("2025-11-01"),
      confidence: 0.92
    },
    organizerEmail: {
      old: null,
      new: "contact@event.fr",
      confidence: 0.9
    }
  },
  justification: [...]
}
```

### 5.3 RACE_CREATE (nouvelle course)

```typescript
{
  type: 'RACE_CREATE',
  eventId: "123",
  editionId: "456",
  changes: {
    name: "Trail 15 km",
    startDate: new Date("2025-11-01T11:00:00"),
    runDistance: 15000,
    runPositiveElevation: 800,
    type: "TRAIL"
  },
  justification: [...]
}
```

### 5.4 RACE_UPDATE (mise à jour course)

```typescript
{
  type: 'RACE_UPDATE',
  eventId: "123",
  editionId: "456",
  raceId: "789",
  changes: {
    name: {
      old: "Trail 10km",
      new: "Trail de la Raye 10 km",
      confidence: 0.85
    },
    runPositiveElevation: {
      old: null,
      new: 500,
      confidence: 0.9
    }
  },
  justification: [...]
}
```

---

## 🔧 Étape 6 : Enregistrer l'agent

**Fichier** : `apps/agents/src/index.ts`

```typescript
import { agentRegistry } from '@data-agents/agent-framework'
import { GoogleSearchDateAgent } from './GoogleSearchDateAgent'
import { FFAScraperAgent } from './FFAScraperAgent'

agentRegistry.register('GOOGLE_SEARCH_DATE', GoogleSearchDateAgent)
agentRegistry.register('FFA_SCRAPER', FFAScraperAgent)

export { GoogleSearchDateAgent, FFAScraperAgent }
export { agentRegistry }

console.log('📦 Sample agents registered:', agentRegistry.getRegisteredTypes())
```

---

## 🧪 Étape 7 : Créer la configuration de test

**Fichier** : `test-environment/configs/ffa-scraper.json`

```json
{
  "id": "ffa-scraper-test",
  "name": "FFA Scraper Agent - Test",
  "type": "EXTRACTOR",
  "frequency": "0 */12 * * *",
  "isActive": true,
  "config": {
    "sourceDatabase": "db-miles-republic",
    "liguesPerRun": 1,
    "monthsPerRun": 1,
    "levels": ["Départemental", "Régional"],
    "scrapingWindowMonths": 3,
    "rescanDelayDays": 30,
    "humanDelayMs": 1500,
    "similarityThreshold": 0.75,
    "distanceTolerancePercent": 0.1,
    "confidenceBase": 0.9,
    "maxCompetitionsPerMonth": 50
  }
}
```

---

## 🧪 Étape 8 : Tester l'agent

**Commandes de test** :

```bash
# Test dry-run avec verbose
node test-environment/console-tester.js FFAScraperAgent \
  --config test-environment/configs/ffa-scraper.json \
  --dry-run --verbose

# Test avec une seule ligue
node test-environment/console-tester.js FFAScraperAgent \
  --config test-environment/configs/ffa-scraper.json \
  --verbose

# Test en mode debug
node test-environment/console-tester.js FFAScraperAgent \
  --config test-environment/configs/ffa-scraper.json \
  --debug --output ./ffa-results.json
```

---

## 📝 Checklist de validation

### Fonctionnalités de base
- [ ] L'agent scrape correctement le listing FFA
- [ ] La pagination fonctionne (traite toutes les pages)
- [ ] Les détails des compétitions sont extraits
- [ ] Le matching avec Miles Republic fonctionne
- [ ] Les propositions sont créées avec le bon type
- [ ] L'état de progression est persisté
- [ ] Le délai humain est respecté

### Matching
- [ ] Les événements existants sont bien identifiés (>75% similarité)
- [ ] Les courses sont matchées par distance (±10%)
- [ ] Les nouveaux événements sont détectés
- [ ] Les nouvelles courses sont détectées

### Propositions
- [ ] `EVENT_CREATE` : structure complète (event + edition + races)
- [ ] `EDITION_UPDATE` : format old/new correct
- [ ] `RACE_CREATE` : rattachée à la bonne édition
- [ ] `RACE_UPDATE` : format old/new correct
- [ ] Confiance calculée correctement (0.9 base + ajustements)

### Performance
- [ ] Pas de boucle infinie
- [ ] Timeout géré (max 5min par ligue/mois)
- [ ] Délai humain respecté (1.5-3s entre requêtes)
- [ ] Pagination limitée (sécurité max 50 pages)

### Qualité
- [ ] Logs clairs et informatifs
- [ ] Gestion des erreurs HTTP
- [ ] Validation de la configuration
- [ ] Code commenté en français
- [ ] Types TypeScript complets

---

## 🚀 Ordre d'implémentation recommandé

1. **Jour 1** : Types + ConfigSchema
2. **Jour 2** : Parser HTML (tests unitaires)
3. **Jour 3** : Scraper HTTP + pagination
4. **Jour 4** : Matcher (similarité + distances)
5. **Jour 5** : Classe principale + état de progression
6. **Jour 6** : Création propositions
7. **Jour 7** : Tests + debug + documentation

---

## 📚 Références

- **GoogleSearchDateAgent** : `apps/agents/src/GoogleSearchDateAgent.ts`
- **BaseAgent** : `packages/agent-framework/src/base-agent.ts`
- **AgentRegistry** : `packages/agent-framework/src/index.ts`
- **Test Environment** : `test-environment/README.md`
- **Documentation** : `docs/AGENTS-ARCHITECTURE.md`

---

## ⚠️ Points d'attention

1. **Respect du site FFA** : Délai humain obligatoire (1.5-3s)
2. **Pagination** : Vérifier le nombre total de pages avant de boucler
3. **Cooldown** : Pas de cooldown comme GoogleSearchDateAgent (progression linéaire)
4. **Saison FFA** : Calculer correctement (1er sept → 31 août suivant)
5. **Distances** : Toujours convertir en mètres (km → m)
6. **Courses sans distance** : Ignorer (ne pas créer de proposition)
7. **Matching** : Ne pas créer de doublon si match >75%
8. **Confiance** : Utiliser les mêmes critères que GoogleSearchDateAgent (jour semaine, historique)

---

## 💡 Optimisations futures

- [ ] Cache des compétitions déjà scrapées (éviter re-scraping)
- [ ] Détection des modifications (date changée, nouvelle course ajoutée)
- [ ] Parallélisation du scraping (plusieurs ligues en parallèle)
- [ ] Export des compétitions scrapées en JSON
- [ ] Dashboard de monitoring du scraping
- [ ] Alertes en cas d'erreur récurrente

---

**Auteur** : Generated by Warp AI  
**Date** : 2025-10-31  
**Version** : 1.0
