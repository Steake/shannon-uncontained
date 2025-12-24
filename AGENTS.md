# Agent Guidelines for Shannon Uncontained

> *For AI agents, LLM assistants, and automated contributors working on this codebase.*

---

## 🍴 Fork Context

### Repository Situation

This is **Shannon Uncontained**, a fork of the original Shannon project:

| Attribute | Value |
|:----------|:------|
| **This Fork** | `github.com/Steake/shannon` |
| **Upstream** | `github.com/KeygraphHQ/shannon` |
| **Fork Name** | Shannon Uncontained |
| **License** | AGPL-3.0 (inherited from upstream) |

### Key Differences from Upstream

1. **No Docker requirement** — Native Node.js execution is the default
2. **LSG v2** — World-model-first architecture with 15 specialized agents
3. **Epistemic Reasoning** — EBSL/EQBSL uncertainty quantification
4. **Multi-provider LLM** — Claude, OpenAI, GitHub Models, and local providers

### Branch Strategy

- `main` — Stable fork releases
- Upstream sync happens manually; we cherry-pick relevant updates

---

## 🏗️ LSG v2 Architecture

### World Model First

All data flows through a canonical spine:

```
EvidenceGraph → TargetModel → ArtifactManifest
       ↑              ↓
  Recon Agents   Synthesis Agents
       ↑              ↓
  Tool Runners   Validation Harness
       ↑              ↓
 Exploitation    Blue Team Agents
```

### 27 Agents (LSGv2)

| Phase | Agent | Purpose |
|:------|:------|:--------|
| **Recon** | `NetReconAgent` | Port scanning (nmap) |
| Recon | `CrawlerAgent` | Endpoint discovery (katana, gau) |
| Recon | `TechFingerprinterAgent` | Framework detection (whatweb) |
| Recon | `JSHarvesterAgent` | JavaScript bundle analysis |
| Recon | `APIDiscovererAgent` | OpenAPI/GraphQL discovery |
| Recon | `SubdomainHunterAgent` | Subdomain enumeration (subfinder) |
| Recon | `ContentDiscoveryAgent` | Hidden files/dirs (feroxbuster, ffuf) |
| Recon | `SecretScannerAgent` | Credential detection (trufflehog, gitleaks) |
| Recon | `WAFDetector` | WAF detection (wafw00f) |
| **Analysis** | `ArchitectInferAgent` | Architecture inference via LLM |
| Analysis | `AuthFlowAnalyzer` | Authentication flow detection |
| Analysis | `DataFlowMapper` | Source-to-sink data flow analysis |
| Analysis | `VulnHypothesizer` | OWASP vulnerability hypotheses |
| Analysis | `BusinessLogicAgent` | Workflow/state machine detection |
| Analysis | `SecurityHeaderAnalyzer` | HSTS, CSP, security headers (A-F grading) |
| Analysis | `TLSAnalyzer` | TLS/SSL config (sslyze, cipher checks) |
| **Synthesis** | `SourceGenAgent` | Framework-aware code generation |
| Synthesis | `SchemaGenAgent` | OpenAPI/GraphQL schema generation |
| Synthesis | `TestGenAgent` | API and security test generation |
| Synthesis | `DocumentationAgent` | Model-driven documentation |
| Synthesis | `GroundTruthAgent` | Endpoint accessibility validation |
| **Exploitation** | `NucleiScanAgent` | CVE/exposure scanning (nuclei) |
| Exploitation | `MetasploitAgent` | msfrpc module execution |
| Exploitation | `SQLmapAgent` | SQL injection validation |
| Exploitation | `XSSValidatorAgent` | XSS confirmation (xsstrike) |
| Exploitation | `CommandInjectionAgent` | OS command injection (commix) |

### Key Components

| Component | Path | Purpose |
|:----------|:-----|:--------|
| `EvidenceGraph` | `v2/worldmodel/evidence-graph.js` | Append-only event store |
| `TargetModel` | `v2/worldmodel/target-model.js` | Normalized entity graph |
| `ArtifactManifest` | `v2/worldmodel/artifact-manifest.js` | Output tracking |
| `EpistemicLedger` | `src/core/EpistemicLedger.js` | EBSL/EQBSL claims |
| `WorldModel` | `src/core/WorldModel.js` | Unified epistemic world model |
| `ASVSMapper` | `v2/compliance/asvs-mapper.js` | OWASP ASVS v4.0.3 mapping |
| `EnhancedReport` | `v2/reports/enhanced-report.js` | EBSL-aware report generation |
| `ToolPreflight` | `v2/tools/preflight.js` | Tool availability checks |
| `Orchestrator` | `v2/orchestrator/scheduler.js` | Pipeline controller |
| `LLMClient` | `v2/orchestrator/llm-client.js` | Capability-based routing |
| `ValidationHarness` | `v2/synthesis/validators/validation-harness.js` | Code validation |

---

## 📋 Documentation Requirements

### When Making Changes

**Always update these files when modifying the codebase:**

#### 1. `MODS.md` — Modifications Log

Document all significant changes:
- New files created
- Modified files and what changed
- Configuration changes
- Dependency additions

#### 2. `README.md` — User-Facing Documentation

Update if:
- Adding new CLI flags or usage patterns
- Changing installation requirements
- Adding new features users should know about

---

## 🔧 Technical Notes

### Environment Variables

```bash
# Cloud Providers (one of these)
GITHUB_TOKEN=ghp_...           # For GitHub Models
OPENAI_API_KEY=sk-...          # For OpenAI
ANTHROPIC_API_KEY=sk-ant-...   # For Claude

# Local Providers (no API key needed)
LLM_PROVIDER=ollama            # Ollama (localhost:11434)
LLM_PROVIDER=llamacpp          # llama.cpp (localhost:8080)
LLM_PROVIDER=lmstudio          # LM Studio (localhost:1234)

# Custom Endpoint
LLM_PROVIDER=custom
LLM_BASE_URL=https://your-endpoint.com/v1

# Optional
LLM_MODEL=codellama            # Override default model
```

### Key Files

| File | Purpose |
|:-----|:--------|
| `src/local-source-generator/v2/` | LSG v2 implementation |
| `src/local-source-generator/v2/index.js` | Main exports |
| `src/local-source-generator/v2/test-suite.mjs` | 39-test comprehensive suite |
| `src/local-source-generator/v2/test-lsg-v2.mjs` | Live target testing |
| `src/ai/llm-client.js` | Multi-provider LLM client |
| `src/ai/claude-executor.js` | Claude-specific executor |

### Running Tests

```bash
# LSG v2 unit tests
cd src/local-source-generator/v2
node test-suite.mjs             # 39 tests across 12 categories

# Live target test
node test-lsg-v2.mjs https://example.com ./output
```

---

## 🚫 What NOT to Do

1. **Don't use Docker in examples** — Native execution is our identity
2. **Don't assume source code access** — Black-box is a first-class mode
3. **Don't hardcode Claude** — Multi-provider support must be maintained
4. **Don't commit test outputs** — `test-output*/` directories are gitignored
5. **Don't forget to update docs** — MODS.md must stay current

---

## 📝 Commit Message Format

```
type(scope): Short description

- Detail 1
- Detail 2
```

Types:
- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation only
- `refactor:` — Code change that neither fixes nor adds
- `test:` — Adding tests
- `chore:` — Maintenance tasks

Scopes:
- `lsg-v2` — Local Source Generator v2
- `cli` — Command-line interface
- `llm` — LLM client and providers

---

## 🤝 Relationship with Upstream

We are not hostile to the original Shannon project. Our modifications are:
- Documented and attributed
- Available for upstream consideration
- Compliant with AGPL-3.0

If upstream accepts any of our features, we consider that a success.

---

*Last updated: 2025-12-23*

