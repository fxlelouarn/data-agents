# Design Spec: LLM-Assisted Event & Race Matching

**Date**: 2026-03-21
**Status**: Draft
**Approach**: Hybrid — existing pipeline + LLM for ambiguous events and all race matching

## Problem Statement

The current matching system uses SQL/Meilisearch for candidate retrieval and fuse.js with hand-tuned rules for scoring. It has evolved through 4+ versions (v2.0→v2.3), each adding bonuses, penalties, and edge-case fixes. This creates two problems:

1. **Race matching is too rigid**: Distance-based matching (±15% tolerance) fails when races are reformatted between years (e.g., "Trail 25 km" → "Trail du Lac 27 km"). Out of 42,717 EDITION_UPDATE proposals, 2,177 have `racesToAdd` — potential false negatives where the race exists but wasn't recognized.

2. **Event matching has a fragile "gray zone"**: Scores between 0.30-0.95 depend on layered heuristics (department bonus +15%, homonym penalty -25%, temporal multiplier) that are hard to maintain and can conflict. The Slack agent match rate is only 34%.

## Approach: Hybrid LLM Integration

Keep the existing pipeline for clear cases. Add LLM judgment where it brings the most value:

- **Race matching**: Replace distance-based matching with LLM for all editions that have existing races
- **Event matching gray zone**: When fuse.js score falls between 0.30-0.95, ask LLM to arbitrate

### What stays unchanged

- SQL/Meilisearch candidate retrieval
- fuse.js scoring (still used as first pass + fallback)
- Public API of `matchEvent()` and `matchRaces()`
- All downstream processing (proposal creation, dashboard UI)

### Design principles

- **LLM is optional**: If not configured or API is down, behavior is identical to today
- **Same interfaces**: LLM results are converted to existing `RaceMatchResult` / `EventMatchResult` types
- **Incremental deployment**: Shadow mode first, then toggle on per phase
- **No new infrastructure**: Just HTTP calls to Anthropic API within existing pipeline

## Architecture

```
                          ┌─────────────────────────────────────────────┐
                          │              matchEvent()                    │
                          │                                             │
Input ──► Candidates ──► fuse.js scoring ──► score ≥ 0.95 ──► EXACT_MATCH
     (SQL/Meilisearch)                   ──► score < 0.30 ──► NO_MATCH
                                         ──► 0.30-0.95    ──► LLM Event Judge ──► Match/NoMatch
                                                               │ (fallback: fuse.js decision)
                          └─────────────────────────────────────────────┘

                          ┌─────────────────────────────────────────────┐
                          │              matchRaces()                    │
                          │                                             │
Proposed races ──► Has DB races? ──► YES ──► LLM Race Matcher ──► matched/unmatched
+ DB races                         ──► NO  ──► all new (no LLM needed)
                                               │ (fallback: distance-based matching)
                          └─────────────────────────────────────────────┘
```

## Phase 1: LLM Race Matcher

### When to call

- Edition has been matched (EDITION_UPDATE or RACE_UPDATE)
- There are proposed races AND existing races in the database
- LLM matching is enabled in config

### Prompt design

The prompt sends structured data about existing and proposed races, asking the LLM to identify correspondences:

```
Tu es un expert en événements sportifs. Pour l'édition {year} de "{eventName}" ({city}),
voici les courses existantes en base et les courses proposées par une source externe.

Identifie les correspondances : une course proposée peut être la même qu'une course existante
même si le nom ou la distance a légèrement changé d'une année sur l'autre.

COURSES EXISTANTES (base de données) :
1. [id:164478] Trail 8 km - 8km - départ 14:00 - TRAIL/DISCOVERY_TRAIL
2. [id:164480] Trail 25 km - 25km - D+800m - départ 09:00 - TRAIL/LONG_TRAIL
3. [id:164481] Trail 14 km - 14km - départ 10:30 - TRAIL/SHORT_TRAIL

COURSES PROPOSÉES (source externe) :
A. Trail du Lac 27 km - 27km - D+850m - départ 09:00 - TRAIL/LONG_TRAIL
B. Trail découverte 8 km - 8km - départ 14:00 - TRAIL/DISCOVERY_TRAIL
C. Défi 4x14 km à élimination - 56km - départ 22:00 - TRAIL/ULTRA_TRAIL

Réponds UNIQUEMENT en JSON valide :
{
  "matches": [
    { "proposedIndex": "A", "existingRaceId": 164480, "confidence": 0.9, "reason": "..." }
  ],
  "newRaces": [
    { "proposedIndex": "C", "reason": "..." }
  ]
}
```

### Expected LLM capabilities

The LLM can reason about things the current system cannot:
- "Trail 25 km" → "Trail du Lac 27 km": same category, similar distance, same time slot = same race reformatted
- "Défi 4x14 km à élimination" at 56km: relay format, no existing match = genuinely new
- Name changes with distance preserved: still the same race
- Distance changes with name preserved: still the same race
- Complete overhaul (new name + new distance): LLM can still match based on category + time slot + being the only race of that type

### Output conversion

LLM response is parsed and converted to the existing `RaceMatchResult` format:

```typescript
interface RaceMatchResult {
  matched: Array<{ input: RaceMatchInput, dbRace: DbRace, confidence: number }>
  unmatched: RaceMatchInput[]
}
```

- `matches[].existingRaceId` → lookup in dbRaces to build `dbRace` reference
- `newRaces[].proposedIndex` → added to `unmatched` array
- Any proposed race not mentioned in response → added to `unmatched` (safe default)

### Volume and cost

- ~11,500 EDITION_UPDATE with races per month
- ~800 input tokens + ~200 output tokens per call (Haiku 4.5)
- **~$12/month**

## Phase 2: LLM Event Judge

### When to call

- fuse.js score for best candidate is between 0.30 and 0.95
- LLM matching is enabled in config

### Prompt design

```
Tu es un expert en événements sportifs français. Un agent a trouvé un événement
et cherche s'il existe déjà dans notre base de données.

ÉVÉNEMENT CHERCHÉ :
- Nom : "Brooks Marathon Annecy 2026"
- Ville : Annecy
- Département : 74 (Haute-Savoie)
- Date : 2026-04-19

CANDIDATS TROUVÉS (triés par score de similarité textuelle) :
1. [id:2642] "Marathon du lac d'Annecy" - Annecy (74) - Édition 2025 le 2025-04-20 - score: 0.68
2. [id:8811] "Marathon d'Annemasse" - Annemasse (74) - Édition 2026 le 2026-03-15 - score: 0.52
3. [id:1203] "Brooks Running Festival" - Lyon (69) - Édition 2026 le 2026-05-03 - score: 0.41

Est-ce que l'événement cherché correspond à l'un des candidats ?

Réponds UNIQUEMENT en JSON valide :
{
  "match": { "eventId": 2642, "confidence": 0.92, "reason": "..." }
}
// OU
{
  "match": null,
  "reason": "..."
}
```

### Expected LLM capabilities

- Sponsor recognition: "Brooks Marathon Annecy" = "Marathon du lac d'Annecy" (Brooks is a sponsor)
- Location reasoning: same city + same department + similar date = likely same event
- Homonym handling: "Corrida de Noël" in dept 19 vs dept 56 = different events (no hand-tuned penalty needed)
- Date reasoning: edition 2025 on April 20 → edition 2026 likely around same date → April 19 matches

### Thresholds

- Score < 0.30 → NO_MATCH directly (no LLM call)
- Score ≥ 0.95 → EXACT_MATCH directly (no LLM call)
- Score 0.30-0.95 → LLM Event Judge

### Output conversion

LLM response updates the existing `EventMatchResult`:
- `match.eventId` → used to set `result.event` and `result.edition`
- `match.confidence` → used as `result.confidence`
- `match: null` → `result.type = 'NO_MATCH'`

### Volume and cost

- ~30% of 8,000 FFA matchings fall in gray zone = ~2,400/month
- ~600 input tokens + ~150 output tokens per call
- **~$2/month**

## Technical Integration

### New files

```
packages/agent-framework/src/services/event-matching/
├── event-matcher.ts          # Modified — calls LLM service when needed
├── types.ts                  # Modified — add LLMMatchingConfig
├── llm-matching.service.ts   # NEW — LLM API calls + response parsing
└── llm-prompts.ts            # NEW — prompt templates
```

### Configuration

Same pattern as Meilisearch:

```typescript
interface LLMMatchingConfig {
  apiKey: string
  model?: string          // default: 'claude-haiku-4-5-20251001'
  enabled?: boolean       // default: true
  maxCandidates?: number  // default: 5 (for event judge)
}
```

**API side**: `settingsService.getLLMMatchingConfig()`
**Agents side**: Environment variables `LLM_MATCHING_API_KEY`, `LLM_MATCHING_MODEL`, `LLM_MATCHING_ENABLED`

### LLM client

Uses the Anthropic SDK (already in project dependencies):

```typescript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: config.apiKey })
const response = await client.messages.create({
  model: config.model ?? 'claude-haiku-4-5-20251001',
  max_tokens: 1024,
  messages: [{ role: 'user', content: prompt }],
})
```

### Error handling

Every LLM call is wrapped in try/catch with a 10-second timeout:

```
LLM called → success → use LLM result
           → failure (timeout, API error, invalid JSON, rate limit) → use current result (fuse.js / distance)
```

No retries. Failure is logged and the existing matching result is used. The user never sees a difference.

### Logging

Each LLM call logs:
- Prompt summary (event name, number of candidates/races)
- Raw LLM response
- Response time (ms)
- Whether the result was used or fell back to current matching
- In shadow mode: comparison between LLM result and current result

## Testing Strategy

### Unit tests

- `LLMMatchingService` with mocked LLM responses (no real API calls in tests)
- Fallback behavior: verify that when LLM fails, result is identical to current behavior
- JSON parsing: verify malformed responses are handled gracefully
- Prompt building: verify prompts are correctly constructed from input data

### Shadow mode validation

Before enabling LLM as decision-maker:

1. Current matching runs normally and produces its result
2. LLM is called in parallel (fire-and-forget, no blocking)
3. Both results are logged, only current result is used
4. Divergences are analyzed to evaluate LLM quality

Metrics to track:
- False negatives recovered (LLM found a match that fuse.js missed)
- False positives avoided (LLM rejected a match that fuse.js accepted)
- Overall concordance rate
- Average response time

## Deployment Plan

| Step | What | Success criteria |
|------|------|------------------|
| 1 | Implement `LLMMatchingService` + prompts + unit tests | Tests pass, build passes |
| 2 | Shadow mode race matching — log LLM results without using them | 1 week of data collected |
| 3 | Analyze race matching divergences, adjust prompts if needed | >90% agreement on clear cases |
| 4 | Enable LLM race matching in production | Toggle `enabled: true` |
| 5 | Shadow mode event judge (gray zone) | 1 week of data collected |
| 6 | Enable LLM event judge in production | Toggle `enabled: true` |

Rollback at any step: set `LLM_MATCHING_ENABLED=false`.

## Cost Summary

| Component | Monthly volume | Cost/month |
|-----------|---------------|------------|
| Race matching (Haiku 4.5) | ~11,500 calls | ~$12 |
| Event judge (Haiku 4.5) | ~2,400 calls | ~$2 |
| **Total** | | **~$14/month** |

Scale-up option: Use Sonnet for the most ambiguous cases (score 0.40-0.70) if Haiku quality is insufficient. Marginal cost increase given low volume.

## Future Considerations

Once Phase 1 and 2 are stable:
- **Remove heuristic rules**: Department bonus, homonym penalty, temporal multiplier become unnecessary in the gray zone — the LLM handles them better
- **Full LLM scoring (Approach A)**: If results are good, consider replacing fuse.js entirely for all scoring
- **Correction tracking**: Log LLM decisions and manual corrections to build a dataset for future evaluation/fine-tuning
