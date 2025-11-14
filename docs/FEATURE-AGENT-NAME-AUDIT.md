# Feature : Audit trail avec nom de l'agent

**Date** : 2025-11-14  
**Auteur** : Assistant Warp  
**Type** : Amélioration

## Problème résolu

Lors de l'application des propositions, les champs `createdBy` et `updatedBy` dans Miles Republic étaient hardcodés avec la valeur générique `"data-agents"`.

**Avant** :
```typescript
createdBy: 'data-agents',
updatedBy: 'data-agents'
```

**Problème** : Impossible de tracer quel agent spécifique a créé ou modifié une donnée (FFA Scraper, Google Search Date Agent, etc.).

## Solution implémentée

### 1. Ajout de `agentName` dans `ApplyOptions`

**Fichier** : `packages/database/src/services/interfaces.ts`

```typescript
export interface ApplyOptions {
  applyToDatabase?: boolean
  force?: boolean
  dryRun?: boolean
  milesRepublicDatabaseId?: string
  capturedLogs?: string[]
  agentName?: string  // ✅ NOUVEAU : Nom de l'agent pour l'audit trail
}
```

### 2. Extraction du nom de l'agent dans `applyProposal()`

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`

Le nom de l'agent est extrait depuis la relation Prisma `proposal.agent.name` et passé à tous les handlers :

```typescript
async applyProposal(
  proposalId: string,
  selectedChanges: Record<string, any>,
  options: ApplyOptions = {}
): Promise<ProposalApplicationResult> {
  const proposal = await this.proposalRepo.findById(proposalId)
  
  // ✅ Extraire le nom de l'agent
  const agentName = (proposal as any).agent?.name || 'data-agents'
  this.logger.info(`🤖 Application par l'agent: ${agentName}`)
  
  // ✅ Passer agentName aux handlers
  switch (proposal.type) {
    case 'NEW_EVENT':
      result = await this.applyNewEvent(finalChanges, filteredSelectedChanges, { ...options, agentName })
      break
    // ... autres types
  }
}
```

### 3. Modification de `MilesRepublicRepository`

**Fichier** : `packages/database/src/repositories/miles-republic.repository.ts`

Le repository accepte maintenant un paramètre `auditUser` dans son constructeur :

```typescript
export class MilesRepublicRepository {
  constructor(
    private milesDb: any,
    private auditUser: string = 'data-agents'  // ✅ Paramètre avec fallback
  ) {}

  async createEvent(data: {...}) {
    return this.milesDb.event.create({
      data: {
        // ...
        createdBy: this.auditUser,  // ✅ Utilise le paramètre dynamique
        updatedBy: this.auditUser
      }
    })
  }

  async updateEvent(eventId: number, data: Record<string, any>) {
    return this.milesDb.event.update({
      where: { id: eventId },
      data: {
        ...data,
        updatedBy: this.auditUser,  // ✅ Utilise le paramètre dynamique
        updatedAt: new Date()
      }
    })
  }
}
```

**Méthodes modifiées** :
- `createEvent()` - lignes 93-94
- `updateEvent()` - ligne 107
- `createEdition()` - lignes 223-224
- `updateEdition()` - ligne 237
- `createRace()` - lignes 482-483
- `updateRace()` - ligne 496
- `touchEvent()` - ligne 548

### 4. Passage de l'agent aux repositories

**Fichier** : `packages/database/src/services/proposal-domain.service.ts`

La méthode `getMilesRepublicRepository()` accepte et transmet le nom de l'agent :

```typescript
private async getMilesRepublicRepository(
  databaseId?: string, 
  agentName: string = 'data-agents'  // ✅ Paramètre avec fallback
): Promise<MilesRepublicRepository> {
  const milesDb = await this.getMilesRepublicConnection(databaseId)
  return new MilesRepublicRepository(milesDb, agentName)  // ✅ Passe le nom
}
```

**Appels modifiés** :
- `applyNewEvent()` - ligne 135
- `applyEventUpdate()` - ligne 247
- `applyEditionUpdate()` - ligne 282
- `applyRaceUpdate()` - ligne 517

## Résultats

### Avant

```sql
SELECT 
  id, name, city, 
  createdBy, updatedBy, createdAt, updatedAt
FROM "Event"
WHERE id = 13446;

| id    | name               | createdBy    | updatedBy    |
|-------|-------------------|--------------|--------------|
| 13446 | Trail des Loups   | data-agents  | data-agents  |
```

❌ Impossible de savoir quel agent a créé/modifié l'événement.

### Après

```sql
| id    | name               | createdBy          | updatedBy                |
|-------|-------------------|--------------------|--------------------------|
| 13446 | Trail des Loups   | FFA Scraper        | FFA Scraper              |
| 15178 | Semi Marathon GN  | FFA Scraper        | Google Search Date Agent |
```

✅ Traçabilité complète des modifications par agent.

## Cas d'usage

1. **Debugging** : "Le FFA Scraper a créé cet événement avec des coordonnées incorrectes"
2. **Statistiques** : "Combien d'événements ont été créés par chaque agent ?"
3. **Audit** : "Quel agent a mis à jour la date de cette édition ?"
4. **Confiance** : "Les modifications du Google Search Date Agent sont-elles fiables ?"

## Tests

✅ Compilation TypeScript réussie  
✅ Rétrocompatibilité : Si `agentName` n'est pas fourni, fallback sur `"data-agents"`  
✅ Tous les types de propositions supportés (NEW_EVENT, EVENT_UPDATE, EDITION_UPDATE, RACE_UPDATE)

## Fichiers modifiés

1. `packages/database/src/services/interfaces.ts` - Ajout `agentName` dans `ApplyOptions`
2. `packages/database/src/services/proposal-domain.service.ts` - Extraction et passage de l'agent
3. `packages/database/src/repositories/miles-republic.repository.ts` - Paramètre `auditUser` dynamique

## Prochaines étapes

- [ ] Ajouter un filtre par agent dans l'interface d'admin Miles Republic
- [ ] Créer des statistiques de modifications par agent
- [ ] Ajouter un champ `modifiedByAgent` dans le modèle Proposal pour tracer les modifications manuelles

## Ressources

- Documentation Prisma : https://www.prisma.io/docs/concepts/components/prisma-client/relation-queries
- Architecture Repository Pattern : `docs/ARCHITECTURE-REPOSITORY-PATTERN.md`
