# Design: Shared LLM Event Extractor

**Date**: 2026-03-23
**Context**: The FFA cheerio parser misinterprets ambiguous formats (e.g. "24h" as 24 meters). Moving to LLM-based extraction for competition detail pages, with a shared module reusable across agents.

## Problem

The FFA parser uses regex/cheerio to extract race data from HTML. This fails on:
- Ambiguous formats: "24h en équipe" interpreted as 24m distance
- Missing prices: the `price` field exists in Miles Republic but is never extracted
- Complex descriptions: relay races, multi-format events, unusual race names

Meanwhile, the Slack agent already has LLM-based extractors that produce similar data. The two systems should share extraction logic.

## Architecture

### New module: `packages/agent-framework/src/services/event-extraction/`

```
event-extraction/
├── index.ts                    # Public exports
├── types.ts                    # ExtractedEventData, ExtractedRace
├── llm-event-extractor.ts      # Main LLMEventExtractor class
├── extraction-prompts.ts       # Prompts and Anthropic tool schema
└── html-preprocessor.ts        # HTML cleanup before LLM (strip scripts, nav, etc.)
```

### Interface

```typescript
type ExtractionSource =
  | { type: 'html'; content: string }
  | { type: 'text'; content: string }
  | { type: 'image'; imageData: Buffer; mimeType: string }

interface ExtractionOptions {
  context?: string          // e.g. "Page FFA, compétition départementale"
  extraFields?: string[]    // e.g. ['raceDate'] for multi-day FFA events
  timeout?: number          // default: 15000ms
}

interface ExtractionResult {
  success: boolean
  data?: ExtractedEventData
  error?: string
}

class LLMEventExtractor {
  constructor(apiKey: string, options?: { model?: string, logger?: MatchingLogger })
  async extract(source: ExtractionSource, options?: ExtractionOptions): Promise<ExtractionResult>
}
```

### Types (moved from Slack extractors to shared location)

```typescript
interface ExtractedEventData {
  eventName: string
  eventCity?: string
  eventCountry?: string
  eventDepartment?: string
  editionYear?: number
  editionDate?: string        // ISO date
  editionEndDate?: string
  races?: ExtractedRace[]
  organizerName?: string
  organizerEmail?: string
  organizerPhone?: string
  organizerWebsite?: string
  registrationUrl?: string
  confidence: number
}

interface ExtractedRace {
  name: string
  distance?: number           // meters
  elevation?: number          // D+ meters
  startTime?: string          // HH:mm
  price?: number              // euros
  raceDate?: string           // DD/MM for multi-day events
  description?: string        // free text for special formats
  categoryLevel1?: string     // RUNNING, TRAIL, WALK, etc.
  categoryLevel2?: string     // MARATHON, ULTRA_TRAIL, etc.
}
```

### Tool schema (Anthropic tool use)

Single tool `extract_event_data` with structured JSON output. Uses `tool_choice: { type: 'tool', name: 'extract_event_data' }` for guaranteed structured output.

### HTML Preprocessor

Strips `<script>`, `<style>`, `<nav>`, `<header>`, `<footer>` to minimize tokens. Accepts optional CSS selector to extract specific sections (e.g. `#epreuves` for FFA pages).

### Prompts

Adapted from existing Slack `EXTRACTION_PROMPT_SYSTEM` and `buildExtractionPrompt`. Key improvements:
- Tool use instead of free-form JSON (more reliable)
- `context` parameter for agent-specific instructions
- Better handling of special formats (relay races, timed events, etc.)

## FFA Integration

In `apps/agents/src/ffa/`:
- `parseCompetitionDetails()` replaced by `LLMEventExtractor.extract({ type: 'html', content })`
- Result mapped from `ExtractedEventData` → `FFACompetitionDetails` (existing FFA interface)
- Fallback to existing cheerio parser on LLM failure
- `parseCompetitionsList()` (calendar listing) unchanged — stays cheerio

## Price field propagation

- `FFARace` → add `price?: number`
- `ProposalRaceInput` (`@data-agents/types`) → add `price?: number`
- `proposal-builder.ts` → include `price` in race changes
- `proposal-domain.service.ts` → map `price` when applying proposals

## Configuration

- API key: reuses `LLM_MATCHING_API_KEY` / `settings.llmMatchingApiKey`
- Model: `claude-haiku-4-5-20251001`
- Timeout: 15s per call

## Cost estimate

- ~200 pages/active day, ~10 active days/month
- ~3,500 input tokens + ~200 output tokens per call
- **~$9/month** with Haiku pricing

## Future: Slack extractor migration

Not in this iteration. The module is designed for it:
- `HtmlExtractor` → `extractor.extract({ type: 'html', content })`
- `TextExtractor` → `extractor.extract({ type: 'text', content })`
- `ImageExtractor` → `extractor.extract({ type: 'image', imageData, mimeType })`
