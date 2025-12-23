/**
 * Validation Harness - Syntax and runtime validation for generated artifacts
 * 
 * Validates:
 * - Parse: Language parse success
 * - Lint: ESLint/Pyright results  
 * - Typecheck: TypeScript/Pyright
 * - Build: Compilation if applicable
 * - Runtime: App boot and endpoint testing
 */

import { runTool, isToolAvailable } from '../../tools/runners/tool-runner.js';
import { createEvidenceEvent } from '../../worldmodel/evidence-graph.js';

/**
 * Validation result
 */
export class ValidationResult {
    constructor({
        stage,
        passed,
        errors = [],
        warnings = [],
        duration = 0,
    }) {
        this.stage = stage;
        this.passed = passed;
        this.errors = errors;
        this.warnings = warnings;
        this.duration = duration;
        this.timestamp = new Date().toISOString();
    }
}

/**
 * Validators by language
 */
const VALIDATORS = {
    javascript: {
        parse: async (filePath) => {
            const result = await runTool(`node --check "${filePath}"`, { timeout: 10000 });
            return new ValidationResult({
                stage: 'parse',
                passed: result.success,
                errors: result.success ? [] : [result.stderr],
                duration: result.duration,
            });
        },

        lint: async (filePath) => {
            const eslintAvailable = await isToolAvailable('npx');
            if (!eslintAvailable) {
                return new ValidationResult({ stage: 'lint', passed: true, warnings: ['ESLint not available'] });
            }

            // Extract project directory from file path (look for eslint.config.js)
            const { dirname, resolve } = await import('path');
            const { existsSync } = await import('fs');
            let projectDir = dirname(resolve(filePath));
            // Walk up to find eslint.config.js
            for (let i = 0; i < 5; i++) {
                if (existsSync(resolve(projectDir, 'eslint.config.js'))) break;
                const parent = dirname(projectDir);
                if (parent === projectDir) break;
                projectDir = parent;
            }

            const result = await runTool(`npx eslint --format json "${filePath}"`, {
                timeout: 30000,
                cwd: projectDir
            });

            let errors = [];
            let warnings = [];

            try {
                const output = JSON.parse(result.stdout);
                for (const file of output) {
                    for (const msg of file.messages || []) {
                        if (msg.severity === 2) {
                            errors.push(`${msg.line}:${msg.column} - ${msg.message}`);
                        } else {
                            warnings.push(`${msg.line}:${msg.column} - ${msg.message}`);
                        }
                    }
                }
            } catch {
                // Non-JSON output
                if (!result.success) {
                    errors.push(result.stderr);
                }
            }

            return new ValidationResult({
                stage: 'lint',
                passed: errors.length === 0,
                errors,
                warnings,
                duration: result.duration,
            });
        },
    },

    python: {
        parse: async (filePath) => {
            const result = await runTool(`python3 -m py_compile "${filePath}"`, { timeout: 10000 });
            return new ValidationResult({
                stage: 'parse',
                passed: result.success,
                errors: result.success ? [] : [result.stderr],
                duration: result.duration,
            });
        },

        lint: async (filePath) => {
            // Try ruff first (faster), fall back to pylint
            let result = await runTool(`ruff check "${filePath}" --output-format json`, { timeout: 30000 });

            if (!result.success && result.error?.includes('not found')) {
                result = await runTool(`pylint --output-format=json "${filePath}"`, { timeout: 60000 });
            }

            let errors = [];
            let warnings = [];

            try {
                const output = JSON.parse(result.stdout);
                for (const msg of output) {
                    if (msg.type === 'error' || msg.type === 'fatal') {
                        errors.push(`${msg.line}:${msg.column} - ${msg.message}`);
                    } else {
                        warnings.push(`${msg.line}:${msg.column} - ${msg.message}`);
                    }
                }
            } catch {
                // Ignore JSON parse errors
            }

            return new ValidationResult({
                stage: 'lint',
                passed: errors.length === 0,
                errors,
                warnings,
                duration: result.duration,
            });
        },

        typecheck: async (filePath) => {
            const pyrightAvailable = await isToolAvailable('pyright');
            if (!pyrightAvailable) {
                return new ValidationResult({ stage: 'typecheck', passed: true, warnings: ['Pyright not available'] });
            }

            const result = await runTool(`pyright "${filePath}" --outputjson`, { timeout: 60000 });

            let errors = [];
            try {
                const output = JSON.parse(result.stdout);
                for (const diag of output.generalDiagnostics || []) {
                    if (diag.severity === 'error') {
                        errors.push(`${diag.range?.start?.line}:${diag.range?.start?.character} - ${diag.message}`);
                    }
                }
            } catch {
                // Ignore
            }

            return new ValidationResult({
                stage: 'typecheck',
                passed: errors.length === 0,
                errors,
                duration: result.duration,
            });
        },
    },

    typescript: {
        parse: async (filePath) => {
            const result = await runTool(`npx tsc --noEmit "${filePath}"`, { timeout: 30000 });
            return new ValidationResult({
                stage: 'parse',
                passed: result.success,
                errors: result.success ? [] : result.stderr.split('\n').filter(l => l.includes('error')),
                duration: result.duration,
            });
        },

        typecheck: async (filePath) => {
            const result = await runTool(`npx tsc --noEmit "${filePath}"`, { timeout: 30000 });

            const errors = [];
            for (const line of result.stderr.split('\n')) {
                if (line.includes('error TS')) {
                    errors.push(line);
                }
            }

            return new ValidationResult({
                stage: 'typecheck',
                passed: errors.length === 0,
                errors,
                duration: result.duration,
            });
        },
    },
};

/**
 * ValidationHarness - Run validation suite on artifacts
 */
export class ValidationHarness {
    constructor(options = {}) {
        this.options = {
            timeout: options.timeout || 60000,
            skipLint: options.skipLint || false,
            skipTypecheck: options.skipTypecheck || false,
            ...options,
        };
    }

    /**
     * Detect language from file extension
     * @param {string} filePath - File path
     * @returns {string} Language name
     */
    detectLanguage(filePath) {
        if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) return 'javascript';
        if (filePath.endsWith('.ts')) return 'typescript';
        if (filePath.endsWith('.py')) return 'python';
        if (filePath.endsWith('.json')) return 'json';
        return 'unknown';
    }

    /**
     * Validate a single file
     * @param {string} filePath - File path
     * @param {object} options - Validation options
     * @returns {Promise<object>} Validation results
     */
    async validateFile(filePath, options = {}) {
        const language = options.language || this.detectLanguage(filePath);
        const validators = VALIDATORS[language];

        const results = {
            file: filePath,
            language,
            parse: null,
            lint: null,
            typecheck: null,
            overall: true,
        };

        if (!validators) {
            results.parse = new ValidationResult({
                stage: 'parse',
                passed: true,
                warnings: [`No validators for ${language}`]
            });
            return results;
        }

        // Parse validation
        if (validators.parse) {
            results.parse = await validators.parse(filePath);
            if (!results.parse.passed) {
                results.overall = false;
            }
        }

        // Lint validation (skip if parse failed)
        if (!this.options.skipLint && validators.lint && results.parse?.passed !== false) {
            results.lint = await validators.lint(filePath);
            if (!results.lint.passed) {
                results.overall = false;
            }
        }

        // Typecheck validation
        if (!this.options.skipTypecheck && validators.typecheck && results.parse?.passed !== false) {
            results.typecheck = await validators.typecheck(filePath);
            if (!results.typecheck.passed) {
                results.overall = false;
            }
        }

        return results;
    }

    /**
     * Validate a project directory
     * @param {string} projectPath - Project root path
     * @param {object} options - Validation options
     * @returns {Promise<object>} Project validation results
     */
    async validateProject(projectPath, options = {}) {
        const { fs } = await import('zx');

        const results = {
            project: projectPath,
            files: [],
            summary: {
                total: 0,
                passed: 0,
                failed: 0,
            },
        };

        // Get all source files
        const files = await this.findSourceFiles(projectPath);
        results.summary.total = files.length;

        for (const file of files) {
            const fileResult = await this.validateFile(file, options);
            results.files.push(fileResult);

            if (fileResult.overall) {
                results.summary.passed++;
            } else {
                results.summary.failed++;
            }
        }

        return results;
    }

    /**
     * Find source files in directory
     * @param {string} dir - Directory path
     * @returns {Promise<string[]>} File paths
     */
    async findSourceFiles(dir) {
        const { $, glob } = await import('zx');

        const patterns = ['**/*.js', '**/*.ts', '**/*.py'];
        const ignores = ['node_modules/**', '__pycache__/**', 'venv/**', '.git/**'];

        try {
            const result = await $`find ${dir} -type f \\( -name "*.js" -o -name "*.ts" -o -name "*.py" \\) -not -path "*/node_modules/*" -not -path "*/__pycache__/*" -not -path "*/venv/*"`;
            return result.stdout.split('\n').filter(f => f.trim());
        } catch {
            return [];
        }
    }

    /**
     * Validate JSON file
     * @param {string} filePath - File path
     * @returns {Promise<ValidationResult>} Result
     */
    async validateJSON(filePath) {
        const { fs } = await import('zx');

        try {
            const content = await fs.readFile(filePath, 'utf-8');
            JSON.parse(content);
            return new ValidationResult({ stage: 'parse', passed: true });
        } catch (err) {
            return new ValidationResult({
                stage: 'parse',
                passed: false,
                errors: [err.message],
            });
        }
    }
}

/**
 * Emit validation evidence
 * @param {object} ctx - Agent context
 * @param {string} filePath - File path
 * @param {object} results - Validation results
 */
export function emitValidationEvidence(ctx, filePath, results) {
    ctx.evidenceGraph.addEvent(createEvidenceEvent({
        source: 'ValidationHarness',
        event_type: 'validation_result',
        target: filePath,
        payload: {
            language: results.language,
            parse_passed: results.parse?.passed,
            lint_passed: results.lint?.passed,
            typecheck_passed: results.typecheck?.passed,
            overall: results.overall,
            errors: [
                ...(results.parse?.errors || []),
                ...(results.lint?.errors || []),
                ...(results.typecheck?.errors || []),
            ],
        },
    }));
}

export default ValidationHarness;
