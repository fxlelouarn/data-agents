/**
 * BaseAgent compatible context for testing
 * Implements the AgentContext interface from @data-agents/agent-framework
 */

const { createMockContext } = require('./mock-context');

/**
 * Create a compatible AgentContext for BaseAgent-derived classes
 */
function createBaseAgentContext(config = {}, logger) {
    // Start with the basic mock context
    const mockContext = createMockContext(config, logger);
    
    // Create a logger compatible with AgentLogger interface from @data-agents/agent-framework
    const agentLogger = {
        debug: (message, data) => {
            if (logger && logger.debug) {
                logger.debug(message, data);
            } else {
                console.log(`🔍 DEBUG: ${message}`, data ? JSON.stringify(data, null, 2) : '');
            }
        },
        
        info: (message, data) => {
            if (logger && logger.info) {
                logger.info(message, data);
            } else {
                console.log(`ℹ️  INFO: ${message}`, data ? JSON.stringify(data, null, 2) : '');
            }
        },
        
        warn: (message, data) => {
            if (logger && logger.warn) {
                logger.warn(message, data);
            } else {
                console.log(`⚠️  WARN: ${message}`, data ? JSON.stringify(data, null, 2) : '');
            }
        },
        
        error: (message, data) => {
            if (logger && logger.error) {
                logger.error(message, data);
            } else {
                console.log(`❌ ERROR: ${message}`, data ? JSON.stringify(data, null, 2) : '');
            }
        }
    };
    
    // Create the AgentContext compatible object
    const agentContext = {
        // AgentContext interface properties
        runId: `test-run-${Date.now()}`,
        startedAt: new Date(),
        logger: agentLogger,
        config: config,
        
        // Additional mock services for BaseAgent compatibility
        ...mockContext
    };
    
    return agentContext;
}

/**
 * Create a mock database service compatible with DatabaseService
 */
function createMockDatabaseService(logger) {
    return {
        // Mock Prisma client
        prisma: {
            event: {
                findMany: async (options) => {
                    console.log('📊 Mock Database: Finding events', options);
                    return [];
                },
                create: async (data) => {
                    console.log('📊 Mock Database: Creating event', data);
                    return { id: `mock-event-${Date.now()}`, ...data.data };
                },
                update: async (options) => {
                    console.log('📊 Mock Database: Updating event', options);
                    return { id: options.where.id, ...options.data };
                }
            },
            proposal: {
                create: async (data) => {
                    console.log('📝 Mock Database: Creating proposal', data);
                    return { id: `mock-proposal-${Date.now()}`, ...data };
                }
            },
            run: {
                create: async (data) => {
                    console.log('🏃 Mock Database: Creating run', data);
                    return { id: `mock-run-${Date.now()}`, ...data };
                },
                update: async (options) => {
                    console.log('🏃 Mock Database: Updating run', options);
                    return { id: options.where.id, ...options.data };
                }
            },
            log: {
                create: async (data) => {
                    console.log('📜 Mock Database: Creating log', data);
                    return { id: `mock-log-${Date.now()}`, ...data };
                }
            },
            // Connection methods for Prisma
            $connect: async () => {
                console.log('🔗 Mock Database: Connecting...');
                return Promise.resolve();
            },
            $disconnect: async () => {
                console.log('🔌 Mock Database: Disconnecting...');
                return Promise.resolve();
            }
        },
        
        // State service for BaseAgent
        state: {
            getState: async (agentId, key) => {
                console.log(`📊 Mock State: Getting state for ${agentId}.${key}`);
                // Return some mock state based on key
                if (key === 'offset') return 0;
                return null;
            },
            setState: async (agentId, key, value) => {
                console.log(`📊 Mock State: Setting state for ${agentId}.${key} = ${value}`);
                return Promise.resolve();
            }
        },
        
        // Proposals service
        proposals: {
            create: async (type, changes, justification, eventId, editionId, raceId, confidence) => {
                console.log('📝 Mock Proposals: Creating proposal', {
                    type,
                    eventId,
                    editionId,
                    raceId,
                    confidence,
                    changes: Object.keys(changes).length,
                    justifications: justification.length
                });
                return {
                    id: `mock-proposal-${Date.now()}`,
                    type,
                    changes,
                    justification,
                    eventId,
                    editionId,
                    raceId,
                    confidence,
                    createdAt: new Date()
                };
            }
        }
    };
}

module.exports = {
    createBaseAgentContext,
    createMockDatabaseService
};