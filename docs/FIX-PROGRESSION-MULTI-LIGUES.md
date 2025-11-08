# Fix: Algorithme de progression pour liguesPerRun > 1

**Date** : 2025-01-07  
**Problème** : Combinaisons (ligue, mois) sautées lors du scraping  
**Fichier** : `apps/agents/src/FFAScraperAgent.ts`

---

## Problème identifié

Lors du scraping avec `liguesPerRun > 1`, certaines combinaisons (ligue, mois) étaient **systématiquement sautées**.

### Symptômes

Interface de progression affichant des trous :

```
Prochain : G-E 2026-04
Réalisé :
  ARA : 2025-11
  BFC : 2025-11, 2025-12
  BRE : 2025-12, 2026-01      ❌ Manque 2025-11
  CEN : 2026-01, 2026-02
  COR : 2026-02, 2026-03
  G-E : 2026-03               ❌ Manque 2025-11, 2025-12
```

### Configuration

```json
{
  "liguesPerRun": 2,
  "monthsPerRun": 1,
  "scrapingWindowMonths": 6
}
```

### Fenêtre temporelle (6 mois)

- 2025-11 (novembre)
- 2025-12 (décembre)
- 2026-01 (janvier)
- 2026-02 (février)
- 2026-03 (mars)
- 2026-04 (avril)

---

## Cause racine

L'algorithme de calcul de la prochaine position (lignes 1160-1186) **supposait implicitement `liguesPerRun = 1`**.

### Code buggé

```typescript
// Après traitement de [ARA, BFC] × [2025-11]
const lastProcessedLigue = ligues[ligues.length - 1]  // BFC
const lastProcessedMonth = months[months.length - 1]  // 2025-11

if (lastMonthIndex + 1 < allMonths.length) {
  progress.currentMonth = allMonths[lastMonthIndex + 1]  // 2025-12 ✅
  progress.currentLigue = lastProcessedLigue             // BFC ❌
}
```

**Résultat** : Prochaine position = **BFC 2025-12** au lieu de **ARA 2025-12**

### Séquence erronée

| Run | Traite | Prochaine position |
|-----|--------|--------------------|
| 1 | **ARA** 2025-11<br>**BFC** 2025-11 | **BFC** 2025-12 ❌ |
| 2 | **BFC** 2025-12<br>**BRE** 2025-12 | **BRE** 2026-01 ❌ |
| 3 | **BRE** 2026-01<br>**CEN** 2026-01 | **CEN** 2026-02 ❌ |

**Résultat** : ARA 2025-12, BFC 2026-01, BRE 2026-02, etc. **jamais traités** ❌

---

## Solution

Lorsque plusieurs ligues sont traitées par run, **revenir à la première ligue** au mois suivant.

### Code corrigé

```typescript
// Après traitement de [ARA, BFC] × [2025-11]
const lastProcessedLigue = ligues[ligues.length - 1]  // BFC
const lastProcessedMonth = months[months.length - 1]  // 2025-11

if (lastMonthIndex + 1 < allMonths.length) {
  progress.currentMonth = allMonths[lastMonthIndex + 1]  // 2025-12 ✅
  progress.currentLigue = ligues[0]  // ARA ✅ (FIX: au lieu de lastProcessedLigue)
  context.logger.info(`⏭️  Prochaine position: ${progress.currentLigue} - ${progress.currentMonth}`, {
    liguesTraitees: ligues,
    moisTraite: lastProcessedMonth,
    prochainMois: progress.currentMonth
  })
}
```

### Séquence corrigée

| Run | Traite | Prochaine position |
|-----|--------|--------------------|
| 1 | **ARA** 2025-11<br>**BFC** 2025-11 | **ARA** 2025-12 ✅ |
| 2 | **ARA** 2025-12<br>**BFC** 2025-12 | **ARA** 2026-01 ✅ |
| 3 | **ARA** 2026-01<br>**BFC** 2026-01 | **ARA** 2026-02 ✅ |
| ... | ... | ... |
| 18 | **ARA** 2026-04<br>**BFC** 2026-04 | **BRE** 2025-11 ✅ |
| 19 | **BRE** 2025-11<br>**CEN** 2025-11 | **BRE** 2025-12 ✅ |

**Résultat** : **Toutes les combinaisons** (21 ligues × 6 mois = 126) sont traitées ✅

---

## Logique de l'algorithme

### Ordre de traitement

1. **Boucle externe** : Ligues
2. **Boucle interne** : Mois

```typescript
for (const ligue of ligues) {       // [ARA, BFC]
  for (const month of months) {     // [2025-11]
    // Scraper ligue × mois
  }
}
```

### Calcul de la prochaine position

**Si mois suivant existe** :
- `currentLigue = ligues[0]` → Revenir à la première ligue du run
- `currentMonth = mois suivant` → Passer au mois suivant

**Si tous les mois traités** :
- `currentLigue = ligue suivante` → Passer à la ligue suivante non traitée
- `currentMonth = premier mois` → Recommencer au début de la fenêtre

**Si toutes les ligues complétées** :
- Entrer en **cooldown** (configurable, défaut: 30 jours)
- Puis recommencer au début : `ARA × 2025-11`

---

## Impact

### ✅ Bénéfices

- **Couverture complète** : Toutes les combinaisons (ligue, mois) sont scrapées
- **Progression cohérente** : L'interface affiche tous les mois complétés pour chaque ligue
- **Rétrocompatible** : Fonctionne aussi avec `liguesPerRun = 1`
- **Logs améliorés** : Ajout de métadonnées pour traçabilité

### ⚠️ Limitations

Les combinaisons **déjà sautées** avant le fix ne seront **pas rattrapées automatiquement** car elles sortent de la fenêtre temporelle au fil du temps.

**Exemple** : Si aujourd'hui on est le 7 janvier 2026 :
- Fenêtre : 2026-01 → 2026-06
- BRE 2025-11, G-E 2025-11/12 sont **hors fenêtre** → non scrapés

### 🔧 Rattrapage manuel (si nécessaire)

**Option 1 : Augmenter temporairement la fenêtre**

```json
{
  "scrapingWindowMonths": 12  // Au lieu de 6
}
```

→ Permet de rescraper les mois passés dans un prochain cycle

**Option 2 : Modifier manuellement la progression**

```typescript
// Dans Prisma Studio ou via script
await prisma.agentState.update({
  where: { agentId: 'FFA_SCRAPER', key: 'progress' },
  data: {
    value: {
      ...progress,
      completedMonths: {
        ...progress.completedMonths,
        'BRE': ['2025-12', '2026-01'],  // Retirer 2025-11 pour forcer rescrape
        'G-E': ['2026-03']               // Idem
      }
    }
  }
})
```

---

## Tests

### Test 1 : liguesPerRun = 2, monthsPerRun = 1

**Progression attendue** :

```
Run 1:  ARA 2025-11, BFC 2025-11  → Prochain: ARA 2025-12
Run 2:  ARA 2025-12, BFC 2025-12  → Prochain: ARA 2026-01
Run 3:  ARA 2026-01, BFC 2026-01  → Prochain: ARA 2026-02
...
Run 6:  ARA 2026-04, BFC 2026-04  → Prochain: BRE 2025-11
Run 7:  BRE 2025-11, CEN 2025-11  → Prochain: BRE 2025-12
```

### Test 2 : liguesPerRun = 1, monthsPerRun = 2

**Progression attendue** :

```
Run 1:  ARA 2025-11, ARA 2025-12  → Prochain: ARA 2026-01
Run 2:  ARA 2026-01, ARA 2026-02  → Prochain: ARA 2026-03
Run 3:  ARA 2026-03, ARA 2026-04  → Prochain: BFC 2025-11
Run 4:  BFC 2025-11, BFC 2025-12  → Prochain: BFC 2026-01
```

### Test 3 : liguesPerRun = 3, monthsPerRun = 2

**Progression attendue** :

```
Run 1:  ARA 2025-11, ARA 2025-12, BFC 2025-11, BFC 2025-12, BRE 2025-11, BRE 2025-12
        → Prochain: ARA 2026-01

Run 2:  ARA 2026-01, ARA 2026-02, BFC 2026-01, BFC 2026-02, BRE 2026-01, BRE 2026-02
        → Prochain: ARA 2026-03
```

---

## Logs ajoutés

```
⏭️  Prochaine position: ARA - 2025-12
{
  liguesTraitees: ['ARA', 'BFC'],
  moisTraite: '2025-11',
  prochainMois: '2025-12'
}
```

**Permet de vérifier** :
- Quelles ligues ont été traitées dans ce run
- Quel mois a été traité
- Quel est le prochain mois

---

## Références

- **Fichier** : `apps/agents/src/FFAScraperAgent.ts` (lignes 1160-1196)
- **Issue** : Combinaisons (ligue, mois) sautées dans la progression
- **Fix date** : 2025-01-07
- **Related** : `docs/FIX-DEDUPLICATION-PROGRESSION.md` (sauvegarde progressive)
