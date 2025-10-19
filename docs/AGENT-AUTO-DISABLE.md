# 🛑 Gestion Automatique des Agents en Échec

## Vue d'ensemble

Le système Data Agents intègre une fonctionnalité de désactivation automatique des agents qui accumulent des échecs consécutifs. Cette fonctionnalité améliore la fiabilité du système en évitant que des agents défaillants continuent à s'exécuter inutilement.

## 🎯 Fonctionnalités

### 1. Désactivation Automatique
- **Seuil configurable** : Nombre d'échecs consécutifs avant désactivation (défaut: 3)
- **Monitoring temps réel** : Vérification après chaque exécution d'agent
- **Vérification périodique** : Scan automatique toutes les 5 minutes (configurable)

### 2. Interface Utilisateur

#### Page Settings (`/settings`)
- **Configuration système** : Paramètres de désactivation automatique
- **Rapport d'échecs** : Vue détaillée des agents en difficulté
- **Vérification manuelle** : Bouton pour déclencher une vérification immédiate

#### Page Agents (`/agents`)
- **Indicateurs visuels** dans le tableau :
  - 🔴 **Chip "Auto-désactivé"** : Agent désactivé automatiquement
  - 🟡 **Chip "À risque"** : Agent actif mais avec échecs consécutifs
  - 📊 **Statistiques** : Compteurs dans l'en-tête de page

### 3. États des Agents

| État | Indicateur | Description |
|------|------------|-------------|
| **Actif normal** | Switch vert | Agent actif sans problème |
| **À risque** | Switch orange + Chip "À risque" | Agent actif avec échecs, surveiller |
| **Auto-désactivé** | Switch rouge + Chip "Auto-désactivé" | Désactivé automatiquement |
| **Erreur config** | Switch + Icône erreur | Erreur de configuration |

## 🔧 Configuration

### Variables d'environnement
```bash
# Nombre maximum d'échecs consécutifs (défaut: 3)
MAX_CONSECUTIVE_FAILURES=3

# Activer/désactiver la fonctionnalité (défaut: true)
ENABLE_AUTO_DISABLING=true

# Intervalle de vérification en minutes (défaut: 5)
CHECK_INTERVAL_MINUTES=5
```

### API Endpoints
```bash
# Récupérer la configuration
GET /api/settings

# Modifier les paramètres
PUT /api/settings
{
  "maxConsecutiveFailures": 3,
  "enableAutoDisabling": true,
  "checkIntervalMinutes": 5
}

# Rapport d'échecs détaillé
GET /api/settings/failure-report

# Vérification manuelle
POST /api/settings/check-failures
```

## 🚨 Workflow de Désactivation

1. **Détection d'échec** : Agent en erreur lors de l'exécution
2. **Comptage** : Vérification des échecs consécutifs depuis le dernier succès
3. **Seuil atteint** : Si `échecs >= maxConsecutiveFailures`
4. **Désactivation** : Agent mis à `isActive = false`
5. **Logging** : Enregistrement avec détails et historique
6. **Notification** : Log de niveau WARN avec justification
7. **Désenregistrement** : Retrait du scheduler automatique

## 📊 Monitoring

### Logs automatiques
- **Niveau WARN** : Désactivation automatique
- **Détails complets** : Nombre d'échecs, historique, raisons
- **Traçabilité** : ID d'agent, runs échoués, timestamps

### Métriques disponibles
- Nombre d'agents auto-désactivés
- Agents à risque (avec échecs mais encore actifs)
- Historique des désactivations
- Performance du système de monitoring

## 🔄 Réactivation

Pour réactiver un agent auto-désactivé :

1. **Identifier le problème** : Consulter les logs d'erreur
2. **Corriger la configuration** : Résoudre les problèmes identifiés
3. **Réactivation manuelle** : Utiliser le switch dans l'interface
4. **Surveillance** : Vérifier que l'agent fonctionne correctement

## ⚙️ Architecture Technique

### Backend (`apps/api`)
- **`SettingsService`** : Gestion de la configuration système
- **`AgentFailureMonitor`** : Service de monitoring des échecs
- **`AgentScheduler`** : Intégration dans le cycle de vie des agents

### Frontend (`apps/dashboard`) 
- **`useFailureReport`** : Hook pour les données d'échecs
- **`useSettings`** : Hook pour la configuration système
- **Interface unifiée** : Indicateurs visuels dans le tableau d'agents

Cette fonctionnalité assure une **fiabilité accrue** du système Data Agents en gérant proactivement les agents défaillants tout en maintenant une **visibilité complète** pour les administrateurs.