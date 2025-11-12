/**
 * ProposalEditRedirect
 * 
 * Composant de redirection pour forcer l'édition via la vue groupée.
 * 
 * Phase 3 du refactoring : ProposalDetailBase est maintenant en lecture seule.
 * Toute édition doit passer par GroupedProposalDetailBase (même pour 1 proposition).
 */

import { Navigate, useParams } from 'react-router-dom'

function ProposalEditRedirect() {
  const { proposalId } = useParams<{ proposalId: string }>()
  
  if (!proposalId) {
    return <Navigate to="/proposals" replace />
  }
  
  // Rediriger vers la vue groupée avec un seul ID
  return <Navigate to={`/proposals/group/${proposalId}`} replace />
}

export default ProposalEditRedirect
