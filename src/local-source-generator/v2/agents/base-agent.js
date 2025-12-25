/**
 * BaseAgent - Abstract agent contract for LSG v2
 * 
 * Every agent must declare:
 * - inputs_schema / outputs_schema (JSON Schema)
 * - requires (evidence kinds / model nodes)
 * - emits (evidence events / model updates / claims / artifacts)
 * - idempotency_key (for caching/replay)
 * - budget (time, network, tokens, tool invocations)
 * - run(ctx) → structured outputs only
 */

import { createHash } from 'crypto';
import { EventEmitter } from 'events';

/**
 * Agent execution context
 */
export class AgentContext extends EventEmitter {
  constructor({
    evidenceGraph,
    targetModel,
    ledger,
    manifest,
    verifier = null,  // ReactiveVerifier for closed-loop verification
    config = {},
    budget = {},
  }) {
    super();
    this.evidenceGraph = evidenceGraph;
    this.targetModel = targetModel;
    this.ledger = ledger;
    this.manifest = manifest;
    this.verifier = verifier;
    this.config = config;
    this.budget = {
      max_time_ms: budget.max_time_ms || 60000,
      max_network_requests: budget.max_network_requests || 100,
      max_tokens: budget.max_tokens || 10000,
      max_tool_invocations: budget.max_tool_invocations || 50,
    };

    // Tracking
    this.startTime = null;
    this.networkRequests = 0;
    this.tokensUsed = 0;
    this.toolInvocations = 0;
    this.emittedEvents = [];
    this.emittedClaims = [];
  }

  /**
   * Start execution tracking
   */
  start() {
    this.startTime = Date.now();
  }

  /**
   * Check if budget exceeded
   * @returns {object|null} Exceeded budget item or null
   */
  checkBudget() {
    if (this.startTime && (Date.now() - this.startTime) > this.budget.max_time_ms) {
      return { type: 'time', used: Date.now() - this.startTime, max: this.budget.max_time_ms };
    }
    if (this.networkRequests > this.budget.max_network_requests) {
      return { type: 'network', used: this.networkRequests, max: this.budget.max_network_requests };
    }
    if (this.tokensUsed > this.budget.max_tokens) {
      return { type: 'tokens', used: this.tokensUsed, max: this.budget.max_tokens };
    }
    if (this.toolInvocations > this.budget.max_tool_invocations) {
      return { type: 'tools', used: this.toolInvocations, max: this.budget.max_tool_invocations };
    }
    return null;
  }

  /**
   * Record network request
   */
  recordNetworkRequest() {
    this.networkRequests++;
  }

  /**
   * Record token usage
   * @param {number} tokens - Tokens used
   */
  recordTokens(tokens) {
    this.tokensUsed += tokens;
  }

  /**
   * Record tool invocation
   */
  recordToolInvocation() {
    this.toolInvocations++;
  }

  /**
   * Update agent status
   * @param {string} status - Status message
   */
  setStatus(status) {
    // Emit status event if emitter is available, otherwise silently store it
    if (typeof this.emit === 'function') {
      this.emit('status', status);
    }
    // Don't log to console - it breaks MultiBar UI
    this.currentStatus = status;
  }

  /**
   * Emit evidence event
   * @param {object} eventData - Event data
   * @returns {string} Event ID
   */
  emitEvidence(eventData) {
    const id = this.evidenceGraph.addEvent(eventData);
    this.emittedEvents.push(id);
    return id;
  }

  /**
   * Emit claim
   * @param {object} claimData - Claim data
   * @returns {object} Claim
   */
  emitClaim(claimData) {
    const claim = this.ledger.upsertClaim(claimData);
    this.emittedClaims.push(claim.id);

    // Auto-enqueue for reactive verification if verifier supports it
    if (
      this.verifier &&
      typeof this.verifier.shouldVerify === 'function' &&
      typeof this.verifier.enqueue === 'function' &&
      this.verifier.shouldVerify(claim)
    ) {
      this.verifier.enqueue(claim);
    }

    return claim;
  }

  /**
   * Get execution summary
   * @returns {object} Summary
   */
  getSummary() {
    return {
      duration_ms: this.startTime ? Date.now() - this.startTime : 0,
      network_requests: this.networkRequests,
      tokens_used: this.tokensUsed,
      tool_invocations: this.toolInvocations,
      events_emitted: this.emittedEvents.length,
      claims_emitted: this.emittedClaims.length,
    };
  }

  /**
   * Log message (compatibility)
   */
  log(msg) {
    // Silenced - would break MultiBar UI
    // Use this.emit('log', msg) if logging is needed
  }
}

/**
 * Base Agent class - all agents extend this
 */
export class BaseAgent {
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;

    // Must be overridden by subclasses
    this.inputs_schema = null;
    this.outputs_schema = null;
    this.requires = { evidence_kinds: [], model_nodes: [] };
    this.emits = { evidence_events: [], model_updates: [], claims: [], artifacts: [] };
    this.default_budget = {
      max_time_ms: 60000,
      max_network_requests: 100,
      max_tokens: 10000,
      max_tool_invocations: 50,
    };
  }

  /**
   * Compute idempotency key for caching/replay
   * @param {object} inputs - Agent inputs
   * @param {object} config - Configuration
   * @returns {string} Idempotency key
   */
  idempotencyKey(inputs, config) {
    const data = {
      agent: this.name,
      inputs,
      config,
    };
    return createHash('sha256')
      .update(JSON.stringify(data, Object.keys(data).sort()))
      .digest('hex')
      .slice(0, 24);
  }

  /**
   * Validate inputs against schema
   * @param {object} inputs - Inputs to validate
   * @returns {object} { valid: boolean, errors: string[] }
   */
  validateInputs(inputs) {
    // Basic validation - subclasses can override with JSON Schema validation
    if (!inputs) {
      return { valid: false, errors: ['Inputs required'] };
    }
    return { valid: true, errors: [] };
  }

  /**
   * Validate outputs against schema
   * @param {object} outputs - Outputs to validate
   * @returns {object} { valid: boolean, errors: string[] }
   */
  validateOutputs(outputs) {
    // Basic validation - subclasses can override
    if (!outputs) {
      return { valid: false, errors: ['Outputs required'] };
    }
    if (typeof outputs !== 'object') {
      return { valid: false, errors: ['Outputs must be structured object'] };
    }
    return { valid: true, errors: [] };
  }

  /**
   * Execute the agent (must be overridden)
   * @param {AgentContext} ctx - Execution context
   * @param {object} inputs - Agent inputs
   * @returns {Promise<object>} Structured outputs
   */
  async run(ctx, inputs) {
    throw new Error(`Agent ${this.name} must implement run()`);
  }

  /**
   * Execute with full lifecycle (validation, budgeting, etc.)
   * @param {AgentContext} ctx - Execution context
   * @param {object} inputs - Agent inputs
   * @returns {Promise<object>} Execution result
   */
  async execute(ctx, inputs) {
    // Validate inputs
    const inputValidation = this.validateInputs(inputs);
    if (!inputValidation.valid) {
      return {
        success: false,
        error: 'Input validation failed',
        errors: inputValidation.errors,
      };
    }

    // Start tracking
    ctx.start();
    this.ctx = ctx; // Allow access to context from instance methods

    try {
      // Run agent
      const outputs = await this.run(ctx, inputs);

      // Validate outputs
      const outputValidation = this.validateOutputs(outputs);
      if (!outputValidation.valid) {
        return {
          success: false,
          error: 'Output validation failed',
          errors: outputValidation.errors,
          partial_outputs: outputs,
        };
      }

      // Check budget
      const budgetExceeded = ctx.checkBudget();

      return {
        success: true,
        outputs,
        summary: ctx.getSummary(),
        budget_exceeded: budgetExceeded,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack,
        summary: ctx.getSummary(),
      };
    }
  }

  /**
   * Get agent contract (for documentation/introspection)
   * @returns {object} Agent contract
   */
  /**
   * Set agent status (proxies to context)
   * @param {string} status - Status message
   */
  setStatus(status) {
    if (this.ctx) {
      this.ctx.setStatus(status);
    }
    // Silenced - would break MultiBar UI
  }

  getContract() {
    return {
      name: this.name,
      inputs_schema: this.inputs_schema,
      outputs_schema: this.outputs_schema,
      requires: this.requires,
      emits: this.emits,
      default_budget: this.default_budget,
    };
  }
}

/**
 * Agent registry for orchestrator
 */
export class AgentRegistry {
  constructor() {
    this.agents = new Map();
  }

  /**
   * Register an agent
   * @param {BaseAgent} agent - Agent instance
   */
  register(agent) {
    this.agents.set(agent.name, agent);
  }

  /**
   * Get agent by name
   * @param {string} name - Agent name
   * @returns {BaseAgent|null} Agent or null
   */
  get(name) {
    return this.agents.get(name) || null;
  }

  /**
   * List all agents
   * @returns {string[]} Agent names
   */
  list() {
    return Array.from(this.agents.keys());
  }

  /**
   * Get all contracts
   * @returns {object[]} Agent contracts
   */
  getContracts() {
    return Array.from(this.agents.values()).map(a => a.getContract());
  }
}

export default BaseAgent;
