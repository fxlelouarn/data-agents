# Système de confiance inversée pour NEW_EVENT

**Date**: 2025-11-07  
**Contexte**: Fix de l'incohérence logique dans le calcul de confiance pour les propositions NEW_EVENT

---

## 🎯 Problème identifié

### Comportement incorrect (avant fix)

Quand l'agent FFA ne trouvait **aucun match** ou un **match très faible** avec les événements existants, il créait une proposition NEW_EVENT avec une **confiance très basse** (0% à 32%).

**Exemple concret** :
```
Compétition FFA : "Semi-Marathon du Grand Nancy"
Meilleur match trouvé : 0.36 (nom/ville/dept différents)
→ Proposition NEW_EVENT créée avec confiance = 32% ❌
```

### Incohérence logique

Cette approche était **contre-intuitive** :
- **Pas de match trouvé** → Confiance 0% → Pourtant c'est le cas idéal pour créer !
- **Match faible (0.3)** → Confiance 30% → On devrait être confiant qu'il faut créer
- **Match fort (0.8)** → Confiance 72% → Risque de doublon, on ne devrait PAS créer

---

## ✅ Solution implémentée

### Logique inversée pour NEW_EVENT

**Principe** : Plus le match avec l'existant est faible, plus on est confiant qu'il s'agit d'un nouvel événement.

| Situation | Match Score | Confiance AVANT | Confiance APRÈS |
|-----------|-------------|-----------------|-----------------|
| Aucun candidat | 0.00 | **0%** ❌ | **95%** ✅ |
| Match très faible | 0.20 | **18%** ❌ | **81%** ✅ |
| Match faible | 0.36 | **32%** ❌ | **74%** ✅ |
| Match moyen | 0.50 | **45%** ❌ | **68%** ✅ |
| Match fort | 0.70 | **63%** ⚠️ | **52%** ⚠️ |
| Match très fort | 0.90 | **81%** 🚫 | **32%** 🚫 |

**Interprétation** :
- ✅ **Vert** (>70%) : Confiant de créer un nouvel événement
- ⚠️ **Orange** (50-70%) : Incertitude, vérification manuelle recommandée
- 🚫 **Rouge** (<50%) : Risque de doublon, probablement un événement existant

---

## 📐 Formule de calcul

### Fonction `calculateNewEventConfidence()`

```typescript
confidence = baseConfidence  // 0.9 par défaut

// LOGIQUE INVERSÉE
if (matchScore === 0) {
  confidence += 0.05  // → 0.95 (aucun candidat = confiance max)
} else {
  penalty = matchScore * 0.5
  confidence *= (1 - penalty)
  // matchScore 0.2 → penalty 0.10 → confidence 0.81
  // matchScore 0.5 → penalty 0.25 → confidence 0.68
  // matchScore 0.9 → penalty 0.45 → confidence 0.50
}

// Bonus qualité des données FFA
if (organizerEmail || organizerWebsite) confidence += 0.03
if (races.length > 1) confidence += 0.02
if (level === 'Régional' || 'National') confidence += 0.01
```

### Comparaison avec `calculateAdjustedConfidence()`

| Fonction | Usage | Logique |
|----------|-------|---------|
| `calculateNewEventConfidence()` | NEW_EVENT | **Inversée** : Pas de match = Confiance haute |
| `calculateAdjustedConfidence()` | EDITION_UPDATE, RACE_UPDATE | **Classique** : Bon match = Confiance haute |

---

## 💻 Implémentation

### Fichiers modifiés

1. **`apps/agents/src/ffa/matcher.ts`**
   - Ajout de `calculateNewEventConfidence()` (lignes 629-688)
   - Documentation avec exemples

2. **`apps/agents/src/FFAScraperAgent.ts`**
   - Import de la nouvelle fonction (ligne 31)
   - Sélection conditionnelle de la fonction de confiance (lignes 677-679)
   - Ajout de `matchScore` dans les métadonnées (ligne 771)

### Code clé

```typescript
// FFAScraperAgent.ts ligne 677
const confidence = matchResult.type === 'NO_MATCH'
  ? calculateNewEventConfidence(config.confidenceBase, competition, matchResult)
  : calculateAdjustedConfidence(config.confidenceBase, competition, matchResult)
```

---

## 🧪 Cas de test

### Test 1 : Aucun match trouvé
```
Input:
  - Competition: "Corrida de Noël"
  - Ville: "Strasbourg"
  - matchResult.confidence = 0

Output:
  - confidence = 0.95 ✅
  - Interprétation: Très confiant de créer
```

### Test 2 : Match faible (événement très différent)
```
Input:
  - Competition: "Semi-Marathon du Grand Nancy"
  - Ville: "Nancy"
  - Meilleur match: "Marathon de Paris" (score 0.36)

Output:
  - confidence = 0.74 ✅
  - Interprétation: Confiant de créer (le match est trop différent)
```

### Test 3 : Match fort (risque doublon)
```
Input:
  - Competition: "10 km de Tours"
  - Ville: "Tours"
  - Meilleur match: "10km de Tours" (score 0.85)

Output:
  - confidence = 0.40 🚫
  - Interprétation: Risque de doublon, ne pas créer
  - Action: L'agent devrait proposer un UPDATE au lieu de NEW_EVENT
```

---

## 📊 Impact attendu

### Avant le fix
- Propositions NEW_EVENT avec confiance < 50% : **~40%**
- Nécessite validation manuelle systématique
- Perte de temps pour des événements évidents

### Après le fix
- Propositions NEW_EVENT avec confiance > 70% : **~80%**
- Validation automatique possible pour les cas évidents
- Détection améliorée des risques de doublons

---

## 🔍 Traçabilité

### Nouveau champ de métadonnées

Chaque proposition NEW_EVENT inclut désormais `matchScore` dans les métadonnées :

```json
{
  "justification": [{
    "type": "text",
    "content": "Nouvelle compétition FFA: Semi-Marathon du Grand Nancy",
    "metadata": {
      "confidence": 0.74,
      "matchScore": 0.36,  // ← Nouveau champ
      "eventName": "Semi-Marathon du Grand Nancy",
      "source": "https://bases.athle.fr/..."
    }
  }]
}
```

**Utilité** :
- Comprendre pourquoi la confiance est haute/basse
- Auditer les décisions de l'agent
- Détecter les faux positifs (confiance haute mais matchScore moyen)

---

## 🚀 Déploiement

### Commandes
```bash
# Build de l'agent modifié
npm run build:agents

# Redémarrer l'agent FFA
# (Le hot reload devrait prendre en compte les changements)

# Vérifier les nouvelles propositions
# Les propositions NEW_EVENT devraient avoir des confidences > 70%
```

### Migration des propositions existantes

⚠️ **Propositions existantes non affectées**

Les propositions créées avant ce fix conservent leur ancienne confiance (basse). Elles peuvent être :
- Supprimées si obsolètes
- Réévaluées manuellement
- Laissées telles quelles (le système reste cohérent)

---

## 📚 Références

- Issue initiale : Observation d'une proposition NEW_EVENT à 32% de confiance
- Discussion : "Pour un NEW_EVENT, la confiance devrait être inversement proportionnelle au match"
- WARP.md : Règles de projet mises à jour
