# Stats Sport Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich dashboard statistics with sport type differentiation (Running/Trail, Triathlon, Cycling, Others) using dominant sport per edition.

**Architecture:** Raw SQL queries with `$queryRawUnsafe` on the Miles Republic Prisma client determine the dominant sport per edition via a CTE + GROUP BY. Frontend uses Recharts with per-chart sport filter dropdown. New constants file for sport group mapping.

**Tech Stack:** Express.js (backend), PostgreSQL raw SQL, React + Recharts + MUI (frontend), React Query (data fetching)

**Spec:** `docs/superpowers/specs/2026-03-30-stats-sport-breakdown-design.md`

---

### Task 1: Sport constants (shared)

**Files:**
- Create: `apps/dashboard/src/constants/sports.ts`
- Modify: `apps/dashboard/src/constants/index.ts`

- [ ] **Step 1: Create sport constants file**

Create `apps/dashboard/src/constants/sports.ts`:

```typescript
export const SPORT_GROUPS = {
  running_trail: { label: 'Course à pied / Trail', color: '#3b82f6' },
  triathlon: { label: 'Triathlon', color: '#f59e0b' },
  cycling: { label: 'Cyclisme', color: '#22c55e' },
  other: { label: 'Autres', color: '#8b5cf6' },
} as const

export type SportGroup = keyof typeof SPORT_GROUPS

export const SPORT_GROUP_KEYS = Object.keys(SPORT_GROUPS) as SportGroup[]
```

- [ ] **Step 2: Export from index**

In `apps/dashboard/src/constants/index.ts`, add:

```typescript
export * from './sports'
```

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/constants/sports.ts apps/dashboard/src/constants/index.ts
git commit -m "feat(stats): add sport group constants"
```

---

### Task 2: Backend — Sport helper + calendar-confirmations endpoint

**Files:**
- Modify: `apps/api/src/routes/stats.ts` (lines 1-228)

- [ ] **Step 1: Add sport mapping and SQL helper at the top of stats.ts**

After line 7 (`const prisma = new PrismaClient()`), add:

```typescript
// Sport group mapping: categoryLevel1 → sport group key
const SPORT_GROUP_SQL_CASE = `
  CASE
    WHEN dominant_sport IN ('RUNNING', 'TRAIL', 'WALK') THEN 'running_trail'
    WHEN dominant_sport = 'TRIATHLON' THEN 'triathlon'
    WHEN dominant_sport = 'CYCLING' THEN 'cycling'
    ELSE 'other'
  END
`

const ALL_SPORT_GROUPS = ['running_trail', 'triathlon', 'cycling', 'other'] as const

/**
 * Sous-requête SQL pour déterminer le sport dominant d'une édition.
 * Retourne le categoryLevel1 le plus fréquent parmi les courses de l'édition.
 */
const DOMINANT_SPORT_SUBQUERY = `
  COALESCE(
    (SELECT r."categoryLevel1"
     FROM "Race" r
     WHERE r."editionId" = e.id
     GROUP BY r."categoryLevel1"
     ORDER BY COUNT(*) DESC, r."categoryLevel1" ASC
     LIMIT 1),
    'OTHER'
  )
`

type SportGroupKey = typeof ALL_SPORT_GROUPS[number]

/**
 * Initialise un objet avec tous les groupes sport à 0
 */
function emptySportCounts(): Record<SportGroupKey, number> {
  return { running_trail: 0, triathlon: 0, cycling: 0, other: 0 }
}
```

- [ ] **Step 2: Rewrite calendar-confirmations endpoint with sport support**

Replace the existing `router.get('/calendar-confirmations', ...)` handler (lines 173-228) with:

```typescript
router.get('/calendar-confirmations', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date()
    const granularity = (req.query.granularity as TimeGranularity) || 'month'
    const sportFilter = req.query.sport as SportGroupKey | undefined

    const sourceDb = await getMilesRepublicConnection()
    const endPeriodBoundary = getNextPeriodStart(endDate, granularity)
    const intervals = generateTimeIntervals(startDate, endDate, granularity)
    const results = []

    for (let i = 0; i < intervals.length; i++) {
      const currentDate = intervals[i]
      const nextDate = intervals[i + 1] || endPeriodBoundary

      if (sportFilter) {
        // Filtered mode: return count for selected sport only
        const rows: any[] = await sourceDb.$queryRawUnsafe(`
          WITH edition_sports AS (
            SELECT e.id,
              ${DOMINANT_SPORT_SUBQUERY} as dominant_sport
            FROM "Edition" e
            WHERE e."calendarStatus" = 'CONFIRMED'
              AND e."confirmedAt" >= $1
              AND e."confirmedAt" < $2
          )
          SELECT COUNT(*)::int as count
          FROM edition_sports
          WHERE ${SPORT_GROUP_SQL_CASE} = $3
        `, currentDate, nextDate, sportFilter)

        results.push({
          date: formatDateLabel(currentDate, granularity),
          count: rows[0]?.count || 0,
          timestamp: currentDate.toISOString()
        })
      } else {
        // Default mode: return breakdown by sport group
        const rows: any[] = await sourceDb.$queryRawUnsafe(`
          WITH edition_sports AS (
            SELECT e.id,
              ${DOMINANT_SPORT_SUBQUERY} as dominant_sport
            FROM "Edition" e
            WHERE e."calendarStatus" = 'CONFIRMED'
              AND e."confirmedAt" >= $1
              AND e."confirmedAt" < $2
          )
          SELECT ${SPORT_GROUP_SQL_CASE} as sport_group, COUNT(*)::int as count
          FROM edition_sports
          GROUP BY sport_group
        `, currentDate, nextDate)

        const counts = emptySportCounts()
        let total = 0
        for (const row of rows) {
          const key = row.sport_group as SportGroupKey
          if (key in counts) {
            counts[key] = row.count
            total += row.count
          }
        }

        results.push({
          date: formatDateLabel(currentDate, granularity),
          ...counts,
          total,
          timestamp: currentDate.toISOString()
        })
      }
    }

    res.json({
      success: true,
      data: { startDate: startDate.toISOString(), endDate: endDate.toISOString(), granularity, results }
    })
  } catch (error) {
    console.error('Error fetching calendar confirmations stats:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch calendar confirmations statistics',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})
```

- [ ] **Step 3: Verify API starts without errors**

Run: Open the browser to `http://localhost:3001/api/stats/calendar-confirmations?granularity=month` and confirm JSON response with sport groups. Also test with `?sport=running_trail`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/stats.ts
git commit -m "feat(stats): add sport breakdown to calendar-confirmations endpoint"
```

---

### Task 3: Backend — pending-confirmations endpoint with sport support

**Files:**
- Modify: `apps/api/src/routes/stats.ts` (lines 230-309, the `pending-confirmations` route)

- [ ] **Step 1: Rewrite pending-confirmations endpoint**

Replace the existing `router.get('/pending-confirmations', ...)` handler with:

```typescript
router.get('/pending-confirmations', async (req, res) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date()
    const granularity = (req.query.granularity as TimeGranularity) || 'month'
    const sportFilter = req.query.sport as SportGroupKey | undefined

    const sourceDb = await getMilesRepublicConnection()
    const endPeriodBoundary = getNextPeriodStart(endDate, granularity)
    const intervals = generateTimeIntervals(startDate, endDate, granularity)
    const now = new Date()
    const results = []

    for (let i = 0; i < intervals.length; i++) {
      const currentDate = intervals[i]
      const nextDate = intervals[i + 1] || endPeriodBoundary

      if (sportFilter) {
        // Filtered mode: return confirmed/toBeConfirmed for selected sport
        const rows: any[] = await sourceDb.$queryRawUnsafe(`
          WITH edition_sports AS (
            SELECT e.id, e."calendarStatus",
              ${DOMINANT_SPORT_SUBQUERY} as dominant_sport
            FROM "Edition" e
            WHERE e."startDate" >= $1
              AND e."startDate" >= $2
              AND e."startDate" < $3
              AND e."calendarStatus" IN ('CONFIRMED', 'TO_BE_CONFIRMED')
          )
          SELECT
            "calendarStatus",
            COUNT(*)::int as count
          FROM edition_sports
          WHERE ${SPORT_GROUP_SQL_CASE} = $4
          GROUP BY "calendarStatus"
        `, now, currentDate, nextDate, sportFilter)

        let confirmed = 0
        let toBeConfirmed = 0
        for (const row of rows) {
          if (row.calendarStatus === 'CONFIRMED') confirmed = row.count
          if (row.calendarStatus === 'TO_BE_CONFIRMED') toBeConfirmed = row.count
        }

        results.push({
          date: formatDateLabel(currentDate, granularity),
          confirmed,
          toBeConfirmed,
          total: confirmed + toBeConfirmed,
          timestamp: currentDate.toISOString()
        })
      } else {
        // Default mode: grouped+stacked by sport
        const rows: any[] = await sourceDb.$queryRawUnsafe(`
          WITH edition_sports AS (
            SELECT e.id, e."calendarStatus",
              ${DOMINANT_SPORT_SUBQUERY} as dominant_sport
            FROM "Edition" e
            WHERE e."startDate" >= $1
              AND e."startDate" >= $2
              AND e."startDate" < $3
              AND e."calendarStatus" IN ('CONFIRMED', 'TO_BE_CONFIRMED')
          )
          SELECT
            ${SPORT_GROUP_SQL_CASE} as sport_group,
            "calendarStatus",
            COUNT(*)::int as count
          FROM edition_sports
          GROUP BY sport_group, "calendarStatus"
        `, now, currentDate, nextDate)

        const dataPoint: any = {
          date: formatDateLabel(currentDate, granularity),
          timestamp: currentDate.toISOString()
        }

        let total = 0
        for (const group of ALL_SPORT_GROUPS) {
          dataPoint[`${group}_confirmed`] = 0
          dataPoint[`${group}_toBeConfirmed`] = 0
        }

        for (const row of rows) {
          const group = row.sport_group as SportGroupKey
          if (row.calendarStatus === 'CONFIRMED') {
            dataPoint[`${group}_confirmed`] = row.count
          } else if (row.calendarStatus === 'TO_BE_CONFIRMED') {
            dataPoint[`${group}_toBeConfirmed`] = row.count
          }
          total += row.count
        }

        dataPoint.total = total
        results.push(dataPoint)
      }
    }

    res.json({
      success: true,
      data: { startDate: startDate.toISOString(), endDate: endDate.toISOString(), granularity, results }
    })
  } catch (error) {
    console.error('Error fetching pending confirmations stats:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending confirmations statistics',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})
```

- [ ] **Step 2: Verify API**

Test `http://localhost:3001/api/stats/pending-confirmations?granularity=month` — should return grouped data with `running_trail_confirmed`, `running_trail_toBeConfirmed`, etc.

Test `http://localhost:3001/api/stats/pending-confirmations?granularity=month&sport=triathlon` — should return legacy format with `confirmed`/`toBeConfirmed`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/stats.ts
git commit -m "feat(stats): add sport breakdown to pending-confirmations endpoint"
```

---

### Task 4: Backend — New confirmation-rate-by-sport endpoint

**Files:**
- Modify: `apps/api/src/routes/stats.ts` (add new route before the `export`)

- [ ] **Step 1: Add the new endpoint**

Before the final `export { router as statsRouter }` line, add:

```typescript
/**
 * GET /api/stats/confirmation-rate-by-sport
 * Snapshot: taux de confirmation des éditions futures par groupe sport
 */
router.get('/confirmation-rate-by-sport', async (req, res) => {
  try {
    const sourceDb = await getMilesRepublicConnection()
    const now = new Date()

    const SPORT_LABELS: Record<SportGroupKey, string> = {
      running_trail: 'Course à pied / Trail',
      triathlon: 'Triathlon',
      cycling: 'Cyclisme',
      other: 'Autres',
    }

    const rows: any[] = await sourceDb.$queryRawUnsafe(`
      WITH edition_sports AS (
        SELECT e.id, e."calendarStatus",
          ${DOMINANT_SPORT_SUBQUERY} as dominant_sport
        FROM "Edition" e
        WHERE e."startDate" >= $1
          AND e."calendarStatus" IN ('CONFIRMED', 'TO_BE_CONFIRMED')
      )
      SELECT
        ${SPORT_GROUP_SQL_CASE} as sport_group,
        "calendarStatus",
        COUNT(*)::int as count
      FROM edition_sports
      GROUP BY sport_group, "calendarStatus"
    `, now)

    // Aggregate into sport groups
    const sportData: Record<SportGroupKey, { confirmed: number; toBeConfirmed: number }> = {
      running_trail: { confirmed: 0, toBeConfirmed: 0 },
      triathlon: { confirmed: 0, toBeConfirmed: 0 },
      cycling: { confirmed: 0, toBeConfirmed: 0 },
      other: { confirmed: 0, toBeConfirmed: 0 },
    }

    for (const row of rows) {
      const group = row.sport_group as SportGroupKey
      if (!(group in sportData)) continue
      if (row.calendarStatus === 'CONFIRMED') {
        sportData[group].confirmed = row.count
      } else if (row.calendarStatus === 'TO_BE_CONFIRMED') {
        sportData[group].toBeConfirmed = row.count
      }
    }

    const results = ALL_SPORT_GROUPS.map(sport => {
      const data = sportData[sport]
      const total = data.confirmed + data.toBeConfirmed
      return {
        sport,
        label: SPORT_LABELS[sport],
        confirmed: data.confirmed,
        toBeConfirmed: data.toBeConfirmed,
        total,
        rate: total > 0 ? Math.round((data.confirmed / total) * 1000) / 10 : 0
      }
    })

    res.json({ success: true, data: { results } })
  } catch (error) {
    console.error('Error fetching confirmation rate by sport:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch confirmation rate by sport',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})
```

- [ ] **Step 2: Verify API**

Test `http://localhost:3001/api/stats/confirmation-rate-by-sport` — should return 4 sport groups with confirmed/toBeConfirmed/rate.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/stats.ts
git commit -m "feat(stats): add confirmation-rate-by-sport endpoint"
```

---

### Task 5: Frontend — API client + hooks

**Files:**
- Modify: `apps/dashboard/src/services/api.ts` (lines 761-834)
- Modify: `apps/dashboard/src/hooks/useApi.ts` (lines 1170-1215)

- [ ] **Step 1: Update statsApi in api.ts**

Replace the `statsApi` object (lines 761-834) with:

```typescript
export type SportGroup = 'running_trail' | 'triathlon' | 'cycling' | 'other'

export const statsApi = {
  getCalendarConfirmations: (filters: {
    startDate?: string
    endDate?: string
    granularity?: 'day' | 'week' | 'month' | 'quarter' | 'year'
    sport?: SportGroup
  } = {}): Promise<ApiResponse<{
    startDate: string
    endDate: string
    granularity: string
    results: Array<Record<string, any>>
  }>> =>
    api.get('/stats/calendar-confirmations', { params: filters }).then(res => res.data),

  getPendingConfirmations: (filters: {
    startDate?: string
    endDate?: string
    granularity?: 'day' | 'week' | 'month' | 'quarter' | 'year'
    sport?: SportGroup
  } = {}): Promise<ApiResponse<{
    startDate: string
    endDate: string
    granularity: string
    results: Array<Record<string, any>>
  }>> =>
    api.get('/stats/pending-confirmations', { params: filters }).then(res => res.data),

  getProposalsCreated: (filters: {
    startDate?: string
    endDate?: string
    granularity?: 'day' | 'week' | 'month' | 'quarter' | 'year'
  } = {}): Promise<ApiResponse<{
    startDate: string
    endDate: string
    granularity: string
    results: Array<{
      date: string
      timestamp: string
      total: number
      NEW_EVENT: number
      EVENT_UPDATE: number
      EDITION_UPDATE: number
      RACE_UPDATE: number
    }>
  }>> =>
    api.get('/stats/proposals-created', { params: filters }).then(res => res.data),

  getUserLeaderboard: (filters: {
    startDate?: string
    endDate?: string
  } = {}): Promise<ApiResponse<{
    startDate: string
    endDate: string
    leaderboard: Array<{
      userId: string
      firstName: string
      lastName: string
      email: string
      approved: number
      rejected: number
      archived: number
      total: number
    }>
  }>> =>
    api.get('/stats/user-leaderboard', { params: filters }).then(res => res.data),

  getConfirmationRateBySport: (): Promise<ApiResponse<{
    results: Array<{
      sport: string
      label: string
      confirmed: number
      toBeConfirmed: number
      total: number
      rate: number
    }>
  }>> =>
    api.get('/stats/confirmation-rate-by-sport').then(res => res.data),
}
```

- [ ] **Step 2: Update hooks in useApi.ts**

Replace the stats hooks (lines 1170-1215) with:

```typescript
export const useCalendarConfirmations = (filters: {
  startDate?: string
  endDate?: string
  granularity?: 'day' | 'week' | 'month' | 'quarter' | 'year'
  sport?: SportGroup
} = {}) => {
  return useQuery({
    queryKey: ['stats', 'calendar-confirmations', filters],
    queryFn: () => statsApi.getCalendarConfirmations(filters),
    staleTime: 300000,
  })
}

export const usePendingConfirmations = (filters: {
  startDate?: string
  endDate?: string
  granularity?: 'day' | 'week' | 'month' | 'quarter' | 'year'
  sport?: SportGroup
} = {}) => {
  return useQuery({
    queryKey: ['stats', 'pending-confirmations', filters],
    queryFn: () => statsApi.getPendingConfirmations(filters),
    staleTime: 300000,
  })
}

export const useProposalsCreated = (filters: {
  startDate?: string
  endDate?: string
  granularity?: 'day' | 'week' | 'month' | 'quarter' | 'year'
} = {}) => {
  return useQuery({
    queryKey: ['stats', 'proposals-created', filters],
    queryFn: () => statsApi.getProposalsCreated(filters),
    staleTime: 300000,
  })
}

export const useUserLeaderboard = (filters: {
  startDate?: string
  endDate?: string
} = {}) => {
  return useQuery({
    queryKey: ['stats', 'user-leaderboard', filters],
    queryFn: () => statsApi.getUserLeaderboard(filters),
    staleTime: 300000,
  })
}

export const useConfirmationRateBySport = () => {
  return useQuery({
    queryKey: ['stats', 'confirmation-rate-by-sport'],
    queryFn: () => statsApi.getConfirmationRateBySport(),
    staleTime: 300000,
  })
}
```

Also add the import for `SportGroup` at the top of `useApi.ts`:

```typescript
import type { SportGroup } from '@/constants/sports'
```

Note: `statsApi` should already be imported from `@/services/api`. Only add the `SportGroup` type import from constants.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/services/api.ts apps/dashboard/src/hooks/useApi.ts
git commit -m "feat(stats): update API client and hooks for sport breakdown"
```

---

### Task 6: Frontend — SportFilterSelect component

**Files:**
- Create: `apps/dashboard/src/components/stats/SportFilterSelect.tsx`

- [ ] **Step 1: Create the shared sport filter dropdown**

```tsx
import React from 'react'
import { FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import { SPORT_GROUPS, type SportGroup } from '@/constants/sports'

interface SportFilterSelectProps {
  value: SportGroup | ''
  onChange: (value: SportGroup | '') => void
}

const SportFilterSelect: React.FC<SportFilterSelectProps> = ({ value, onChange }) => {
  return (
    <FormControl size="small" sx={{ minWidth: 200 }}>
      <InputLabel>Sport</InputLabel>
      <Select
        value={value}
        label="Sport"
        onChange={(e) => onChange(e.target.value as SportGroup | '')}
      >
        <MenuItem value="">Tous les sports</MenuItem>
        {(Object.entries(SPORT_GROUPS) as [SportGroup, typeof SPORT_GROUPS[SportGroup]][]).map(
          ([key, { label }]) => (
            <MenuItem key={key} value={key}>
              {label}
            </MenuItem>
          )
        )}
      </Select>
    </FormControl>
  )
}

export default SportFilterSelect
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/components/stats/SportFilterSelect.tsx
git commit -m "feat(stats): add SportFilterSelect component"
```

---

### Task 7: Frontend — Calendar confirmations chart with sport lines

**Files:**
- Modify: `apps/dashboard/src/pages/Statistics.tsx`

This task modifies the first chart (confirmations calendrier). The chart currently uses a single `Line` with `dataKey="Confirmations"`.

- [ ] **Step 1: Add sport filter state and import**

At the top of `Statistics.tsx`, add imports:

```typescript
import SportFilterSelect from '@/components/stats/SportFilterSelect'
import { SPORT_GROUPS, SPORT_GROUP_KEYS, type SportGroup } from '@/constants/sports'
import { useConfirmationRateBySport } from '@/hooks/useApi'
```

Inside the component, after the existing `confirmationsEndDate` state (line 58), add:

```typescript
const [confirmationsSport, setConfirmationsSport] = useState<SportGroup | ''>('')
```

- [ ] **Step 2: Pass sport filter to hook**

Update the `useCalendarConfirmations` call to include the sport filter:

```typescript
const { data: confirmationsData, isLoading: confirmationsLoading } = useCalendarConfirmations({
  startDate: confirmationsStartDate,
  endDate: confirmationsEndDate,
  granularity: confirmationsGranularity,
  ...(confirmationsSport ? { sport: confirmationsSport } : {})
})
```

- [ ] **Step 3: Update chart data mapping**

Replace the existing `confirmationsChartData` useMemo (lines 111-117) with:

```typescript
const confirmationsChartData = useMemo(() => {
  if (!confirmationsData?.data?.results) return []
  return confirmationsData.data.results
}, [confirmationsData])
```

The data is already in the right format from the API — either `{ date, count }` when filtered, or `{ date, running_trail, triathlon, cycling, other, total }` when not.

- [ ] **Step 4: Add sport filter to chart header and update chart rendering**

In the filter `Box` for confirmations (after the granularity `FormControl`, around line 190), add:

```tsx
<SportFilterSelect
  value={confirmationsSport}
  onChange={setConfirmationsSport}
/>
```

Replace the `LineChart` rendering block (lines 201-216) with:

```tsx
<ResponsiveContainer width="100%" height={300}>
  <LineChart data={confirmationsChartData}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="date" />
    <YAxis />
    <Tooltip />
    <Legend />
    {confirmationsSport ? (
      <Line
        type="monotone"
        dataKey="count"
        stroke={SPORT_GROUPS[confirmationsSport].color}
        strokeWidth={2}
        name={SPORT_GROUPS[confirmationsSport].label}
        activeDot={{ r: 8 }}
      />
    ) : (
      SPORT_GROUP_KEYS.map(key => (
        <Line
          key={key}
          type="monotone"
          dataKey={key}
          stroke={SPORT_GROUPS[key].color}
          strokeWidth={2}
          name={SPORT_GROUPS[key].label}
          activeDot={{ r: 6 }}
        />
      ))
    )}
  </LineChart>
</ResponsiveContainer>
```

- [ ] **Step 5: Verify in browser**

Open the Statistics page. The confirmations chart should show 4 colored lines by default. Selecting a sport should show a single line.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/pages/Statistics.tsx
git commit -m "feat(stats): calendar confirmations chart with sport lines"
```

---

### Task 8: Frontend — Pending confirmations chart (grouped + stacked)

**Files:**
- Modify: `apps/dashboard/src/pages/Statistics.tsx`

- [ ] **Step 1: Add sport filter state for pending chart**

After the existing `pendingEndDate` state (around line 67), add:

```typescript
const [pendingSport, setPendingSport] = useState<SportGroup | ''>('')
```

- [ ] **Step 2: Pass sport filter to hook**

Update the `usePendingConfirmations` call:

```typescript
const { data: pendingData, isLoading: pendingLoading } = usePendingConfirmations({
  startDate: pendingStartDate,
  endDate: pendingEndDate,
  granularity: pendingGranularity,
  ...(pendingSport ? { sport: pendingSport } : {})
})
```

- [ ] **Step 3: Update chart data mapping**

Replace the existing `pendingChartData` useMemo (lines 119-127) with:

```typescript
const pendingChartData = useMemo(() => {
  if (!pendingData?.data?.results) return []
  return pendingData.data.results
}, [pendingData])
```

- [ ] **Step 4: Add sport filter and update chart rendering**

Add the sport filter dropdown in the pending chart header (after granularity Select):

```tsx
<SportFilterSelect
  value={pendingSport}
  onChange={setPendingSport}
/>
```

Replace the `BarChart` rendering block (lines 271-296) with:

```tsx
<ResponsiveContainer width="100%" height={350}>
  <BarChart data={pendingChartData}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="date" />
    <YAxis />
    <Tooltip />
    <Legend />
    {pendingSport ? (
      <>
        <Bar
          dataKey="confirmed"
          stackId="a"
          fill="#22c55e"
          name="Confirmées"
        />
        <Bar
          dataKey="toBeConfirmed"
          stackId="a"
          fill="#f59e0b"
          name="À confirmer"
        >
          <LabelList
            dataKey="total"
            position="top"
            style={{ fill: theme.palette.text.primary, fontWeight: 'bold', fontSize: 12 }}
          />
        </Bar>
      </>
    ) : (
      SPORT_GROUP_KEYS.flatMap(key => [
        <Bar
          key={`${key}_confirmed`}
          dataKey={`${key}_confirmed`}
          stackId={key}
          fill={SPORT_GROUPS[key].color}
          name={`${SPORT_GROUPS[key].label} (confirmées)`}
        />,
        <Bar
          key={`${key}_toBeConfirmed`}
          dataKey={`${key}_toBeConfirmed`}
          stackId={key}
          fill={SPORT_GROUPS[key].color}
          fillOpacity={0.4}
          name={`${SPORT_GROUPS[key].label} (à confirmer)`}
        />
      ])
    )}
  </BarChart>
</ResponsiveContainer>
```

- [ ] **Step 5: Verify in browser**

The chart should show 4 grouped mini-bars per period, each stacked confirmed/à confirmer. Selecting a sport should show a single stacked bar (green/orange) like the original.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/pages/Statistics.tsx
git commit -m "feat(stats): pending confirmations grouped+stacked by sport"
```

---

### Task 9: Frontend — New confirmation rate by sport chart

**Files:**
- Modify: `apps/dashboard/src/pages/Statistics.tsx`

- [ ] **Step 1: Add the hook call**

Inside the component, after the existing `usePendingConfirmations` call, add:

```typescript
const { data: rateData, isLoading: rateLoading } = useConfirmationRateBySport()
```

- [ ] **Step 2: Add chart data mapping**

After the existing `pendingChartData` useMemo, add:

```typescript
const rateChartData = useMemo(() => {
  if (!rateData?.data?.results) return []
  return rateData.data.results
}, [rateData])
```

- [ ] **Step 3: Add the horizontal bar chart**

Between the "Éditions futures par statut" card and the "Propositions créées" card, add:

```tsx
{/* Taux de confirmation par sport */}
<Card sx={{ mb: 4 }}>
  <CardContent>
    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
      <TrendingUpIcon sx={{ mr: 1 }} />
      Taux de confirmation par sport
    </Typography>

    {rateLoading ? (
      <LinearProgress />
    ) : rateChartData.length === 0 ? (
      <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
        Aucune donnée disponible
      </Typography>
    ) : (
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={rateChartData} layout="vertical" margin={{ left: 140, right: 80 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
          <YAxis type="category" dataKey="label" width={130} />
          <Tooltip
            formatter={(value: number, name: string) => [
              `${value}%`,
              name === 'rate_confirmed' ? 'Confirmées' : 'À confirmer'
            ]}
          />
          <Bar
            dataKey="rate"
            fill="#22c55e"
            name="rate_confirmed"
            stackId="rate"
          >
            <LabelList
              formatter={(value: number) => `${value}%`}
              position="center"
              style={{ fill: '#fff', fontWeight: 'bold', fontSize: 12 }}
            />
          </Bar>
          <Bar
            dataKey={(entry: any) => Math.round((100 - entry.rate) * 10) / 10}
            fill="#f59e0b"
            name="rate_toBeConfirmed"
            stackId="rate"
          >
            <LabelList
              content={({ x, y, width, height, index }: any) => {
                if (!rateChartData[index]) return null
                const entry = rateChartData[index]
                return (
                  <text
                    x={(x as number) + (width as number) + 8}
                    y={(y as number) + (height as number) / 2}
                    dominantBaseline="middle"
                    style={{ fill: theme.palette.text.primary, fontSize: 12 }}
                  >
                    {entry.confirmed}/{entry.total}
                  </text>
                )
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )}
  </CardContent>
</Card>
```

- [ ] **Step 4: Verify in browser**

The new chart should appear between "Éditions futures" and "Propositions créées". 4 horizontal bars, each stacked 100% with confirmed (green) / à confirmer (orange), percentage label centered, and absolute count on the right.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/pages/Statistics.tsx
git commit -m "feat(stats): add confirmation rate by sport horizontal chart"
```

---

### Task 10: Final verification and cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run TypeScript check**

Run: `npm run tsc`
Expected: No errors

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: No errors (or only pre-existing warnings)

- [ ] **Step 3: Full browser test**

Verify all 3 charts on the Statistics page:
1. Confirmations calendrier — 4 lines by default, 1 line with sport filter
2. Éditions futures — 4 grouped+stacked bars by default, 1 stacked bar with sport filter
3. Taux de confirmation — 4 horizontal bars, always visible

Verify the other 2 charts (propositions créées, leaderboard) are unchanged.

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore(stats): cleanup and final adjustments"
```
