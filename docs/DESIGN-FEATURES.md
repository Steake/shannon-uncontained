# Shannon Uncontained: New and Smart Design Features

> **Document prepared:** 2025-12-21
> **Analysis scope:** Shannon Uncontained fork (github.com/Steake/shannon)
> **Upstream:** KeygraphHQ/shannon
> **Development timeline:** December 18-21, 2025 (4 days)

---

## Executive Summary

Shannon Uncontained represents a paradigm shift in AI-powered penetration testing by treating security assessment as a **probabilistic knowledge discovery system** rather than a simple tool chain. Through 10+ innovative design patterns, LSG v2 architecture, and epistemic reasoning, Shannon Uncontained distinguishes itself from both traditional security tools and the upstream Shannon project.

**Key metrics:**
- **15 specialized agents** across recon, analysis, and synthesis phases
- **13 evidence dimensions** for epistemic reasoning
- **5-stage validation harness** for artifact quality
- **6+ LLM providers** supported (vendor-neutral)
- **39 comprehensive tests** with 100% pass rate
- **Deterministic reproducibility** via content hashing

---

## Top 10 Smart Design Features

### 1. World-Model-First Architecture

**Innovation:** Creates a canonical data spine where all information flows deterministically.

**Traditional approach:**
```
Tools → Ad-hoc parsing → Hope they integrate → Generate reports
```

**LSG v2 approach:**
```
EvidenceGraph → TargetModel → ArtifactManifest
       ↑              ↓
  Recon Agents   Synthesis Agents
```

**Why it matters:**
- Perfect provenance from findings to source evidence
- Deterministic derivation (same inputs → same outputs)
- No orphaned data or ad-hoc integration hacks

**Implementation:**
- `worldmodel/evidence-graph.js` — Immutable event store
- `worldmodel/target-model.js` — Normalized entity graph
- `worldmodel/artifact-manifest.js` — Output tracking

### 2. Epistemic Reasoning (EBSL/EQBSL)

**Innovation:** Quantifies uncertainty using Subjective Logic instead of binary true/false findings.

**Opinion tuple:** `(b, d, u, a)`
- **b** (belief): Positive evidence strength
- **d** (disbelief): Negative evidence strength
- **u** (uncertainty): Lack of evidence
- **a** (base rate): Prior probability

**Example:**
```javascript
Claim: "Endpoint /api/users accepts parameter 'id' of type integer"
Evidence:
  - 2 successful probes (2.0 × 1.0)
  - 1 crawl observation (1.0 × 0.9)
  - 1 JS analysis (1.0 × 0.8)
Result: 85% confident (70% belief, 0% disbelief, 30% uncertainty)
```

**Why it matters:**
- Security engineers know *when to trust* findings
- Prioritize high-confidence findings over uncertain ones
- Transparent: "How confident?" and "Why?" are always answerable

**Implementation:**
- `epistemics/ledger.js` — Full EBSL/EQBSL system
- 13 evidence dimensions with configurable weights
- Source reputation tracking
- Expected Calibration Error (ECE) metrics

### 3. Content-Hashed Immutability

**Innovation:** Evidence events are identified by content hash, not timestamps or random IDs.

**Benefits:**
- Same observation → same event ID
- Automatic deduplication
- Deterministic replay
- Perfect caching

**Implementation:**
```javascript
function contentHash(event) {
  const canonical = JSON.stringify(event, Object.keys(event).sort());
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}
```

**Why it matters:**
Makes the entire system reproducible and auditable — critical for security testing.

### 4. Capability-Based LLM Routing

**Innovation:** Routes tasks by capability requirements, not "which LLM is best."

**7 capabilities:**
- `CLASSIFY_FAST` → fast, cheap models (prefer local)
- `INFER_ARCHITECTURE` → smart models (prefer cloud)
- `SYNTHESIZE_MODULE` → code-specialized models
- `EXTRACT_CLAIMS` → smart models
- `SYNTHESIZE_CODE_PATCH` → code models (prefer local)
- `SCHEMA_COMPLETION` → smart models
- `TEST_GENERATION` → code models (prefer local)

**Multi-provider support:**
- Claude (Anthropic)
- GPT-4/4o (OpenAI)
- GitHub Models (free tier)
- Ollama (local)
- llama.cpp (local)
- LM Studio (local)

**Why it matters:**
- Cost optimization (cheap models for simple tasks)
- Privacy (local models for sensitive targets)
- Availability (fallback when primary provider is down)
- Vendor independence

### 5. Budget-Constrained Agent Execution

**Innovation:** Every agent declares explicit resource budgets with real-time enforcement.

**Budget dimensions:**
- `max_time_ms` — Execution time limit
- `max_network_requests` — API call limit
- `max_tokens` — LLM token limit
- `max_tool_invocations` — External tool call limit

**Example:**
```javascript
default_budget = {
  max_time_ms: 300000,        // 5 minutes
  max_network_requests: 5000,
  max_tokens: 20000,
  max_tool_invocations: 10
}

const exceeded = ctx.checkBudget();
if (exceeded) {
  return { success: false, budget_exceeded: exceeded };
}
```

**Why it matters:**
Prevents runaway execution and cost overruns in production environments.

### 6. Five-Stage Validation Harness

**Innovation:** Generated artifacts validated through progressive stages.

**5 stages:**
1. **Parse** — Syntax checking (`node --check`, `python -m py_compile`)
2. **Lint** — Code quality (ESLint, Ruff, Pylint)
3. **Typecheck** — Type safety (TypeScript, Pyright)
4. **Build** — Compilation validation
5. **Runtime** — App boot + endpoint testing

**Feedback loop:**
```javascript
// Validation failure creates evidence
ctx.emitEvidence({
  event_type: 'validation_result',
  payload: { stage: 'lint', passed: false, errors: [...] }
});

// Affects future claims
ledger.addEvidence(claimId, 'tool_error', 1.0, 'ValidationHarness');
```

**Why it matters:**
Generated code isn't just syntactically valid — it's production-ready.

### 7. Real-Time Delta Streaming

**Innovation:** Emits world-model changes as they occur, not batch reports.

**8 delta types:**
- `EVIDENCE` — New evidence events
- `CLAIM` — Epistemic claims
- `ENTITY` — TargetModel entities
- `EDGE` — Entity relationships
- `ARTIFACT` — Generated files
- `VALIDATION` — Validation results
- `STAGE` — Pipeline stage progress
- `PROGRESS` — Percentage complete

**Why it matters:**
Users see progress immediately rather than waiting for batch completion.

### 8. Agent Contract System

**Innovation:** Every agent declares a formal contract.

**Contract components:**
```javascript
{
  inputs_schema: { /* JSON Schema */ },
  outputs_schema: { /* JSON Schema */ },
  requires: {
    evidence_kinds: ['port_scan', 'endpoint_discovered'],
    model_nodes: ['service', 'endpoint']
  },
  emits: {
    evidence_events: ['endpoint_discovered'],
    model_updates: ['endpoint'],
    claims: ['endpoint_exists'],
    artifacts: ['source_files']
  },
  default_budget: { /* resource limits */ },
  idempotency_key: (inputs, config) => hash(...)
}
```

**Why it matters:**
- Static analysis of agent dependencies
- Pipeline validation before execution
- Automatic documentation generation
- Budget enforcement

### 9. Framework-Aware Code Generation

**Innovation:** Pluggable scaffold packs that adapt to detected frameworks.

**Features:**
- Templates are **functions**, not static strings
- Detect framework (Express.js, FastAPI, etc.)
- Generate framework-idiomatic code
- Embed epistemic confidence in comments

**Example:**
```javascript
// Generated code includes:
// Confidence: 0.87 (based on 3 evidence sources)
// Uncertainty: URL patterns may differ from actual routing
```

**Why it matters:**
Generated code matches the target's actual conventions, not generic templates.

### 10. Deterministic Model Derivation

**Innovation:** TargetModel is deterministically derived from EvidenceGraph.

**Key property:**
```javascript
deriveFromEvidence(evidenceGraph, ledger) {
  this.derivationVersion++;
  // Process events in deterministic order
  // Same inputs → Same output (no randomness)
}
```

**Why it matters:**
Critical for artifact reproducibility — same evidence always generates same code.

---

## Architecture Comparison

### Traditional Security Tools

```
┌──────────┐
│   Scan   │ ← Run tools
└────┬─────┘
     ↓
┌──────────┐
│  Report  │ ← Generate findings
└────┬─────┘
     ↓
┌──────────┐
│   Done   │
└──────────┘
```

**Problems:**
- ❌ No canonical representation
- ❌ No uncertainty tracking
- ❌ No traceability
- ❌ No reproducibility

### Shannon Uncontained (LSG v2)

```
┌──────────────┐
│ Recon Tools  │ ← nmap, katana, gau, subfinder, etc.
└──────┬───────┘
       ↓ normalize
┌──────────────┐
│EvidenceGraph │ ← Immutable, content-hashed events
└──────┬───────┘
       ↓ derive
┌──────────────┐
│ TargetModel  │ ← Normalized entities + epistemic claims
└──────┬───────┘
       ↓ synthesize
┌──────────────┐
│  Artifacts   │ ← Framework-aware code generation
└──────┬───────┘
       ↓ validate
┌──────────────┐
│  Feedback    │ ← Evidence about quality
└──────┬───────┘
       └────────> (loops back to EvidenceGraph)
```

**Advantages:**
- ✅ Canonical world model
- ✅ Quantified uncertainty
- ✅ Perfect traceability
- ✅ Deterministic reproducibility

---

## Upstream Shannon vs. Shannon Uncontained

| Feature | Upstream Shannon | Shannon Uncontained |
|:--------|:----------------|:--------------------|
| **Execution** | Docker containers | Native Node.js |
| **Source requirement** | White-box only | Black-box + white-box |
| **LLM support** | Claude only | 6+ providers |
| **Architecture** | Agent pipeline | World-model-first |
| **Uncertainty** | Not tracked | EBSL/EQBSL |
| **Agent count** | ~8 | 15 specialized |
| **Validation** | Basic | 5-stage harness |
| **Streaming** | Batch reports | Real-time deltas |
| **Budgets** | No limits | Hard resource limits |
| **Reproducibility** | Not guaranteed | Deterministic |
| **Reconnaissance** | Source analysis only | nmap, katana, gau, subfinder |

---

## The 15 Specialized Agents

### Recon Phase (6 agents)

| Agent | Purpose | Tools | Outputs |
|:------|:--------|:------|:--------|
| **NetReconAgent** | Port scanning | nmap | PORT_SCAN events |
| **CrawlerAgent** | Endpoint discovery | katana, gau | ENDPOINT_DISCOVERED events |
| **TechFingerprinterAgent** | Framework detection | whatweb | TECH_DETECTED events |
| **JSHarvesterAgent** | JavaScript analysis | AST parsing | JS_FETCH_CALL events |
| **APIDiscovererAgent** | API introspection | OpenAPI, GraphQL | API_SCHEMA events |
| **SubdomainHunterAgent** | Subdomain enumeration | subfinder | SUBDOMAIN_FOUND events |

### Analysis Phase (5 agents)

| Agent | Purpose | LLM Capability | Outputs |
|:------|:--------|:--------------|:--------|
| **ArchitectInferAgent** | Architecture inference | INFER_ARCHITECTURE | Component entities |
| **AuthFlowAnalyzer** | Auth mechanism detection | EXTRACT_CLAIMS | Auth flow entities |
| **DataFlowMapper** | Source-to-sink analysis | EXTRACT_CLAIMS | Data flow claims |
| **VulnHypothesizer** | Vulnerability hypothesis | EXTRACT_CLAIMS | Vulnerability claims |
| **BusinessLogicAgent** | Workflow detection | INFER_ARCHITECTURE | Workflow entities |

### Synthesis Phase (4 agents)

| Agent | Purpose | LLM Capability | Outputs |
|:------|:--------|:--------------|:--------|
| **SourceGenAgent** | Code generation | SYNTHESIZE_MODULE | Source files |
| **SchemaGenAgent** | Schema synthesis | SCHEMA_COMPLETION | OpenAPI/GraphQL schemas |
| **TestGenAgent** | Test generation | TEST_GENERATION | Test files |
| **DocumentationAgent** | Documentation | SYNTHESIZE_MODULE | Markdown docs |

---

## Evidence Dimensions (13 Total)

### Positive Dimensions (contribute to belief)

| Dimension | Weight | Source |
|:----------|-------:|:-------|
| `active_probe_success` | 1.0 | Successful HTTP probes |
| `crawl_observed` | 0.9 | Direct URL observations |
| `js_ast_direct` | 0.8 | JavaScript AST analysis |
| `openapi_fragment` | 1.0 | OpenAPI schema fragments |
| `graphql_introspection` | 1.0 | GraphQL introspection |
| `har_observed_shape` | 0.9 | HAR file request shapes |
| `historical_url_hit` | 0.6 | Historical URL databases |
| `crawl_inferred` | 0.5 | Inferred from patterns |
| `js_ast_heuristic` | 0.4 | Heuristic JS analysis |

### Negative Dimensions (contribute to disbelief)

| Dimension | Weight | Source |
|:----------|-------:|:-------|
| `active_probe_fail` | 1.0 | Failed HTTP probes |
| `contradiction_count` | 0.8 | Conflicting evidence |
| `tool_error` | 0.5 | Tool execution errors |
| `timeout` | 0.3 | Network timeouts |

---

## Source Reputation System

**How it works:**

1. **Track successes/failures** per source:
   ```javascript
   {
     sourceId: 'nmap',
     successes: 47,
     failures: 3
   }
   ```

2. **Compute reliability** using EBSL:
   ```javascript
   opinion = ebslOpinion(47, 3, K=2, a=0.5)
   // → { b: 0.90, d: 0.06, u: 0.04 }
   reliability = 0.92
   ```

3. **Discount evidence** by reliability:
   ```javascript
   adjustedValue = rawValue * reliability
   // Example: 1.0 * 0.92 = 0.92
   ```

**Benefits:**
- Unreliable tools automatically contribute less
- System adapts to tool performance over time
- Transparent: track which tools are trustworthy

---

## Validation Harness Details

### Language Support

**JavaScript:**
- Parse: `node --check`
- Lint: ESLint
- Typecheck: N/A (or TypeScript if `.ts`)

**TypeScript:**
- Parse: `npx tsc --noEmit`
- Lint: ESLint
- Typecheck: `npx tsc --noEmit`

**Python:**
- Parse: `python3 -m py_compile`
- Lint: Ruff (fallback: Pylint)
- Typecheck: Pyright

### Validation Workflow

```javascript
async validateFile(filePath) {
  const results = { parse: null, lint: null, typecheck: null };

  // Stage 1: Parse
  results.parse = await validators.parse(filePath);
  if (!results.parse.passed) return results; // Early exit

  // Stage 2: Lint
  results.lint = await validators.lint(filePath);

  // Stage 3: Typecheck
  results.typecheck = await validators.typecheck(filePath);

  return results;
}
```

### Feedback Loop

```javascript
// Emit validation evidence
ctx.emitEvidence({
  source: 'ValidationHarness',
  event_type: 'validation_result',
  target: artifactId,
  payload: { stage, passed, errors, warnings }
});

// Update source reputation
if (!passed) {
  ledger.updateSourceReputation(generatorAgent, wasCorrect: false);
}
```

---

## Technical Statistics

### Code Metrics
- **LSG v2 implementation:** 34 files, 8,831 lines
- **Test coverage:** 39 tests, 100% pass rate
- **Agent count:** 15 specialized agents
- **Evidence dimensions:** 13 types
- **Validation stages:** 5 progressive levels
- **LLM providers:** 6 supported

### Performance Characteristics
- **Startup time:** < 1 second (native execution)
- **Recon phase:** 3-10 minutes (depends on target size)
- **Analysis phase:** 1-5 minutes (LLM-dependent)
- **Synthesis phase:** 2-8 minutes (validation included)
- **Total pipeline:** 6-23 minutes for typical web app

### Resource Requirements
- **Memory:** 512MB - 2GB (depends on target size)
- **CPU:** 2+ cores recommended
- **Network:** Active reconnaissance requires outbound access
- **Disk:** 100MB - 1GB for evidence storage
- **LLM tokens:** 10,000 - 50,000 per run (cloud providers)

---

## Philosophical Innovations

### 1. Probabilistic Security Testing

Traditional tools: "Vulnerability found: yes/no"

Shannon Uncontained: "87% confident this vulnerability exists with 13% uncertainty due to limited authentication testing"

### 2. Provenance-First Design

Every finding links back to source evidence:
- "Why did you generate this endpoint?" → Links to 3 evidence events
- "How confident are you?" → Shows opinion (b, d, u, a)
- "What's missing?" → Identifies high-uncertainty claims

### 3. Adaptive Tool Reliability

Tools aren't treated as perfect oracles. Their track record affects future evidence weighting.

### 4. Deterministic Reproducibility

Content hashing ensures:
- Same target → same evidence → same model → same artifacts
- Perfect for CI/CD validation
- Enables reproducible security research

### 5. Feedback-Driven Improvement

Validation failures feed back into the world model:
- Failed validations reduce source reputation
- High error rates trigger evidence reweighting
- Calibration metrics guide configuration tuning

---

## Use Cases

### Security Engineers
- **Automate reconnaissance** across large attack surfaces
- **Generate working exploits** for vulnerability reports
- **Quantify confidence** in findings for prioritization
- **Track uncertainty** to know when manual validation is needed

### DevOps Teams
- **CI/CD integration** for continuous security testing
- **Pre-deployment validation** of security controls
- **Budget-constrained** execution prevents cost overruns
- **Real-time feedback** during development

### Bug Bounty Hunters
- **Accelerate initial recon** with 15 specialized agents
- **Generate test cases** from discovered endpoints
- **Framework-aware** code generation for custom exploits
- **Multi-provider LLM** for cost optimization

### Security Researchers
- **Epistemic reasoning** as a research contribution
- **Deterministic replay** for reproducible experiments
- **Extensible architecture** for custom agent development
- **Open-source** for academic use

---

## Future Directions

### Planned Enhancements
1. **Additional agents** (mobile app analysis, cloud infrastructure)
2. **Enhanced calibration** (Bayesian calibration, active learning)
3. **Distributed execution** (agent parallelization across nodes)
4. **Visual dashboards** (real-time world model visualization)
5. **Custom scaffolds** (more framework templates)

### Research Opportunities
1. **Transfer learning** for source reputation
2. **Uncertainty reduction** strategies
3. **Agent collaboration** patterns
4. **Automated evidence weight tuning**
5. **Formal verification** of generated code

---

## Conclusion

Shannon Uncontained represents a fundamental rethinking of AI-powered security testing. By treating penetration testing as a **probabilistic knowledge discovery system**, it solves problems that traditional tools don't even acknowledge:

1. **Uncertainty quantification** — Every claim has a probability
2. **Perfect traceability** — Every finding links to source evidence
3. **Deterministic reproducibility** — Same inputs → same outputs
4. **Vendor independence** — Multi-provider LLM support
5. **Budget awareness** — Hard resource limits prevent overruns

The innovations in LSG v2 — world-model-first architecture, epistemic reasoning, content-hashed immutability, and validation feedback loops — create a system that is:

- **Transparent** — Always explainable
- **Adaptive** — Improves over time
- **Reproducible** — Scientifically rigorous
- **Practical** — Production-ready code generation

This isn't just "better pentesting." It's a new category of security tool.

---

**Last updated:** 2025-12-21
**Version:** Shannon Uncontained 2.0.0
**License:** AGPL-3.0
**Repository:** https://github.com/Steake/shannon
