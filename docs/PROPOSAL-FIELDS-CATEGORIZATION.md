# Catégorisation des Champs de Propositions

## Problème Actuel

Les champs proposés pour un `EditionUpdate` ou `NewEvent` sont affichés en vrac dans les composants `GroupedProposalDetail` et `ProposalDetail`, rendant difficile :
- La visualisation rapide des modifications par type d'entité
- La compréhension de l'impact global des changements
- La validation efficace des propositions

## Structure Proposée

### 1. **Champs Event** (Informations sur l'événement)
Informations générales et permanentes de l'événement, qui ne changent généralement pas d'une édition à l'autre.

**Catégorie : Informations de base**
- `name` - Nom de l'événement
- `city` - Ville
- `country` - Pays
- `countrySubdivisionNameLevel1` - Région
- `countrySubdivisionNameLevel2` - Département
- `countrySubdivisionDisplayCodeLevel1` - Code région
- `countrySubdivisionDisplayCodeLevel2` - Code département
- `fullAddress` - Adresse complète
- `latitude` / `longitude` - Coordonnées GPS

**Catégorie : Médias et visibilité**
- `websiteUrl` - Site web
- `facebookUrl` - Facebook
- `instagramUrl` - Instagram
- `twitterUrl` - Twitter
- `coverImage` - Image de couverture
- `images` - Images additionnelles
- `isPrivate` - Événement privé
- `isFeatured` - Mis en avant
- `isRecommended` - Recommandé

**Catégorie : Métadonnées**
- `dataSource` - Source des données
- `status` - Statut de l'événement (LIVE, DRAFT, etc.)

### 2. **Champs Edition** (Informations spécifiques à l'édition)
Informations qui changent d'une année à l'autre.

**Catégorie : Dates de l'édition**
- `year` - Année
- `startDate` - Date de début
- `endDate` - Date de fin
- `timeZone` - Fuseau horaire

**Catégorie : Inscriptions**
- `registrationOpeningDate` - Ouverture inscriptions
- `registrationClosingDate` - Fermeture inscriptions
- `registrantsNumber` - Nombre d'inscrits

**Catégorie : Statut et organisation**
- `calendarStatus` - Statut calendrier (CONFIRMED, CANCELED, TO_BE_CONFIRMED)
- `clientStatus` - Statut client (INTERNAL_SALES_FUNNEL, EXTERNAL_SALES_FUNNEL, NEW_SALES_FUNNEL)
- `customerType` - Type de client (BASIC, PREMIUM, ESSENTIAL, etc.)

**Catégorie : Retrait des dossards**
- `bibWithdrawalFullAddress` - Adresse retrait dossards
- `bibWithdrawalStreet` - Rue
- `bibWithdrawalPostalCode` - Code postal
- `bibWithdrawalCity` - Ville
- `bibWithdrawalCountry` - Pays
- `bibWithdrawalLongitude` / `bibWithdrawalLatitude` - Coordonnées
- `bibWithdrawalInfo` - Informations complémentaires

**Catégorie : Commerce**
- `currency` - Devise
- `hasInsurance` - Assurance disponible
- `whatIsIncluded` - Ce qui est inclus
- `medusaVersion` - Version Medusa (V1, V2)
- `organizerStripeConnectedAccountId` - Compte Stripe organisateur

**Catégorie : Partenariats et affiliations**
- `federationId` - ID fédération
- `generalRulesUrl` - Règlement général

### 3. **Champs Race** (Informations sur les courses)
Détails spécifiques à chaque course de l'édition.

**Catégorie : Informations de base**
- `name` - Nom de la course
- `startDate` - Date et heure de départ
- `timeZone` - Fuseau horaire (hérité de l'édition)

**Catégorie : Distances**
- `swimDistance` - Distance natation (km)
- `bikeDistance` - Distance vélo (km)
- `runDistance` - Distance course à pied (km)
- `runDistance2` - Distance course 2 (km)
- `walkDistance` - Distance marche (km)
- `swimRunDistance` - Distance swim&run (km)
- `bikeRunDistance` - Distance bike&run (km)

**Catégorie : Dénivelés**
- `runPositiveElevation` / `runNegativeElevation` - Dénivelé course (m)
- `bikePositiveElevation` / `bikeNegativeElevation` - Dénivelé vélo (m)
- `walkPositiveElevation` / `walkNegativeElevation` - Dénivelé marche (m)

**Catégorie : Classification**
- `distance` - Catégorie distance (MARATHON, KM10, TRAIL, etc.)
- `type` - Type de course (ROAD_RACE, TRAIL, TRIATHLON, etc.)
- `distanceCategory` - Catégorie (XXS, XS, S, M, L, XL, XXL)
- `categoryLevel1` - Catégorie niveau 1
- `categoryLevel2` - Catégorie niveau 2

**Catégorie : Tarification**
- `price` - Prix
- `priceType` - Type de prix (PER_TEAM, PER_PERSON)
- `paymentCollectionType` - Type de paiement (SINGLE, MULTIPLE)

**Catégorie : Équipes**
- `maxTeamSize` - Taille max équipe
- `minTeamSize` - Taille min équipe

**Catégorie : Licences et justificatifs**
- `licenseNumberType` - Type de licence (FFA, FFTRI, FFS, NONE)
- `adultJustificativeOptions` - Justificatifs adultes
- `minorJustificativeOptions` - Justificatifs mineurs

**Catégorie : Formulaires et inscriptions**
- `askAttendeeBirthDate` - Demander date de naissance
- `askAttendeeGender` - Demander genre
- `askAttendeeNationality` - Demander nationalité
- `askAttendeePhoneNumber` - Demander téléphone
- `askAttendeePostalAddress` - Demander adresse postale
- `showClubOrAssoInput` - Afficher club/association
- `showPublicationConsentCheckbox` - Consentement publication

**Catégorie : Stock et disponibilité**
- `isActive` - Course active
- `isArchived` - Course archivée
- `isWaitingList` - Liste d'attente
- `stockDisplayThreshold` - Seuil affichage stock
- `stockDisplayThresholdValue` - Valeur seuil
- `resaleEnabled` - Revente autorisée

**Catégorie : Intégrations externes**
- `externalFunnelURL` - URL tunnel externe
- `medusaProductId` - ID produit Medusa
- `raceVariantStoreId` - ID variant boutique

### 4. **Champs EditionPartner** (Organisateur)
Informations sur l'organisateur de l'édition (actuellement non implémenté dans les composants).

**À implémenter si nécessaire** :
- Nom de l'organisateur
- Contact
- Type de partenariat
- etc.

## Implémentation Recommandée

### Option 1 : Accordion par Catégorie (Recommandé)

```tsx
<Accordion>
  <AccordionSummary>
    <Typography>📍 Informations de base</Typography>
    <Chip label="3 changements" size="small" />
  </AccordionSummary>
  <AccordionDetails>
    <ChangesTable fields={['name', 'city', 'country', ...]} />
  </AccordionDetails>
</Accordion>

<Accordion>
  <AccordionSummary>
    <Typography>📅 Dates de l'édition</Typography>
    <Chip label="2 changements" size="small" />
  </AccordionSummary>
  <AccordionDetails>
    <ChangesTable fields={['startDate', 'endDate', 'timeZone']} />
  </AccordionDetails>
</Accordion>
```

### Option 2 : Onglets par Entité

```tsx
<Tabs>
  <Tab label="Événement (5)" />
  <Tab label="Édition (8)" />
  <Tab label="Courses (12)" />
  <Tab label="Organisateur (2)" />
</Tabs>

<TabPanel value={0}>
  <EventChangesTable ... />
</TabPanel>
```

### Option 3 : Sections Collapsibles

```tsx
<Box>
  <SectionHeader 
    title="Informations de base" 
    icon={<InfoIcon />}
    changeCount={3}
    defaultExpanded={true}
  />
  <Collapse in={expanded}>
    <ChangesTable fields={...} />
  </Collapse>
</Box>
```

## Structure de Données pour la Catégorisation

```typescript
interface FieldCategory {
  id: string
  label: string
  icon?: ReactNode
  description?: string
  fields: string[]
  priority?: number // Pour l'ordre d'affichage
  entityType: 'EVENT' | 'EDITION' | 'RACE' | 'ORGANIZER'
}

const FIELD_CATEGORIES: FieldCategory[] = [
  // Event
  {
    id: 'event-basic',
    label: 'Informations de base',
    icon: <InfoIcon />,
    entityType: 'EVENT',
    fields: ['name', 'city', 'country', 'countrySubdivisionNameLevel1', ...],
    priority: 1
  },
  {
    id: 'event-media',
    label: 'Médias et visibilité',
    icon: <LanguageIcon />,
    entityType: 'EVENT',
    fields: ['websiteUrl', 'facebookUrl', 'instagramUrl', ...],
    priority: 2
  },
  
  // Edition
  {
    id: 'edition-dates',
    label: 'Dates de l\'édition',
    icon: <EventIcon />,
    entityType: 'EDITION',
    fields: ['year', 'startDate', 'endDate', 'timeZone'],
    priority: 1
  },
  {
    id: 'edition-registration',
    label: 'Inscriptions',
    icon: <PersonAddIcon />,
    entityType: 'EDITION',
    fields: ['registrationOpeningDate', 'registrationClosingDate', 'registrantsNumber'],
    priority: 2
  },
  
  // Race
  {
    id: 'race-basic',
    label: 'Informations de base',
    icon: <InfoIcon />,
    entityType: 'RACE',
    fields: ['name', 'startDate', 'timeZone'],
    priority: 1
  },
  {
    id: 'race-distances',
    label: 'Distances',
    icon: <StraightenIcon />,
    entityType: 'RACE',
    fields: ['swimDistance', 'bikeDistance', 'runDistance', ...],
    priority: 2
  },
  // ... etc
]
```

## Bénéfices

1. **Clarté visuelle** : Les changements sont organisés logiquement
2. **Navigation rapide** : Accordions/onglets permettent de se focaliser sur une catégorie
3. **Validation efficace** : Possibilité de valider par catégorie
4. **Scalabilité** : Facile d'ajouter de nouvelles catégories
5. **Contexte** : L'utilisateur sait immédiatement quelle entité est impactée

## Migration Progressive

1. **Phase 1** : Ajouter la catégorisation visuelle dans `EditionChangesTable` et `EventChangesTable`
2. **Phase 2** : Refactoriser avec des accordions par catégorie
3. **Phase 3** : Ajouter des actions par catégorie (approuver tous les champs de la catégorie)
4. **Phase 4** : Statistiques par catégorie dans le résumé de proposition

## Exemple d'utilisation dans le composant

```tsx
// GroupedProposalDetail.tsx ou ProposalDetail.tsx
const categorizedChanges = useMemo(() => {
  return categorizeChanges(consolidatedChanges, FIELD_CATEGORIES)
}, [consolidatedChanges])

return (
  <Box>
    {categorizedChanges.event && (
      <Card sx={{ mb: 2 }}>
        <CardHeader title="Modifications Event" />
        <CardContent>
          {categorizedChanges.event.map(category => (
            <CategorySection
              key={category.id}
              category={category}
              changes={category.changes}
              onApprove={handleApprove}
            />
          ))}
        </CardContent>
      </Card>
    )}
    
    {categorizedChanges.edition && (
      <Card sx={{ mb: 2 }}>
        <CardHeader title="Modifications Edition" />
        <CardContent>
          {categorizedChanges.edition.map(category => (
            <CategorySection
              key={category.id}
              category={category}
              changes={category.changes}
              onApprove={handleApprove}
            />
          ))}
        </CardContent>
      </Card>
    )}
    
    {/* Races déjà dans RaceChangesSection */}
  </Box>
)
```
