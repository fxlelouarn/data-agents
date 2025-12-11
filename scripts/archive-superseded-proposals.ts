#!/usr/bin/env npx tsx
/**
 * Script d'archivage des propositions obsolètes
 *
 * Ce script archive les propositions PENDING qui ont été "superseded" par des propositions
 * FFA déjà appliquées (status APPROVED avec des ProposalApplications APPLIED).
 *
 * Logique :
 * 1. Trouver toutes les propositions FFA avec status APPROVED et applications APPLIED
 * 2. Pour chaque groupe (eventId/editionId), trouver les autres propositions PENDING
 * 3. Archiver ces propositions avec la raison "superseded"
 *
 * Usage :
 *   DATABASE_URL="..." npx tsx scripts/archive-superseded-proposals.ts [--dry-run]
 *
 * Options :
 *   --dry-run : Affiche les propositions qui seraient archivées sans les modifier
 *
 * Environnement :
 *   DATABASE_URL : URL de la base de données (obligatoire)
 */

import { PrismaClient } from "@prisma/client";

// Vérifier que DATABASE_URL est défini
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL non défini. Usage:");
  console.error(
    '   DATABASE_URL="postgresql://..." npx tsx scripts/archive-superseded-proposals.ts [--dry-run]',
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

interface SupersededProposal {
  id: string;
  eventId: string | null;
  editionId: string | null;
  agentId: string | null;
  type: string;
  createdAt: Date;
  supersededBy: string;
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  console.log("🗄️  Script d'archivage des propositions obsolètes");
  console.log(`   Mode: ${isDryRun ? "DRY RUN (simulation)" : "PRODUCTION"}`);
  console.log("─".repeat(60));

  // 1. Trouver les propositions FFA appliquées (APPROVED avec applications APPLIED)
  const appliedProposals = await prisma.proposal.findMany({
    where: {
      status: "APPROVED",
      applications: {
        some: {
          status: "APPLIED",
        },
      },
    },
    include: {
      agent: {
        select: { name: true },
      },
      applications: {
        where: { status: "APPLIED" },
        select: { id: true, blockType: true, appliedAt: true },
      },
    },
  });

  console.log(
    `\n📊 Propositions appliquées trouvées: ${appliedProposals.length}`,
  );

  // 2. Grouper par eventId/editionId
  const groupsWithApplied = new Map<string, (typeof appliedProposals)[0]>();

  for (const proposal of appliedProposals) {
    if (!proposal.eventId || !proposal.editionId) continue;

    const groupKey = `${proposal.eventId}-${proposal.editionId}`;

    // Garder la plus récente si plusieurs propositions appliquées dans le même groupe
    const existing = groupsWithApplied.get(groupKey);
    if (!existing || proposal.createdAt > existing.createdAt) {
      groupsWithApplied.set(groupKey, proposal);
    }
  }

  console.log(
    `📦 Groupes avec propositions appliquées: ${groupsWithApplied.size}`,
  );

  // 3. Trouver les propositions PENDING à archiver pour chaque groupe
  const proposalsToArchive: SupersededProposal[] = [];

  for (const [groupKey, appliedProposal] of groupsWithApplied) {
    const [eventId, editionId] = groupKey.split("-");

    const pendingInGroup = await prisma.proposal.findMany({
      where: {
        eventId,
        editionId,
        id: { not: appliedProposal.id },
        status: "PENDING",
      },
      select: {
        id: true,
        eventId: true,
        editionId: true,
        agentId: true,
        type: true,
        createdAt: true,
      },
    });

    for (const pending of pendingInGroup) {
      proposalsToArchive.push({
        ...pending,
        supersededBy: appliedProposal.id,
      });
    }
  }

  console.log(
    `\n🎯 Propositions PENDING à archiver: ${proposalsToArchive.length}`,
  );

  if (proposalsToArchive.length === 0) {
    console.log("\n✅ Aucune proposition à archiver.");
    return;
  }

  // Afficher les détails
  console.log("\n📋 Détails des propositions à archiver:");
  console.log("─".repeat(60));

  // Grouper par agent pour l'affichage
  const byAgent = new Map<string, SupersededProposal[]>();
  for (const proposal of proposalsToArchive) {
    const agentId = proposal.agentId || "unknown";
    if (!byAgent.has(agentId)) {
      byAgent.set(agentId, []);
    }
    byAgent.get(agentId)!.push(proposal);
  }

  // Récupérer les noms des agents
  const agentIds = Array.from(byAgent.keys()).filter((id) => id !== "unknown");
  const agents = await prisma.agent.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, name: true },
  });
  const agentNames = new Map(agents.map((a) => [a.id, a.name]));

  for (const [agentId, proposals] of byAgent) {
    const agentName = agentNames.get(agentId) || agentId;
    console.log(`\n  📌 ${agentName}: ${proposals.length} proposition(s)`);

    for (const proposal of proposals.slice(0, 5)) {
      console.log(
        `     - ${proposal.id} (${proposal.type}) → superseded by ${proposal.supersededBy}`,
      );
    }

    if (proposals.length > 5) {
      console.log(`     ... et ${proposals.length - 5} autres`);
    }
  }

  // 4. Archiver si pas en dry-run
  if (isDryRun) {
    console.log("\n⚠️  Mode DRY RUN - Aucune modification effectuée");
    console.log("   Relancez sans --dry-run pour appliquer les modifications");
  } else {
    console.log("\n🔄 Archivage en cours...");

    const result = await prisma.proposal.updateMany({
      where: {
        id: { in: proposalsToArchive.map((p) => p.id) },
      },
      data: {
        status: "ARCHIVED",
        reviewedAt: new Date(),
        reviewedBy: "migration-script",
        modificationReason: "Auto-archived: superseded by applied FFA proposal",
      },
    });

    console.log(`\n✅ ${result.count} proposition(s) archivée(s) avec succès`);

    // Log pour traçabilité
    console.log("\n📝 Résumé par groupe:");
    for (const [groupKey, appliedProposal] of groupsWithApplied) {
      const archivedInGroup = proposalsToArchive.filter(
        (p) => `${p.eventId}-${p.editionId}` === groupKey,
      );
      if (archivedInGroup.length > 0) {
        console.log(
          `   ${groupKey}: ${archivedInGroup.length} archivée(s) (superseded by ${appliedProposal.id})`,
        );
      }
    }
  }

  console.log("\n" + "─".repeat(60));
  console.log("🏁 Script terminé");
}

main()
  .catch((error) => {
    console.error("❌ Erreur:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
