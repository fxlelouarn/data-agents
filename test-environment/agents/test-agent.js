/**
 * Test Agent - Simple agent for testing the test environment
 * This agent demonstrates how to create a testable agent using BaseAgent
 */

// Mock BaseAgent class for testing (in real scenario, import from @data-agents/agent-framework)
class BaseAgent {
    constructor(config, db) {
        this.config = config;
        this.db = db;
        this.logger = {
            debug: (message, data) => console.log(`🔍 [${this.config.name}] ${message}`, data ? JSON.stringify(data, null, 2) : ''),
            info: (message, data) => console.log(`ℹ️  [${this.config.name}] ${message}`, data ? JSON.stringify(data, null, 2) : ''),
            warn: (message, data) => console.log(`⚠️  [${this.config.name}] ${message}`, data ? JSON.stringify(data, null, 2) : ''),
            error: (message, data) => console.log(`❌ [${this.config.name}] ${message}`, data ? JSON.stringify(data, null, 2) : '')
        };
    }

    async createProposal(type, changes, justification, eventId, editionId, raceId, confidence) {
        return await this.db.proposals.create(type, changes, justification, eventId, editionId, raceId, confidence);
    }

    async validate() {
        return true;
    }

    async getStatus() {
        return {
            healthy: true,
            lastRun: new Date(),
            message: 'Test agent is healthy'
        };
    }
}

class TestAgent extends BaseAgent {
    constructor(config, db) {
        super(config, db);
        this.name = 'TestAgent';
    }

    /**
     * Configure the agent with provided options (optional for BaseAgent compatibility)
     */
    async configure(config) {
        // For BaseAgent, configuration is handled in constructor
        this.logger.info('Test agent configuration updated', { config: this.sanitizeConfig(config) });
    }

    /**
     * Get interactive questions for this agent
     */
    getInteractiveQuestions() {
        return [
            {
                name: 'itemsToProcess',
                type: 'number',
                message: 'How many test items should be processed?',
                default: 5,
                min: 1,
                max: 100
            },
            {
                name: 'processingDelay',
                type: 'number',
                message: 'Delay between items (ms)?',
                default: 500,
                min: 0,
                max: 5000
            },
            {
                name: 'simulateError',
                type: 'confirm',
                message: 'Simulate an error during processing?',
                default: false
            }
        ];
    }

    /**
     * Apply answers from interactive mode
     */
    applyInteractiveAnswers(answers) {
        this.config = { ...this.config, ...answers };
        this.logger.info('Applied interactive configuration', answers);
    }

    /**
     * Main execution method - BaseAgent interface
     */
    async run(context) {
        const operation = context.logger.startOperation ? 
            context.logger.startOperation('test-agent-execution') : 
            { info: context.logger.info.bind(context.logger), complete: () => {}, fail: () => {} };
        
        try {
            const config = { ...this.config.config, ...context.config };
            
            operation.info('Starting test agent execution', {
                config: this.sanitizeConfig(config),
                mode: config.dryRun ? 'DRY_RUN' : 'LIVE'
            });

            const itemsToProcess = config.itemsToProcess || 5;
            const processingDelay = config.processingDelay || 500;
            const simulateError = config.simulateError || false;
            
            const results = [];
            
            // Process items
            for (let i = 1; i <= itemsToProcess; i++) {
                const itemOperation = context.logger.startOperation ? 
                    context.logger.startOperation(`process-item-${i}`) :
                    { info: context.logger.info.bind(context.logger), complete: () => {}, fail: () => {} };
                
                try {
                    // Simulate error if requested
                    if (simulateError && i === Math.floor(itemsToProcess / 2)) {
                        throw new Error('Simulated error for testing');
                    }
                    
                    // Simulate some processing work
                    await this.processItem(i, itemOperation);
                    
                    // Create a result
                    const result = {
                        id: `test-item-${i}`,
                        processed: true,
                        timestamp: new Date().toISOString(),
                        data: {
                            name: `Test Event ${i}`,
                            description: `This is test event number ${i}`,
                            value: Math.floor(Math.random() * 100),
                            tags: ['test', 'generated', `batch-${Math.floor(i / 3) + 1}`]
                        }
                    };
                    
                    results.push(result);
                    
                    itemOperation.complete(`Processed item ${i}`, {
                        itemId: result.id,
                        value: result.data.value
                    });
                    
                    // Add delay if not in dry run
                    if (!config.dryRun && processingDelay > 0) {
                        await this.waitForDelay(processingDelay);
                    }
                    
                } catch (error) {
                    itemOperation.fail(`Failed to process item ${i}`, error);
                    
                    // Add failed result
                    results.push({
                        id: `test-item-${i}`,
                        processed: false,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }
            
            // Simulate some database operations if not in dry run
            if (!config.dryRun) {
                await this.saveResults(results, context);
            }
            
            operation.complete('Test agent execution completed', {
                totalItems: itemsToProcess,
                successfulItems: results.filter(r => r.processed).length,
                failedItems: results.filter(r => !r.processed).length
            });

            return {
                success: true,
                itemsProcessed: results.length,
                results,
                summary: {
                    total: itemsToProcess,
                    successful: results.filter(r => r.processed).length,
                    failed: results.filter(r => !r.processed).length
                }
            };
            
        } catch (error) {
            operation.fail('Test agent execution failed', error);
            throw error;
        }
    }

    /**
     * Wait for a specified delay
     */
    async waitForDelay(ms) {
        console.log(`⏱️  Mock Utils: Waiting ${ms}ms`);
        return new Promise(resolve => setTimeout(resolve, Math.min(ms, 100)));
    }

    /**
     * Process a single item (simulates real work)
     */
    async processItem(itemNumber, logger) {
        logger.info(`Processing test item ${itemNumber}`);
        
        // Simulate different types of operations
        switch (itemNumber % 4) {
            case 0:
                // Simulate API call
                logger.debug('Simulating API call');
                console.log('🔍 Mock Google API: Searching', { query: `test query ${itemNumber}`, options: {} });
                break;
                
            case 1:
                // Simulate database query
                logger.debug('Simulating database query');
                console.log('📊 Mock Database: Finding events', { take: 1 });
                break;
                
            case 2:
                // Simulate file operation
                logger.debug('Simulating file operation');
                console.log('💾 Mock FS: Writing file', `/tmp/test-${itemNumber}.txt`, `(string, ${`Test data ${itemNumber}`.length} chars)`);
                break;
                
            case 3:
                // Simulate computation
                logger.debug('Simulating computation');
                const result = Array.from({ length: 1000 }, (_, i) => i * itemNumber).reduce((a, b) => a + b, 0);
                logger.debug('Computation result', { result });
                break;
        }
        
        logger.info(`Item ${itemNumber} processed successfully`);
    }

    /**
     * Save results to database (simulated)
     */
    async saveResults(results, context) {
        const saveOperation = context.logger.startOperation ? 
            context.logger.startOperation('save-results') :
            { info: context.logger.info.bind(context.logger), complete: () => {}, fail: () => {} };
        
        try {
            saveOperation.info('Saving results to database', { count: results.length });
            
            // Simulate database saves
            for (const result of results) {
                if (result.processed) {
                    console.log('📊 Mock Database: Creating event', {
                        data: result
                    });
                }
            }
            
            saveOperation.complete('Results saved successfully');
            
        } catch (error) {
            saveOperation.fail('Failed to save results', error);
            throw error;
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        this.logger.info('Cleaning up test agent resources');
        // Nothing special to clean up for test agent
    }

    /**
     * Sanitize configuration for logging (remove sensitive info)
     */
    sanitizeConfig(config) {
        const sanitized = { ...config };
        // Test agent doesn't have sensitive config, but this is where you'd filter it
        return sanitized;
    }
}

// Export the agent class
module.exports = TestAgent;
// Also export as default for compatibility
module.exports.default = TestAgent;
// Export with the expected name
module.exports.TestAgent = TestAgent;
module.exports['test-agent'] = TestAgent;
