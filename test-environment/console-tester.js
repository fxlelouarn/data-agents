#!/usr/bin/env node

const { createLogger } = require('./utils/logger');
const { AgentTester } = require('./utils/AgentTester');
const { parseArguments } = require('./utils/cli-parser');
const path = require('path');

/**
 * Test Environment for Data Agents
 * Usage: node test-environment/console-tester.js <agent-name> [options]
 * 
 * Examples:
 *   node test-environment/console-tester.js GoogleSearchDateAgent --config ./configs/google-agent.json
 *   node test-environment/console-tester.js ffa-scraper --dry-run --verbose
 *   node test-environment/console-tester.js GoogleSearchDateAgent --interactive
 */

async function main() {
    const logger = createLogger('TestRunner');
    
    try {
        // Parse command line arguments
        const args = parseArguments(process.argv.slice(2));
        
        if (!args.agentName) {
            console.log(`
🤖 Data Agents Test Environment
==============================

Usage: node console-tester.js <agent-name> [options]

Options:
  --config <file>     Configuration file (JSON)
  --dry-run          Simulation mode (no real actions)
  --verbose          Detailed logging output
  --interactive      Interactive mode with prompts
  --timeout <ms>     Execution timeout (default: 30000)
  --batch-size <n>   Batch size for processing (default: 10)
  --output <file>    Save output to file
  --no-color         Disable colored output
  --debug            Enable debug mode with extra details

Available Agents:
  - GoogleSearchDateAgent    Search for event dates via Google
  - ffa-scraper             FFA website scraper

Examples:
  node console-tester.js GoogleSearchDateAgent --config ./configs/google.json
  node console-tester.js ffa-scraper --dry-run --verbose
  node console-tester.js GoogleSearchDateAgent --interactive
            `);
            process.exit(0);
        }

        logger.info('🚀 Starting Agent Test Environment', {
            agentName: args.agentName,
            options: args.options,
            timestamp: new Date().toISOString()
        });

        // Initialize the agent tester
        const tester = new AgentTester(args.agentName, args.options, logger);
        
        // Setup signal handlers for graceful shutdown
        process.on('SIGINT', async () => {
            logger.warn('🛑 Received SIGINT, shutting down gracefully...');
            await tester.cleanup();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            logger.warn('🛑 Received SIGTERM, shutting down gracefully...');
            await tester.cleanup();
            process.exit(0);
        });

        // Run the agent test
        const result = await tester.run();
        
        // Display results
        if (result.success) {
            logger.info('✅ Agent execution completed successfully', {
                duration: result.duration,
                itemsProcessed: result.itemsProcessed,
                outputFile: args.options.output
            });
        } else {
            logger.error('❌ Agent execution failed', {
                error: result.error,
                duration: result.duration
            });
            process.exit(1);
        }
        
    } catch (error) {
        logger.error('💥 Fatal error in test environment', { 
            error: error.message, 
            stack: error.stack 
        });
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run if this file is executed directly
if (require.main === module) {
    main();
}

module.exports = { main };