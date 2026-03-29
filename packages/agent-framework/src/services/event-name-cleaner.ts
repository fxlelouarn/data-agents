/**
 * LLM-based event name cleaning.
 * Removes edition-specific elements (years, edition numbers, etc.)
 * so the event name remains valid across editions.
 */

import Anthropic from '@anthropic-ai/sdk'

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

/**
 * Clean an event name using LLM to remove edition-specific elements.
 * Returns the cleaned name, or the original name if LLM fails.
 */
export async function cleanEventNameWithLLM(
  eventName: string,
  config: { apiKey: string; model?: string }
): Promise<string> {
  try {
    const anthropic = new Anthropic({ apiKey: config.apiKey })

    const response = await Promise.race([
      anthropic.messages.create({
        model: config.model || DEFAULT_MODEL,
        max_tokens: 256,
        tools: [{
          name: 'cleaned_name',
          description: "Nom d'événement nettoyé",
          input_schema: {
            type: 'object' as const,
            properties: {
              name: { type: 'string', description: 'Nom nettoyé' },
              changed: { type: 'boolean', description: 'true si le nom a été modifié' },
            },
            required: ['name', 'changed'],
          },
        }],
        tool_choice: { type: 'tool' as const, name: 'cleaned_name' },
        messages: [{
          role: 'user',
          content: `Nettoie ce nom d'événement sportif pour qu'il reste valable d'une année sur l'autre.

RETIRER : années (2025, 2026), numéros d'édition (5ème, 24E, XXIIe, 10Eme Edition), prépositions orphelines après suppression.
CONSERVER : nom de marque, ville/lieu, mots descriptifs (Trail, Marathon, Semi, etc.), numéros faisant partie du nom (6 miles, 24 Heures, 10km).
CONSERVER : les arrondissements de Paris/Lyon/Marseille (14ème, 19ème = arrondissements, PAS des éditions).

Si le nom est déjà propre, retourne-le tel quel avec changed=false.

Nom: "${eventName}"`
        }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM timeout')), 10000)
      ),
    ])

    const toolBlock = (response as Anthropic.Message).content.find(
      b => b.type === 'tool_use'
    ) as Anthropic.ToolUseBlock | undefined

    if (!toolBlock) return eventName

    const result = toolBlock.input as { name: string; changed: boolean }
    return result.name || eventName
  } catch {
    // LLM failure — return original name, regex fallback will still apply in buildNewEventChanges
    return eventName
  }
}
