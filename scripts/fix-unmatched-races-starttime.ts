/**
 * Script de correction pour les courses non matchées dont l'heure a été écrasée
 *
 * Bug: Les courses existantes non listées sur FFA avaient leur heure précise
 * écrasée par la date de début de l'édition (ffaStartDate).
 *
 * Ce script:
 * 1. Récupère toutes les ProposalApplication APPLIED avec des courses non matchées
 * 2. Pour chaque course non matchée, vérifie si l'heure a été écrasée
 * 3. Restaure l'heure originale dans Miles Republic
 *
 * Usage:
 *   npx ts-node scripts/fix-unmatched-races-starttime.ts --dry-run
 *   npx ts-node scripts/fix-unmatched-races-starttime.ts --apply
 */

import { PrismaClient as DataAgentsPrisma } from "@prisma/client";
import { PrismaClient as MilesRepublicPrisma } from "../node_modules/.prisma/client-miles";

const DATA_AGENTS_DB_URL =
  process.env.DATA_AGENTS_PROD_URL ||
  "postgresql://data_agents_user:epbhY7JjPVJERAY7tkHzBWx3THEFFy0M@dpg-d4c5448dl3ps73b959s0-a.frankfurt-postgres.render.com/data_agents_8bni";

const MILES_REPUBLIC_DB_URL =
  process.env.MILES_REPUBLIC_PROD_URL ||
  "postgresql://neondb_owner:EcB08pZVgXGk@ep-summer-smoke-a29510xq-pooler.eu-central-1.aws.neon.tech/neondb";

const dataAgentsDb = new DataAgentsPrisma({
  datasources: { db: { url: DATA_AGENTS_DB_URL } },
});

const milesDb = new MilesRepublicPrisma({
  datasources: { db: { url: MILES_REPUBLIC_DB_URL } },
});

interface RaceUpdate {
  raceId: number;
  raceName: string;
  updates: {
    startDate?: {
      old: string | null;
      new: string;
    };
    [key: string]: any;
  };
  currentData: {
    startDate: string;
    timeZone: string;
    [key: string]: any;
  };
}

interface AppliedChanges {
  racesToUpdate?: {
    new: RaceUpdate[];
    old: null;
    confidence: number;
  };
}

interface ProposalJustification {
  type: string;
  content: string;
  metadata?: {
    unmatchedRaces?: string[];
    [key: string]: any;
  };
}

/**
 * Vérifie si une date est à minuit dans une timezone donnée
 */
function isMidnightInTimezone(date: Date, timezone: string): boolean {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const timeStr = formatter.format(date);
  return timeStr === "00:00:00";
}

/**
 * Extrait l'heure locale d'une date dans une timezone
 */
function getLocalTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const isApply = process.argv.includes("--apply");

  if (!isDryRun && !isApply) {
    console.log("Usage:");
    console.log(
      "  npx ts-node scripts/fix-unmatched-races-starttime.ts --dry-run",
    );
    console.log(
      "  npx ts-node scripts/fix-unmatched-races-starttime.ts --apply",
    );
    process.exit(1);
  }

  console.log(
    `\n🔧 Mode: ${isDryRun ? "DRY RUN (aucune modification)" : "APPLY (modifications réelles)"}\n`,
  );

  // 1. Récupérer les ProposalApplication APPLIED avec courses non matchées
  const affectedApplications = await dataAgentsDb.$queryRaw<
    Array<{
      app_id: string;
      proposal_id: string;
      event_name: string;
      edition_year: number;
      applied_changes: AppliedChanges;
      justification: ProposalJustification[];
    }>
  >`
    SELECT
      pa.id as app_id,
      p.id as proposal_id,
      p."eventName" as event_name,
      p."editionYear" as edition_year,
      pa."appliedChanges" as applied_changes,
      p.justification
    FROM proposal_applications pa
    JOIN proposals p ON pa."proposalId" = p.id
    WHERE p.justification IS NOT NULL
      AND jsonb_typeof(p.justification) = 'array'
      AND jsonb_array_length(p.justification) >= 3
      AND p.justification->2->>'content' LIKE '%non matchée%'
      AND pa.status = 'APPLIED'
      AND pa."blockType" = 'races'
    ORDER BY pa."appliedAt" DESC
  `;

  console.log(
    `📊 ${affectedApplications.length} applications de courses affectées trouvées\n`,
  );

  const racesToFix: Array<{
    raceId: number;
    raceName: string;
    eventName: string;
    eventId: number;
    oldStartDate: Date;
    currentStartDate: Date;
    correctStartDate: Date;
    timezone: string;
  }> = [];

  for (const app of affectedApplications) {
    const appliedChanges = app.applied_changes;
    const justification = app.justification;

    if (!appliedChanges?.racesToUpdate?.new) continue;

    // Trouver les noms des courses non matchées depuis la justification
    const unmatchedJustif = justification.find((j) =>
      j.content?.includes("non matchée"),
    );
    const unmatchedRaceNames = unmatchedJustif?.metadata?.unmatchedRaces || [];

    if (unmatchedRaceNames.length === 0) continue;

    // Pour chaque course non matchée
    for (const raceUpdate of appliedChanges.racesToUpdate.new) {
      // Vérifier si c'est une course non matchée
      if (!unmatchedRaceNames.includes(raceUpdate.raceName)) continue;

      // Vérifier si la startDate a été modifiée
      if (!raceUpdate.updates.startDate) continue;

      const oldStartDate = raceUpdate.updates.startDate.old
        ? new Date(raceUpdate.updates.startDate.old)
        : null;
      const newStartDate = new Date(raceUpdate.updates.startDate.new);
      const timezone = raceUpdate.currentData.timeZone || "Europe/Paris";

      // Si l'ancienne date n'existait pas, on ne peut pas restaurer
      if (!oldStartDate) continue;

      // Vérifier si l'ancienne date avait une heure précise (non-minuit)
      const wasNotMidnight = !isMidnightInTimezone(oldStartDate, timezone);

      if (!wasNotMidnight) {
        // L'ancienne date était à minuit, pas de problème
        continue;
      }

      // L'ancienne date avait une heure précise qui a été écrasée
      // Récupérer la date actuelle dans Miles Republic
      const currentRace = await milesDb.race.findUnique({
        where: { id: raceUpdate.raceId },
        select: { id: true, name: true, startDate: true, eventId: true },
      });

      if (!currentRace || !currentRace.startDate) continue;

      // Vérifier si la date actuelle correspond à la nouvelle date (bug appliqué)
      const currentTime = currentRace.startDate.getTime();
      const newTime = newStartDate.getTime();

      if (Math.abs(currentTime - newTime) > 60000) {
        // La date actuelle ne correspond pas à ce qui a été appliqué
        // Quelqu'un a peut-être déjà corrigé manuellement
        console.log(
          `⏭️  ${raceUpdate.raceName} - date actuelle différente, ignorée`,
        );
        continue;
      }

      racesToFix.push({
        raceId: raceUpdate.raceId,
        raceName: raceUpdate.raceName,
        eventName: app.event_name,
        eventId: currentRace.eventId,
        oldStartDate,
        currentStartDate: currentRace.startDate,
        correctStartDate: oldStartDate, // Restaurer l'ancienne date avec l'heure
        timezone,
      });
    }
  }

  // Filtrer les courses où l'heure est déjà correcte
  const racesToFixFiltered = racesToFix.filter((race) => {
    const timeDiff = Math.abs(
      race.oldStartDate.getTime() - race.currentStartDate.getTime(),
    );
    return timeDiff > 60000; // Plus d'1 minute de différence
  });

  console.log(
    `\n🔍 ${racesToFixFiltered.length} courses à corriger (${racesToFix.length - racesToFixFiltered.length} déjà correctes):\n`,
  );

  for (const race of racesToFixFiltered) {
    const oldTime = getLocalTime(race.oldStartDate, race.timezone);
    const currentTime = getLocalTime(race.currentStartDate, race.timezone);

    console.log(`  📍 ${race.eventName}`);
    console.log(`     Course: ${race.raceName} (ID: ${race.raceId})`);
    console.log(`     Heure originale: ${oldTime} (${race.timezone})`);
    console.log(`     Heure actuelle (bug): ${currentTime}`);
    console.log(`     → Restauration vers: ${oldTime}`);
    console.log("");
  }

  if (isApply && racesToFixFiltered.length > 0) {
    console.log("\n🚀 Application des corrections...\n");

    let successCount = 0;
    let errorCount = 0;

    // Collecter les eventIds uniques pour la mise à jour groupée
    const eventIdsToUpdate = new Set<number>();

    for (const race of racesToFixFiltered) {
      try {
        // Mettre à jour la Race
        await milesDb.race.update({
          where: { id: race.raceId },
          data: {
            startDate: race.correctStartDate,
          },
        });

        // Collecter l'eventId pour mise à jour
        eventIdsToUpdate.add(race.eventId);

        console.log(`  ✅ ${race.raceName} corrigée`);
        successCount++;
      } catch (error) {
        console.error(`  ❌ Erreur pour ${race.raceName}:`, error);
        errorCount++;
      }
    }

    // Mettre à jour les Events (toUpdate + algoliaObjectToUpdate)
    if (eventIdsToUpdate.size > 0) {
      console.log(
        `\n📢 Mise à jour de ${eventIdsToUpdate.size} Event(s) pour Algolia...`,
      );

      for (const eventId of eventIdsToUpdate) {
        try {
          await milesDb.event.update({
            where: { id: eventId },
            data: {
              toUpdate: true,
              algoliaObjectToUpdate: true,
            },
          });
          console.log(`  ✅ Event ${eventId} marqué pour mise à jour`);
        } catch (error) {
          console.error(`  ❌ Erreur pour Event ${eventId}:`, error);
        }
      }
    }

    console.log(
      `\n📊 Résultat: ${successCount} corrigées, ${errorCount} erreurs`,
    );
  } else if (isDryRun) {
    console.log("\n💡 Exécutez avec --apply pour appliquer les corrections");
  }

  await dataAgentsDb.$disconnect();
  await milesDb.$disconnect();
}

main().catch(console.error);
