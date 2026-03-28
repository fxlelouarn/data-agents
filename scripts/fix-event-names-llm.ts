/**
 * Script to clean event names in Miles Republic using LLM.
 * Sends batches of event names to Claude for cleaning.
 *
 * Usage:
 *   npx tsx scripts/fix-event-names-llm.ts --dry-run       # Preview changes
 *   npx tsx scripts/fix-event-names-llm.ts                  # Apply changes
 *   npx tsx scripts/fix-event-names-llm.ts --proposals      # Also fix PENDING proposals
 */

import Anthropic from '@anthropic-ai/sdk'

const dryRun = process.argv.includes('--dry-run')
const includeProposals = process.argv.includes('--proposals')

const anthropic = new Anthropic()

const BATCH_SIZE = 50
const MODEL = 'claude-haiku-4-5-20251001'

// Regex pre-filter: only send names that likely need cleaning
function likelyNeedsCleaning(name: string): boolean {
  return /20[2-3]\d/.test(name) ||
    /\d+\s*[èe]r?[èe]?m?e?s?\s+[éeÉE]dition/i.test(name) ||
    /\d+\s*[eE]me\s+[éeÉE]dition/i.test(name) ||
    /\d+è/i.test(name) ||
    /\d+ème/i.test(name) ||
    /[IVXLCDM]{2,}e\b/.test(name) ||
    /\b\d+e\s+[éeÉE]dition/i.test(name)
}

interface NameEntry {
  id: number | string
  name: string
}

async function cleanBatch(entries: NameEntry[]): Promise<Map<string, string>> {
  const nameList = entries.map((e, i) => `${i + 1}. "${e.name}"`).join('\n')

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [{
      name: 'cleaned_names',
      description: 'Liste des noms nettoyés',
      input_schema: {
        type: 'object' as const,
        properties: {
          names: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'number', description: 'Numéro de la ligne (1-based)' },
                cleaned: { type: 'string', description: 'Nom nettoyé' },
              },
              required: ['index', 'cleaned'],
            },
            description: 'Seulement les noms qui ont été modifiés (omettre ceux déjà propres)',
          },
        },
        required: ['names'],
      },
    }],
    tool_choice: { type: 'tool' as const, name: 'cleaned_names' },
    messages: [{
      role: 'user',
      content: `Nettoie ces noms d'événements sportifs en retirant les éléments spécifiques à une édition.

RETIRER :
- Années : "2025", "2026"
- Numéros d'édition : "5ème édition", "XXIIe", "3è", "10Eme Edition", "39èmes"
- Prépositions orphelines après suppression ("du", "de la", "des" qui ne servent plus)
- Tirets ou ponctuation devenus inutiles après nettoyage

CONSERVER ABSOLUMENT :
- Le nom de marque/identité de l'événement
- La ville/lieu si elle fait partie du nom
- Les mots descriptifs ("Trail", "Marathon", "Nocturne", "Semi", etc.)
- Les numéros qui font partie du nom (ex: "6 miles", "24 Heures", "10km")

Si un nom est déjà propre, NE L'INCLUS PAS dans la réponse.

${nameList}`
    }],
  })

  const toolBlock = response.content.find(b => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined
  if (!toolBlock) return new Map()

  const result = toolBlock.input as { names: { index: number; cleaned: string }[] }
  const map = new Map<string, string>()

  for (const { index, cleaned } of result.names) {
    const entry = entries[index - 1]
    if (entry && cleaned && cleaned !== entry.name) {
      map.set(String(entry.id), cleaned)
    }
  }

  return map
}

async function main() {
  // Use psql for queries (avoids Prisma client issues)
  const { execSync } = await import('child_process')

  const mrUrl = process.env.MILES_REPUBLIC_DATABASE_URL!
  const dbUrl = process.env.DATABASE_URL!

  if (!mrUrl) {
    console.error('MILES_REPUBLIC_DATABASE_URL not set')
    process.exit(1)
  }

  function query(url: string, sql: string): string {
    return execSync(`psql "${url}" -t -A -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf-8' })
  }

  console.log(dryRun ? '🧪 DRY RUN MODE\n' : '🚀 APPLYING CHANGES\n')

  // === Miles Republic Events ===
  console.log('=== Miles Republic Events ===\n')

  const eventRows = query(mrUrl, 'SELECT id, name FROM "Event"').trim().split('\n').filter(Boolean)
  const events: NameEntry[] = eventRows.map(row => {
    const sep = row.indexOf('|')
    return { id: parseInt(row.substring(0, sep)), name: row.substring(sep + 1) }
  }).filter(e => likelyNeedsCleaning(e.name))

  console.log(`${events.length} events likely need cleaning (out of ${eventRows.length} total)`)

  let totalFixed = 0
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE)
    console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(events.length / BATCH_SIZE)} (${batch.length} events)...`)

    const cleaned = await cleanBatch(batch)

    for (const [id, newName] of cleaned) {
      const oldName = batch.find(e => String(e.id) === id)?.name
      console.log(`  [${id}] ${oldName?.padEnd(55)} → ${newName}`)
      totalFixed++

      if (!dryRun) {
        const escaped = newName.replace(/'/g, "''")
        query(mrUrl, `UPDATE "Event" SET name = '${escaped}' WHERE id = ${id}`)
      }
    }
  }

  console.log(`\n${dryRun ? '[DRY RUN] Would fix' : 'Fixed'} ${totalFixed} events`)

  // === PENDING Proposals ===
  if (includeProposals && dbUrl) {
    console.log('\n=== PENDING NEW_EVENT Proposals ===\n')

    const propRows = query(dbUrl, "SELECT id, changes->'name'->>'new' FROM proposals WHERE type = 'NEW_EVENT' AND status = 'PENDING' AND changes->'name'->>'new' IS NOT NULL")
      .trim().split('\n').filter(Boolean)

    const proposals: NameEntry[] = propRows.map(row => {
      const sep = row.indexOf('|')
      return { id: row.substring(0, sep), name: row.substring(sep + 1) }
    }).filter(p => likelyNeedsCleaning(p.name))

    console.log(`${proposals.length} proposals likely need cleaning`)

    let propFixed = 0
    for (let i = 0; i < proposals.length; i += BATCH_SIZE) {
      const batch = proposals.slice(i, i + BATCH_SIZE)
      const cleaned = await cleanBatch(batch)

      for (const [id, newName] of cleaned) {
        const oldName = batch.find(p => String(p.id) === id)?.name
        console.log(`  ${oldName?.padEnd(55)} → ${newName}`)
        propFixed++

        if (!dryRun) {
          // Update changes.name.new and eventName
          const escaped = newName.replace(/'/g, "''")
          const idEscaped = id.replace(/'/g, "''")
          query(dbUrl, `UPDATE proposals SET changes = jsonb_set(changes, '{name,new}', '"${escaped}"'::jsonb), "eventName" = '${escaped}' WHERE id = '${idEscaped}'`)
        }
      }
    }

    console.log(`\n${dryRun ? '[DRY RUN] Would fix' : 'Fixed'} ${propFixed} proposals`)
  }
}

main().catch(console.error)
