/**
 * Mock context utilities for testing agents
 * Provides a fake context that simulates the real agent execution environment
 */

/**
 * Create a mock database context
 */
function createMockDatabase(config = {}) {
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
                    return { id: 'mock-id', ...data };
                },
                update: async (options) => {
                    console.log('📊 Mock Database: Updating event', options);
                    return { id: options.where.id, ...options.data };
                }
            },
            proposal: {
                create: async (data) => {
                    console.log('📝 Mock Database: Creating proposal', data);
                    return { id: 'proposal-mock-id', ...data };
                }
            },
            run: {
                create: async (data) => {
                    console.log('🏃 Mock Database: Creating run', data);
                    return { id: 'run-mock-id', ...data };
                },
                update: async (options) => {
                    console.log('🏃 Mock Database: Updating run', options);
                    return { id: options.where.id, ...options.data };
                }
            },
            log: {
                create: async (data) => {
                    console.log('📜 Mock Database: Creating log', data);
                    return { id: 'log-mock-id', ...data };
                }
            }
        },

        // Mock database config
        config: config.database || {
            host: 'mock-host',
            port: 5432,
            database: 'mock-database',
            user: 'mock-user'
        }
    };
}

/**
 * Create a mock HTTP client
 */
function createMockHttpClient(config = {}) {
    return {
        get: async (url, options = {}) => {
            console.log('🌐 Mock HTTP: GET', url, options.params || {});
            
            // Simulate different responses based on URL patterns
            if (url.includes('google')) {
                return {
                    data: {
                        items: [
                            {
                                title: 'Mock Event 2024 - Marathon de Test',
                                snippet: 'Le Marathon de Test aura lieu le 15 juin 2024',
                                link: 'https://example.com/marathon-test'
                            },
                            {
                                title: 'Course de Test - 10km',
                                snippet: 'Inscription ouverte pour la course du 22 septembre 2024',
                                link: 'https://example.com/course-test'
                            }
                        ]
                    },
                    status: 200,
                    statusText: 'OK'
                };
            }

            if (url.includes('ffa')) {
                return {
                    data: `
                        <html>
                            <body>
                                <div class="event">
                                    <h3>Championnat de France 2024</h3>
                                    <p>Date: 15 juin 2024</p>
                                    <p>Lieu: Paris</p>
                                </div>
                            </body>
                        </html>
                    `,
                    status: 200,
                    statusText: 'OK'
                };
            }

            // Default response
            return {
                data: { message: 'Mock response' },
                status: 200,
                statusText: 'OK'
            };
        },

        post: async (url, data, options = {}) => {
            console.log('🌐 Mock HTTP: POST', url, { data, options: options.params || {} });
            return {
                data: { id: 'mock-response-id', created: true },
                status: 201,
                statusText: 'Created'
            };
        },

        put: async (url, data, options = {}) => {
            console.log('🌐 Mock HTTP: PUT', url, { data, options: options.params || {} });
            return {
                data: { id: 'mock-response-id', updated: true },
                status: 200,
                statusText: 'OK'
            };
        },

        delete: async (url, options = {}) => {
            console.log('🌐 Mock HTTP: DELETE', url, options.params || {});
            return {
                data: { deleted: true },
                status: 200,
                statusText: 'OK'
            };
        }
    };
}

/**
 * Create a mock browser/playwright context
 */
function createMockBrowser(config = {}) {
    const mockPage = {
        goto: async (url, options = {}) => {
            console.log('🌐 Mock Browser: Navigating to', url, options);
            return { status: 200 };
        },

        waitForSelector: async (selector, options = {}) => {
            console.log('🎯 Mock Browser: Waiting for selector', selector, options);
            return { element: 'mock-element' };
        },

        $(selector) {
            console.log('🎯 Mock Browser: Finding element', selector);
            return {
                textContent: async () => 'Mock text content',
                getAttribute: async (attr) => `mock-${attr}-value`,
                click: async () => console.log('🖱️  Mock Browser: Clicked element'),
                type: async (text) => console.log('⌨️  Mock Browser: Typed', text)
            };
        },

        $$(selector) {
            console.log('🎯 Mock Browser: Finding elements', selector);
            return [
                {
                    textContent: async () => 'Mock element 1',
                    getAttribute: async (attr) => `mock-${attr}-1`
                },
                {
                    textContent: async () => 'Mock element 2',
                    getAttribute: async (attr) => `mock-${attr}-2`
                }
            ];
        },

        evaluate: async (fn, ...args) => {
            console.log('🧮 Mock Browser: Evaluating function', fn.toString().substring(0, 100) + '...');
            
            // Return mock evaluation results based on common patterns
            if (fn.toString().includes('querySelectorAll')) {
                return [
                    { title: 'Mock Event 1', date: '2024-06-15' },
                    { title: 'Mock Event 2', date: '2024-09-22' }
                ];
            }
            
            return 'Mock evaluation result';
        },

        screenshot: async (options = {}) => {
            console.log('📸 Mock Browser: Taking screenshot', options);
            return Buffer.from('mock-screenshot-data');
        },

        close: async () => {
            console.log('🚪 Mock Browser: Closing page');
        }
    };

    return {
        newPage: async () => {
            console.log('📄 Mock Browser: Creating new page');
            return mockPage;
        },

        close: async () => {
            console.log('🚪 Mock Browser: Closing browser');
        }
    };
}

/**
 * Create a mock file system
 */
function createMockFileSystem(config = {}) {
    const mockFiles = new Map();

    return {
        writeFile: async (filename, content, options = {}) => {
            console.log('💾 Mock FS: Writing file', filename, `(${typeof content}, ${content?.length || 0} chars)`);
            mockFiles.set(filename, content);
            return true;
        },

        readFile: async (filename, options = {}) => {
            console.log('📖 Mock FS: Reading file', filename);
            return mockFiles.get(filename) || 'Mock file content';
        },

        exists: async (filename) => {
            console.log('🔍 Mock FS: Checking file exists', filename);
            return mockFiles.has(filename) || Math.random() > 0.5; // Random for testing
        },

        mkdir: async (dirname, options = {}) => {
            console.log('📁 Mock FS: Creating directory', dirname, options);
            return true;
        },

        readdir: async (dirname, options = {}) => {
            console.log('📂 Mock FS: Reading directory', dirname);
            return ['file1.txt', 'file2.json', 'subdirectory'];
        }
    };
}

/**
 * Create a mock external API client
 */
function createMockApiClient(config = {}) {
    return {
        google: {
            search: async (query, options = {}) => {
                console.log('🔍 Mock Google API: Searching', { query, options });
                return {
                    items: [
                        {
                            title: `Résultats pour "${query}"`,
                            snippet: 'Description du résultat de recherche mock',
                            link: 'https://example.com/result',
                            displayLink: 'example.com'
                        }
                    ],
                    searchInformation: {
                        totalResults: '1',
                        searchTime: 0.123
                    }
                };
            }
        },

        ffa: {
            getEvents: async (options = {}) => {
                console.log('🏃 Mock FFA API: Getting events', options);
                return [
                    {
                        id: 'mock-ffa-event-1',
                        name: 'Championnat Mock',
                        date: '2024-06-15',
                        location: 'Mock City'
                    }
                ];
            }
        }
    };
}

/**
 * Create a complete mock context for agent testing
 */
function createMockContext(config = {}, logger) {
    const context = {
        // Database access
        db: createMockDatabase(config),
        
        // HTTP client
        http: createMockHttpClient(config),
        
        // Browser automation
        browser: createMockBrowser(config),
        
        // File system
        fs: createMockFileSystem(config),
        
        // External APIs
        api: createMockApiClient(config),
        
        // Configuration
        config: {
            ...config,
            // Default test configuration
            simulation: config.dryRun || false,
            batchSize: config.batchSize || 10,
            timeout: config.timeout || 30000,
            retryAttempts: config.retryAttempts || 3
        },
        
        // Utilities
        utils: {
            wait: async (ms) => {
                console.log(`⏱️  Mock Utils: Waiting ${ms}ms`);
                if (!config.dryRun) {
                    await new Promise(resolve => setTimeout(resolve, Math.min(ms, 100))); // Cap wait time in tests
                }
            },
            
            retry: async (fn, attempts = 3) => {
                console.log('🔄 Mock Utils: Retrying operation', { attempts });
                for (let i = 0; i < attempts; i++) {
                    try {
                        return await fn();
                    } catch (error) {
                        if (i === attempts - 1) throw error;
                        console.log(`🔄 Mock Utils: Retry ${i + 1}/${attempts} failed, retrying...`);
                    }
                }
            },
            
            parseDate: (dateStr) => {
                console.log('📅 Mock Utils: Parsing date', dateStr);
                return new Date(dateStr || '2024-01-01');
            },
            
            sanitize: (text) => {
                console.log('🧹 Mock Utils: Sanitizing text', text?.substring(0, 50) + '...');
                return (text || '').trim().replace(/[^\w\s-]/g, '');
            }
        },
        
        // Logger
        logger: logger || console,
        
        // Environment info
        env: {
            NODE_ENV: process.env.NODE_ENV || 'test',
            isDevelopment: true,
            isTest: true,
            isProduction: false
        }
    };

    // Add some helper methods to the context
    context.log = (message, data = {}) => {
        if (logger) {
            logger.info(message, data);
        } else {
            console.log('🤖 Mock Context:', message, data);
        }
    };

    context.debug = (message, data = {}) => {
        if (logger) {
            logger.debug(message, data);
        } else if (config.debug || config.verbose) {
            console.log('🐛 Mock Context Debug:', message, data);
        }
    };

    return context;
}

/**
 * Create a minimal mock context (for simple tests)
 */
function createMinimalMockContext(config = {}) {
    return {
        config: { ...config, simulation: true },
        log: (message, data) => console.log('📝', message, data),
        debug: (message, data) => config.debug && console.log('🐛', message, data)
    };
}

module.exports = {
    createMockContext,
    createMinimalMockContext,
    createMockDatabase,
    createMockHttpClient,
    createMockBrowser,
    createMockFileSystem,
    createMockApiClient
};