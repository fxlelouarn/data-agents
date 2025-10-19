/**
 * Live Agent Context for testing with real dependencies
 * Uses actual database connections and API calls instead of mocks
 */

const path = require('path');

/**
 * Create a real AgentContext with actual dependencies
 */
function createLiveAgentContext(config = {}, logger) {
    // Create a logger compatible with AgentLogger interface
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
        },

        startOperation: (operation) => {
            const startTime = Date.now();
            agentLogger.info(`⚙️  Starting operation: ${operation}`);
            
            return {
                info: (message, data) => agentLogger.info(`[${operation}] ${message}`, data),
                warn: (message, data) => agentLogger.warn(`[${operation}] ${message}`, data),
                error: (message, data) => agentLogger.error(`[${operation}] ${message}`, data),
                debug: (message, data) => agentLogger.debug(`[${operation}] ${message}`, data),
                complete: (message, data) => {
                    const duration = Date.now() - startTime;
                    agentLogger.info(`✅ [${operation}] ${message} (${duration}ms)`, data);
                },
                fail: (message, error) => {
                    const duration = Date.now() - startTime;
                    agentLogger.error(`❌ [${operation}] ${message} (${duration}ms)`, { 
                        error: error.message, 
                        stack: error.stack 
                    });
                }
            };
        }
    };
    
    // Create the AgentContext compatible object
    const agentContext = {
        // AgentContext interface properties
        runId: `live-test-run-${Date.now()}`,
        startedAt: new Date(),
        logger: agentLogger,
        config: config
    };
    
    return agentContext;
}

/**
 * Create a real database service using Prisma directly
 */
async function createLiveDatabaseService(logger) {
    try {
        logger.info('🔗 Initializing live database service with direct Prisma...');
        
        // Import Prisma directly
        const { PrismaClient } = await import('@prisma/client');
        
        // Create Prisma client
        const prismaClient = new PrismaClient({
            log: ['info', 'warn', 'error']
        });
        
        // Test the connection
        logger.info('🧪 Testing database connection...');
        await prismaClient.$connect();
        logger.info('✅ Database connection successful');
        
        // Create a proper DatabaseService-like object for BaseAgent compatibility
        const dbService = {
            prisma: prismaClient,
            
            // Mock state service for BaseAgent
            state: {
                getState: async (agentId, key) => {
                    logger.debug(`📊 Live State: Getting state for ${agentId}.${key}`);
                    // Simple in-memory state for testing
                    const stateKey = `${agentId}_${key}`;
                    const state = global.testAgentState || {};
                    return state[stateKey] || null;
                },
                setState: async (agentId, key, value) => {
                    logger.debug(`📊 Live State: Setting state for ${agentId}.${key} = ${value}`);
                    const stateKey = `${agentId}_${key}`;
                    global.testAgentState = global.testAgentState || {};
                    global.testAgentState[stateKey] = value;
                    return Promise.resolve();
                }
            },
            
            // Mock proposals service - Display in console for testing
            proposals: {
                create: async (type, changes, justification, eventId, editionId, raceId, confidence) => {
                    const proposal = {
                        id: `test-proposal-${Date.now()}`,
                        type,
                        changes,
                        justification,
                        eventId,
                        editionId,
                        raceId,
                        confidence: confidence || 0.8,
                        createdAt: new Date().toISOString()
                    };
                    
                    // Display proposal in console with nice formatting
                    console.log('\n' + '='.repeat(80));
                    console.log('📝 PROPOSITION CRÉÉE (MODE TEST - PAS ENREGISTRÉE)');
                    console.log('='.repeat(80));
                    console.log(`🏷️  Type: ${type}`);
                    console.log(`🎯 Event ID: ${eventId || 'N/A'}`);
                    console.log(`📅 Edition ID: ${editionId || 'N/A'}`);
                    console.log(`🏁 Race ID: ${raceId || 'N/A'}`);
                    console.log(`📊 Confiance: ${(confidence || 0.8) * 100}%`);
                    console.log(`⏰ Créée le: ${proposal.createdAt}`);
                    
                    console.log('\n🔄 CHANGEMENTS:');
                    if (typeof changes === 'object' && changes !== null) {
                        Object.entries(changes).forEach(([key, value]) => {
                            console.log(`  • ${key}: ${JSON.stringify(value, null, 2)}`);
                        });
                    } else {
                        console.log(`  ${JSON.stringify(changes, null, 2)}`);
                    }
                    
                    console.log('\n📜 JUSTIFICATIONS:');
                    if (Array.isArray(justification)) {
                        justification.forEach((just, index) => {
                            console.log(`  ${index + 1}. ${typeof just === 'string' ? just : JSON.stringify(just, null, 2)}`);
                        });
                    } else {
                        console.log(`  ${typeof justification === 'string' ? justification : JSON.stringify(justification, null, 2)}`);
                    }
                    
                    console.log('='.repeat(80) + '\n');
                    
                    logger.info('✅ Proposition affichée en console (mode test)', { 
                        proposalId: proposal.id,
                        type,
                        confidence
                    });
                    
                    return proposal;
                }
            },
            
            // Add database connection service for DatabaseManager compatibility
            databases: {
                findMany: async () => {
                    logger.debug('📊 Live DB Service: Finding database connections...');
                    
                    try {
                        const connections = await prismaClient.databaseConnection.findMany({
                            where: { isActive: true }
                        });
                        
                        logger.debug(`📊 Found ${connections.length} database connections`);
                        return connections;
                        
                    } catch (error) {
                        logger.warn('⚠️ Could not fetch database connections', { error: error.message });
                        return [];
                    }
                }
            },
            
            // Add createProposal method for BaseAgent compatibility
            createProposal: async (data) => {
                // Delegate to the proposals service
                return await dbService.proposals.create(
                    data.type,
                    data.changes,
                    data.justification,
                    data.eventId,
                    data.editionId,
                    data.raceId,
                    data.confidence
                );
            }
        };
        
        return dbService;
        
    } catch (error) {
        logger.error('❌ Failed to create live database service', { error: error.message });
        throw error;
    }
}

/**
 * Setup live configuration database if needed
 */
async function setupLiveDatabase(config, logger) {
    try {
        // If sourceDatabase is localhost, log the configuration we'll use
        if (config.sourceDatabase === 'localhost') {
            logger.info('🔧 Using localhost database configuration...');
            logger.info('✅ Will connect directly to Miles Republic database', {
                url: process.env.MILES_REPUBLIC_DATABASE_URL ? 'configured' : 'not configured'
            });
        }
        
    } catch (error) {
        logger.warn('⚠️  Could not setup database configuration, proceeding anyway...', { 
            error: error.message 
        });
        // Don't throw - let the agent try to continue
    }
}

module.exports = {
    createLiveAgentContext,
    createLiveDatabaseService,
    setupLiveDatabase
};