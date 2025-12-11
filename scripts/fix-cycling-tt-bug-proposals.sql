-- Script de correction des propositions avec courses CYCLING incorrectes
-- Bug: le pattern 'tt' dans inferRaceCategories() matchait tous les mots contenant "tt"
-- Ex: "marmottons", "raquette" étaient catégorisés en CYCLING/TIME_TRIAL
--
-- Date: 2025-12-10
-- Ticket: Bug fix - courses vélo dans propositions FFA

-- ============================================================================
-- ÉTAPE 1: DIAGNOSTIC - Lister les propositions affectées
-- ============================================================================

-- Propositions PENDING avec des racesToAdd contenant CYCLING
SELECT
    id,
    "eventName",
    "editionYear",
    status,
    jsonb_array_length(changes->'racesToAdd'->'new') as nb_races_to_add,
    (
        SELECT COUNT(*)::int
        FROM jsonb_array_elements(changes->'racesToAdd'->'new') as race
        WHERE race->>'categoryLevel1' = 'CYCLING'
    ) as nb_cycling_races
FROM proposals
WHERE
    status = 'PENDING'
    AND changes->'racesToAdd'->'new' IS NOT NULL
    AND changes::text LIKE '%"categoryLevel1": "CYCLING"%'
ORDER BY "eventName";

-- ============================================================================
-- ÉTAPE 2: ARCHIVER les propositions corrompues
-- ============================================================================

-- Option A: Archiver (recommandé - garde une trace)
UPDATE proposals
SET
    status = 'ARCHIVED',
    "reviewedAt" = NOW()
WHERE
    status = 'PENDING'
    AND changes->'racesToAdd'->'new' IS NOT NULL
    AND changes::text LIKE '%"categoryLevel1": "CYCLING"%';

-- Afficher le nombre de propositions archivées
-- SELECT 'Propositions archivées: ' || COUNT(*) FROM proposals WHERE status = 'ARCHIVED' AND "reviewedAt" > NOW() - INTERVAL '1 minute';

-- ============================================================================
-- ÉTAPE 3: VÉRIFICATION
-- ============================================================================

-- Vérifier qu'il ne reste plus de propositions PENDING avec CYCLING
SELECT COUNT(*) as remaining_cycling_proposals
FROM proposals
WHERE
    status = 'PENDING'
    AND changes::text LIKE '%"categoryLevel1": "CYCLING"%';

-- ============================================================================
-- ALTERNATIVE: Supprimer au lieu d'archiver (si préféré)
-- ============================================================================

-- Option B: Supprimer définitivement (décommenter si nécessaire)
-- DELETE FROM proposals
-- WHERE
--     status = 'PENDING'
--     AND changes->'racesToAdd'->'new' IS NOT NULL
--     AND changes::text LIKE '%"categoryLevel1": "CYCLING"%';
