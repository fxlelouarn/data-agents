const util = require('util');
const fs = require('fs').promises;
const path = require('path');

/**
 * Color codes for console output
 */
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    
    // Text colors
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    
    // Background colors
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m'
};

/**
 * Log levels with colors and priorities
 */
const logLevels = {
    DEBUG: { priority: 0, color: colors.dim + colors.cyan, emoji: '🔍' },
    INFO: { priority: 1, color: colors.blue, emoji: 'ℹ️' },
    WARN: { priority: 2, color: colors.yellow, emoji: '⚠️' },
    ERROR: { priority: 3, color: colors.red, emoji: '❌' },
    SUCCESS: { priority: 1, color: colors.green, emoji: '✅' },
    OPERATION: { priority: 1, color: colors.magenta, emoji: '⚙️' }
};

/**
 * Logger class with structured logging and colors
 */
class Logger {
    constructor(context = 'System', options = {}) {
        this.context = context;
        this.options = {
            level: process.env.LOG_LEVEL || options.level || 'INFO',
            colorize: !process.argv.includes('--no-color') && (options.colorize !== false),
            outputFile: options.outputFile,
            includeTimestamp: options.includeTimestamp !== false,
            includeMetadata: options.includeMetadata !== false,
            maxDataLength: options.maxDataLength || 1000
        };
        this.operationStack = [];
        this.startTime = Date.now();
        this.outputs = [];
        
        if (this.options.outputFile) {
            this.initializeOutputFile();
        }
    }
    
    async initializeOutputFile() {
        try {
            const dir = path.dirname(this.options.outputFile);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(this.options.outputFile, 
                `=== Test Log Started at ${new Date().toISOString()} ===\n`,
                { flag: 'w' }
            );
        } catch (error) {
            console.warn('Failed to initialize output file:', error.message);
        }
    }
    
    /**
     * Check if a log level should be output
     */
    shouldLog(level) {
        const currentLevel = logLevels[this.options.level] || logLevels.INFO;
        const messageLevel = logLevels[level] || logLevels.INFO;
        return messageLevel.priority >= currentLevel.priority;
    }
    
    /**
     * Format timestamp
     */
    formatTimestamp() {
        const now = new Date();
        const elapsed = now.getTime() - this.startTime;
        return this.options.colorize 
            ? `${colors.dim}[${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')} +${elapsed}ms]${colors.reset}`
            : `[${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')} +${elapsed}ms]`;
    }
    
    /**
     * Format context and operation stack
     */
    formatContext() {
        const contextParts = [this.context];
        if (this.operationStack.length > 0) {
            contextParts.push(...this.operationStack);
        }
        const contextStr = contextParts.join(' > ');
        
        return this.options.colorize 
            ? `${colors.dim}[${contextStr}]${colors.reset}`
            : `[${contextStr}]`;
    }
    
    /**
     * Truncate data if too long
     */
    truncateData(data) {
        const str = typeof data === 'string' ? data : util.inspect(data, { depth: 3, colors: false });
        if (str.length > this.options.maxDataLength) {
            return str.substring(0, this.options.maxDataLength) + '... (truncated)';
        }
        return str;
    }
    
    /**
     * Format and output log message
     */
    log(level, message, data = {}) {
        if (!this.shouldLog(level)) return;
        
        const levelInfo = logLevels[level] || logLevels.INFO;
        const timestamp = this.options.includeTimestamp ? this.formatTimestamp() + ' ' : '';
        const context = this.formatContext() + ' ';
        
        // Format level with color and emoji
        const levelStr = this.options.colorize 
            ? `${levelInfo.color}${level}${colors.reset}`
            : level;
        
        // Format the main message
        const messageStr = this.options.colorize 
            ? `${levelInfo.color}${message}${colors.reset}`
            : message;
        
        // Base log line
        let logLine = `${timestamp}${levelInfo.emoji}  ${levelStr.padEnd(10)} ${context}${messageStr}`;
        
        // Add data if present and metadata is enabled
        if (this.options.includeMetadata && Object.keys(data).length > 0) {
            const dataStr = this.options.colorize 
                ? colors.dim + this.truncateData(data) + colors.reset
                : this.truncateData(data);
            logLine += '\n  ' + dataStr;
        }
        
        // Output to console
        console.log(logLine);
        this.outputs.push({ level, message, data, timestamp: new Date().toISOString() });
        
        // Output to file if configured
        if (this.options.outputFile) {
            this.writeToFile(logLine + '\n');
        }
    }
    
    async writeToFile(content) {
        try {
            // Remove color codes for file output
            const cleanContent = content.replace(/\x1b\[[0-9;]*m/g, '');
            await fs.appendFile(this.options.outputFile, cleanContent);
        } catch (error) {
            console.warn('Failed to write to output file:', error.message);
        }
    }
    
    /**
     * Log methods for different levels
     */
    debug(message, data = {}) {
        this.log('DEBUG', message, data);
    }
    
    info(message, data = {}) {
        this.log('INFO', message, data);
    }
    
    warn(message, data = {}) {
        this.log('WARN', message, data);
    }
    
    error(message, data = {}) {
        this.log('ERROR', message, data);
    }
    
    success(message, data = {}) {
        this.log('SUCCESS', message, data);
    }
    
    /**
     * Start a new operation (adds to operation stack)
     */
    startOperation(operationName, data = {}) {
        this.operationStack.push(operationName);
        const operationLogger = new OperationLogger(this, operationName, Date.now());
        this.log('OPERATION', `Starting operation: ${operationName}`, data);
        return operationLogger;
    }
    
    /**
     * Create a child logger with additional context
     */
    child(additionalContext) {
        const newContext = typeof additionalContext === 'string' 
            ? `${this.context}>${additionalContext}`
            : `${this.context}>${additionalContext.component || 'child'}`;
            
        return new Logger(newContext, this.options);
    }
    
    /**
     * Display a separator line
     */
    separator(title = '') {
        const line = '═'.repeat(60);
        const titleStr = title ? ` ${title} ` : '';
        const separator = this.options.colorize 
            ? `${colors.dim}${colors.cyan}${line}${titleStr}${line}${colors.reset}`
            : `${line}${titleStr}${line}`;
        
        console.log(separator);
        if (this.options.outputFile) {
            this.writeToFile(separator + '\n');
        }
    }
    
    /**
     * Display a summary box
     */
    box(title, content) {
        const lines = Array.isArray(content) ? content : [content];
        const maxLength = Math.max(title.length, ...lines.map(line => line.length)) + 4;
        const topLine = '┌' + '─'.repeat(maxLength) + '┐';
        const bottomLine = '└' + '─'.repeat(maxLength) + '┘';
        const titleLine = `│ ${title.padEnd(maxLength - 1)}│`;
        
        const boxColor = this.options.colorize ? colors.cyan : '';
        const resetColor = this.options.colorize ? colors.reset : '';
        
        console.log(boxColor + topLine + resetColor);
        console.log(boxColor + titleLine + resetColor);
        console.log(boxColor + '├' + '─'.repeat(maxLength) + '┤' + resetColor);
        
        for (const line of lines) {
            const contentLine = `│ ${line.padEnd(maxLength - 1)}│`;
            console.log(boxColor + contentLine + resetColor);
        }
        
        console.log(boxColor + bottomLine + resetColor);
    }
    
    /**
     * Get all logged outputs (useful for testing or analysis)
     */
    getOutputs() {
        return [...this.outputs];
    }
    
    /**
     * Clear all logged outputs
     */
    clearOutputs() {
        this.outputs = [];
    }
}

/**
 * Operation Logger for tracking specific operations
 */
class OperationLogger {
    constructor(parentLogger, operationName, startTime) {
        this.parentLogger = parentLogger;
        this.operationName = operationName;
        this.startTime = startTime;
    }
    
    debug(message, data = {}) {
        this.parentLogger.debug(message, data);
    }
    
    info(message, data = {}) {
        this.parentLogger.info(message, data);
    }
    
    warn(message, data = {}) {
        this.parentLogger.warn(message, data);
    }
    
    error(message, data = {}) {
        this.parentLogger.error(message, data);
    }
    
    success(message, data = {}) {
        this.parentLogger.success(message, data);
    }
    
    complete(message, data = {}) {
        const duration = Date.now() - this.startTime;
        const completeData = { ...data, duration: `${duration}ms` };
        this.parentLogger.log('SUCCESS', `${message || 'Operation completed'}`, completeData);
        
        // Remove operation from stack
        const index = this.parentLogger.operationStack.indexOf(this.operationName);
        if (index > -1) {
            this.parentLogger.operationStack.splice(index, 1);
        }
        
        return { success: true, duration };
    }
    
    fail(message, error, data = {}) {
        const duration = Date.now() - this.startTime;
        const failData = { 
            ...data, 
            duration: `${duration}ms`,
            error: error instanceof Error ? error.message : error
        };
        this.parentLogger.error(`${message || 'Operation failed'}`, failData);
        
        // Remove operation from stack
        const index = this.parentLogger.operationStack.indexOf(this.operationName);
        if (index > -1) {
            this.parentLogger.operationStack.splice(index, 1);
        }
        
        return { success: false, duration, error };
    }
}

/**
 * Create a logger instance
 */
function createLogger(context, options = {}) {
    return new Logger(context, options);
}

module.exports = {
    createLogger,
    Logger,
    logLevels,
    colors
};