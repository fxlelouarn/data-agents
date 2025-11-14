import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSnackbar } from 'notistack'
import { 
  agentsApi, 
  proposalsApi, 
  runsApi, 
  logsApi, 
  healthApi,
  databasesApi,
  settingsApi,
  updatesApi,
  cacheApi,
  eventsApi
} from '@/services/api'
import { 
  AgentFilters, 
  ProposalFilters, 
  RunFilters, 
  LogFilters,
  CreateAgentForm,
  UpdateAgentForm,
  UpdateFilters
} from '@/types'

// Agents hooks
export const useAgents = (filters: AgentFilters = {}) => {
  return useQuery({
    queryKey: ['agents', filters],
    queryFn: () => agentsApi.getAll(filters),
    staleTime: 30000, // 30 seconds
  })
}

export const useAgent = (id: string) => {
  return useQuery({
    queryKey: ['agents', id],
    queryFn: () => agentsApi.getById(id),
    enabled: !!id,
  })
}

export const useAgentStatus = (id: string) => {
  return useQuery({
    queryKey: ['agents', id, 'status'],
    queryFn: () => agentsApi.getStatus(id),
    enabled: !!id,
    refetchInterval: 10000, // Refresh every 10 seconds
  })
}

export const useAgentValidation = (id: string) => {
  return useQuery({
    queryKey: ['agents', id, 'validation'],
    queryFn: () => agentsApi.validate(id),
    enabled: !!id,
    staleTime: 30000, // 30 seconds
  })
}

export const useCreateAgent = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: (data: CreateAgentForm) => agentsApi.create(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      enqueueSnackbar(response.message || 'Agent créé avec succès', { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || "Erreur lors de la création de l'agent",
        { variant: 'error' }
      )
    },
  })
}

export const useUpdateAgent = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAgentForm }) => 
      agentsApi.update(id, data),
    onSuccess: (response, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      queryClient.invalidateQueries({ queryKey: ['agents', id] })
      enqueueSnackbar(response.message || 'Agent mis à jour', { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || 'Erreur lors de la mise à jour',
        { variant: 'error' }
      )
    },
  })
}

export const useToggleAgent = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: (id: string) => agentsApi.toggle(id),
    onSuccess: (response, id) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      queryClient.invalidateQueries({ queryKey: ['agents', id] })
      enqueueSnackbar(response.message || "Statut de l'agent modifié", { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || 'Erreur lors du changement de statut',
        { variant: 'error' }
      )
    },
  })
}

export const useRunAgent = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: (id: string) => agentsApi.run(id),
    onSuccess: (response, id) => {
      queryClient.invalidateQueries({ queryKey: ['agents', id] })
      queryClient.invalidateQueries({ queryKey: ['runs'] })
      // Invalider les propositions car l'agent va potentiellement en créer de nouvelles
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
      enqueueSnackbar(response.message || "Exécution de l'agent démarrée", { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || "Erreur lors du lancement de l'agent",
        { variant: 'error' }
      )
    },
  })
}

export const useReinstallAgent = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: (id: string) => agentsApi.reinstall(id),
    onSuccess: (response, id) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      queryClient.invalidateQueries({ queryKey: ['agents', id] })
      enqueueSnackbar(response.message || 'Agent réinstallé avec succès', { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || 'Erreur lors de la réinstallation',
        { variant: 'error' }
      )
    },
  })
}

export const useResetAgentCursor = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: (id: string) => agentsApi.resetCursor(id),
    onSuccess: (response, id) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      queryClient.invalidateQueries({ queryKey: ['agents', id] })
      queryClient.invalidateQueries({ queryKey: ['agents', id, 'state'] })
      enqueueSnackbar(response.message || 'État réinitialisé avec succès', { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || 'Erreur lors de la réinitialisation',
        { variant: 'error' }
      )
    },
  })
}

export const useAgentState = (id: string, key?: string) => {
  return useQuery({
    queryKey: ['agents', id, 'state', key],
    queryFn: () => agentsApi.getState(id, key),
    enabled: !!id,
    staleTime: 10000, // 10 secondes
    refetchInterval: 30000, // Rafraîchir toutes les 30s pour voir la progression
  })
}

export const useDeleteAgent = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: (id: string) => agentsApi.delete(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      enqueueSnackbar(response.message || 'Agent supprimé', { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || 'Erreur lors de la suppression',
        { variant: 'error' }
      )
    },
  })
}

// Proposals hooks
export const useProposals = (filters: ProposalFilters = {}, limit = 20, offset = 0) => {
  return useQuery({
    queryKey: ['proposals', filters, limit, offset],
    queryFn: () => proposalsApi.getAll(filters, limit, offset),
    staleTime: 30000, // 30 secondes - réduit pour capter les nouvelles propositions plus vite
    gcTime: 300000, // 5 minutes (garde le cache plus longtemps)
    refetchInterval: 120000, // Auto-refresh toutes les 2 minutes (au lieu de 1)
    refetchOnWindowFocus: false, // Désactiver pour éviter les refetch excessifs
    refetchOnMount: true, // ✅ Toujours refetch au montage pour capter les nouvelles propositions
    retry: 1, // Réessayer qu'une seule fois en cas d'échec
  })
}

export const useProposal = (id: string) => {
  return useQuery({
    queryKey: ['proposals', id],
    queryFn: () => proposalsApi.getById(id),
    enabled: !!id,
  })
}

export const useProposalGroup = (groupKey: string) => {
  return useQuery({
    queryKey: ['proposals', 'group', groupKey],
    queryFn: () => proposalsApi.getByGroup(groupKey),
    enabled: !!groupKey,
    staleTime: 60000, // 60 secondes
    gcTime: 300000, // 5 minutes
    refetchInterval: 120000, // Auto-refresh toutes les 2 minutes
    refetchOnWindowFocus: false, // Désactiver
    refetchOnMount: false, // Utiliser le cache
    retry: 1,
  })
}

export const useUpdateProposal = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: async ({ 
      id,
      proposalIds,  // 📦 MODE GROUPÉ
      status, 
      reviewedBy, 
      appliedChanges,
      userModifiedChanges,
      modificationReason,
      modifiedBy,
      block,
      killEvent,
      changes  // 📦 MODE GROUPÉ : payload consolidé
    }: { 
      id?: string
      proposalIds?: string[]  // 📦 MODE GROUPÉ
      status?: string
      reviewedBy?: string
      appliedChanges?: Record<string, any>
      userModifiedChanges?: Record<string, any>
      modificationReason?: string
      modifiedBy?: string
      block?: string
      killEvent?: boolean
      changes?: Record<string, any>  // 📦 MODE GROUPÉ
    }) => {
      // 📦 MODE GROUPÉ : Détecter et router vers le bon endpoint
      if (proposalIds && proposalIds.length > 0 && block) {
        console.log(`📦 useUpdateProposal MODE GROUPÉ: ${proposalIds.length} propositions, bloc "${block}"`)
        return proposalsApi.validateBlockGroup(proposalIds, block, changes || {})
      }
      
      // Mode simple (1 proposition) - retourner un tableau pour uniformiser le type
      if (!id) {
        throw new Error('id ou proposalIds requis')
      }
      const result = await proposalsApi.update(id, { status, reviewedBy, appliedChanges, userModifiedChanges, modificationReason, modifiedBy, block, killEvent })
      // ✅ Retourner un tableau pour uniformiser avec le mode groupé
      return { ...result, data: [result.data] }
    },
    onSuccess: (response, { id, proposalIds }) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
      
      // Invalider les propositions concernées
      if (proposalIds && proposalIds.length > 0) {
        proposalIds.forEach(proposalId => {
          queryClient.invalidateQueries({ queryKey: ['proposals', proposalId] })
        })
        // ✅ Invalider TOUS les groupes car on ne connait pas le groupKey ici
        queryClient.invalidateQueries({ queryKey: ['proposals', 'group'] })
        enqueueSnackbar(response.message || `${proposalIds.length} propositions mises à jour`, { variant: 'success' })
      } else if (id) {
        queryClient.invalidateQueries({ queryKey: ['proposals', id] })
        // ✅ Invalider les groupes car la proposition peut appartenir à un groupe
        queryClient.invalidateQueries({ queryKey: ['proposals', 'group'] })
        enqueueSnackbar(response.message || 'Proposition mise à jour', { variant: 'success' })
      }
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || 'Erreur lors de la mise à jour',
        { variant: 'error' }
      )
    },
  })
}

export const useCompareProposal = () => {
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: ({ id, existingEventId }: { id: string; existingEventId?: string }) =>
      proposalsApi.compare(id, existingEventId),
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || 'Erreur lors de la comparaison',
        { variant: 'error' }
      )
    },
  })
}

export const useBulkApproveProposals = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: ({ proposalIds, reviewedBy }: { proposalIds: string[]; reviewedBy?: string }) =>
      proposalsApi.bulkApprove(proposalIds, reviewedBy),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
      enqueueSnackbar(response.message || `${response.data.updated} propositions approuvées`, { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || "Erreur lors de l'approbation en masse",
        { variant: 'error' }
      )
    },
  })
}

export const useBulkRejectProposals = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: ({ proposalIds, reviewedBy }: { proposalIds: string[]; reviewedBy?: string }) =>
      proposalsApi.bulkReject(proposalIds, reviewedBy),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
      enqueueSnackbar(response.message || `${response.data.updated} propositions rejetées`, { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || 'Erreur lors du rejet en masse',
        { variant: 'error' }
      )
    },
  })
}

export const useBulkArchiveProposals = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: ({ proposalIds, reviewedBy, archiveReason }: { 
      proposalIds: string[]; 
      reviewedBy?: string; 
      archiveReason?: string 
    }) =>
      proposalsApi.bulkArchive(proposalIds, reviewedBy, archiveReason),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
      enqueueSnackbar(response.message || `${response.data.updated} propositions archivées`, { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || "Erreur lors de l'archivage en masse",
        { variant: 'error' }
      )
    },
  })
}

export const useUnapproveProposal = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: (id: string) => proposalsApi.unapprove(id),
    onSuccess: (response, id) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
      queryClient.invalidateQueries({ queryKey: ['proposals', id] })
      enqueueSnackbar(response.message || 'Approbation annulée', { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || "Erreur lors de l'annulation de l'approbation",
        { variant: 'error' }
      )
    },
  })
}

export const useUnapproveBlock = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: ({ id, block }: { id: string; block: string }) => proposalsApi.unapproveBlock(id, block),
    onSuccess: (response, { id, block }) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
      queryClient.invalidateQueries({ queryKey: ['proposals', id] })
      queryClient.invalidateQueries({ queryKey: ['proposals', 'group'] })
      enqueueSnackbar(response.message || `Bloc "${block}" annulé`, { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || "Erreur lors de l'annulation du bloc",
        { variant: 'error' }
      )
    },
  })
}

export const useConvertToEditionUpdate = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: (data: {
      proposalId: string
      eventId: number
      editionId: number
      eventName: string
      eventSlug: string
      editionYear: string
    }) => proposalsApi.convertToEditionUpdate(data.proposalId, data),
    onSuccess: (response, { eventName }) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
      enqueueSnackbar(
        response.message || `Proposition convertie en EDITION_UPDATE pour ${eventName}`,
        { variant: 'success' }
      )
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || 'Erreur lors de la conversion de la proposition',
        { variant: 'error' }
      )
    },
  })
}

export const useCreateManualProposal = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: (data: {
      eventId?: string
      editionId?: string
      raceId?: string
      fieldName: string
      fieldValue: any
      type: 'NEW_EVENT' | 'EVENT_UPDATE' | 'EDITION_UPDATE' | 'RACE_UPDATE'
      propagateToRaces?: boolean
      justification?: string
    }) => proposalsApi.createManual(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
      enqueueSnackbar(response.message || 'Proposition créée manuellement avec succès', { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || 'Erreur lors de la création de la proposition',
        { variant: 'error' }
      )
    },
  })
}

export const useDeleteProposal = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: (id: string) => proposalsApi.delete(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
      enqueueSnackbar(response.message || 'Proposition supprimée définitivement', { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || 'Erreur lors de la suppression',
        { variant: 'error' }
      )
    },
  })
}

export const useBulkDeleteProposals = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: ({ proposalIds, reviewedBy }: { 
      proposalIds: string[]; 
      reviewedBy?: string;
    }) =>
      proposalsApi.bulkDelete(proposalIds, reviewedBy),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
      enqueueSnackbar(response.message || `${response.data.deleted} propositions supprimées définitivement`, { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || 'Erreur lors de la suppression en masse',
        { variant: 'error' }
      )
    },
  })
}

// Runs hooks
export const useRuns = (filters: RunFilters = {}, limit = 20, offset = 0) => {
  return useQuery({
    queryKey: ['runs', filters, limit, offset],
    queryFn: () => runsApi.getAll(filters, limit, offset),
    staleTime: 30000,
  })
}

export const useRun = (id: string) => {
  return useQuery({
    queryKey: ['runs', id],
    queryFn: () => runsApi.getById(id),
    enabled: !!id,
  })
}

// Logs hooks  
export const useLogs = (filters: LogFilters = {}, limit = 100, offset = 0) => {
  return useQuery({
    queryKey: ['logs', filters, limit, offset],
    queryFn: () => logsApi.getAll(filters, limit, offset),
    staleTime: 10000, // Logs are more dynamic
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  })
}

// Databases hooks
export const useDatabases = (includeInactive = false) => {
  return useQuery({
    queryKey: ['databases', includeInactive],
    queryFn: () => databasesApi.getAll(includeInactive),
    staleTime: 60000, // 1 minute - databases don't change often
  })
}

export const useDatabase = (id: string) => {
  return useQuery({
    queryKey: ['databases', id],
    queryFn: () => databasesApi.getById(id),
    enabled: !!id,
  })
}

export const useCreateDatabase = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: databasesApi.create,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['databases'] })
      enqueueSnackbar(response.message || 'Base de données créée avec succès', { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Erreur lors de la création de la base de données',
        { variant: 'error' }
      )
    },
  })
}

export const useUpdateDatabase = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => databasesApi.update(id, data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['databases'] })
      enqueueSnackbar(response.message || 'Base de données mise à jour avec succès', { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Erreur lors de la mise à jour de la base de données',
        { variant: 'error' }
      )
    },
  })
}

export const useToggleDatabase = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: databasesApi.toggle,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['databases'] })
      enqueueSnackbar(response.message || 'Statut de la base de données modifié', { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Erreur lors du changement de statut',
        { variant: 'error' }
      )
    },
  })
}

export const useTestDatabase = () => {
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: databasesApi.test,
    onSuccess: (response) => {
      const message = response.data.isHealthy 
        ? `Test de connexion réussi (${response.data.responseTime}ms)`
        : `Test de connexion échoué: ${response.data.error || 'Erreur inconnue'}`
      enqueueSnackbar(message, { 
        variant: response.data.isHealthy ? 'success' : 'error' 
      })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Erreur lors du test de connexion',
        { variant: 'error' }
      )
    },
  })
}

export const useDeleteDatabase = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: databasesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databases'] })
      enqueueSnackbar('Base de données supprimée avec succès', { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Erreur lors de la suppression de la base de données',
        { variant: 'error' }
      )
    },
  })
}

// Settings hooks
export const useSettings = () => {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
    staleTime: 300000, // 5 minutes - settings don't change often
  })
}

export const useUpdateSettings = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: settingsApi.update,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      enqueueSnackbar(response.message || 'Paramètres mis à jour avec succès', { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Erreur lors de la mise à jour des paramètres',
        { variant: 'error' }
      )
    },
  })
}

export const useFailureReport = () => {
  return useQuery({
    queryKey: ['settings', 'failure-report'],
    queryFn: () => settingsApi.getFailureReport(),
    staleTime: 60000, // 1 minute
    refetchInterval: 300000, // Auto-refresh every 5 minutes
  })
}

export const useCheckFailures = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: settingsApi.checkFailures,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'failure-report'] })
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      
      const { disabledAgents, checkedAgents } = response.data
      if (disabledAgents.length > 0) {
        enqueueSnackbar(
          `Vérification terminée : ${disabledAgents.length} agents désactivés sur ${checkedAgents} vérifiés`, 
          { variant: 'warning' }
        )
      } else {
        enqueueSnackbar(
          `Vérification terminée : ${checkedAgents} agents vérifiés, aucune désactivation nécessaire`, 
          { variant: 'success' }
        )
      }
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.message || 'Erreur lors de la vérification des échecs',
        { variant: 'error' }
      )
    },
  })
}

export const useAgentFailures = (agentId: string) => {
  return useQuery({
    queryKey: ['settings', 'agent-failures', agentId],
    queryFn: () => settingsApi.getAgentFailures(agentId),
    enabled: !!agentId,
    staleTime: 30000, // 30 seconds
  })
}

// Health hook
export const useHealth = () => {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => healthApi.check(),
    refetchInterval: 60000, // Check every minute
    retry: false,
  })
}

// Updates hooks
export const useUpdates = (filters: UpdateFilters = {}, limit = 20, offset = 0) => {
  return useQuery({
    queryKey: ['updates', filters, limit, offset],
    queryFn: () => updatesApi.getAll(filters, limit, offset),
    staleTime: 30000,
  })
}

export const useUpdate = (id: string) => {
  return useQuery({
    queryKey: ['updates', id],
    queryFn: () => updatesApi.getById(id),
    enabled: !!id,
  })
}

export const useCreateUpdate = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: ({ proposalId, scheduledAt }: { proposalId: string; scheduledAt?: string }) => 
      updatesApi.create(proposalId, scheduledAt),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
      enqueueSnackbar(response.message || 'Mise à jour créée', { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || 'Erreur lors de la création de la mise à jour',
        { variant: 'error' }
      )
    },
  })
}

export const useApplyUpdate = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: (id: string) => updatesApi.apply(id),
    onSuccess: (response, id) => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
      queryClient.invalidateQueries({ queryKey: ['updates', id] })
      enqueueSnackbar(response.message || 'Mise à jour appliquée', { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || 'Erreur lors de l\'application de la mise à jour',
        { variant: 'error' }
      )
    },
  })
}

export const useDeleteUpdate = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: (id: string) => updatesApi.delete(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
      enqueueSnackbar(response.message || 'Mise à jour supprimée', { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || 'Erreur lors de la suppression de la mise à jour',
        { variant: 'error' }
      )
    },
  })
}

export const useReplayUpdate = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: (id: string) => updatesApi.replay(id),
    onSuccess: (response, id) => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
      queryClient.invalidateQueries({ queryKey: ['updates', id] })
      enqueueSnackbar(response.message || 'Mise à jour prête pour rejeu', { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || 'Erreur lors du rejeu de la mise à jour',
        { variant: 'error' }
      )
    },
  })
}

export const useUpdateLogs = (id: string) => {
  return useQuery({
    queryKey: ['updates', id, 'logs'],
    queryFn: () => updatesApi.getLogs(id),
    enabled: !!id,
    refetchInterval: 5000, // Auto-refresh logs every 5 seconds
  })
}

export const useBulkDeleteUpdates = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: (ids: string[]) => updatesApi.bulkDelete(ids),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
      enqueueSnackbar(
        response.message || `${response.data.deletedCount} mise(s) à jour supprimée(s)`,
        { variant: 'success' }
      )
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || 'Erreur lors de la suppression en masse',
        { variant: 'error' }
      )
    },
  })
}

export const useBulkApplyUpdates = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: (ids: string[]) => updatesApi.bulkApply(ids),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
      const { successful, failed } = response.data
      if (failed.length === 0) {
        enqueueSnackbar(
          response.message || `${successful.length} mise(s) à jour appliquée(s)`,
          { variant: 'success' }
        )
      } else {
        enqueueSnackbar(
          `${successful.length} appliquée(s), ${failed.length} échec(s)`,
          { variant: 'warning' }
        )
      }
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || 'Erreur lors de l\'application en masse',
        { variant: 'error' }
      )
    },
  })
}

// Cache hooks
export const useEvents = (filters: { limit?: number; search?: string } = {}) => {
  return useQuery({
    queryKey: ['cache', 'events', filters],
    queryFn: () => cacheApi.getEvents(filters),
    staleTime: 300000, // 5 minutes - events don't change often
  })
}

export const useEditions = (filters: { eventId?: string; limit?: number } = {}) => {
  return useQuery({
    queryKey: ['cache', 'editions', filters],
    queryFn: () => cacheApi.getEditions(filters),
    staleTime: 300000, // 5 minutes
    enabled: !!filters.eventId, // Only run if eventId is provided
  })
}

export const useRaces = (filters: { editionId?: string; limit?: number } = {}) => {
  return useQuery({
    queryKey: ['cache', 'races', filters],
    queryFn: () => cacheApi.getRaces(filters),
    staleTime: 300000, // 5 minutes
    enabled: !!filters.editionId, // Only run if editionId is provided
  })
}

// Events hooks (kill/revive)
export const useKillEvent = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: (eventId: string) => eventsApi.kill(eventId),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
      enqueueSnackbar(response.message || 'Événement tué avec succès', { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || 'Erreur lors de la mise à mort de l\'événement',
        { variant: 'error' }
      )
    },
  })
}

export const useReviveEvent = () => {
  const queryClient = useQueryClient()
  const { enqueueSnackbar } = useSnackbar()

  return useMutation({
    mutationFn: (eventId: string) => eventsApi.revive(eventId),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['proposals'] })
      enqueueSnackbar(response.message || 'Événement ressuscité avec succès', { variant: 'success' })
    },
    onError: (error: any) => {
      enqueueSnackbar(
        error.response?.data?.error?.message || 'Erreur lors de la résurrection de l\'événement',
        { variant: 'error' }
      )
    },
  })
}

// Miles Republic direct access hooks
export const useMilesRepublicEvents = (filters: { limit?: number; search?: string } = {}) => {
  return useQuery({
    queryKey: ['miles-republic', 'events', filters],
    queryFn: () => cacheApi.getMilesRepublicEvents(filters),
    staleTime: 60000, // 1 minute - real-time data
  })
}

export const useMilesRepublicEditions = (filters: { eventId?: string; limit?: number } = {}) => {
  return useQuery({
    queryKey: ['miles-republic', 'editions', filters],
    queryFn: () => cacheApi.getMilesRepublicEditions(filters),
    staleTime: 60000, // 1 minute
    enabled: !!filters.eventId, // Only enable when eventId is provided
  })
}

export const useMilesRepublicRaces = (filters: { editionId?: string; limit?: number } = {}) => {
  return useQuery({
    queryKey: ['miles-republic', 'races', filters],
    queryFn: () => cacheApi.getMilesRepublicRaces(filters),
    staleTime: 60000, // 1 minute
    enabled: !!filters.editionId, // Only enable when editionId is provided
  })
}
