-- Migration: Convert cron expressions to FrequencyConfig JSON
-- This migration converts the frequency column from String (cron) to Json (FrequencyConfig)

-- Step 1: Add the new columns
ALTER TABLE "agents" ADD COLUMN "nextRunAt" TIMESTAMP(3);
ALTER TABLE "agents" ADD COLUMN "frequency_new" JSONB;

-- Step 2: Convert existing cron expressions to FrequencyConfig
-- Default conversion: cron -> interval every 2h with 30min jitter (safe default)
UPDATE "agents" SET "frequency_new" =
  CASE
    -- "Toutes les 30 minutes" -> interval 30min ± 10min
    WHEN frequency = '*/30 * * * *' THEN '{"type": "interval", "intervalMinutes": 30, "jitterMinutes": 10}'::jsonb
    -- "Toutes les heures" -> interval 60min ± 15min
    WHEN frequency LIKE '0 * * * *' OR frequency LIKE '0 */1 * * *' THEN '{"type": "interval", "intervalMinutes": 60, "jitterMinutes": 15}'::jsonb
    -- "Toutes les 2 heures" -> interval 120min ± 30min
    WHEN frequency LIKE '0 */2 * * *' OR frequency LIKE '*/120 * * * *' THEN '{"type": "interval", "intervalMinutes": 120, "jitterMinutes": 30}'::jsonb
    -- "Toutes les 4 heures" -> interval 240min ± 60min
    WHEN frequency LIKE '0 */4 * * *' THEN '{"type": "interval", "intervalMinutes": 240, "jitterMinutes": 60}'::jsonb
    -- "Toutes les 6 heures" -> interval 360min ± 60min
    WHEN frequency LIKE '0 */6 * * *' THEN '{"type": "interval", "intervalMinutes": 360, "jitterMinutes": 60}'::jsonb
    -- "Tous les jours à minuit" -> daily 00:00-05:00
    WHEN frequency LIKE '0 0 * * *' THEN '{"type": "daily", "windowStart": "00:00", "windowEnd": "05:00"}'::jsonb
    -- "Tous les jours à 6h" -> daily 06:00-09:00
    WHEN frequency LIKE '0 6 * * *' THEN '{"type": "daily", "windowStart": "06:00", "windowEnd": "09:00"}'::jsonb
    -- "Lundi à 6h" -> weekly lundi 06:00-09:00
    WHEN frequency LIKE '0 6 * * 1' THEN '{"type": "weekly", "windowStart": "06:00", "windowEnd": "09:00", "daysOfWeek": [1]}'::jsonb
    -- "Dimanche à 2h" -> weekly dimanche 00:00-05:00
    WHEN frequency LIKE '0 2 * * 0' THEN '{"type": "weekly", "windowStart": "00:00", "windowEnd": "05:00", "daysOfWeek": [0]}'::jsonb
    -- "4 fois par jour" (8h, 12h, 16h, 20h) -> interval 4h ± 1h
    WHEN frequency LIKE '0 8,12,16,20 * * *' THEN '{"type": "interval", "intervalMinutes": 240, "jitterMinutes": 60}'::jsonb
    -- Default fallback: interval every 2h with 30min jitter
    ELSE '{"type": "interval", "intervalMinutes": 120, "jitterMinutes": 30}'::jsonb
  END;

-- Step 3: Drop old column and rename new one
ALTER TABLE "agents" DROP COLUMN "frequency";
ALTER TABLE "agents" RENAME COLUMN "frequency_new" TO "frequency";

-- Step 4: Add NOT NULL constraint
ALTER TABLE "agents" ALTER COLUMN "frequency" SET NOT NULL;
