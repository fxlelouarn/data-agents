# Design: Matching Fixes — LLM rejectedMatches, Organizer Context, Department Inference

**Date**: 2026-03-23
**Context**: A "Goat Trail" proposal from Slack was classified as NEW_EVENT despite an existing "Goat trail" in a nearby city. Investigation revealed 3 issues.

## Problem

1. **LLM NO_MATCH loses rejectedMatches**: When the LLM event judge returns NO_MATCH, `event-matcher.ts` returns `{ type: 'NO_MATCH', confidence: 0 }` without `rejectedMatches`, losing all traceability of which candidates were considered.

2. **LLM lacks organizer context**: The LLM judge prompt receives name, city, department, and date — but not the organizer name. Two events with identical names in different cities but the same organizer are likely the same event that moved venues.

3. **Department not inferred for Slack proposals**: The Slack extractors can extract `eventDepartment` from content, but often it's absent. When missing, the proposal lacks `countrySubdivisionDisplayCodeLevel2` which is required for the catalogue display. A geocoding lookup can infer it from the city name.

## Fix 1: Preserve rejectedMatches on LLM NO_MATCH

**File**: `packages/agent-framework/src/services/event-matching/event-matcher.ts`

In the LLM NO_MATCH branch (line ~374), build `rejectedMatches` from `scoredCandidates` before returning, same as the existing logic at lines 391-407.

## Fix 2: Pass organizer info to LLM judge

**Files**:
- `packages/agent-framework/src/services/event-matching/types.ts` — add `organizerName?: string` to `EventMatchInput`
- `packages/agent-framework/src/services/event-matching/llm-prompts.ts` — add `inputOrganizer?: string` param to `buildEventJudgePrompt`, include in prompt if present
- `packages/agent-framework/src/services/event-matching/llm-matching.service.ts` — add `inputOrganizer?: string` param to `judgeEventMatchWithLLM`, pass to prompt builder
- `packages/agent-framework/src/services/event-matching/event-matcher.ts` — pass `input.organizerName` through to the LLM judge call
- `apps/api/src/services/slack/SlackProposalService.ts` — populate `organizerName` in `extractedDataToMatchInput`
- `apps/agents/src/FFAScraperAgent.ts` — populate `organizerName` in match input if available

## Fix 3: Infer department via Meilisearch geonames

**New file**: `packages/agent-framework/src/services/event-matching/geo-lookup.ts`
- `lookupDepartmentFromCity(city: string, meilisearchConfig: MeilisearchMatchingConfig): Promise<string | undefined>`
- Queries Meilisearch index `geonames` with the city name
- Returns `admin2 code` from first hit (department code)
- Silent fallback on error (returns undefined)

**Integration in proposal builder**: `packages/agent-framework/src/services/proposal-builder/proposal-builder.ts`
- Add optional `meilisearchConfig` parameter to `buildNewEventChanges`
- If `countrySubdivisionDisplayCodeLevel2` is missing but `eventCity` is present and Meilisearch is configured, call `lookupDepartmentFromCity` to infer it
- Set both `countrySubdivisionDisplayCodeLevel2` and `countrySubdivisionNameLevel2` from the lookup

**Callers**: Pass Meilisearch config when calling `buildNewEventChanges` (Slack agent, FFA agent already has department).

**Department name mapping**: Need a simple `getDepartmentName(code)` lookup (already exists in FFA agent — reuse or extract to shared location).
