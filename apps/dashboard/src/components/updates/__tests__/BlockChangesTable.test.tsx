import React from 'react'
import { render, screen } from '@testing-library/react'
import BlockChangesTable from '../BlockChangesTable'

describe('BlockChangesTable', () => {
  describe('Bloc Edition - NEW_EVENT', () => {
    it('should display edition fields from edition.new structure', () => {
      const appliedChanges = {
        edition: {
          new: {
            year: 2026,
            startDate: '2026-03-15T09:00:00.000Z',
            endDate: '2026-03-15T18:00:00.000Z',
            timeZone: 'Europe/Paris',
            calendarStatus: 'CONFIRMED'
          }
        }
      }
      
      render(
        <BlockChangesTable 
          blockType="edition" 
          appliedChanges={appliedChanges} 
          isApplied={true}
        />
      )
      
      // Vérifier que les champs sont affichés
      expect(screen.getByText('Année')).toBeInTheDocument()
      expect(screen.getByText('2026')).toBeInTheDocument()
      
      expect(screen.getByText('Date de début')).toBeInTheDocument()
      expect(screen.getByText('Date de fin')).toBeInTheDocument()
      expect(screen.getByText('Fuseau horaire')).toBeInTheDocument()
      expect(screen.getByText(/Europe\/Paris/)).toBeInTheDocument()
    })

    it('should display "Valeur actuelle: -" when no old value', () => {
      const appliedChanges = {
        edition: {
          new: {
            year: 2026,
            startDate: '2026-03-15T09:00:00.000Z'
          }
        }
      }
      
      render(
        <BlockChangesTable 
          blockType="edition" 
          appliedChanges={appliedChanges} 
          isApplied={true}
        />
      )
      
      // Colonne "Valeur actuelle" doit afficher "-"
      const rows = screen.getAllByRole('row')
      expect(rows.length).toBeGreaterThan(1)
      
      // Vérifier qu'il y a au moins une cellule avec "-"
      const currentValueCells = screen.getAllByText('-')
      expect(currentValueCells.length).toBeGreaterThan(0)
    })

    it('should handle userModifiedChanges override', () => {
      const appliedChanges = {
        edition: {
          new: {
            year: 2026,
            startDate: '2026-03-15T09:00:00.000Z'
          }
        }
      }
      
      const userModifiedChanges = {
        year: 2027  // ✅ Override par l'utilisateur
      }
      
      render(
        <BlockChangesTable 
          blockType="edition" 
          appliedChanges={appliedChanges}
          userModifiedChanges={userModifiedChanges}
          isApplied={false}
        />
      )
      
      // L'année modifiée par l'utilisateur doit être affichée
      expect(screen.getByText('2027')).toBeInTheDocument()
    })
  })

  describe('Bloc Edition - EDITION_UPDATE (rétrocompatibilité)', () => {
    it('should display edition fields from root structure', () => {
      const appliedChanges = {
        year: { 
          old: 2025,
          new: 2026 
        },
        startDate: { 
          old: '2025-03-15T09:00:00.000Z',
          new: '2026-03-20T09:00:00.000Z'
        }
      }
      
      render(
        <BlockChangesTable 
          blockType="edition" 
          appliedChanges={appliedChanges} 
          isApplied={true}
        />
      )
      
      // Vérifier que les valeurs old/new sont affichées
      expect(screen.getByText('Année')).toBeInTheDocument()
      expect(screen.getByText('2025')).toBeInTheDocument()
      expect(screen.getByText('2026')).toBeInTheDocument()
    })
  })

  describe('Bloc Courses - NEW_EVENT', () => {
    it('should display racesToAdd from root structure (EDITION_UPDATE)', () => {
      const appliedChanges = {
        racesToAdd: [
          { 
            name: '10km',
            runDistance: 10,
            categoryLevel1: 'RUNNING',
            startDate: '2026-03-15T10:00:00.000Z'
          },
          { 
            name: '21km',
            runDistance: 21.1,
            categoryLevel1: 'RUNNING',
            startDate: '2026-03-15T11:00:00.000Z'
          }
        ]
      }
      
      render(
        <BlockChangesTable 
          blockType="races" 
          appliedChanges={appliedChanges} 
          isApplied={true}
        />
      )
      
      // Vérifier que le champ est affiché
      expect(screen.getByText('Courses à ajouter')).toBeInTheDocument()
      
      // Vérifier que les courses sont listées
      expect(screen.getByText(/10km/)).toBeInTheDocument()
      expect(screen.getByText(/21km/)).toBeInTheDocument()
    })

    it('should display races from edition.new.races structure (NEW_EVENT)', () => {
      const appliedChanges = {
        edition: {
          new: {
            races: [
              { 
                name: 'Trail 7 km',
                runDistance: 7,
                categoryLevel1: 'TRAIL',
                startDate: '2025-11-07T23:00:00.000Z'
              },
              { 
                name: 'Trail 14 km',
                runDistance: 14,
                categoryLevel1: 'TRAIL',
                startDate: '2025-11-07T23:00:00.000Z'
              }
            ]
          }
        }
      }
      
      render(
        <BlockChangesTable 
          blockType="races" 
          appliedChanges={appliedChanges} 
          isApplied={true}
        />
      )
      
      // Vérifier que le champ est affiché
      expect(screen.getByText('Courses à ajouter')).toBeInTheDocument()
      
      // Vérifier que les courses sont listées
      expect(screen.getByText(/Trail 7 km/)).toBeInTheDocument()
      expect(screen.getByText(/Trail 14 km/)).toBeInTheDocument()
    })

    it('should display empty state when no races', () => {
      const appliedChanges = {}
      
      render(
        <BlockChangesTable 
          blockType="races" 
          appliedChanges={appliedChanges} 
          isApplied={false}
        />
      )
      
      // Vérifier message vide
      expect(screen.getByText(/Aucun changement détaillé disponible/)).toBeInTheDocument()
    })
  })

  describe('Bloc Organizer - rétrocompatibilité', () => {
    it('should display organizer fields from organizer.new structure', () => {
      const appliedChanges = {
        organizer: {
          new: {
            name: 'Association Trail',
            email: 'contact@trail.fr',
            phone: '0123456789'
          }
        }
      }
      
      render(
        <BlockChangesTable 
          blockType="organizer" 
          appliedChanges={appliedChanges} 
          isApplied={true}
        />
      )
      
      // Vérifier que les champs sont affichés
      expect(screen.getByText('Nom')).toBeInTheDocument()
      expect(screen.getByText(/Association Trail/)).toBeInTheDocument()
      expect(screen.getByText('Email')).toBeInTheDocument()
      expect(screen.getByText(/contact@trail.fr/)).toBeInTheDocument()
    })
  })

  describe('Bandeau "Appliqué"', () => {
    it('should show success banner when isApplied=true', () => {
      const appliedChanges = {
        edition: {
          new: { year: 2026 }
        }
      }
      
      render(
        <BlockChangesTable 
          blockType="edition" 
          appliedChanges={appliedChanges} 
          isApplied={true}
        />
      )
      
      expect(screen.getByText('Changements appliqués avec succès')).toBeInTheDocument()
    })

    it('should not show banner when isApplied=false', () => {
      const appliedChanges = {
        edition: {
          new: { year: 2026 }
        }
      }
      
      render(
        <BlockChangesTable 
          blockType="edition" 
          appliedChanges={appliedChanges} 
          isApplied={false}
        />
      )
      
      expect(screen.queryByText('Changements appliqués avec succès')).not.toBeInTheDocument()
    })
  })
})
