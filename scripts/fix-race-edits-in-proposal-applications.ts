/**
 * Script pour détecter et corriger les ProposalApplications avec raceEdits non fusionnés
 *
 * Problème: Le fix du 2025-12-10 a changé le frontend pour utiliser les vrais raceId
 * comme clés dans raceEdits, mais le backend cherchait existing-{index}.
 * Résultat: les modifications manuelles n'étaient pas fusionnées dans racesToUpdate.
 *
 * Usage:
 *   npx tsx scripts/fix-race-edits-in-proposal-applications.ts [--dry-run] [--fix] [--replay]
 *
 * Options:
 *   --dry-run      Affiche les corrections sans les appliquer (par défaut)
 *   --fix          Applique les corrections sur les applications PENDING uniquement
 *   --replay       Reset les applications APPLIED à PENDING après correction (pour rejeu)
 *   --app-id=XXX   Corriger une ProposalApplication spécifique
 */

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// Type pour le résultat de la requête avec include
type ApplicationWithProposal = Prisma.ProposalApplicationGetPayload<{
  include: {
    proposal: {
      select: {
        id: true;
        eventName: true;
        editionYear: true;
        userModifiedChanges: true;
        changes: true;
      };
    };
  };
}>;

interface RaceUpdate {
  raceId: number;
  raceName: string;
  updates: Record<string, { new: any; old: any }>;
  currentData?: Record<string, any>;
}

interface AppliedChanges {
  racesToUpdate?: { new: RaceUpdate[]; old: any; confidence: number };
  raceEdits?: Record<string, any>;
  [key: string]: any;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--fix") && !args.includes("--replay");
  const replayMode = args.includes("--replay");
  const specificAppId = args
    .find((a) => a.startsWith("--app-id="))
    ?.split("=")[1];

  console.log("=".repeat(80));
  console.log("Script de correction des raceEdits dans ProposalApplications");
  console.log("=".repeat(80));
  if (dryRun) {
    console.log("Mode: DRY RUN (pas de modification)");
  } else if (replayMode) {
    console.log("Mode: REPLAY (corrections + reset à PENDING pour rejeu)");
  } else {
    console.log("Mode: FIX (corrections sur PENDING uniquement)");
  }
  if (specificAppId) {
    console.log(`Application ciblée: ${specificAppId}`);
  }
  console.log("");

  // 1. Récupérer toutes les ProposalApplications de type 'races' avec raceEdits
  const query: any = {
    where: {
      blockType: "races",
      proposal: {
        userModifiedChanges: {
          not: null,
        },
      },
    },
    include: {
      proposal: {
        select: {
          id: true,
          eventName: true,
          editionYear: true,
          userModifiedChanges: true,
          changes: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc" as const,
    },
  };

  if (specificAppId) {
    query.where.id = specificAppId;
  }

  const applications = (await prisma.proposalApplication.findMany(
    query,
  )) as ApplicationWithProposal[];

  console.log(
    `Trouvé ${applications.length} ProposalApplication(s) de type 'races'\n`,
  );

  let affectedCount = 0;
  let fixedCount = 0;

  for (const app of applications) {
    const userModifiedChanges = app.proposal.userModifiedChanges as Record<
      string,
      any
    > | null;
    const raceEdits = userModifiedChanges?.raceEdits as
      | Record<string, any>
      | undefined;

    if (!raceEdits || Object.keys(raceEdits).length === 0) {
      continue;
    }

    // Vérifier s'il y a des clés numériques (vrais raceId)
    const numericKeys = Object.keys(raceEdits).filter((key) =>
      /^\d+$/.test(key),
    );
    if (numericKeys.length === 0) {
      continue;
    }

    affectedCount++;

    console.log("-".repeat(80));
    console.log(`ProposalApplication: ${app.id}`);
    console.log(`  Status: ${app.status}`);
    console.log(
      `  Événement: ${app.proposal.eventName} (${app.proposal.editionYear})`,
    );
    console.log(`  Proposition: ${app.proposal.id}`);
    console.log(`  Clés raceEdits numériques: ${numericKeys.join(", ")}`);

    const appliedChanges = app.appliedChanges as AppliedChanges | null;
    const racesToUpdate = appliedChanges?.racesToUpdate?.new || [];

    // Analyser les incohérences
    console.log("\n  Analyse des modifications:");

    const corrections: Array<{
      raceId: string;
      raceName: string;
      field: string;
      currentValue: any;
      expectedValue: any;
    }> = [];

    for (const raceIdStr of numericKeys) {
      const userEdits = raceEdits[raceIdStr];
      if (userEdits._deleted) continue;

      const race = racesToUpdate.find(
        (r: RaceUpdate) => r.raceId?.toString() === raceIdStr,
      );

      if (!race) {
        console.log(
          `    ⚠️  Race ${raceIdStr}: Non trouvée dans racesToUpdate`,
        );
        continue;
      }

      for (const [field, expectedValue] of Object.entries(userEdits)) {
        if (field === "_deleted" || field === "_originalIndex") continue;

        const currentUpdate = race.updates?.[field];
        const currentValue = currentUpdate?.new;

        if (JSON.stringify(currentValue) !== JSON.stringify(expectedValue)) {
          corrections.push({
            raceId: raceIdStr,
            raceName: race.raceName,
            field,
            currentValue,
            expectedValue,
          });

          // Formatter les dates pour l'affichage
          const formatValue = (v: any) => {
            if (typeof v === "string" && v.match(/^\d{4}-\d{2}-\d{2}T/)) {
              return new Date(v).toLocaleString("fr-FR", {
                timeZone: "Europe/Paris",
              });
            }
            return JSON.stringify(v);
          };

          console.log(`    ❌ ${race.raceName} (${raceIdStr}) - ${field}:`);
          console.log(`       Actuel:   ${formatValue(currentValue)}`);
          console.log(`       Attendu:  ${formatValue(expectedValue)}`);
        }
      }
    }

    if (corrections.length === 0) {
      console.log("    ✅ Aucune incohérence détectée");
      continue;
    }

    console.log(`\n  Total: ${corrections.length} correction(s) nécessaire(s)`);

    // Appliquer les corrections si demandé
    const shouldFix = !dryRun && (app.status === "PENDING" || replayMode);

    if (shouldFix) {
      console.log("\n  Applying corrections...");

      // Construire le nouveau appliedChanges avec les corrections
      const newAppliedChanges = JSON.parse(JSON.stringify(appliedChanges));
      const newRacesToUpdate = newAppliedChanges.racesToUpdate?.new || [];

      for (const correction of corrections) {
        const race = newRacesToUpdate.find(
          (r: RaceUpdate) => r.raceId?.toString() === correction.raceId,
        );
        if (race) {
          if (!race.updates) race.updates = {};
          race.updates[correction.field] = {
            new: correction.expectedValue,
            old: race.currentData?.[correction.field],
          };
        }
      }

      // Mettre à jour raceEdits aussi
      newAppliedChanges.raceEdits = raceEdits;

      // Préparer les données de mise à jour
      const updateData: any = {
        appliedChanges: newAppliedChanges,
        updatedAt: new Date(),
      };

      // En mode replay, reset le status à PENDING pour permettre le rejeu
      if (replayMode && app.status === "APPLIED") {
        updateData.status = "PENDING";
        updateData.appliedAt = null;
        updateData.errorMessage = null;
        console.log("  🔄 Reset status APPLIED → PENDING pour rejeu");
      }

      await prisma.proposalApplication.update({
        where: { id: app.id },
        data: updateData,
      });

      console.log("  ✅ Corrections appliquées!");
      fixedCount++;
    } else if (!dryRun && app.status === "APPLIED" && !replayMode) {
      console.log(
        "\n  ⚠️  Status APPLIED - Utilisez --replay pour corriger et permettre le rejeu",
      );
    } else if (dryRun) {
      console.log(
        "\n  ℹ️  Mode dry-run - Utilisez --fix ou --replay pour appliquer",
      );
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("RÉSUMÉ");
  console.log("=".repeat(80));
  console.log(`Applications analysées: ${applications.length}`);
  console.log(`Applications affectées: ${affectedCount}`);
  if (!dryRun) {
    console.log(`Applications corrigées: ${fixedCount}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
