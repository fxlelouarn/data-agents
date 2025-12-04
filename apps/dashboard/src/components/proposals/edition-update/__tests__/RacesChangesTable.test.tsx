import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import RacesChangesTable from '../RacesChangesTable'
import { ConsolidatedRaceChange } from '@/hooks/useProposalEditor'

// Mock des données de test
const mockRaceWithPrice: ConsolidatedRaceChange = {
  raceId: 'race-1',
  raceName: 'Trail 10km',
  proposalIds: ['p1'],
  originalFields: {
    name: 'Trail 10km',
    runDistance: 10,
    price: 25,
    categoryLevel1: 'TRAIL',
    startDate: '2025-06-15T09:00:00.000Z'
  },
  fields: {
    price: 30 // Changement proposé
  }
}

const mockNewRaceWithPrice: ConsolidatedRaceChange = {
  raceId: 'new-1',
  raceName: 'Marathon',
  proposalIds: ['p1'],
  originalFields: {},
  fields: {
    name: 'Marathon',
    runDistance: 42.195,
    price: 50,
    categoryLevel1: 'RUNNING',
    startDate: '2025-06-15T10:00:00.000Z'
  }
}

const mockRaceWithoutPrice: ConsolidatedRaceChange = {
  raceId: 'race-2',
  raceName: 'Course enfants',
  proposalIds: ['p1'],
  originalFields: {
    name: 'Course enfants',
    runDistance: 1
  },
  fields: {}
}

describe('RacesChangesTable', () => {
  const defaultProps = {
    consolidatedRaces: [mockRaceWithPrice],
    userModifiedRaceChanges: {},
    onRaceFieldModify: jest.fn()
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Affichage du champ price', () => {
    it('should display the price field label', () => {
      render(<RacesChangesTable {...defaultProps} />)

      expect(screen.getByText('Prix')).toBeInTheDocument()
    })

    it('should display price with euro symbol when value exists', () => {
      render(<RacesChangesTable {...defaultProps} />)

      // La valeur proposée (30) devrait être affichée avec le symbole €
      expect(screen.getByText('30 €')).toBeInTheDocument()
    })

    it('should display current price value in "Valeur actuelle" column', () => {
      render(<RacesChangesTable {...defaultProps} showCurrentValue={true} />)

      // La valeur actuelle (25) devrait être affichée
      expect(screen.getByText('25 €')).toBeInTheDocument()
    })

    it('should display "-" when price is null or undefined', () => {
      render(
        <RacesChangesTable
          {...defaultProps}
          consolidatedRaces={[mockRaceWithoutPrice]}
        />
      )

      // Vérifier que le champ Prix existe et affiche "-"
      expect(screen.getByText('Prix')).toBeInTheDocument()
      // Il y aura plusieurs "-" dans la table, on vérifie juste qu'ils existent
      const dashes = screen.getAllByText('-')
      expect(dashes.length).toBeGreaterThan(0)
    })

    it('should display price for new races', () => {
      render(
        <RacesChangesTable
          {...defaultProps}
          consolidatedRaces={[mockNewRaceWithPrice]}
        />
      )

      expect(screen.getByText('50 €')).toBeInTheDocument()
    })
  })

  describe('Édition du champ price', () => {
    it('should show edit button for price field when not disabled', () => {
      render(
        <RacesChangesTable
          {...defaultProps}
          disabled={false}
          showActions={true}
        />
      )

      // Trouver la ligne du prix et vérifier qu'il y a un bouton d'édition
      const priceRow = screen.getByText('Prix').closest('tr')
      expect(priceRow).toBeInTheDocument()

      // Il devrait y avoir un bouton d'édition dans la ligne
      const editButtons = priceRow?.querySelectorAll('button')
      expect(editButtons?.length).toBeGreaterThan(0)
    })

    it('should not show edit button when block is validated', () => {
      render(
        <RacesChangesTable
          {...defaultProps}
          isBlockValidated={true}
          showActions={true}
        />
      )

      // Vérifier que le bouton d'édition n'est pas présent (ou est désactivé)
      const priceRow = screen.getByText('Prix').closest('tr')
      const editButton = priceRow?.querySelector('button[aria-label*="edit"], button svg[data-testid="EditIcon"]')

      // En mode validé, les boutons d'édition ne sont pas rendus
      expect(editButton).toBeNull()
    })

    it('should call onRaceFieldModify when price is edited', () => {
      const onRaceFieldModify = jest.fn()

      render(
        <RacesChangesTable
          {...defaultProps}
          onRaceFieldModify={onRaceFieldModify}
          disabled={false}
          showActions={true}
        />
      )

      // Trouver le bouton d'édition pour le champ prix
      const priceRow = screen.getByText('Prix').closest('tr')
      const editButton = priceRow?.querySelector('button')

      expect(editButton).not.toBeNull()
      fireEvent.click(editButton!)

      // Après clic, un champ de saisie devrait apparaître
      const input = screen.getByRole('textbox')
      expect(input).toBeInTheDocument()

      // Modifier la valeur
      fireEvent.change(input, { target: { value: '35' } })

      // Confirmer l'édition (bouton check via data-testid)
      const checkButton = screen.getByTestId('CheckIcon').closest('button')
      expect(checkButton).not.toBeNull()
      fireEvent.click(checkButton!)

      expect(onRaceFieldModify).toHaveBeenCalledWith('race-1', 'price', '35')
    })
  })

  describe('Modification utilisateur du price', () => {
    it('should display user modified price with "Modifié" badge', () => {
      render(
        <RacesChangesTable
          {...defaultProps}
          userModifiedRaceChanges={{
            'race-1': { price: 45 }
          }}
        />
      )

      // La valeur modifiée par l'utilisateur devrait être affichée
      expect(screen.getByText('45 €')).toBeInTheDocument()

      // Le badge "Modifié" devrait être visible
      expect(screen.getByText('Modifié')).toBeInTheDocument()
    })

    it('should prioritize user modified price over proposed price', () => {
      render(
        <RacesChangesTable
          {...defaultProps}
          userModifiedRaceChanges={{
            'race-1': { price: 99 }
          }}
        />
      )

      // La valeur utilisateur (99) devrait être affichée, pas la proposée (30)
      expect(screen.getByText('99 €')).toBeInTheDocument()
      expect(screen.queryByText('30 €')).not.toBeInTheDocument()
    })
  })

  describe('RACE_FIELDS inclut price', () => {
    it('should render all 9 fields including price', () => {
      render(<RacesChangesTable {...defaultProps} />)

      // Vérifier que tous les champs sont présents
      expect(screen.getByText('Nom')).toBeInTheDocument()
      expect(screen.getByText('Date + Heure')).toBeInTheDocument()
      expect(screen.getByText('Catégorie 1')).toBeInTheDocument()
      expect(screen.getByText('Catégorie 2')).toBeInTheDocument()
      expect(screen.getByText('Distance course (km)')).toBeInTheDocument()
      expect(screen.getByText('Distance vélo (km)')).toBeInTheDocument()
      expect(screen.getByText('Distance marche (km)')).toBeInTheDocument()
      expect(screen.getByText('D+ (m)')).toBeInTheDocument()
      expect(screen.getByText('Prix')).toBeInTheDocument() // Le nouveau champ
    })
  })
})
