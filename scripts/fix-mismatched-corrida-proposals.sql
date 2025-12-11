-- Script de correction pour les propositions "Corrida de Noël" mal matchées
-- Bug: L'algorithme de matching associait des événements homonymes au mauvais département
-- Fix: Ajout d'une pénalité département dans matcher.ts v2.3
-- Date: 2025-12-10

-- =============================================================================
-- ANALYSE DES PROPOSITIONS AFFECTÉES
-- =============================================================================

-- Proposition cmixjswif05bxmz1weewfxlmi
-- Source: campus.coach pour Cléguérec
-- ✅ CORRECTEMENT MATCHÉE - Pas de correction nécessaire

-- Proposition cmiy1tp650gnrmz1wpp0s4uop
-- Source FFA: "11ème Corrida de Noël" à Lagraulière (19)
-- Organisateur: "La Graule Nature" (lagraulenature@gmail.com)
-- Mal matchée avec: eventId=6278 (Cléguérec, dept 56)
-- Devrait être: eventId=4172 (Lagraulière, dept 19), editionId=41133

-- Proposition cmirhz7uv36h7lx1vsuaqgtz2
-- Source FFA: Corrida à Montluçon (03)
-- Organisateur: "amitie nature montlucon" (eric.foucaux@orange.fr)
-- Mal matchée avec: eventId=6278 (Cléguérec, dept 56)
-- Problème: Pas d'événement "Corrida de Noël" à Montluçon dans Miles Republic
-- Action: ARCHIVER (pas de bon match possible)

-- Proposition cmitajkbr02zbig1e8q2ell3m
-- Source FFA: Corrida à Bologne (52)
-- Organisateur: "ANTOINE Brigitte" (brigitte12antoine@free.fr)
-- Mal matchée avec: eventId=6278 (Cléguérec, dept 56)
-- Devrait être: eventId=4145 (Bologne, dept 52), editionId=40825

-- =============================================================================
-- CORRECTIONS
-- =============================================================================

-- 1. Corriger la proposition de Lagraulière
UPDATE proposals
SET
  "eventId" = '4172',
  "editionId" = '41133',
  "eventCity" = 'Lagraulière'
WHERE id = 'cmiy1tp650gnrmz1wpp0s4uop';

-- 2. Archiver la proposition de Montluçon (pas de bon match)
UPDATE proposals
SET
  status = 'ARCHIVED'
WHERE id = 'cmirhz7uv36h7lx1vsuaqgtz2';

-- 3. Corriger la proposition de Bologne
UPDATE proposals
SET
  "eventId" = '4145',
  "editionId" = '40825',
  "eventCity" = 'Bologne'
WHERE id = 'cmitajkbr02zbig1e8q2ell3m';

-- =============================================================================
-- CORRECTION SUPPLÉMENTAIRE : La foulée verte
-- =============================================================================

-- Proposition cmixde9hn038lmz1w3jfta1dm
-- Source FFA: "La Foulée Verte" à Marolles-en-Brie (94)
-- Organisateur: "Etoile Marollaise" (fouleevertemarolles@yahoo.fr)
-- Mal matchée avec: eventId=10180 (Chambéry, dept 73)
-- Devrait être: eventId=1852 (Marolles-en-Brie, dept 94), editionId=46728

-- 4. Corriger la proposition de La foulée verte Marolles
UPDATE proposals
SET
  "eventId" = '1852',
  "editionId" = '46728',
  "eventCity" = 'Marolles-en-Brie'
WHERE id = 'cmixde9hn038lmz1w3jfta1dm';

-- =============================================================================
-- VÉRIFICATION
-- =============================================================================

-- Vérifier les corrections
SELECT
  id,
  "eventId",
  "editionId",
  "eventName",
  "eventCity",
  status
FROM proposals
WHERE id IN (
  'cmiy1tp650gnrmz1wpp0s4uop',
  'cmirhz7uv36h7lx1vsuaqgtz2',
  'cmitajkbr02zbig1e8q2ell3m',
  'cmixde9hn038lmz1w3jfta1dm'
);
