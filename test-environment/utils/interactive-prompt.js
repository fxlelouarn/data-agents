const readline = require('readline');

/**
 * Interactive prompt utility for user input during agent testing
 */
class InteractivePrompt {
    constructor(logger) {
        this.logger = logger;
        this.rl = null;
    }

    /**
     * Initialize readline interface
     */
    createInterface() {
        if (!this.rl) {
            this.rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
        }
        return this.rl;
    }

    /**
     * Ask a single question
     */
    async askQuestion(question, defaultValue = '') {
        const rl = this.createInterface();
        const prompt = defaultValue 
            ? `${question} (${defaultValue}): `
            : `${question}: `;

        return new Promise((resolve) => {
            rl.question(prompt, (answer) => {
                resolve(answer.trim() || defaultValue);
            });
        });
    }

    /**
     * Ask a yes/no question
     */
    async confirm(question, defaultValue = true) {
        const defaultText = defaultValue ? 'Y/n' : 'y/N';
        const answer = await this.askQuestion(`${question} (${defaultText})`);
        
        if (!answer) return defaultValue;
        
        const normalized = answer.toLowerCase();
        return normalized === 'y' || normalized === 'yes' || normalized === 'true';
    }

    /**
     * Ask for a number
     */
    async askNumber(question, defaultValue = 0, min = null, max = null) {
        while (true) {
            const answer = await this.askQuestion(
                `${question}${min !== null && max !== null ? ` (${min}-${max})` : ''}`, 
                defaultValue.toString()
            );
            
            const number = parseInt(answer);
            if (isNaN(number)) {
                this.logger.warn('Please enter a valid number');
                continue;
            }
            
            if (min !== null && number < min) {
                this.logger.warn(`Number must be at least ${min}`);
                continue;
            }
            
            if (max !== null && number > max) {
                this.logger.warn(`Number must be at most ${max}`);
                continue;
            }
            
            return number;
        }
    }

    /**
     * Ask for selection from multiple options
     */
    async select(question, options, defaultIndex = 0) {
        this.logger.info(`\n${question}`);
        
        options.forEach((option, index) => {
            const marker = index === defaultIndex ? '→' : ' ';
            console.log(`${marker} ${index + 1}. ${option}`);
        });
        
        while (true) {
            const answer = await this.askQuestion(
                `Select option (1-${options.length})`, 
                (defaultIndex + 1).toString()
            );
            
            const selection = parseInt(answer) - 1;
            if (isNaN(selection) || selection < 0 || selection >= options.length) {
                this.logger.warn(`Please enter a number between 1 and ${options.length}`);
                continue;
            }
            
            return {
                index: selection,
                value: options[selection]
            };
        }
    }

    /**
     * Ask multiple questions in sequence
     */
    async ask(questions) {
        const answers = {};
        
        for (const question of questions) {
            try {
                let answer;
                
                switch (question.type) {
                    case 'confirm':
                        answer = await this.confirm(question.message, question.default);
                        break;
                        
                    case 'number':
                        answer = await this.askNumber(
                            question.message, 
                            question.default || 0,
                            question.min,
                            question.max
                        );
                        break;
                        
                    case 'select':
                        const selection = await this.select(
                            question.message, 
                            question.choices,
                            question.default || 0
                        );
                        answer = selection.value;
                        break;
                        
                    default: // text
                        answer = await this.askQuestion(question.message, question.default || '');
                        break;
                }
                
                answers[question.name] = answer;
                
                // Apply validation if provided
                if (question.validate) {
                    const validationResult = question.validate(answer);
                    if (validationResult !== true) {
                        this.logger.warn(validationResult || 'Invalid input');
                        // You might want to re-ask the question here
                    }
                }
                
            } catch (error) {
                this.logger.error(`Error asking question "${question.name}":`, error.message);
                answers[question.name] = question.default;
            }
        }
        
        return answers;
    }

    /**
     * Display a menu and get user selection
     */
    async menu(title, items, allowCancel = true) {
        this.logger.info(`\n${title}`);
        this.logger.separator();
        
        const options = [...items];
        if (allowCancel) {
            options.push('Cancel');
        }
        
        const selection = await this.select('Choose an option:', options.map(item => 
            typeof item === 'string' ? item : item.name || item.title
        ));
        
        if (allowCancel && selection.index === options.length - 1) {
            return null; // User cancelled
        }
        
        return {
            index: selection.index,
            item: items[selection.index]
        };
    }

    /**
     * Get configuration values interactively
     */
    async getConfiguration(schema) {
        const config = {};
        
        this.logger.info('\n🔧 Interactive Configuration');
        this.logger.separator();
        
        for (const [key, field] of Object.entries(schema)) {
            try {
                let value;
                const prompt = field.description || field.label || key;
                
                if (field.type === 'boolean') {
                    value = await this.confirm(prompt, field.default);
                } else if (field.type === 'number') {
                    value = await this.askNumber(prompt, field.default, field.min, field.max);
                } else if (field.options) {
                    const selection = await this.select(prompt, field.options);
                    value = selection.value;
                } else if (field.secret) {
                    // For secrets, don't show default value
                    value = await this.askQuestion(`${prompt} (hidden)`);
                    if (!value && field.required) {
                        this.logger.warn('This field is required');
                        value = await this.askQuestion(prompt);
                    }
                } else {
                    value = await this.askQuestion(prompt, field.default);
                }
                
                // Apply transformation if provided
                if (field.transform && typeof field.transform === 'function') {
                    value = field.transform(value);
                }
                
                config[key] = value;
                
            } catch (error) {
                this.logger.error(`Error configuring ${key}:`, error.message);
                config[key] = field.default;
            }
        }
        
        return config;
    }

    /**
     * Show a progress indicator (useful for long-running operations)
     */
    startProgress(message) {
        const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let i = 0;
        
        const interval = setInterval(() => {
            process.stdout.write(`\r${frames[i]} ${message}`);
            i = (i + 1) % frames.length;
        }, 100);
        
        return {
            stop: (finalMessage) => {
                clearInterval(interval);
                process.stdout.write(`\r✅ ${finalMessage || message}\n`);
            }
        };
    }

    /**
     * Display a table of data
     */
    displayTable(headers, rows) {
        if (!rows || rows.length === 0) {
            this.logger.info('No data to display');
            return;
        }

        // Calculate column widths
        const widths = headers.map((header, i) => 
            Math.max(
                header.length,
                ...rows.map(row => String(row[i] || '').length)
            )
        );

        // Display header
        const headerRow = headers
            .map((header, i) => header.padEnd(widths[i]))
            .join(' │ ');
        console.log('┌' + widths.map(w => '─'.repeat(w + 2)).join('┼') + '┐');
        console.log('│ ' + headerRow + ' │');
        console.log('├' + widths.map(w => '─'.repeat(w + 2)).join('┼') + '┤');

        // Display rows
        for (const row of rows) {
            const dataRow = headers
                .map((_, i) => String(row[i] || '').padEnd(widths[i]))
                .join(' │ ');
            console.log('│ ' + dataRow + ' │');
        }

        console.log('└' + widths.map(w => '─'.repeat(w + 2)).join('┴') + '┘');
    }

    /**
     * Pause execution and wait for user input
     */
    async pause(message = 'Press Enter to continue...') {
        await this.askQuestion(message);
    }

    /**
     * Clean up readline interface
     */
    close() {
        if (this.rl) {
            this.rl.close();
            this.rl = null;
        }
    }
}

module.exports = { InteractivePrompt };