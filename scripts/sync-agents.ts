#!/usr/bin/env node
/**
 * Script de synchronisation des agents
 *
 * Ce script met à jour la base de données avec les métadonnées actuelles
 * des agents (version, description) depuis le code source.
 *
 * IMPORTANT: L'identifiant technique invariable est `agentType` dans la config.
 * Cela permet de détecter les agents existants même s'ils ont été créés avec
 * des IDs différents (CUIDs vs IDs fixes).
 *
 * Usage:
 *   npm run sync-agents
 *   npm run sync-agents -- --force  (force la mise à jour même si version identique)
 */

import { prisma } from "@data-agents/database";
import { getAgentName } from "@data-agents/types";
import { FFA_SCRAPER_AGENT_VERSION } from "../apps/agents/src/FFAScraperAgent";
import { GOOGLE_SEARCH_DATE_AGENT_VERSION } from "../apps/agents/src/GoogleSearchDateAgent";
import { DEFAULT_CONFIG as FFA_DEFAULT_CONFIG } from "../apps/agents/src/registry/ffa-scraper";
import { DEFAULT_CONFIG as GOOGLE_DEFAULT_CONFIG } from "../apps/agents/src/registry/google-search-date";

interface AgentDefinition {
  agentType: string; // Identifiant technique invariable (clé primaire logique)
  defaultId: string; // ID par défaut pour les nouvelles installations
  name: string;
  description: string;
  version: string;
  type: string; // Type fonctionnel (EXTRACTOR, VALIDATOR, etc.)
  defaultFrequency: string;
  defaultConfig: Record<string, any>;
}

/**
 * Registry des agents avec leurs métadonnées depuis le code
 *
 * La clé est `agentType` - l'identifiant technique invariable qui identifie
 * uniquement les agents qui utilisent la même technologie/source.
 */
const AGENT_DEFINITIONS: Record<string, AgentDefinition> = {
  FFA_SCRAPER: {
    agentType: "FFA_SCRAPER",
    defaultId: "ffa-scraper-agent",
    name: getAgentName("FFA_SCRAPER"),
    description: `Agent qui scrape le calendrier FFA pour extraire les compétitions de course à pied (v${FFA_SCRAPER_AGENT_VERSION})`,
    version: FFA_SCRAPER_AGENT_VERSION,
    type: "EXTRACTOR",
    defaultFrequency: FFA_DEFAULT_CONFIG.frequency,
    defaultConfig: FFA_DEFAULT_CONFIG.config,
  },
  GOOGLE_SEARCH_DATE: {
    agentType: "GOOGLE_SEARCH_DATE",
    defaultId: "google-search-date-agent",
    name: getAgentName("GOOGLE_SEARCH_DATE"),
    description: `Agent qui recherche les dates d'événements via Google Search et propose des mises à jour (v${GOOGLE_SEARCH_DATE_AGENT_VERSION})`,
    version: GOOGLE_SEARCH_DATE_AGENT_VERSION,
    type: "EXTRACTOR",
    defaultFrequency: GOOGLE_DEFAULT_CONFIG.frequency,
    defaultConfig: GOOGLE_DEFAULT_CONFIG.config,
  },
};

/**
 * Recherche un agent par son agentType dans la config
 */
async function findAgentByType(agentType: string) {
  // Prisma JSON filtering: chercher dans config.agentType
  const agents = await prisma.agent.findMany({
    where: {
      config: {
        path: ["agentType"],
        equals: agentType,
      },
    },
  });

  return agents.length > 0 ? agents[0] : null;
}

async function syncAgents(force = false) {
  console.log("🔄 Synchronisation des agents...\n");

  for (const [agentType, definition] of Object.entries(AGENT_DEFINITIONS)) {
    console.log(`📦 Traitement de ${definition.name} (type: ${agentType})...`);

    try {
      // Rechercher l'agent par son agentType (identifiant technique invariable)
      const existingAgent = await findAgentByType(agentType);

      if (existingAgent) {
        // Agent existe déjà - vérifier la version
        const currentVersion = (existingAgent.config as any)?.version;
        const needsUpdate = force || currentVersion !== definition.version;

        if (needsUpdate) {
          const versionInfo = currentVersion
            ? `${currentVersion} → ${definition.version}`
            : `inconnue → ${definition.version}`;
          console.log(`  ⬆️  Mise à jour de version: ${versionInfo}`);

          // Merger la config existante avec les valeurs par défaut
          // Les valeurs existantes ont la priorité (sauf version)
          const existingConfig = (existingAgent.config as any) || {};
          const mergedConfig = {
            ...definition.defaultConfig,
            ...existingConfig,
            version: definition.version, // Toujours mettre à jour la version
            agentType: definition.agentType, // S'assurer que agentType est présent
          };

          await prisma.agent.update({
            where: { id: existingAgent.id },
            data: {
              description: definition.description,
              config: mergedConfig,
            },
          });

          console.log(
            `  ✅ Agent mis à jour avec succès (ID: ${existingAgent.id})`,
          );
        } else {
          console.log(
            `  ⏭️  Déjà à jour (v${currentVersion}, ID: ${existingAgent.id})`,
          );
        }
      } else {
        // Agent n'existe pas - l'installer avec l'ID par défaut
        console.log(`  ➕ Installation de l'agent...`);

        await prisma.agent.create({
          data: {
            id: definition.defaultId,
            name: definition.name,
            description: definition.description,
            type: definition.type,
            frequency: definition.defaultFrequency,
            isActive: false, // Désactivé par défaut lors de l'installation
            config: {
              ...definition.defaultConfig,
              version: definition.version,
              agentType: definition.agentType, // Identifiant technique invariable
            },
          },
        });

        console.log(
          `  ✅ Agent installé avec succès (v${definition.version}, ID: ${definition.defaultId})`,
        );
        console.log(
          `  ⚠️  Agent désactivé par défaut - activez-le via le dashboard`,
        );
      }
    } catch (error) {
      console.error(
        `  ❌ Erreur lors du traitement de ${definition.name}:`,
        error,
      );
    }

    console.log();
  }

  console.log("✅ Synchronisation terminée\n");
}

async function main() {
  const force = process.argv.includes("--force");

  if (force) {
    console.log("⚠️  Mode FORCE activé - tous les agents seront mis à jour\n");
  }

  try {
    await syncAgents(force);
  } catch (error) {
    console.error("❌ Erreur fatale:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
