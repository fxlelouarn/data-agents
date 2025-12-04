# Fix : Updates en Double lors de la Validation par Blocs

**Date** : 28 Novembre 2025  
**Problème** : La validation de propositions groupées crée plusieurs updates identiques

---

## 🎯 Problème Identifié

**Symptôme** : Lorsqu'un utilisateur valide un bloc (ex: "Courses") dans une proposition groupée, plusieurs `ProposalApplication` identiques peuvent être créées au lieu d'une seule.

**Cause racine** : L'endpoint `POST /api/proposals/validate-block-group` ne vérifie **PAS** si des applications PENDING identiques existent déjà avant d'en créer une nouvelle.

### Comparaison avec les autres endpoints

| Endpoint | Logique de déduplication | Résultat |
|----------|-------------------------|----------|
| `PUT /api/proposals/:id` | ✅ Vérifie les apps PENDING identiques | Pas de doublons |
| `POST /api/proposals/bulk-approve` | ✅ Vérifie les apps PENDING identiques | Pas de doublons |
| `POST /api/proposals/validate-block-group` | ❌ **Aucune vérification** | ⚠️ DOUBLONS POSSIBLES |

---

## 📝 Solution

Ajouter la même logique de déduplication dans `validate-block-group` que dans les autres endpoints.

### Fichier à modifier

**apps/api/src/routes/proposals.ts** (lignes ~1073-1114)

### Code actuel (bugué)

```typescript
if (allBlocksValidated) {
  // Vérifier si application existe déjà
  const existingApp = await db.prisma.proposalApplication.findFirst({
    where: {
      proposalId: proposalIds[0]
    } as any
  })

  if (!existingApp) {
    // ❌ PAS DE VÉRIFICATION DES DOUBLONS IDENTIQUES
    // Crée directement la nouvelle application
    const applicationId = `cmapp${Date.now()}${Math.random().toString(36).substr(2, 9)}`
    await db.prisma.$executeRaw`
      INSERT INTO "proposal_applications" (...)
      VALUES (...)
    `
  }
}
```

### Code corrigé (avec déduplication)

```typescript
if (allBlocksValidated) {
  // Vérifier si application existe déjà pour ce groupe
  const existingApp = await db.prisma.proposalApplication.findFirst({
    where: {
      proposalId: proposalIds[0]
    } as any
  })

  if (!existingApp) {
    // ✅ NOUVEAU : Vérifier si une application PENDING avec changements identiques existe
    const firstProposal = proposals[0]
    const proposalChanges = JSON.stringify(firstProposal.changes)
    const allPendingApplications = await db.prisma.proposalApplication.findMany({
      where: { status: 'PENDING' },
      include: { proposal: true }
    })
    
    const duplicateApp = allPendingApplications.find(app => {
      // Vérifier type et cible (event/edition/race)
      if (app.proposal.type !== firstProposal.type) return false
      if (app.proposal.eventId !== firstProposal.eventId) return false
      if (app.proposal.editionId !== firstProposal.editionId) return false
      if (app.proposal.raceId !== firstProposal.raceId) return false
      
      // Vérifier si changements identiques
      const appChanges = JSON.stringify(app.proposal.changes)
      return appChanges === proposalChanges
    })
    
    if (duplicateApp) {
      // ✅ Doublon détecté - ne pas créer de nouvelle application
      await db.createLog({
        agentId: firstProposal.agentId,
        level: 'INFO',
        message: `Grouped proposals [${proposalIds.join(', ')}] approved - Identical update already pending (${duplicateApp.id})`,
        data: { 
          proposalIds,
          existingApplicationId: duplicateApp.id,
          reason: 'duplicate_changes'
        }
      })
      
      console.log('⚠️ Doublon détecté - Application existante:', duplicateApp.id)
    } else {
      // ✅ Pas de doublon - créer la nouvelle application
      const applicationId = `cmapp${Date.now()}${Math.random().toString(36).substr(2, 9)}`
      await db.prisma.$executeRaw`
        INSERT INTO "proposal_applications" (
          "id", "proposalId", "proposalIds", "status", "createdAt", "updatedAt", "logs"
        ) VALUES (
          ${applicationId},
          ${proposalIds[0]},
          ${proposalIds}::text[],
          'PENDING',
          NOW(),
          NOW(),
          ARRAY[]::text[]
        )
      `
      
      await db.createLog({
        agentId: firstProposal.agentId,
        level: 'INFO',
        message: `Grouped proposals [${proposalIds.join(', ')}] approved - Single application created`,
        data: { 
          proposalIds,
          applicationId,
          block,
          allBlocksValidated: true
        }
      })

      console.log('✅ Application groupée créée:', applicationId)
    }
  } else {
    // Application existe déjà pour ce groupe
    await db.createLog({
      agentId: firstProposal.agentId,
      level: 'INFO',
      message: `Grouped proposals [${proposalIds.join(', ')}] approved - Application already exists`,
      data: { 
        proposalIds,
        existingApplicationId: existingApp.id
      }
    })
    
    console.log('ℹ️ Application déjà existante:', existingApp.id)
  }
}
```

---

## ✅ Tests de Validation

### Scénario 1 : Validation de plusieurs blocs d'une même proposition groupée

```
1. Ouvrir une proposition groupée (ex: 6483-45137)
2. Valider le bloc "Edition"
   ✅ Aucune application créée (blocs incomplets)
3. Valider le bloc "Organizer"
   ✅ Aucune application créée (blocs incomplets)
4. Valider le bloc "Courses"
   ✅ 1 application créée (tous blocs validés)
5. Vérifier dans /updates
   ✅ 1 seule ligne apparaît
```

### Scénario 2 : Validation de 2 groupes avec changements identiques

```
1. Avoir 2 propositions groupées différentes mais avec les mêmes changements
   - Groupe A : Propositions [id1, id2, id3]
   - Groupe B : Propositions [id4, id5, id6]
   - Les 2 groupes proposent : startDate = 2025-06-01
2. Valider complètement le groupe A
   ✅ 1 application créée
3. Valider complètement le groupe B
   ✅ Aucune nouvelle application (doublon détecté)
   ✅ Log : "Identical update already pending"
4. Vérifier dans /updates
   ✅ 1 seule ligne apparaît
```

### Scénario 3 : Cliquer plusieurs fois sur "Tout valider (blocs)"

```
1. Ouvrir une proposition groupée
2. Cliquer sur "Tout valider (blocs)"
3. Attendre le rechargement
4. Re-cliquer sur "Tout valider (blocs)" (si bouton toujours visible)
   ✅ Aucune nouvelle application (existingApp détecté)
5. Vérifier dans /updates
   ✅ 1 seule ligne apparaît
```

---

## 📊 Résultat Attendu

### Avant

```
Groupe A (3 propositions) : startDate = 2025-06-01
→ Validation → 1 application créée

Groupe B (3 propositions) : startDate = 2025-06-01
→ Validation → 1 application créée (DOUBLON ❌)

Page /updates : 2 lignes identiques ❌
```

### Après

```
Groupe A (3 propositions) : startDate = 2025-06-01
→ Validation → 1 application créée

Groupe B (3 propositions) : startDate = 2025-06-01
→ Validation → Doublon détecté, aucune application créée ✅

Page /updates : 1 seule ligne ✅
```

---

## 🔍 Vérification en Base de Données

Pour vérifier qu'il n'y a pas de doublons existants :

```sql
-- Chercher les applications PENDING avec changements identiques
SELECT 
  pa.id as application_id,
  p.id as proposal_id,
  p."editionId",
  p.changes,
  pa.status,
  pa."createdAt"
FROM proposal_applications pa
JOIN proposals p ON pa."proposalId" = p.id
WHERE pa.status = 'PENDING'
ORDER BY p."editionId", pa."createdAt" DESC;
```

---

## 🚨 Impact

**Risque** : Aucun (ajout de logique de sécurité uniquement)

**Performances** : Négligeable
- 1 requête supplémentaire pour récupérer les applications PENDING
- Comparaison JSON en mémoire
- Exécuté uniquement quand **tous les blocs validés** (rare)

**Rétrocompatibilité** : ✅ Totale
- Les propositions existantes continuent de fonctionner
- Les applications déjà créées ne sont pas modifiées

---

## 📚 Ressources

- **Document précédent** : `DUPLICATE_UPDATES_FIX.md` (fix pour `PUT` et `bulk-approve`)
- **Endpoint affecté** : `POST /api/proposals/validate-block-group` (ligne 977)
- **Tests** : À ajouter dans `apps/api/src/__tests__/proposals.test.ts`
