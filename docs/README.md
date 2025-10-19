# 📚 Documentation Data-Agents

**Bienvenue!** Vous avez trouvé la documentation complète du projet **data-agents** - un système intelligent d'extraction et de validation de données d'événements sportifs.

## 🚀 Commencer Ici

### 🆕 Nouveau au projet?
→ **[INDEX.md](./INDEX.md)** - Guide de navigation complet

### 🏗️ Comprendre l'architecture
→ **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Vue d'ensemble structure globale (21 KB)

### 🤖 Travailler avec les agents
1. **[AGENT-REGISTRY.md](./AGENT-REGISTRY.md)** - Comment enregistrer et créer agents
2. **[AGENTS-ARCHITECTURE.md](./AGENTS-ARCHITECTURE.md)** - Hiérarchie classes et cycle de vie
3. **[CONFIGURATION-SYSTEM.md](./CONFIGURATION-SYSTEM.md)** - Configuration dynamique

### 🔌 Intégrations
→ **[DATABASE-MANAGER.md](./DATABASE-MANAGER.md)** - Gestion connexions bases de données

### 🧪 Tester localement
→ **[TEST-ENVIRONMENT.md](./TEST-ENVIRONMENT.md)** - Console interactive de test

### ⚙️ DevOps & Monitoring
→ **[AGENT-AUTO-DISABLE.md](./AGENT-AUTO-DISABLE.md)** - Désactivation automatique en erreurs

---

## 📖 Documentation Complète

| File | Taille | Focus | Audience |
|------|--------|-------|----------|
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | 21 KB | Structure monorepo, packages, flux | Tous |
| **[AGENT-REGISTRY.md](./AGENT-REGISTRY.md)** | 15 KB | Enregistrement & création agents | Devs Backend |
| **[AGENTS-ARCHITECTURE.md](./AGENTS-ARCHITECTURE.md)** | 18 KB | Classes, interfaces, patterns | Devs Backend |
| **[DATABASE-MANAGER.md](./DATABASE-MANAGER.md)** | 17 KB | Gestion connexions multiples BD | Devs Backend |
| **[CONFIGURATION-SYSTEM.md](./CONFIGURATION-SYSTEM.md)** | 15 KB | Schémas configs dynamiques | Devs Backend + Frontend |
| **[TEST-ENVIRONMENT.md](./TEST-ENVIRONMENT.md)** | 11 KB | Console test interactive | Devs |
| **[AGENT-AUTO-DISABLE.md](./AGENT-AUTO-DISABLE.md)** | 4 KB | Auto-désactivation erreurs | DevOps |
| **[INDEX.md](./INDEX.md)** | 10 KB | Navigation index | Tous |

**Total** : ~111 KB, 3934 lignes de documentation

---

## 🎯 Par Cas d'Usage

### Je veux créer un nouvel agent
1. Lire [AGENT-REGISTRY.md](./AGENT-REGISTRY.md) → "Créer un Nouvel Agent"
2. Consulter [AGENTS-ARCHITECTURE.md](./AGENTS-ARCHITECTURE.md) → Exemple GoogleSearchDateAgent
3. Implémenter avec [CONFIGURATION-SYSTEM.md](./CONFIGURATION-SYSTEM.md) pour la config
4. Tester avec [TEST-ENVIRONMENT.md](./TEST-ENVIRONMENT.md)

### Je veux comprendre l'architecture globale
1. [ARCHITECTURE.md](./ARCHITECTURE.md) → Vue d'ensemble
2. [AGENT-REGISTRY.md](./AGENT-REGISTRY.md) → Flux création agents
3. [DATABASE-MANAGER.md](./DATABASE-MANAGER.md) → Gestion connexions

### Je veux tester localement
[TEST-ENVIRONMENT.md](./TEST-ENVIRONMENT.md) → Quick start + options

### Je veux configurer un agent
[CONFIGURATION-SYSTEM.md](./CONFIGURATION-SYSTEM.md) → Schémas & validation

### Je dois déployer en production
[AGENT-AUTO-DISABLE.md](./AGENT-AUTO-DISABLE.md) → Monitoring & auto-désactivation

### Je dois debugger un agent
[TEST-ENVIRONMENT.md](./TEST-ENVIRONMENT.md) → Mode debug + logs

---

## 🔑 Concepts Clés

### Architecture
- **Monorepo** : packages + apps organisés par domaine
- **Packages** : agent-framework, database, types (partagés)
- **Apps** : agents (implémentations), api (REST), dashboard (React)

### Agents
- **BaseAgent** : classe abstraite pour tous les agents
- **AgentRegistry** : factory pour enregistrer & créer agents
- **IAgent** : interface contrat (run, validate, getStatus)

### Configuration
- **ConfigSchema** : schéma JSON pour génération forms dynamiques
- **ConfigField** : description champ (type, label, validation)
- **Validation** : côté agent + côté API

### Bases de Données
- **DatabaseManager** : gestion centralisée connexions multiples
- **Support** : PostgreSQL, MySQL, MongoDB, URLs complètes
- **Lazy loading** : configurations chargées à la demande

### Testing
- **test-environment** : console interactive avec mocks services
- **Contexte mock** : DB, HTTP, Browser, FileSystem, APIs
- **Modes** : dry-run, interactif, debug, verbose

---

## 🎓 Learning Path

**Niveau 1 - Comprendre** (30 min)
- Lire [ARCHITECTURE.md](./ARCHITECTURE.md)
- Survoler [INDEX.md](./INDEX.md)

**Niveau 2 - Développer** (2-4 h)
- [AGENT-REGISTRY.md](./AGENT-REGISTRY.md) - Créer agent
- [AGENTS-ARCHITECTURE.md](./AGENTS-ARCHITECTURE.md) - Implémenter
- [CONFIGURATION-SYSTEM.md](./CONFIGURATION-SYSTEM.md) - Configurer
- [TEST-ENVIRONMENT.md](./TEST-ENVIRONMENT.md) - Tester

**Niveau 3 - Maîtriser** (1-2 jours)
- Créer un agent complet de bout en bout
- Implémenter DatabaseManager pour source custom
- Créer ConfigSchema pour UX optimale
- Écrire tests exhaustifs

---

## 🔍 Recherche Rapide

**Q: Comment ajouter un nouvel agent?**
→ [AGENT-REGISTRY.md](./AGENT-REGISTRY.md#23-créer-un-nouvel-agent)

**Q: Où est BaseAgent?**
→ [ARCHITECTURE.md](./ARCHITECTURE.md#12-baseagent)

**Q: Comment se connecter à Miles Republic?**
→ [DATABASE-MANAGER.md](./DATABASE-MANAGER.md#41-accès-depuis-un-agent)

**Q: Comment tester mon agent?**
→ [TEST-ENVIRONMENT.md](./TEST-ENVIRONMENT.md#quick-start)

**Q: Qu'est-ce qu'AgentRegistry?**
→ [AGENT-REGISTRY.md](./AGENT-REGISTRY.md#1-architecture-du-registry)

**Q: Comment configurer dynamiquement?**
→ [CONFIGURATION-SYSTEM.md](./CONFIGURATION-SYSTEM.md)

**Q: Que se passe-t-il si agent échoue?**
→ [AGENT-AUTO-DISABLE.md](./AGENT-AUTO-DISABLE.md)

---

## 🛠️ Outils & Commandes

```bash
# Tests
node test-environment/console-tester.js GoogleSearchDateAgent --dry-run --verbose

# Viewing docs
cat docs/ARCHITECTURE.md

# Count docs
wc -l docs/*.md

# Search in docs
grep -r "BaseAgent" docs/
```

---

## ✨ Highlights

- ✅ **3934 lignes** de documentation structurée
- ✅ **8 documents** couvrant tous les aspects
- ✅ **Code examples** pour chaque concept
- ✅ **Best practices** et patterns
- ✅ **Dépannage** et FAQ
- ✅ **Learning path** graduellement complexe

---

## 📝 Notez

Cette documentation est **living documentation** - elle évolue avec le projet. Les mises à jour les plus récentes reflètent l'état actuel du code.

---

## 🎯 Objectif

Cette documentation vise à servir comme **mémoire persistée** pour :
- 🚀 **Nouveaux développeurs** - onboarding accéléré
- 👥 **Équipe** - référence commune
- 🤖 **Futurs agents** - context pour nouvelles implémentations
- 🔮 **Mainteneurs** - guide d'architecture

---

**[→ Commencez par INDEX.md](./INDEX.md)**

---

*Documentation générée le 2025-10-19*
