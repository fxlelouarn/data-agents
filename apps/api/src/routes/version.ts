import express from 'express'
import { getVersions } from '../version'

const router = express.Router()

/**
 * GET /api/version
 * Retourne les versions de l'application et des agents
 */
router.get('/', (req, res) => {
  try {
    const versions = getVersions()
    
    res.json({
      success: true,
      data: versions
    })
  } catch (error) {
    console.error('Error fetching versions:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch versions',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

export const versionRouter = router
