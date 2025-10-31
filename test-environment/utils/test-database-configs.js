/**
 * Utility to automatically detect and create database configurations from environment variables
 * and test-env config files for use in test mode
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse a PostgreSQL connection URL to extract components
 */
function parsePostgresUrl(url) {
    try {
        // Format: postgresql://username:password@host:port/database?params
        const urlObj = new URL(url);
        
        return {
            type: 'postgresql',
            username: decodeURIComponent(urlObj.username),
            password: decodeURIComponent(urlObj.password),
            host: urlObj.hostname,
            port: parseInt(urlObj.port) || 5432,
            database: urlObj.pathname.substring(1).split('?')[0], // Remove leading / and query params
            ssl: urlObj.searchParams.has('ssl') || urlObj.searchParams.has('sslmode'),
            connectionString: url
        };
    } catch (error) {
        return null;
    }
}

/**
 * Load test environment configuration from test-env files
 * Tries to load test-env.local.json first (not versioned), then falls back to test-env.json
 */
function loadTestEnvConfig() {
    const configDir = path.join(process.cwd(), 'test-environment', 'configs');
    const localConfigPath = path.join(configDir, 'test-env.local.json');
    const defaultConfigPath = path.join(configDir, 'test-env.json');
    
    // Try local config first
    if (fs.existsSync(localConfigPath)) {
        try {
            const content = fs.readFileSync(localConfigPath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.warn('Failed to parse test-env.local.json:', error.message);
        }
    }
    
    // Fall back to default config
    if (fs.existsSync(defaultConfigPath)) {
        try {
            const content = fs.readFileSync(defaultConfigPath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.warn('Failed to parse test-env.json:', error.message);
        }
    }
    
    return null;
}

/**
 * Load database configurations from test-env config file
 */
function loadDatabaseConfigsFromFile() {
    const configs = [];
    const testEnv = loadTestEnvConfig();
    
    if (!testEnv || !testEnv.databases) {
        return configs;
    }
    
    // Process each database configuration
    for (const [key, dbConfig] of Object.entries(testEnv.databases)) {
        if (!dbConfig.url) {
            continue; // Skip databases without URLs
        }
        
        const parsed = parsePostgresUrl(dbConfig.url);
        if (parsed) {
            configs.push({
                id: dbConfig.id || `db-${key}`,
                name: dbConfig.name || key,
                type: dbConfig.type || parsed.type,
                host: parsed.host,
                port: parsed.port,
                database: parsed.database,
                username: parsed.username,
                password: parsed.password,
                ssl: parsed.ssl,
                isDefault: dbConfig.isDefault || false,
                isActive: true,
                description: dbConfig.description || `Loaded from test-env config (${key})`,
                connectionString: parsed.connectionString
            });
        }
    }
    
    return configs;
}

/**
 * Detect database configurations from environment variables
 * Looks for common patterns like DATABASE_URL, MILES_REPUBLIC_URL, etc.
 */
function detectDatabaseConfigsFromEnv() {
    const configs = [];
    
    // Common environment variable patterns for database URLs
    const envPatterns = [
        { key: 'DATABASE_URL', id: 'db-default', name: 'Default Database' },
        { key: 'MILES_REPUBLIC_URL', id: 'db-miles-republic', name: 'Miles Republic Database', type: 'miles-republic' },
        { key: 'MILES_REPUBLIC_DATABASE_URL', id: 'db-miles-republic', name: 'Miles Republic Database', type: 'miles-republic' },
        { key: 'NEXT_STAGING_DATABASE_URL', id: 'db-miles-republic-staging', name: 'Miles Republic Staging', type: 'miles-republic' },
    ];
    
    // Check each pattern
    for (const pattern of envPatterns) {
        const url = process.env[pattern.key];
        if (url) {
            const parsed = parsePostgresUrl(url);
            if (parsed) {
                configs.push({
                    id: pattern.id,
                    name: pattern.name,
                    type: pattern.type || parsed.type,
                    host: parsed.host,
                    port: parsed.port,
                    database: parsed.database,
                    username: parsed.username,
                    password: parsed.password,
                    ssl: parsed.ssl,
                    isDefault: pattern.key === 'DATABASE_URL',
                    isActive: true,
                    description: `Auto-detected from ${pattern.key}`,
                    connectionString: parsed.connectionString
                });
            }
        }
    }
    
    // Also check for DATABASE_URL which might be the Miles Republic database in staging
    // If DATABASE_URL looks like it's pointing to Miles Republic (contains 'miles' or 'neon.tech')
    if (process.env.DATABASE_URL) {
        const url = process.env.DATABASE_URL;
        const isMilesRepublic = url.includes('miles') || url.includes('neon.tech');
        
        if (isMilesRepublic && !configs.some(c => c.id === 'db-miles-republic')) {
            const parsed = parsePostgresUrl(url);
            if (parsed) {
                configs.push({
                    id: 'db-miles-republic',
                    name: 'Miles Republic Database (from DATABASE_URL)',
                    type: 'miles-republic',
                    host: parsed.host,
                    port: parsed.port,
                    database: parsed.database,
                    username: parsed.username,
                    password: parsed.password,
                    ssl: parsed.ssl,
                    isDefault: false,
                    isActive: true,
                    description: 'Auto-detected from DATABASE_URL (Miles Republic)',
                    connectionString: parsed.connectionString
                });
            }
        }
    }
    
    return configs;
}

/**
 * Apply framework database configuration from test-env
 * Sets DATABASE_URL and DATABASE_DIRECT_URL if configured
 */
function applyFrameworkDatabaseConfig(logger) {
    const testEnv = loadTestEnvConfig();
    
    if (testEnv && testEnv.frameworkDatabase && testEnv.frameworkDatabase.url) {
        const url = testEnv.frameworkDatabase.url;
        logger.info(`🔧 Setting framework database from test-env config`);
        logger.info(`   Framework DB: ${url.split('@')[1] || 'configured'}`);
        
        // Set environment variables for Prisma
        process.env.DATABASE_URL = url;
        process.env.DATABASE_DIRECT_URL = url;
        
        return true;
    }
    
    return false;
}

/**
 * Initialize test database configurations
 * Loads configs from test-env files, then falls back to environment variables
 */
async function initializeTestDatabaseConfigs(dbManager, logger) {
    const allConfigs = [];
    
    // Priority 1: Load from test-env config files
    const fileConfigs = loadDatabaseConfigsFromFile();
    if (fileConfigs.length > 0) {
        logger.info(`📋 Loaded ${fileConfigs.length} database configuration(s) from test-env config:`);
        for (const config of fileConfigs) {
            logger.info(`   - ${config.name} (${config.id}): ${config.host}/${config.database}`);
        }
        allConfigs.push(...fileConfigs);
    }
    
    // Priority 2: Detect from environment variables (for configs not already loaded)
    const envConfigs = detectDatabaseConfigsFromEnv();
    const existingIds = new Set(allConfigs.map(c => c.id));
    const newEnvConfigs = envConfigs.filter(c => !existingIds.has(c.id));
    
    if (newEnvConfigs.length > 0) {
        logger.info(`🔍 Detected ${newEnvConfigs.length} additional database configuration(s) from environment:`);
        for (const config of newEnvConfigs) {
            logger.info(`   - ${config.name} (${config.id}): ${config.host}/${config.database}`);
        }
        allConfigs.push(...newEnvConfigs);
    }
    
    // Warn if no configs found
    if (allConfigs.length === 0) {
        logger.warn('⚠️  No database configurations detected');
        logger.info('💡 Create test-environment/configs/test-env.local.json or set DATABASE_URL');
        return [];
    }
    
    // Add all configs to DatabaseManager
    if (dbManager && typeof dbManager.addTestConfigs === 'function') {
        dbManager.addTestConfigs(allConfigs);
    }
    
    return allConfigs;
}

module.exports = {
    detectDatabaseConfigsFromEnv,
    loadDatabaseConfigsFromFile,
    loadTestEnvConfig,
    parsePostgresUrl,
    initializeTestDatabaseConfigs,
    applyFrameworkDatabaseConfig
};
