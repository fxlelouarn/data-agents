# Esquisse : Option B - Deux panes en miroir (Working Proposal + Source)

## Concept général

L'interface est divisée en **deux panes verticaux** :
- **Pane gauche** : Working Proposal (éditable) - la proposition finale qui sera validée
- **Pane droit** : Source Proposal (lecture seule) - une des propositions originales, sélectionnable par onglets

L'utilisateur peut :
1. Copier **toute une proposition** dans la Working Proposal
2. Copier **champ par champ** depuis n'importe quelle source
3. Copier **course par course** depuis n'importe quelle source
4. Éditer manuellement n'importe quel champ de la Working Proposal

## Décisions prises

- **Priorité des onglets** : FFA > Slack > Google
- **Courses** : Copie individuelle possible (course par course)
- **Archivage** : Silencieux (les autres propositions sont archivées automatiquement à la validation)

---

## Maquette ASCII - Vue générale (deux panes en miroir)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  ← Retour aux propositions                                              [Archiver] [Rejeter]│
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                             │
│  ┌─ WORKING PROPOSAL (éditable) ────────────────┬─ SOURCE ──────────────────────────────────┐
│  │                                              │  [FFA Scraper]  [Google ●]  [Slack]       │
│  │                                              │                                           │
│  │  [← Copier toute la proposition]             │  Google Search Agent                      │
│  │                                              │  Confiance: 70%                           │
│  │  ╔═══════════════════════════════════════╗   │                                           │
│  │  ║  ÉVÉNEMENT              [Valider ✓]   ║   │  ╔═══════════════════════════════════════╗│
│  │  ╠═══════════════════════════════════════╣   │  ║  ÉVÉNEMENT                            ║│
│  │  ║  Champ      Actuel    Proposé         ║   │  ╠═══════════════════════════════════════╣│
│  │  ╠───────────────────────────────────────╣   │  ║  Champ      Valeur              [←]   ║│
│  │  ║  name       -         Trail Monts     ║   │  ╠───────────────────────────────────────╣│
│  │  ║  city       -         Dijon      [✎]  ║   │  ║  name       Trail des Monts     [←]   ║│
│  │  ║  dept       -         21              ║   │  ║  city       St-Apollinaire      [←]   ║│
│  │  ╚═══════════════════════════════════════╝   │  ║  dept       21                  [←]   ║│
│  │                                              │  ╚═══════════════════════════════════════╝│
│  │  ╔═══════════════════════════════════════╗   │                                           │
│  │  ║  ÉDITION                [Valider ✓]   ║   │  ╔═══════════════════════════════════════╗│
│  │  ╠═══════════════════════════════════════╣   │  ║  ÉDITION                              ║│
│  │  ║  startDate  -         30/03 10:00     ║   │  ╠───────────────────────────────────────╣│
│  │  ║  year       -         2025            ║   │  ║  startDate  30/03 09:00  ⚠️    [←]   ║│
│  │  ║  website    -         https://...     ║   │  ║  year       2025                [←]   ║│
│  │  ╚═══════════════════════════════════════╝   │  ║  website    -                         ║│
│  │                                              │  ╚═══════════════════════════════════════╝│
│  │  ╔═══════════════════════════════════════╗   │                                           │
│  │  ║  COURSES                [Valider ✓]   ║   │  ╔═══════════════════════════════════════╗│
│  │  ╠═══════════════════════════════════════╣   │  ║  COURSES                              ║│
│  │  ║  Trail 21km   10:00   21km   800m     ║   │  ╠───────────────────────────────────────╣│
│  │  ║  Trail 10km   10:30   10km   350m     ║   │  ║  Trail 21km  09:00  21km  800m  [←]   ║│
│  │  ║  Marche 5km   11:00   5km    -        ║   │  ║  Trail 10km  09:30  10km  350m  [←]   ║│
│  │  ║  + Ajouter une course                 ║   │  ║  (pas de marche dans Google)         ║│
│  │  ╚═══════════════════════════════════════╝   │  ╚═══════════════════════════════════════╝│
│  │                                              │                                           │
│  │           [Valider tous les blocs]           │                                           │
│  └──────────────────────────────────────────────┴───────────────────────────────────────────┘
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

Légende:
  [←]  = Bouton "Copier ce champ" (copie la valeur source → working)
  [✎]  = Champ modifié manuellement
  ⚠️   = Valeur différente de la working proposal (highlight visuel)
  ●    = Onglet source actuellement affiché
```

---

## Maquette ASCII - Onglets source (pane droit)

```
┌─ SOURCE ──────────────────────────────────────────────────────────┐
│                                                                   │
│   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐      │
│   │  FFA Scraper   │  │  Google    ●   │  │  Slack Agent   │      │
│   │  95%           │  │  70%           │  │  85%           │      │
│   └────────────────┘  └────────────────┘  └────────────────┘      │
│                       ▲ Sélectionné                               │
│                                                                   │
│   Cliquer sur un onglet pour voir cette proposition en miroir     │
│   et pouvoir copier ses valeurs vers la Working Proposal          │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘

Ordre des onglets (priorité agent) :
1. FFA Scraper (source officielle)
2. Slack Agent (données utilisateur)
3. Google Agent (web scrapé)
```

---

## Maquette ASCII - Copie d'un champ individuel

```
                    WORKING                          SOURCE (Google)
              ┌──────────────────────┐         ┌──────────────────────┐
              │  startDate           │         │  startDate           │
              │  30/03/2025 10:00    │   ←──   │  30/03/2025 09:00 [←]│
              └──────────────────────┘    │    └──────────────────────┘
                                          │
                                    Clic sur [←]

APRÈS:
              ┌──────────────────────┐         ┌──────────────────────┐
              │  startDate      ✨   │         │  startDate           │
              │  30/03/2025 09:00    │   ══    │  30/03/2025 09:00    │
              │  (copié de Google)   │         │  ✓ Identique         │
              └──────────────────────┘         └──────────────────────┘

- La valeur est copiée dans la Working Proposal
- Un feedback visuel ✨ indique la copie
- Le bouton [←] disparaît (ou devient grisé) car les valeurs sont identiques
- Le champ source affiche "✓ Identique"
```

---

## Maquette ASCII - Copie d'une course individuelle

```
                    WORKING                          SOURCE (Google)
              ┌──────────────────────────┐    ┌──────────────────────────┐
              │  COURSES                 │    │  COURSES                 │
              ├──────────────────────────┤    ├──────────────────────────┤
              │  Trail 21km  10:00  21km │    │  Trail 21km  09:00 [←ent]│ ← Copier course entière
              │  Trail 10km  10:30  10km │    │  Trail 10km  09:30 [←ent]│
              │  Marche 5km  11:00  5km  │    │  (pas de marche)         │
              │                          │    │  Ultra 42km  08:00 [+]   │ ← Ajouter cette course
              └──────────────────────────┘    └──────────────────────────┘

Actions possibles:
  [←ent] = Copier la course entière (tous les champs)
  [+]    = Ajouter cette course à la Working Proposal (course absente)

Après clic sur [+] Ultra 42km:
              ┌──────────────────────────────┐
              │  COURSES                     │
              ├──────────────────────────────┤
              │  Trail 21km  10:00  21km     │
              │  Trail 10km  10:30  10km     │
              │  Marche 5km  11:00  5km      │
              │  Ultra 42km  08:00  42km  ✨  │ ← Ajouté depuis Google
              └──────────────────────────────┘
```

---

## Maquette ASCII - Copie de toute la proposition

```
┌─ WORKING PROPOSAL ──────────────────────────────────────────────────────┐
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  ⚠️ Cette action va remplacer TOUS les champs de la working    │    │
│  │     proposal par les valeurs de "Google Search Agent"          │    │
│  │                                                                 │    │
│  │  Vous perdrez toutes les modifications manuelles.               │    │
│  │                                                                 │    │
│  │            [Annuler]    [Confirmer le remplacement]             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

- Le bouton [← Copier toute la proposition] déclenche cette confirmation
- Après confirmation, tous les champs sont remplacés par ceux de la source
- Les courses sont également remplacées
```

---

## Maquette ASCII - Highlight des différences

```
                    WORKING                          SOURCE (Google)
              ┌──────────────────────┐         ┌──────────────────────┐
              │  ÉDITION             │         │  ÉDITION             │
              ├──────────────────────┤         ├──────────────────────┤
              │  startDate           │         │  startDate    ⚠️     │
              │  30/03/2025 10:00    │   ≠     │  30/03/2025 09:00 [←]│ ← Différent (highlight)
              ├──────────────────────┤         ├──────────────────────┤
              │  year                │         │  year          ✓     │
              │  2025                │   =     │  2025                │ ← Identique (pas de [←])
              ├──────────────────────┤         ├──────────────────────┤
              │  website             │         │  website             │
              │  https://event.fr    │         │  -              💭   │ ← Absent dans source
              └──────────────────────┘         └──────────────────────┘

Légende des indicateurs (pane droit):
  ⚠️  = Valeur différente → bouton [←] actif
  ✓   = Valeur identique → pas de bouton
  💭  = Champ absent dans cette source → pas de bouton
```

---

## Flux utilisateur

### Scénario 1: Validation simple (Working Proposal OK d'emblée)

```
1. L'utilisateur arrive sur la page groupée
2. La Working Proposal est initialisée avec la proposition FFA (priorité max)
3. Le pane droit affiche FFA par défaut (premier onglet)
4. L'utilisateur vérifie les valeurs, tout est OK
5. Il clique [Valider] sur chaque bloc (ou [Valider tous les blocs])
6. Les autres propositions (Google, Slack) sont archivées silencieusement
7. Redirection vers la liste
```

### Scénario 2: Cherry-pick d'un champ depuis une source

```
1. L'utilisateur voit dans le pane gauche: startDate = 10:00 (FFA)
2. Il clique sur l'onglet "Google" dans le pane droit
3. Il voit startDate = 09:00 avec un indicateur ⚠️ (différent)
4. Il clique sur [←] à côté de startDate
5. La Working Proposal est mise à jour: startDate = 09:00 ✨
6. Le pane droit affiche maintenant ✓ (identique)
7. Il continue l'édition et valide
```

### Scénario 3: Ajout d'une course depuis une autre source

```
1. La Working Proposal (FFA) a 3 courses: Trail 21km, Trail 10km, Marche 5km
2. L'utilisateur sélectionne l'onglet "Slack" dans le pane droit
3. Slack a une 4ème course: Ultra 42km
4. Il clique sur [+] à côté de Ultra 42km
5. La course est ajoutée à la Working Proposal ✨
6. Il valide
```

### Scénario 4: Remplacement complet par une autre source

```
1. L'utilisateur réalise que les données Slack sont globalement meilleures
2. Il sélectionne l'onglet "Slack" dans le pane droit
3. Il clique sur [← Copier toute la proposition]
4. Une confirmation apparaît (perte des modifications manuelles)
5. Il confirme
6. La Working Proposal est entièrement remplacée par Slack
7. Il peut encore faire des ajustements avant validation
```

---

## Initialisation de la Working Proposal

```
Au chargement du groupe:

1. Récupérer toutes les propositions PENDING du groupe
2. Trier par priorité agent: FFA > Slack > Google
3. La Working Proposal = copie profonde de la proposition avec priorité max
4. Les autres propositions sont disponibles comme "sources" dans le pane droit
5. Le premier onglet source = proposition avec priorité max (pour voir les différences avec elle-même = aucune)
```

**Question de design** : Faut-il que le premier onglet source soit la même proposition que la Working (FFA) ou la deuxième (Slack) ?

Option A: Premier onglet = FFA (même que Working) → L'utilisateur voit "tout identique" au début
Option B: Premier onglet = Slack (deuxième priorité) → L'utilisateur voit immédiatement les différences

**Recommandation** : Option B semble plus utile. L'utilisateur veut voir les alternatives, pas confirmer que FFA = FFA.

---

## Composants React à créer/modifier

### Nouveaux composants

```
apps/dashboard/src/components/proposals/grouped/
├── TwoPaneLayout.tsx             # Layout avec deux panes verticaux
├── WorkingProposalPane.tsx       # Pane gauche (éditable)
├── SourceProposalPane.tsx        # Pane droit (lecture seule + boutons copie)
├── SourceTabs.tsx                # Onglets des sources (FFA, Slack, Google)
├── CopyFieldButton.tsx           # Bouton [←] pour copier un champ
├── CopyRaceButton.tsx            # Bouton [←] ou [+] pour copier une course
└── CopyAllButton.tsx             # Bouton [← Copier toute la proposition]
```

### Composants à réutiliser

```
Les composants de table existants peuvent être réutilisés:
- CategorizedEventChangesTable.tsx  → Pane gauche (mode édition)
- CategorizedEditionChangesTable.tsx → Pane gauche (mode édition)
- RacesChangesTable.tsx             → Pane gauche (mode édition)

Nouveaux modes "lecture seule avec bouton copie":
- SourceEventTable.tsx              → Pane droit
- SourceEditionTable.tsx            → Pane droit
- SourceRacesTable.tsx              → Pane droit
```

### Hook principal

```
apps/dashboard/src/hooks/
└── useGroupedProposalEditor.ts (nouveau ou refactor de useProposalEditor)

    État:
    - workingProposal: Proposal          // Copie éditable
    - sourceProposals: Proposal[]        // Les autres propositions (lecture seule)
    - activeSourceIndex: number          // Onglet source actif
    - userModifications: Record<string, any>  // Modifications manuelles

    Actions:
    - copyFieldFromSource(field: string)
    - copyRaceFromSource(raceId: string)
    - copyAllFromSource()
    - updateField(field: string, value: any)
    - addRace(race: Race)
    - deleteRace(raceId: string)
    - validateBlock(block: string)
    - validateAll()

    Computed:
    - getDifferences(sourceIndex: number): FieldDiff[]  // Champs différents
    - getRaceDifferences(sourceIndex: number): RaceDiff[]
```

---

## Comparaison avec l'approche actuelle

| Aspect | Avant (fusion automatique) | Après (deux panes miroir) |
|--------|----------------------------|---------------------------|
| **Complexité code** | Très élevée (8 frictions) | Modérée (logique linéaire) |
| **Traçabilité** | Perdue après fusion | Explicite (copie manuelle) |
| **UX** | Confuse (selects multiples) | Claire (voir + copier) |
| **Contrôle utilisateur** | Limité | Total |
| **Maintenabilité** | Difficile | Facile |
| **Performance** | OK | Meilleure (pas de consolidation) |

---

## Mobile / Responsive

```
Sur écran < 1024px, les deux panes passent en mode stacked:

┌─────────────────────────────────────┐
│  [Working Proposal ▼] [Sources ▼]   │  ← Toggle entre les deux vues
├─────────────────────────────────────┤
│                                     │
│  WORKING PROPOSAL                   │
│  (ou SOURCE selon toggle)           │
│                                     │
│  ...                                │
│                                     │
└─────────────────────────────────────┘

En mode "Sources", les boutons [←] copient vers la Working
et basculent automatiquement vers la vue Working pour montrer le résultat.
```

---

## Prochaines étapes

1. **Valider ce concept** ✓ (tu peux me dire si ça te convient)
2. **Créer le hook `useGroupedProposalEditor`** (nouveau, propre)
3. **Créer le layout `TwoPaneLayout`** avec les deux panes
4. **Créer les composants Source** (tables en lecture seule avec boutons copie)
5. **Intégrer dans `NewEventGroupedDetail`** (premier cas d'usage)
6. **Tester avec des propositions réelles**
7. **Migrer les autres types** (EditionUpdate, EventUpdate, RaceUpdate)
