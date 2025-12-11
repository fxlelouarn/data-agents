-- Script pour détecter et corriger les ProposalApplications avec raceEdits non fusionnés
-- Date: 2025-12-11
-- Problème: Le frontend envoie les vrais raceId comme clés dans raceEdits,
--           mais le backend cherchait existing-{index}

-- ============================================================================
-- PARTIE 1: DIAGNOSTIC - Détecter les ProposalApplications affectées
-- ============================================================================

-- 1.1 Trouver toutes les ProposalApplications de type 'races' avec raceEdits
SELECT
  pa.id as app_id,
  pa.status,
  pa."proposalId",
  p."eventName",
  p."editionYear",
  pa."appliedChanges"->>'raceEdits' as race_edits_in_app,
  p."userModifiedChanges"->>'raceEdits' as race_edits_in_proposal,
  pa."appliedAt"
FROM proposal_applications pa
JOIN proposals p ON pa."proposalId" = p.id
WHERE pa."blockType" = 'races'
  AND p."userModifiedChanges"->>'raceEdits' IS NOT NULL
  AND p."userModifiedChanges"->>'raceEdits' != '{}'
ORDER BY pa."createdAt" DESC;

-- 1.2 Comparer les heures dans racesToUpdate vs raceEdits pour détecter les incohérences
-- Cette requête identifie les cas où raceEdits contient des clés numériques (vrais raceId)
-- qui n'ont pas été fusionnées dans racesToUpdate
SELECT
  pa.id as app_id,
  pa.status,
  p."eventName",
  p."editionYear",
  -- Extraire les clés de raceEdits qui sont des nombres (vrais raceId)
  (
    SELECT jsonb_agg(key)
    FROM jsonb_object_keys(p."userModifiedChanges"->'raceEdits') as key
    WHERE key ~ '^\d+$'
  ) as numeric_race_edit_keys,
  -- Vérifier si ces clés sont dans appliedChanges.raceEdits
  pa."appliedChanges"->'raceEdits' as applied_race_edits
FROM proposal_applications pa
JOIN proposals p ON pa."proposalId" = p.id
WHERE pa."blockType" = 'races'
  AND p."userModifiedChanges"->>'raceEdits' IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p."userModifiedChanges"->'raceEdits') as key
    WHERE key ~ '^\d+$'
  );

-- ============================================================================
-- PARTIE 2: CORRECTION - Mettre à jour les appliedChanges avec les raceEdits
-- ============================================================================

-- 2.1 Voir les corrections qui seraient appliquées (DRY RUN)
WITH affected_apps AS (
  SELECT
    pa.id as app_id,
    pa."appliedChanges",
    p."userModifiedChanges"->'raceEdits' as user_race_edits,
    pa."appliedChanges"->'racesToUpdate' as current_races_to_update
  FROM proposal_applications pa
  JOIN proposals p ON pa."proposalId" = p.id
  WHERE pa."blockType" = 'races'
    AND p."userModifiedChanges"->>'raceEdits' IS NOT NULL
    AND p."userModifiedChanges"->>'raceEdits' != '{}'
)
SELECT
  app_id,
  user_race_edits,
  current_races_to_update
FROM affected_apps;

-- ============================================================================
-- PARTIE 3: CORRECTION MANUELLE pour une ProposalApplication spécifique
-- ============================================================================

-- Pour la ProposalApplication cmapp1765430557547nq3p6igpr mentionnée:
-- Afficher l'état actuel
SELECT
  pa.id,
  pa.status,
  pa."appliedChanges"->'racesToUpdate'->'new' as races_to_update,
  pa."appliedChanges"->'raceEdits' as race_edits,
  p."userModifiedChanges"->'raceEdits' as user_race_edits
FROM proposal_applications pa
JOIN proposals p ON pa."proposalId" = p.id
WHERE pa.id = 'cmapp1765430557547nq3p6igpr';

-- ============================================================================
-- PARTIE 4: Script de correction (à exécuter manuellement après validation)
-- ============================================================================

-- ATTENTION: Ce script modifie les données en production!
-- Exécuter d'abord les requêtes de diagnostic ci-dessus.

-- 4.1 Mettre à jour les raceEdits dans appliedChanges (copier depuis userModifiedChanges)
-- UPDATE proposal_applications pa
-- SET "appliedChanges" = pa."appliedChanges" || jsonb_build_object('raceEdits', p."userModifiedChanges"->'raceEdits')
-- FROM proposals p
-- WHERE pa."proposalId" = p.id
--   AND pa."blockType" = 'races'
--   AND pa.status = 'PENDING'
--   AND p."userModifiedChanges"->>'raceEdits' IS NOT NULL
--   AND p."userModifiedChanges"->>'raceEdits' != '{}';

-- 4.2 Pour les applications APPLIED, on ne peut pas les corriger automatiquement
-- car les données ont déjà été appliquées en base Miles Republic.
-- Il faudrait soit:
-- - Rejouer l'application (reset à PENDING puis Apply)
-- - Corriger manuellement les données dans Miles Republic
