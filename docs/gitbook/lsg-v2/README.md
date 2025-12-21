# LSG v2: Local Source Generator v2

## Overview

LSG v2 (Local Source Generator version 2) is the core innovation of Shannon Uncontained. It implements a **world-model-first architecture** that enables black-box reconnaissance, epistemic reasoning, and deterministic code generation.

## The Problem LSG v2 Solves

Traditional penetration testing tools follow this pattern:

```
1. Run reconnaissance tools (nmap, nikto, etc.)
2. Parse outputs into reports
3. Hope they integrate somehow
4. Generate findings
```

This approach has fundamental problems:

### Problem 1: No Canonical Representation

Each tool produces different output formats. Integration is ad-hoc. There's no unified view of the target.

### Problem 2: No Uncertainty Tracking

Findings are binary (true/false). But reconnaissance is probabilistic. Tools disagree, fail, or produce ambiguous results.

### Problem 3: No Traceability

Generated findings don't link back to source evidence. You can't answer "why did you conclude this?" with provenance.

### Problem 4: No Reproducibility

Random IDs, timestamps, and execution order affect outputs. Same inputs don't produce same outputs.

## The LSG v2 Solution

LSG v2 solves these problems with a **deterministic data pipeline**:

```
┌─────────────────┐
│ Reconnaissance  │ ← Tools produce raw observations
└────────┬────────┘
         │ normalize
         ▼
┌─────────────────┐
│ EvidenceGraph   │ ← Immutable, content-hashed event store
└────────┬────────┘
         │ derive
         ▼
┌─────────────────┐
│  TargetModel    │ ← Normalized entity graph with epistemic claims
└────────┬────────┘
         │ synthesize
         ▼
┌─────────────────┐
│ArtifactManifest │ ← Generated code with validation results
└────────┬────────┘
         │ validate
         ▼
┌─────────────────┐
│   Feedback      │ ← Evidence about artifact quality
└─────────────────┘
         │
         └──> (loops back to EvidenceGraph)
```

### Key Insight

**All information flows through a canonical spine.** Evidence → Model → Artifacts. No ad-hoc integration. No orphaned data. Perfect provenance.

## Core Components

### 1. Evidence Graph

**Purpose:** Immutable append-only store of all observations.

**Key features:**
- Content-hashed event IDs (same observation → same ID)
- Indexed by source, target, and type
- Blob storage for large artifacts
- Export/import for replay

**Example event:**
```json
{
  "id": "a7f3e2c9d1b4f8a0",
  "source": "nmap",
  "event_type": "port_scan",
  "target": "example.com",
  "payload": {
    "port": 443,
    "state": "open",
    "service": "https"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

**See:** [Evidence Graph](evidence-graph.md)

### 2. Target Model

**Purpose:** Normalized entity graph derived deterministically from evidence.

**Key features:**
- Entities: endpoints, components, data models, auth flows, workflows
- Relationships: calls, contains, authenticates, flows_to, depends_on
- Claim bindings: Links entities to epistemic claims
- Deterministic derivation (same inputs → same model)

**Example entity:**
```json
{
  "id": "endpoint:GET:/api/users",
  "entity_type": "endpoint",
  "attributes": {
    "method": "GET",
    "path": "/api/users",
    "params": [
      { "name": "id", "type": "integer", "location": "query" }
    ]
  },
  "claim_refs": ["claim:endpoint_exists:...", "claim:param_type:..."]
}
```

**See:** [Target Model](target-model.md)

### 3. Epistemic Ledger

**Purpose:** Track uncertainty for every claim using Subjective Logic.

**Key features:**
- EBSL/EQBSL (Evidential Belief / Quantified Evidence)
- 13 evidence dimensions
- Source reputation tracking
- Calibration metrics

**Example claim:**
```json
{
  "id": "claim:endpoint_exists:GET:/api/users",
  "claim_type": "endpoint_exists",
  "subject": "endpoint:GET:/api/users",
  "evidence_vector": {
    "active_probe_success": 2,
    "crawl_observed": 1,
    "js_ast_direct": 1
  },
  "opinion": {
    "b": 0.67,  // belief
    "d": 0.05,  // disbelief
    "u": 0.28,  // uncertainty
    "a": 0.5    // base rate
  },
  "expected_probability": 0.81
}
```

**See:** [Epistemic Reasoning](epistemic-reasoning.md)

### 4. Artifact Manifest

**Purpose:** Track generated code with provenance and validation results.

**Key features:**
- Links artifacts to TargetModel entities
- References source evidence
- Tracks validation results (parse, lint, typecheck, build, runtime)
- Epistemic envelope (confidence, uncertainties)

**Example artifact:**
```json
{
  "id": "artifact:source:api-client.js",
  "artifact_type": "source_file",
  "path": "./output/api-client.js",
  "generated_from": ["endpoint:GET:/api/users", "endpoint:POST:/api/users"],
  "claim_refs": ["claim:endpoint_exists:...", "claim:param_type:..."],
  "validation_results": {
    "parse": { "passed": true, "errors": [] },
    "lint": { "passed": true, "warnings": [] },
    "typecheck": { "passed": true, "errors": [] }
  },
  "epistemic_envelope": {
    "confidence": 0.87,
    "uncertainties": ["URL patterns may differ from actual routing"]
  }
}
```

**See:** [Artifact Manifest](artifact-manifest.md)

## The 15 Agents

LSG v2 includes 15 specialized agents organized in three phases:

### Recon Phase (6 agents)

Gather observations about the target:

1. **NetReconAgent** — Port scanning with nmap
2. **CrawlerAgent** — Endpoint discovery with katana + gau
3. **TechFingerprinterAgent** — Framework detection with whatweb
4. **JSHarvesterAgent** — JavaScript analysis (fetch calls, endpoints)
5. **APIDiscovererAgent** — OpenAPI/GraphQL introspection
6. **SubdomainHunterAgent** — Subdomain enumeration with subfinder

**See:** [Recon Agents](recon-agents.md)

### Analysis Phase (5 agents)

Build understanding from observations:

7. **ArchitectInferAgent** — Architecture inference via LLM
8. **AuthFlowAnalyzer** — Authentication mechanism detection
9. **DataFlowMapper** — Source-to-sink data flow analysis
10. **VulnHypothesizer** — OWASP vulnerability hypothesis generation
11. **BusinessLogicAgent** — Workflow and state machine detection

**See:** [Analysis Agents](analysis-agents.md)

### Synthesis Phase (4 agents)

Generate artifacts from the world model:

12. **SourceGenAgent** — Framework-aware code generation
13. **SchemaGenAgent** — OpenAPI/GraphQL schema synthesis
14. **TestGenAgent** — Security test generation
15. **DocumentationAgent** — Model-driven documentation

**See:** [Synthesis Agents](synthesis-agents.md)

## Agent Contracts

Every agent declares a formal contract:

```javascript
class ExampleAgent extends BaseAgent {
  // Input/output schemas (JSON Schema)
  inputs_schema = {
    type: 'object',
    properties: {
      target: { type: 'string' },
      options: { type: 'object' }
    },
    required: ['target']
  }

  outputs_schema = {
    type: 'object',
    properties: {
      endpoints_found: { type: 'number' },
      evidence_ids: { type: 'array' }
    }
  }

  // Dependencies
  requires = {
    evidence_kinds: ['port_scan'],
    model_nodes: ['service']
  }

  // Emissions
  emits = {
    evidence_events: ['endpoint_discovered'],
    model_updates: ['endpoint'],
    claims: ['endpoint_exists'],
    artifacts: []
  }

  // Resource budgets
  default_budget = {
    max_time_ms: 300000,
    max_network_requests: 5000,
    max_tokens: 20000,
    max_tool_invocations: 10
  }

  async run(ctx, inputs) {
    // Agent implementation
  }
}
```

This enables:
- **Static analysis** of agent dependencies
- **Pipeline validation** before execution
- **Automatic documentation** generation
- **Budget enforcement**

**See:** [Orchestration](orchestration.md)

## Execution Modes

LSG v2 supports three execution modes:

### LIVE Mode

Normal execution with network access:
- Agents run reconnaissance tools
- Evidence is gathered from live targets
- LLMs are called for analysis

### REPLAY Mode

Deterministic replay from stored evidence:
- Load EvidenceGraph from file
- Re-derive TargetModel
- Re-generate artifacts

Perfect for:
- Debugging
- Reproducible research
- CI/CD testing

### DRY_RUN Mode

Validation without execution:
- Check agent contracts
- Validate pipeline dependencies
- Estimate budgets

## Validation Harness

Every generated artifact goes through 5 validation stages:

1. **Parse** — Language syntax checking (`node --check`, `python -m py_compile`)
2. **Lint** — ESLint, Ruff, Pylint
3. **Typecheck** — TypeScript, Pyright
4. **Build** — Compilation validation
5. **Runtime** — App boot + endpoint testing

Validation results feed back into the EvidenceGraph:

```javascript
// Validation failure creates evidence
ctx.emitEvidence({
  source: 'ValidationHarness',
  event_type: 'validation_result',
  target: 'artifact:source:api-client.js',
  payload: {
    stage: 'lint',
    passed: false,
    errors: ['Unexpected token on line 42']
  }
});

// This affects future claims about similar artifacts
ledger.addEvidence(claimId, 'tool_error', 1.0, 'ValidationHarness');
```

**See:** [Validation Harness](validation-harness.md)

## Real-Time Delta Streaming

LSG v2 emits world-model changes as they occur:

```javascript
// As agents run, emit deltas
emitDelta('evidence', { id, source, event_type, target });
emitDelta('claim', { id, claim_type, opinion });
emitDelta('entity', { id, entity_type, attributes });
emitDelta('artifact', { id, artifact_type, path });
emitDelta('validation', { artifact_id, stage, passed });
```

Consumers can render results in real-time rather than waiting for batch completion.

## Budget Enforcement

Every agent has explicit resource budgets:

```javascript
default_budget = {
  max_time_ms: 300000,        // 5 minutes
  max_network_requests: 5000, // API calls
  max_tokens: 20000,          // LLM tokens
  max_tool_invocations: 10    // External tool calls
}
```

The orchestrator enforces budgets:

```javascript
const exceeded = ctx.checkBudget();
if (exceeded) {
  return {
    success: false,
    budget_exceeded: exceeded
  };
}
```

This prevents:
- Runaway execution
- Cost overruns
- Resource exhaustion

## Why LSG v2 Matters

### For Security Engineers

- **Reproducible findings** — Same inputs → same outputs
- **Traceable evidence** — Every finding links to source data
- **Quantified confidence** — Know when to trust findings

### For Developers

- **Framework-aware code** — Generated code matches your stack
- **Validated artifacts** — 5-stage validation ensures quality
- **Real-time feedback** — See results as they're discovered

### For Researchers

- **Epistemic reasoning** — Formal uncertainty quantification
- **Deterministic replay** — Perfect reproducibility
- **Extensible architecture** — Add custom agents easily

## Comparison with Upstream

| Feature | Upstream Shannon | LSG v2 (Shannon Uncontained) |
|:--------|:----------------|:-----------------------------|
| **Architecture** | Agent pipeline | World-model-first pipeline |
| **Source requirement** | White-box only | Black-box + white-box |
| **Uncertainty** | Not tracked | EBSL/EQBSL |
| **Reproducibility** | Not guaranteed | Deterministic (content hashing) |
| **Validation** | Basic | 5-stage harness |
| **Agent count** | ~8 | 15 specialized |
| **Streaming** | Batch reports | Real-time deltas |
| **Budgets** | No limits | Hard resource limits |

## Getting Started with LSG v2

### Run LSG v2 Test Suite

```bash
cd src/local-source-generator/v2
node test-suite.mjs
```

Expected output:
```
✓ EvidenceGraph: Create and query events
✓ EvidenceGraph: Content hashing ensures idempotency
✓ TargetModel: Add entities and edges
✓ EpistemicLedger: EBSL opinion calculation
... (39 tests total)

All tests passed!
```

### Run LSG v2 on Live Target

```bash
cd src/local-source-generator/v2
node test-lsg-v2.mjs https://example.com ./output
```

This will:
1. Run all 15 agents
2. Build a complete world model
3. Generate artifacts
4. Validate generated code

### Use LSG v2 Programmatically

```javascript
import { LSGv2Orchestrator } from './src/local-source-generator/v2/index.js';

const orchestrator = new LSGv2Orchestrator({
  target: 'https://example.com',
  outputDir: './output',
  mode: 'black-box',
  streamDeltas: true
});

// Listen for real-time updates
orchestrator.on('delta', (delta) => {
  console.log(`[${delta.type}] ${delta.id}`);
});

// Run full pipeline
const result = await orchestrator.run();

// Export world model
const worldModel = orchestrator.exportWorldModel();
fs.writeFileSync('./world-model.json', JSON.stringify(worldModel, null, 2));
```

## Next Steps

- **[World Model](world-model.md)** — Deep dive into the canonical spine
- **[Epistemic Reasoning](epistemic-reasoning.md)** — How uncertainty is quantified
- **[Agents](agents.md)** — All 15 agents explained
- **[Orchestration](orchestration.md)** — Pipeline execution and scheduling
- **[Validation Harness](validation-harness.md)** — 5-stage validation process
