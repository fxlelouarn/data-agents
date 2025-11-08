-- Script SQL pour corriger l'Event 15178 (Semi-Marathon du Grand Nancy)
-- Suite aux problèmes identifiés lors de l'application de cmhogrojz01d5zx0mfudjdfzo
-- Date : 2025-11-07

-- ============================================
-- CORRECTION EVENT 15178
-- ============================================

-- Mise à jour des champs manquants/incorrects
UPDATE "Event" 
SET 
  -- FIX 1.1: Code région correct
  "countrySubdivisionDisplayCodeLevel1" = 'GES',
  
  -- FIX 1.4: Génération du slug
  "slug" = 'semi-marathon-du-grand-nancy-15178',
  
  -- FIX 1.5: Flag toUpdate pour indexation
  "toUpdate" = true,
  
  -- FIX 1.6: Adresse complète
  "fullAddress" = 'Nancy, Meurthe-et-Moselle, France',
  
  -- Métadonnées de mise à jour
  "updatedAt" = NOW(),
  "updatedBy" = 'system-correction'
WHERE id = 15178;

-- ============================================
-- CORRECTION EDITION 52074
-- ============================================

-- Mise à jour de l'édition liée
UPDATE "Edition"
SET
  -- FIX 2.2: Edition courante
  "currentEditionEventId" = 15178,
  
  -- FIX 2.3: Source de données
  "dataSource" = 'FEDERATION',
  
  -- Métadonnées de mise à jour
  "updatedAt" = NOW(),
  "updatedBy" = 'system-correction'
WHERE id = 52074;

-- ============================================
-- VÉRIFICATION
-- ============================================

-- Vérifier que les corrections ont été appliquées
SELECT 
  id,
  name,
  city,
  "countrySubdivisionNameLevel1",
  "countrySubdivisionDisplayCodeLevel1",
  slug,
  "toUpdate",
  "fullAddress",
  "dataSource"
FROM "Event"
WHERE id = 15178;

-- Vérifier l'édition
SELECT 
  id,
  "eventId",
  "currentEditionEventId",
  year,
  "startDate",
  "endDate",
  "dataSource",
  "calendarStatus"
FROM "Edition"
WHERE id = 52074;

-- Vérifier les races associées
SELECT 
  id,
  name,
  "editionId",
  "eventId",
  "runDistance",
  "runPositiveElevation"
FROM "Race"
WHERE "editionId" = 52074;

-- ============================================
-- NOTES
-- ============================================

-- Résultats attendus :
-- 
-- Event 15178 :
-- - countrySubdivisionDisplayCodeLevel1 = 'GES'
-- - slug = 'semi-marathon-du-grand-nancy-15178'
-- - toUpdate = true
-- - fullAddress = 'Nancy, Meurthe-et-Moselle, France'
-- - dataSource = 'FEDERATION'
--
-- Edition 52074 :
-- - currentEditionEventId = 15178
-- - dataSource = 'FEDERATION'
--
-- Race(s) : 
-- - Au moins une race devrait exister liée à l'édition 52074
-- - Si aucune race n'existe, elle peut être créée via le dashboard

-- ============================================
-- OPTIONNEL : GÉOCODAGE MANUEL
-- ============================================

-- Si vous souhaitez ajouter manuellement les coordonnées GPS de Nancy :
-- (Coordonnées approximatives du centre-ville de Nancy)

UPDATE "Event"
SET
  "latitude" = 48.6921,
  "longitude" = 6.1844,
  "updatedAt" = NOW(),
  "updatedBy" = 'system-geocoding'
WHERE id = 15178;

-- ============================================
-- ROLLBACK (si nécessaire)
-- ============================================

-- En cas de problème, revenir aux valeurs d'origine :
/*
UPDATE "Event" 
SET 
  "countrySubdivisionDisplayCodeLevel1" = 'G',
  "slug" = NULL,
  "toUpdate" = false,
  "fullAddress" = NULL,
  "updatedAt" = NOW(),
  "updatedBy" = 'system-rollback'
WHERE id = 15178;
*/
