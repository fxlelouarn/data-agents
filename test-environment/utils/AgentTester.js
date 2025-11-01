const fs = require('fs').promises;
const path = require('path');
const { loadConfig, mergeOptionsWithConfig } = require('./cli-parser');
const { createMockContext } = require('./mock-context');
const { createBaseAgentContext, createMockDatabaseService } = require('./base-agent-context');
const { createLiveAgentContext, createLiveDatabaseService, setupLiveDatabase } = require('./live-agent-context');
const { InteractivePrompt } = require('./interactive-prompt');
const { initializeTestDatabaseConfigs, applyFrameworkDatabaseConfig } = require('./test-database-configs');

/**
 * AgentTester - Main class for testing agents in a console environment
 */
class AgentTester {
    constructor(agentName, options, logger) {
        this.agentName = agentName;
        this.options = options;
        this.logger = logger;
        this.agent = null;
        this.agentId = null; // Will be set during initialization
        this.testAgentCreated = false;
        this.startTime = null;
        this.results = {
            success: false,
            duration: 0,
            itemsProcessed: 0,
            error: null,
            outputs: []
        };
    }

    /**
     * Ensure test agent exists in framework database
     */
    async ensureTestAgentExists(agentConfig, logger) {
        try {
            // Use the database package's Prisma client
            const { prisma } = await import('@data-agents/database');
            
            // Check if agent exists
            const existingAgent = await prisma.agent.findUnique({
                where: { id: agentConfig.id }
            });
            
            if (!existingAgent) {
                logger.info(`🔧 Creating test agent in framework database: ${agentConfig.id}`);
                
                await prisma.agent.create({
                    data: {
                        id: agentConfig.id,
                        name: agentConfig.name,
                        type: agentConfig.type,
                        frequency: agentConfig.frequency,
                        isActive: agentConfig.isActive,
                        config: agentConfig.config || {}
                    }
                });
                
                this.testAgentCreated = true;
                logger.info(`✅ Test agent created: ${agentConfig.id}`);
            } else {
                this.testAgentCreated = false;
                logger.info(`ℹ️  Test agent already exists: ${agentConfig.id}`);
            }
        } catch (error) {
            logger.warn(`Could not create test agent in framework database: ${error.message}`);
            this.testAgentCreated = false;
        }
    }
    
    /**
     * Cleanup test agent from framework database
     */
    async cleanupTestAgent(agentId, logger) {
        if (!this.testAgentCreated) {
            logger.info(`ℹ️  Skipping cleanup - test agent was not created by this test`);
            return; // Don't delete if we didn't create it
        }
        
        try {
            logger.info(`🧹 Cleaning up test agent: ${agentId}`);
            
            // Use the database package's Prisma client
            const { prisma } = await import('@data-agents/database');
            
            // Delete related data first (cascade)
            const statesDeleted = await prisma.agentState.deleteMany({ where: { agentId } });
            logger.info(`   Deleted ${statesDeleted.count} agent states`);
            
            const logsDeleted = await prisma.agentLog.deleteMany({ where: { agentId } });
            logger.info(`   Deleted ${logsDeleted.count} agent logs`);
            
            const runsDeleted = await prisma.agentRun.deleteMany({ where: { agentId } });
            logger.info(`   Deleted ${runsDeleted.count} agent runs`);
            
            // Delete the agent
            await prisma.agent.delete({ where: { id: agentId } });
            logger.info(`   Deleted agent record`);
            
            logger.info(`✅ Test agent cleaned up: ${agentId}`);
        } catch (error) {
            logger.warn(`⚠️  Could not cleanup test agent: ${error.message}`);
            logger.debug(`Cleanup error stack: ${error.stack}`);
        }
    }

    /**
     * Initialize the agent for testing
     */
    async initializeAgent() {
        const initOperation = this.logger.startOperation('agent-initialization');
        
        try {
            // Load configuration if provided
            let config = {};
            if (this.options.config) {
                initOperation.info(`Loading configuration from: ${this.options.config}`);
                config = loadConfig(this.options.config);
                initOperation.debug('Configuration loaded', { config: this.sanitizeConfig(config) });
            }

            // Merge options with config
            const mergedConfig = mergeOptionsWithConfig(this.options, config);
            
            // Apply framework database configuration from test-env (if configured)
            // This must be done early, before any Prisma clients are created
            applyFrameworkDatabaseConfig(initOperation);
            
            // Set log level based on options
            if (this.options.debug) {
                process.env.LOG_LEVEL = 'DEBUG';
            } else if (this.options.verbose) {
                process.env.LOG_LEVEL = 'INFO';
            }

            // Try to load the agent dynamically
            const agentPath = await this.findAgentPath();
            initOperation.info(`Loading agent from: ${agentPath}`);
            
            // Import the agent class
            const AgentClass = await this.loadAgentClass(agentPath);
            
            // Check if we should use live mode
            const isLiveMode = mergedConfig.testMode === 'live' || mergedConfig.useMockContext === false;
            
            let agentContext, dbService;
            
            if (isLiveMode) {
                initOperation.info('🚀 Using LIVE mode - real database and API calls');
                
                // Setup live database configuration if needed
                await setupLiveDatabase(mergedConfig, initOperation);
                
                // Create live context and database service
                agentContext = createLiveAgentContext(mergedConfig, this.logger);
                dbService = await createLiveDatabaseService(initOperation);
            } else {
                initOperation.info('🧪 Using MOCK mode - simulated calls');
                
                // Create BaseAgent-compatible context and database service (mock)
                agentContext = createBaseAgentContext(mergedConfig, this.logger);
                dbService = createMockDatabaseService(this.logger);
            }
            
            // Prepare agent configuration
            const agentConfig = {
                id: mergedConfig.id || mergedConfig.agentId || this.agentName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                name: mergedConfig.name || mergedConfig.agentName || this.agentName,
                type: mergedConfig.type || mergedConfig.agentType || 'EXTRACTOR',
                frequency: mergedConfig.frequency || '0 */6 * * *',
                isActive: mergedConfig.isActive ?? true,
                config: mergedConfig.config || {}
            };
            
            // Create console logger for test mode
            let agentLogger = null;
            if (isLiveMode) {
                try {
                    // Import console logger for tests (CommonJS require)
                    const { createConsoleLogger } = require('@data-agents/agent-framework');
                    agentLogger = createConsoleLogger(agentConfig.name, agentConfig.id);
                    initOperation.info('📋 Using console-only logger for test mode');
                } catch (error) {
                    initOperation.warn('Could not create console logger, using default', { error: error.message });
                }
            }
            
            // Store agent ID for cleanup
            this.agentId = agentConfig.id;
            
            // Instantiate the agent (BaseAgent interface: constructor(config, db, logger))
            this.agent = new AgentClass(agentConfig, dbService, agentLogger);
            this.agentContext = agentContext; // Store context for run method
            
            // If agent has a DatabaseManager, inject test configurations
            if (this.agent.dbManager) {
                // First, try to auto-detect database configs from environment variables
                initOperation.info('🔧 Detecting database configurations from environment...');
                const autoDetectedConfigs = await initializeTestDatabaseConfigs(this.agent.dbManager, initOperation);
                
                // Then, add any explicit test configs from mergedConfig
                if (mergedConfig.testDatabaseConfigs && mergedConfig.testDatabaseConfigs.length > 0) {
                    initOperation.info(`🔧 Adding ${mergedConfig.testDatabaseConfigs.length} explicit test database configuration(s)...`);
                    this.agent.dbManager.addTestConfigs(mergedConfig.testDatabaseConfigs);
                }
            }
            
            // Apply test configuration
            if (this.agent.configure && typeof this.agent.configure === 'function') {
                await this.agent.configure(mergedConfig);
            }
            
            // Ensure test agent exists in framework database
            await this.ensureTestAgentExists(agentConfig, initOperation);

            initOperation.complete('Agent initialized successfully', {
                agentName: this.agentName,
                agentType: this.agent.constructor.name,
                config: this.sanitizeConfig(mergedConfig)
            });

            return true;
        } catch (error) {
            initOperation.fail('Failed to initialize agent', error);
            throw error;
        }
    }

    /**
     * Find the path to the agent file
     */
    async findAgentPath() {
        const possiblePaths = [
            // Look in apps/agents/src
            path.join(process.cwd(), 'apps', 'agents', 'src', `${this.agentName}.ts`),
            path.join(process.cwd(), 'apps', 'agents', 'src', `${this.agentName}.js`),
            
            // Look for lowercase versions
            path.join(process.cwd(), 'apps', 'agents', 'src', `${this.agentName.toLowerCase()}.ts`),
            path.join(process.cwd(), 'apps', 'agents', 'src', `${this.agentName.toLowerCase()}.js`),
            
            // Look with different naming conventions
            path.join(process.cwd(), 'apps', 'agents', 'src', `${this.agentName}-agent.ts`),
            path.join(process.cwd(), 'apps', 'agents', 'src', `${this.agentName}-agent.js`),
            
            // Look in test-environment/agents (for test agents)
            path.join(process.cwd(), 'test-environment', 'agents', `${this.agentName}.js`),
            path.join(process.cwd(), 'test-environment', 'agents', `${this.agentName}.ts`)
        ];

        for (const agentPath of possiblePaths) {
            try {
                await fs.access(agentPath);
                return agentPath;
            } catch (error) {
                // File doesn't exist, continue to next path
                continue;
            }
        }

        // If not found, list available agents
        const availableAgents = await this.listAvailableAgents();
        throw new Error(`Agent '${this.agentName}' not found. Available agents: ${availableAgents.join(', ')}`);
    }

    /**
     * List available agents
     */
    async listAvailableAgents() {
        const agents = [];
        const agentsDir = path.join(process.cwd(), 'apps', 'agents', 'src');
        
        try {
            const files = await fs.readdir(agentsDir);
            for (const file of files) {
                if (file.endsWith('.ts') || file.endsWith('.js')) {
                    const agentName = file.replace(/\.(ts|js)$/, '');
                    if (!agentName.includes('test') && !agentName.includes('spec')) {
                        agents.push(agentName);
                    }
                }
            }
        } catch (error) {
            this.logger.warn('Could not list available agents', { error: error.message });
        }

        return agents;
    }

    /**
     * Register ts-node for TypeScript support
     */
    registerTsNode() {
        // Check if ts-node is already registered
        if (process.env.TS_NODE_PROJECT) {
            return; // Already registered
        }
        
        // Try multiple ways to import ts-node
        let tsNode;
        try {
            tsNode = require('ts-node');
        } catch (error) {
            // Try alternative import
            try {
                tsNode = require('ts-node/register');
                return; // Registration happened during require
            } catch (registerError) {
                throw new Error('ts-node not found. Please install ts-node: npm install -D ts-node');
            }
        }
        
        // Register ts-node if we have the module
        if (tsNode && tsNode.register) {
            const path = require('path');
            const testTsConfigPath = path.join(__dirname, '..', 'tsconfig.json');
            
            tsNode.register({
                project: testTsConfigPath,
                transpileOnly: true, // Faster compilation, skip type checking
                compilerOptions: {
                    module: 'CommonJS',
                    target: 'ES2020',
                    esModuleInterop: true,
                    allowSyntheticDefaultImports: true,
                    skipLibCheck: true,
                    moduleResolution: 'node'
                }
            });
        }
    }

    /**
     * Load agent class dynamically
     */
    async loadAgentClass(agentPath) {
        try {
            // Handle TypeScript files (requires ts-node or compilation)
            if (agentPath.endsWith('.ts')) {
                // Try to find compiled JS version first
                const compiledPath = agentPath.replace('.ts', '.js');
                try {
                    await fs.access(compiledPath);
                    return this.requireAgentModule(compiledPath);
                } catch (error) {
                    // If compiled version doesn't exist, try to use ts-node
                    try {
                        // First try to register ts-node
                        this.registerTsNode();
                        return this.requireAgentModule(agentPath);
                    } catch (tsError) {
                        throw new Error(`TypeScript agent found but ts-node not available. Please compile the agent first or install ts-node. Error: ${tsError.message}`);
                    }
                }
            } else {
                return this.requireAgentModule(agentPath);
            }
        } catch (error) {
            throw new Error(`Failed to load agent class: ${error.message}`);
        }
    }

    /**
     * Require agent module and extract class
     */
    requireAgentModule(agentPath) {
        // Clear require cache to ensure fresh load
        delete require.cache[require.resolve(agentPath)];
        
        const agentModule = require(agentPath);
        
        // Try to find the agent class in the module
        let AgentClass = null;
        
        // Check for default export
        if (agentModule.default && typeof agentModule.default === 'function') {
            AgentClass = agentModule.default;
        }
        // Check for named export matching the agent name
        else if (agentModule[this.agentName]) {
            AgentClass = agentModule[this.agentName];
        }
        // Check for any class that looks like an agent
        else {
            for (const [key, value] of Object.entries(agentModule)) {
                if (typeof value === 'function' && 
                    (key.toLowerCase().includes('agent') || key === this.agentName)) {
                    AgentClass = value;
                    break;
                }
            }
        }

        if (!AgentClass) {
            throw new Error(`No agent class found in ${agentPath}. Expected class name: ${this.agentName}`);
        }

        return AgentClass;
    }

    /**
     * Run the agent test
     */
    async run() {
        this.startTime = Date.now();
        const runOperation = this.logger.startOperation('agent-test-execution');

        try {
            this.logger.separator('Agent Test Execution');
            
            // Initialize the agent
            await this.initializeAgent();
            
            // Display agent information
            this.displayAgentInfo();
            
            // Interactive mode prompts
            if (this.options.interactive) {
                const shouldContinue = await this.handleInteractiveMode();
                if (!shouldContinue) {
                    return { success: true, duration: 0, cancelled: true };
                }
            }

            // Execute the agent
            const executionResult = await this.executeAgent();
            
            // Process results
            this.processResults(executionResult);
            
            // Display summary
            this.displaySummary();
            
            runOperation.complete('Agent test completed successfully', {
                duration: this.results.duration,
                itemsProcessed: this.results.itemsProcessed
            });
            
            // Cleanup test agent if we created it
            if (this.agentId) {
                await this.cleanupTestAgent(this.agentId, this.logger);
            }

            return this.results;

        } catch (error) {
            this.results.error = error;
            this.results.duration = Date.now() - this.startTime;
            
            runOperation.fail('Agent test failed', error);
            
            // Cleanup test agent even on error
            if (this.agentId) {
                await this.cleanupTestAgent(this.agentId, this.logger);
            }
            
            return this.results;
        }
    }

    /**
     * Display agent information
     */
    displayAgentInfo() {
        const info = [
            `Agent: ${this.agentName}`,
            `Type: ${this.agent.constructor.name}`,
            `Mode: ${this.options.dryRun ? 'DRY RUN' : 'LIVE'}`,
            `Timeout: ${this.options.timeout}ms`,
            `Batch Size: ${this.options.batchSize}`
        ];

        if (this.options.config) {
            info.push(`Config: ${this.options.config}`);
        }

        this.logger.box('Agent Information', info);
    }

    /**
     * Handle interactive mode prompts
     */
    async handleInteractiveMode() {
        const prompt = new InteractivePrompt(this.logger);
        
        this.logger.info('🎯 Interactive Mode Enabled');
        
        const questions = [
            {
                name: 'proceed',
                type: 'confirm',
                message: 'Do you want to proceed with the agent execution?',
                default: true
            }
        ];

        // Add agent-specific questions if the agent supports it
        if (this.agent.getInteractiveQuestions && typeof this.agent.getInteractiveQuestions === 'function') {
            const agentQuestions = this.agent.getInteractiveQuestions();
            questions.push(...agentQuestions);
        }

        const answers = await prompt.ask(questions);
        
        if (!answers.proceed) {
            this.logger.info('User cancelled execution');
            return false;
        }

        // Apply interactive answers to agent configuration
        if (this.agent.applyInteractiveAnswers && typeof this.agent.applyInteractiveAnswers === 'function') {
            this.agent.applyInteractiveAnswers(answers);
        }

        return true;
    }

    /**
     * Execute the agent
     */
    async executeAgent() {
        const execOperation = this.logger.startOperation('agent-execution');
        
        try {
            let result;
            
            // Set timeout
            const timeout = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Agent execution timeout')), this.options.timeout);
            });
            
            // Execute agent based on its type/interface
            const execution = this.executeAgentMethod();
            
            // Race between execution and timeout
            result = await Promise.race([execution, timeout]);
            
            execOperation.complete('Agent execution finished', { 
                resultType: typeof result,
                hasResults: !!result
            });
            
            return result;
            
        } catch (error) {
            execOperation.fail('Agent execution failed', error);
            throw error;
        }
    }

    /**
     * Execute the appropriate agent method
     */
    async executeAgentMethod() {
        // BaseAgent interface: run(context) method
        if (this.agent.run && typeof this.agent.run === 'function') {
            this.logger.debug('Executing BaseAgent run method with context');
            return await this.agent.run(this.agentContext);
        }
        
        // Fallback for other agent types
        const methods = ['execute', 'process', 'scrape', 'extract'];
        
        for (const method of methods) {
            if (this.agent[method] && typeof this.agent[method] === 'function') {
                this.logger.debug(`Executing agent method: ${method}`);
                return await this.agent[method]();
            }
        }
        
        throw new Error('No suitable execution method found on agent. Expected BaseAgent.run(context) or one of: ' + methods.join(', '));
    }

    /**
     * Process execution results
     */
    processResults(result) {
        this.results.duration = Date.now() - this.startTime;
        this.results.success = true;
        
        // Extract metrics from result
        if (result && typeof result === 'object') {
            this.results.itemsProcessed = result.itemsProcessed || result.count || result.length || 0;
            this.results.outputs = result.outputs || result.data || result.results || [];
            
            // Handle proposals if present
            if (result.proposals && Array.isArray(result.proposals)) {
                this.displayProposals(result.proposals);
            }
        } else if (Array.isArray(result)) {
            this.results.itemsProcessed = result.length;
            this.results.outputs = result;
        }

        // Save output to file if requested
        if (this.options.output) {
            this.saveOutputToFile(result);
        }
    }
    
    /**
     * Display proposals in a readable format
     */
    displayProposals(proposals) {
        if (!proposals || proposals.length === 0) {
            return;
        }
        
        this.logger.separator('Propositions Générées');
        this.logger.info(`📝 ${proposals.length} proposition(s) créée(s):\n`);
        
        proposals.forEach((proposal, index) => {
            console.log(`\n${'='.repeat(80)}`);
            console.log(`Proposition #${index + 1} - ${proposal.type}`);
            console.log('='.repeat(80));
            
            // Display event/edition/race info
            if (proposal.eventName) console.log(`🎯 Event: ${proposal.eventName}`);
            if (proposal.eventId) console.log(`🎯 Event ID: ${proposal.eventId}`);
            if (proposal.editionId) console.log(`📅 Edition ID: ${proposal.editionId}`);
            if (proposal.raceId) console.log(`🏁 Race ID: ${proposal.raceId}`);
            if (proposal.confidence !== undefined) console.log(`📊 Confiance: ${(proposal.confidence * 100).toFixed(1)}%`);
            
            // Display changes
            if (proposal.changes) {
                console.log('\n🔄 CHANGEMENTS:');
                if (typeof proposal.changes === 'object') {
                    Object.entries(proposal.changes).forEach(([key, value]) => {
                        console.log(`  • ${key}:`);
                        console.log(`    ${JSON.stringify(value, null, 4).split('\n').join('\n    ')}`);
                    });
                } else {
                    console.log(`  ${JSON.stringify(proposal.changes, null, 2)}`);
                }
            }
            
            // Display justifications
            if (proposal.justification) {
                console.log('\n📜 JUSTIFICATIONS:');
                if (Array.isArray(proposal.justification)) {
                    proposal.justification.forEach((just, idx) => {
                        if (typeof just === 'string') {
                            console.log(`  ${idx + 1}. ${just}`);
                        } else if (just.type === 'text') {
                            console.log(`  ${idx + 1}. ${just.content}`);
                            if (just.metadata) {
                                console.log(`     Métadonnées: ${JSON.stringify(just.metadata, null, 2).split('\n').join('\n     ')}`);
                            }
                        } else {
                            console.log(`  ${idx + 1}. ${JSON.stringify(just, null, 2).split('\n').join('\n     ')}`);
                        }
                    });
                } else {
                    console.log(`  ${typeof proposal.justification === 'string' ? proposal.justification : JSON.stringify(proposal.justification, null, 2)}`);
                }
            }
            
            console.log('='.repeat(80));
        });
        
        console.log('\n');
    }

    /**
     * Save output to file
     */
    async saveOutputToFile(result) {
        try {
            const outputData = {
                agentName: this.agentName,
                timestamp: new Date().toISOString(),
                duration: this.results.duration,
                options: this.sanitizeConfig(this.options),
                success: this.results.success,
                itemsProcessed: this.results.itemsProcessed,
                results: result
            };

            await fs.writeFile(this.options.output, JSON.stringify(outputData, null, 2), 'utf8');
            this.logger.success(`Output saved to: ${this.options.output}`);
        } catch (error) {
            this.logger.warn('Failed to save output to file', { error: error.message });
        }
    }

    /**
     * Display execution summary
     */
    displaySummary() {
        const duration = `${this.results.duration}ms`;
        const itemsCount = this.results.itemsProcessed;
        
        this.logger.separator('Execution Summary');
        
        if (this.results.success) {
            this.logger.success('✅ Agent execution completed successfully');
            this.logger.info(`📊 Processed ${itemsCount} items in ${duration}`);
            
            if (this.results.outputs && this.results.outputs.length > 0) {
                this.logger.info(`📄 Generated ${this.results.outputs.length} outputs`);
                
                // Show sample outputs if verbose
                if (this.options.verbose && this.results.outputs.length > 0) {
                    this.logger.debug('Sample outputs:', { 
                        sample: this.results.outputs.slice(0, 3) 
                    });
                }
            }
        } else {
            this.logger.error('❌ Agent execution failed');
            if (this.results.error) {
                this.logger.error('Error details:', { 
                    message: this.results.error.message,
                    stack: this.options.debug ? this.results.error.stack : undefined
                });
            }
        }

        if (this.options.output) {
            this.logger.info(`📁 Output saved to: ${this.options.output}`);
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        try {
            if (this.agent && this.agent.cleanup && typeof this.agent.cleanup === 'function') {
                await this.agent.cleanup();
            }
        } catch (error) {
            this.logger.warn('Error during cleanup', { error: error.message });
        }
    }

    /**
     * Sanitize configuration for logging (remove sensitive data)
     */
    sanitizeConfig(config) {
        const sanitized = { ...config };
        const sensitiveKeys = ['password', 'token', 'key', 'secret', 'api_key', 'apiKey'];
        
        for (const key of Object.keys(sanitized)) {
            if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
                sanitized[key] = '[REDACTED]';
            }
        }
        
        return sanitized;
    }
}

module.exports = { AgentTester };