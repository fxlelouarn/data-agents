# Data Agents Dashboard

Interface web pour la gestion et supervision des agents d'extraction de données sportives.

## 🚀 Fonctionnalités

### Supervision des Agents
- **Liste des agents** avec filtrage par type et statut
- **Contrôle individuel** : activation/désactivation, exécution manuelle
- **Vue détaillée** : logs d'activité, historique des exécutions
- **Recherche** par nom ou description

### Gestion des Propositions
- **Table des propositions** par événement/édition
- **Filtrage par statut** (En attente, Approuvé, Rejeté, Archivé)
- **Actions en masse** : approbation/rejet de plusieurs propositions
- **Interface de comparaison** avant/après pour validation
- **Justificatifs** : liens, images, HTML pour chaque proposition

### Monitoring
- **Tableau de bord** avec métriques en temps réel
- **État du système** : santé de la base de données, uptime
- **Exécutions récentes** avec statuts et durées
- **Alertes** en cas de problème système

## 🛠️ Technologies

- **React 18** avec TypeScript
- **Material-UI Pro** pour l'interface
- **MUI DataGrid Pro** pour les tableaux avancés
- **React Query** pour la gestion d'état serveur
- **React Router** pour la navigation
- **Vite** comme build tool

## 📱 Interface

### Tableau de bord (`/dashboard`)
Vue d'ensemble avec:
- Compteurs d'agents actifs
- Propositions en attente
- Exécutions récentes
- État système

### Agents (`/agents`)
- Liste filtrable et recherchable
- Switch pour activation/désactivation
- Bouton d'exécution manuelle
- Lien vers détails

### Propositions (`/proposals`)
- Table avec tri par date
- Filtres par statut (priorité sur TO_BE_CONFIRMED)
- Sélection multiple pour actions en masse
- Résumé des changements avec tooltip

### Détails proposition (`/proposals/:id`)
- Comparaison avant/après
- Justificatifs cliquables
- Validation champ par champ
- Propositions liées pour même événement

## 🎨 Design

Suit les principes du projet Miles Republic:
- **Palette de couleurs** cohérente
- **Typographie** Roboto avec hiérarchie claire
- **Composants** Material Design avec customisation
- **Responsive** adaptation mobile/desktop
- **Accessibilité** contraste et navigation clavier

## 📊 Données

### Filtrage intelligent
- **Agents** : nom, type, statut actif/inactif
- **Propositions** : statut, type, agent source
- **Recherche** textuelle en temps réel

### Actions disponibles
- **Agents** : toggle actif/inactif, run manuel, voir détails
- **Propositions** : approuver, rejeter, archiver (individuel ou masse)
- **Navigation** fluide entre les vues connexes

## 🚀 Utilisation

```bash
# Développement
npm run dev

# Build production
npm run build

# Type checking
npm run type-check

# Linting
npm run lint
```

L'application se connecte automatiquement à l'API sur le port 3001 via proxy Vite.