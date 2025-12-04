/**
 * Script de migration : Corriger les URLs organisateur mal classifiées
 *
 * Ce script corrige les propositions où un lien Facebook/Instagram
 * a été stocké dans websiteUrl au lieu de facebookUrl/instagramUrl.
 *
 * Usage:
 *   npx ts-node scripts/migrate-organizer-urls.ts [--dry-run]
 *
 * Options:
 *   --dry-run  Affiche les changements sans les appliquer
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface OrganizerData {
  name?: string;
  websiteUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  email?: string;
  phone?: string;
}

interface OrganizerChange {
  old: OrganizerData | null;
  new: OrganizerData;
  confidence: number;
}

/**
 * Classifie une URL selon son type (identique à parser.ts)
 */
function classifyOrganizerUrl(url: string | undefined): {
  websiteUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
} {
  if (!url) return {};

  const normalizedUrl = url.toLowerCase();

  if (
    normalizedUrl.includes("facebook.com") ||
    normalizedUrl.includes("fb.com") ||
    normalizedUrl.includes("fb.me")
  ) {
    return { facebookUrl: url };
  }

  if (
    normalizedUrl.includes("instagram.com") ||
    normalizedUrl.includes("instagr.am")
  ) {
    return { instagramUrl: url };
  }

  return { websiteUrl: url };
}

/**
 * Vérifie si une URL est mal classifiée (Facebook/Instagram dans websiteUrl)
 */
function isMisclassifiedUrl(url: string | undefined): boolean {
  if (!url) return false;
  const normalized = url.toLowerCase();
  return (
    normalized.includes("facebook.com") ||
    normalized.includes("fb.com") ||
    normalized.includes("fb.me") ||
    normalized.includes("instagram.com") ||
    normalized.includes("instagr.am")
  );
}

async function migrate(dryRun: boolean = false) {
  console.log("🔍 Recherche des propositions avec URLs mal classifiées...\n");

  // Récupérer toutes les propositions (on filtrera en JS car Prisma ne supporte pas bien les filtres JSON complexes)
  const proposals = await prisma.proposal.findMany({
    select: {
      id: true,
      status: true,
      type: true,
      changes: true,
    },
  });

  console.log(
    `📋 ${proposals.length} propositions avec bloc organizer trouvées`,
  );

  const toFix: Array<{
    id: string;
    status: string;
    type: string;
    oldUrl: string;
    newField: string;
    changes: any;
  }> = [];

  for (const proposal of proposals) {
    const changes = proposal.changes as Record<string, any>;
    const organizer = changes?.organizer as OrganizerChange | undefined;

    if (!organizer?.new?.websiteUrl) continue;

    const websiteUrl = organizer.new.websiteUrl;

    if (isMisclassifiedUrl(websiteUrl)) {
      const classified = classifyOrganizerUrl(websiteUrl);
      const newField = Object.keys(classified)[0];

      toFix.push({
        id: proposal.id,
        status: proposal.status,
        type: proposal.type,
        oldUrl: websiteUrl,
        newField,
        changes,
      });
    }
  }

  if (toFix.length === 0) {
    console.log("\n✅ Aucune proposition à corriger !");
    return;
  }

  console.log(`\n⚠️  ${toFix.length} proposition(s) à corriger:\n`);

  for (const item of toFix) {
    console.log(`  📌 ${item.id}`);
    console.log(`     Status: ${item.status}`);
    console.log(`     Type: ${item.type}`);
    console.log(`     URL: ${item.oldUrl}`);
    console.log(`     Correction: websiteUrl → ${item.newField}`);
    console.log("");
  }

  if (dryRun) {
    console.log("🔸 Mode dry-run : aucune modification appliquée");
    return;
  }

  console.log("🔄 Application des corrections...\n");

  let fixed = 0;
  let errors = 0;

  for (const item of toFix) {
    try {
      const changes = item.changes;
      const organizer = changes.organizer as OrganizerChange;
      const websiteUrl = organizer.new.websiteUrl;
      const classified = classifyOrganizerUrl(websiteUrl);

      // Construire le nouveau bloc organizer.new
      const newOrganizerNew: OrganizerData = {
        ...organizer.new,
        websiteUrl: undefined, // Retirer de websiteUrl
        ...classified, // Ajouter au bon champ
      };

      // Mettre à jour changes.organizer.new
      const updatedChanges = {
        ...changes,
        organizer: {
          ...organizer,
          new: newOrganizerNew,
        },
      };

      await prisma.proposal.update({
        where: { id: item.id },
        data: { changes: updatedChanges },
      });

      console.log(`  ✅ ${item.id} corrigé`);
      fixed++;
    } catch (error) {
      console.error(`  ❌ ${item.id} erreur:`, error);
      errors++;
    }
  }

  console.log(`\n📊 Résultat: ${fixed} corrigé(s), ${errors} erreur(s)`);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (dryRun) {
    console.log("🔸 Mode DRY-RUN activé\n");
  }

  try {
    await migrate(dryRun);
  } catch (error) {
    console.error("Erreur:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
