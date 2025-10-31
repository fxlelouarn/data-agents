const fs = require('fs');
const path = require('path');

/**
 * Parse command line arguments for the agent test environment
 */
function parseArguments(args) {
    const parsed = {
        agentName: null,
        options: {
            config: null,
            dryRun: false,
            verbose: false,
            interactive: false,
            timeout: 30000,
            batchSize: 10,
            output: null,
            noColor: false,
            debug: false
        }
    };
    
    // First argument is the agent name (if it doesn't start with --)
    if (args.length > 0 && !args[0].startsWith('--')) {
        parsed.agentName = args[0];
        args = args.slice(1);
    }
    
    // Parse options
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '--config':
                if (i + 1 < args.length) {
                    parsed.options.config = args[++i];
                    if (!fs.existsSync(parsed.options.config)) {
                        throw new Error(`Config file not found: ${parsed.options.config}`);
                    }
                } else {
                    throw new Error('--config requires a file path');
                }
                break;
                
            case '--dry-run':
                parsed.options.dryRun = true;
                break;
                
            case '--verbose':
                parsed.options.verbose = true;
                break;
                
            case '--interactive':
                parsed.options.interactive = true;
                break;
                
            case '--timeout':
                if (i + 1 < args.length) {
                    const timeout = parseInt(args[++i]);
                    if (isNaN(timeout) || timeout <= 0) {
                        throw new Error('--timeout must be a positive number');
                    }
                    parsed.options.timeout = timeout;
                } else {
                    throw new Error('--timeout requires a number (milliseconds)');
                }
                break;
                
            case '--batch-size':
                if (i + 1 < args.length) {
                    const batchSize = parseInt(args[++i]);
                    if (isNaN(batchSize) || batchSize <= 0) {
                        throw new Error('--batch-size must be a positive number');
                    }
                    parsed.options.batchSize = batchSize;
                } else {
                    throw new Error('--batch-size requires a number');
                }
                break;
                
            case '--output':
                if (i + 1 < args.length) {
                    parsed.options.output = path.resolve(args[++i]);
                    // Create directory if it doesn't exist
                    const dir = path.dirname(parsed.options.output);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                } else {
                    throw new Error('--output requires a file path');
                }
                break;
                
            case '--no-color':
                parsed.options.noColor = true;
                break;
                
            case '--debug':
                parsed.options.debug = true;
                parsed.options.verbose = true; // Debug implies verbose
                break;
                
            case '--help':
            case '-h':
                return { agentName: null, options: parsed.options };
                
            default:
                if (arg.startsWith('--')) {
                    throw new Error(`Unknown option: ${arg}`);
                } else if (!parsed.agentName) {
                    // If no agent name was set and this doesn't look like an option
                    parsed.agentName = arg;
                }
                break;
        }
    }
    
    return parsed;
}

/**
 * Load and validate configuration from file
 */
function loadConfig(configPath) {
    if (!configPath) {
        return {};
    }
    
    try {
        const configContent = fs.readFileSync(configPath, 'utf8');
        
        // Support both JSON and JS config files
        if (configPath.endsWith('.js')) {
            // For JS files, we need to evaluate them
            delete require.cache[require.resolve(path.resolve(configPath))];
            return require(path.resolve(configPath));
        } else {
            // For JSON files
            return JSON.parse(configContent);
        }
    } catch (error) {
        throw new Error(`Failed to load config file ${configPath}: ${error.message}`);
    }
}

/**
 * Merge command line options with config file
 */
function mergeOptionsWithConfig(options, config) {
    const merged = { ...options };
    
    // Config file values are used as defaults, command line options override them
    // Special handling for 'config' key: preserve the nested config object from file
    Object.keys(config).forEach(key => {
        if (key === 'config') {
            // Don't override nested config object with config file path
            if (!merged.config || typeof merged.config === 'string') {
                // Store file path separately if it exists
                if (typeof merged.config === 'string') {
                    merged.configFilePath = merged.config;
                }
                merged.config = config[key];
            }
        } else if (merged[key] === undefined || merged[key] === null) {
            merged[key] = config[key];
        }
    });
    
    return merged;
}

/**
 * Validate parsed arguments and options
 */
function validateArguments(parsed) {
    const { agentName, options } = parsed;
    
    // Validate agent name
    if (agentName && !/^[a-zA-Z][a-zA-Z0-9-_]*$/.test(agentName)) {
        throw new Error(`Invalid agent name: ${agentName}. Must start with a letter and contain only letters, numbers, hyphens, and underscores.`);
    }
    
    // Validate timeout
    if (options.timeout < 1000) {
        console.warn('Warning: Very short timeout (<1000ms) may cause agents to fail');
    }
    
    // Validate batch size
    if (options.batchSize > 1000) {
        console.warn('Warning: Large batch size (>1000) may cause memory issues');
    }
    
    // If interactive mode and output file, warn user
    if (options.interactive && options.output) {
        console.warn('Warning: Interactive mode with output file may result in mixed output');
    }
    
    return parsed;
}

/**
 * Display help information
 */
function displayHelp() {
    console.log(`
🤖 Data Agents Test Environment - Help
=====================================

Usage: node console-tester.js <agent-name> [options]

Arguments:
  <agent-name>           Name of the agent to test

Options:
  --config <file>        Configuration file (JSON or JS)
  --dry-run             Run in simulation mode (no real actions)
  --verbose             Enable detailed logging output
  --interactive         Interactive mode with prompts
  --timeout <ms>        Execution timeout in milliseconds (default: 30000)
  --batch-size <n>      Batch size for processing (default: 10)
  --output <file>       Save output to specified file
  --no-color            Disable colored console output
  --debug               Enable debug mode (includes verbose)
  --help, -h            Show this help message

Available Agents:
  - GoogleSearchDateAgent    Search for event dates via Google Search
  - ffa-scraper             FFA website scraper

Configuration File:
  Configuration files can be JSON or JavaScript files containing agent-specific
  settings. Command line options override configuration file values.

  Example JSON config:
  {
    "googleApiKey": "your-api-key",
    "batchSize": 20,
    "timeout": 45000,
    "simulationMode": true
  }

Examples:
  # Run Google Search agent with config
  node console-tester.js GoogleSearchDateAgent --config ./configs/google.json

  # Run in dry-run mode with verbose output
  node console-tester.js ffa-scraper --dry-run --verbose

  # Interactive testing with debug output
  node console-tester.js GoogleSearchDateAgent --interactive --debug

  # Save output to file
  node console-tester.js GoogleSearchDateAgent --output ./logs/test-run.log

Environment Variables:
  LOG_LEVEL             Set logging level (DEBUG, INFO, WARN, ERROR)
  NODE_ENV              Set environment (development, production)

For more information, see the project documentation.
    `);
}

module.exports = {
    parseArguments,
    loadConfig,
    mergeOptionsWithConfig,
    validateArguments,
    displayHelp
};