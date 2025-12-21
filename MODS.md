# Shannon Modifications Log

This document tracks significant modifications made to the Shannon codebase.

---

## LSG v2 - World Model First Architecture (2025-12-21)

### Overview
Complete rewrite of the Local Source Generator using a "World Model First" architecture with epistemic reasoning. Implements 15 agents across reconnaissance, analysis, and synthesis phases.

### Architecture

```
EvidenceGraph → TargetModel → ArtifactManifest
       ↑              ↓
  Recon Agents   Synthesis Agents
       ↑              ↓
  Tool Runners   Validation Harness
```

### Components Implemented

#### World Model Spine
- **`worldmodel/evidence-graph.js`** — Append-only event store with content hashing
- **`worldmodel/target-model.js`** — Normalized entity graph
- **`worldmodel/artifact-manifest.js`** — Output tracking with validation status

#### Epistemic Ledger
- **`epistemics/ledger.js`** — Full EBSL/EQBSL implementation
  - Subjective Logic opinions (b, d, u, a)
  - Vector evidence aggregation
  - Source reputation discounting
  - ECE calibration metrics

#### Orchestrator
- **`orchestrator/scheduler.js`** — Pipeline controller with caching
- **`orchestrator/streaming.js`** — Real-time delta emission
- **`orchestrator/llm-client.js`** — Capability-based LLM routing

#### 15 Agents

| Phase | Agent | Purpose |
|:------|:------|:--------|
| Recon | `NetReconAgent` | Port scanning (nmap) |
| Recon | `CrawlerAgent` | Endpoint discovery (katana, gau) |
| Recon | `TechFingerprinterAgent` | Framework detection |
| Recon | `JSHarvesterAgent` | JavaScript bundle analysis |
| Recon | `APIDiscovererAgent` | OpenAPI/GraphQL discovery |
| Recon | `SubdomainHunterAgent` | Subdomain enumeration |
| Analysis | `ArchitectInferAgent` | Architecture inference |
| Analysis | `AuthFlowAnalyzer` | Authentication flow detection |
| Analysis | `DataFlowMapper` | Source-to-sink analysis |
| Analysis | `VulnHypothesizer` | OWASP vulnerability hypotheses |
| Analysis | `BusinessLogicAgent` | Workflow/state machine detection |
| Synthesis | `SourceGenAgent` | Framework-aware code generation |
| Synthesis | `SchemaGenAgent` | OpenAPI/GraphQL schema generation |
| Synthesis | `TestGenAgent` | API and security test generation |
| Synthesis | `DocumentationAgent` | Model-driven documentation |

#### Synthesis Infrastructure
- **`synthesis/scaffold-packs/`** — Express.js and FastAPI templates
- **`synthesis/validators/validation-harness.js`** — Parse, lint, typecheck validation

### Test Coverage
- **39 tests** across 12 component categories
- Run: `cd src/local-source-generator/v2 && node test-suite.mjs`

### Usage
```bash
cd src/local-source-generator/v2
node test-lsg-v2.mjs https://example.com ./output
```

### Statistics
- **34 files** created
- **8,831 lines** of JavaScript
- **100%** test pass rate

---

## Multi-Provider LLM Infrastructure (2025-12-20)

### Overview
Complete rewrite of the LLM client to support multiple providers: GitHub Models, OpenAI, Ollama, llama.cpp, LM Studio, and custom endpoints.

### Changes Made

#### New/Renamed Files
- **`src/ai/llm-client.js`** — Multi-provider LLM client (renamed from `github-client.js`)
- **`src/ai/llm-client.test.js`** — Unit tests for provider configuration
- **`.env.example`** — Comprehensive environment variable documentation
- **`AGENTS.md`** — AI agent guidelines with provider reference table

#### Modified Files
- **`src/ai/claude-executor.js`** — Updated import to `llm-client.js`
- **`LSG-TODO.md`** — Marked Phase 1.1 complete

### Supported Providers

| Provider | Endpoint | API Key Required |
|:---------|:---------|:----------------:|
| `github` | `models.github.ai/inference` | Yes (`GITHUB_TOKEN`) |
| `openai` | `api.openai.com/v1` | Yes (`OPENAI_API_KEY`) |
| `ollama` | `localhost:11434/v1` | No |
| `llamacpp` | `localhost:8080/v1` | No |
| `lmstudio` | `localhost:1234/v1` | No |
| `custom` | `LLM_BASE_URL` | Optional |

### Configuration

```bash
# Cloud providers
GITHUB_TOKEN=ghp_...
# or
OPENAI_API_KEY=sk-...

# Local providers (no key needed)
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2

# Custom endpoint
LLM_PROVIDER=custom
LLM_BASE_URL=https://your-proxy.com/v1
```

---

## Local Source Generator v1 (2025-12-20)

### Overview
Black-box reconnaissance capability for targets without source code access.

### Features
- Generates synthetic pseudo-source from discovered endpoints
- Integrates with: `nmap`, `subfinder`, `whatweb`, `gau`, `katana`
- Creates route files, models, and configuration stubs
- Progress bar with `cli-progress`

### Files
- **`local-source-generator.mjs`** — CLI entry point
- **`src/local-source-generator/`** — Module components
- **`configs/blackbox-templates/`** — Configuration templates

### Usage
```bash
node local-source-generator.mjs --help
node local-source-generator.mjs --target "https://example.com" --output "./output"
```

---

## Fork Renaming (2025-12-20)

### Overview
Renamed fork to "Shannon Uncontained" with new README and documentation.

### Changes
- **`README.md`** — Complete rewrite with fork philosophy, mermaid architecture diagram
- **`AGENTS.md`** — Guidelines for AI agents working on the codebase
- **`LSG-TODO.md`** — Hitchens-esque roadmap with phase structure

---

