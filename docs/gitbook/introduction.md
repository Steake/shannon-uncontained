# Introduction

## What is Shannon Uncontained?

Shannon Uncontained is a fork of the [Shannon project](https://github.com/KeygraphHQ/shannon) — an AI-powered penetration testing tool that delivers **actual exploits, not just vulnerability reports**.

### The Shannon Philosophy

While traditional security scanners generate JSON files full of *theoretical* vulnerabilities, Shannon takes a different approach: it **attacks your application** and provides proof of exploitation. If Shannon can't exploit a vulnerability, it doesn't report it. This isn't timidity — it's intellectual honesty.

### Why This Fork Exists

The upstream Shannon project is excellent software wrapped in three unfortunate assumptions:

1. **Docker Dependency**: The assumption that Node.js applications require Docker containers
2. **Source Code Access**: The assumption that you always have application source code
3. **Single LLM Provider**: The assumption that vendor lock-in is acceptable

Shannon Uncontained addresses all three:

- ✅ **Native execution** — No Docker required
- ✅ **Black-box reconnaissance** — Works without source code
- ✅ **Multi-provider LLM** — Choose from 6+ LLM providers

## The Problem Shannon Solves

### The Security Gap

Your team ships code continuously. Your penetration test happens annually, if you're lucky. This creates a "security gap" — 364 days a year of shipping code that no adversarial intelligence has examined.

Shannon closes this gap by acting as your **on-demand pentester**, providing:

- **Continuous security testing** integrated into your development workflow
- **Evidence-based findings** with working exploits
- **Reproducible results** through deterministic analysis
- **Cost-effective** compared to manual pentesting

### How Shannon Works

Shannon operates in two modes:

#### White-Box Mode (Upstream Shannon)
- Analyzes your application source code
- Identifies vulnerabilities through static and dynamic analysis
- Generates exploits based on code understanding

#### Black-Box Mode (Shannon Uncontained Enhancement)
- Works without source code access
- Performs comprehensive reconnaissance
- Builds a world model of your application
- Synthesizes attack vectors from observations

## Key Innovations

### 1. LSG v2: World-Model-First Architecture

Shannon Uncontained introduces **Local Source Generator v2**, a novel architecture that:

- Creates a **canonical world model** from reconnaissance data
- Tracks **epistemic uncertainty** for every claim
- Enables **deterministic code generation** from observations
- Provides **perfect traceability** from findings to evidence

```
EvidenceGraph → TargetModel → ArtifactManifest
       ↑              ↓
  Recon Agents   Synthesis Agents
```

### 2. Epistemic Reasoning (EBSL/EQBSL)

Unlike tools that report findings as binary true/false, Shannon quantifies uncertainty:

```
Claim: "Endpoint /api/users accepts parameter 'id' of type integer"
Confidence: 87% (based on 5 evidence sources)
Uncertainty: 13% (insufficient type validation evidence)
```

This is powered by **Subjective Logic** with:
- **Belief** (b): Positive evidence strength
- **Disbelief** (d): Negative evidence strength
- **Uncertainty** (u): Lack of evidence
- **Base rate** (a): Prior probability

### 3. Multi-Provider LLM Support

Choose the right LLM for each task:

| Provider | Use Case | Cost | Privacy |
|:---------|:---------|:----:|:-------:|
| **Claude** | Architecture inference | $$$ | Cloud |
| **GPT-4** | Code synthesis | $$$ | Cloud |
| **GitHub Models** | Free tier testing | $ | Cloud |
| **Ollama** | Local development | Free | Local |
| **llama.cpp** | High-performance local | Free | Local |
| **LM Studio** | GUI-based local | Free | Local |

### 4. 15 Specialized Agents

Shannon Uncontained includes 15 purpose-built agents:

**Recon Phase** (6 agents):
- NetReconAgent — Port scanning
- CrawlerAgent — Endpoint discovery
- TechFingerprinterAgent — Framework detection
- JSHarvesterAgent — JavaScript analysis
- APIDiscovererAgent — API schema discovery
- SubdomainHunterAgent — Subdomain enumeration

**Analysis Phase** (5 agents):
- ArchitectInferAgent — Architecture inference
- AuthFlowAnalyzer — Authentication detection
- DataFlowMapper — Data flow analysis
- VulnHypothesizer — Vulnerability hypothesis
- BusinessLogicAgent — Workflow detection

**Synthesis Phase** (4 agents):
- SourceGenAgent — Code generation
- SchemaGenAgent — Schema synthesis
- TestGenAgent — Test generation
- DocumentationAgent — Documentation

### 5. Validation Harness

Every generated artifact goes through 5 validation stages:

1. **Parse** — Syntax validation
2. **Lint** — Code quality checks
3. **Typecheck** — Type safety verification
4. **Build** — Compilation validation
5. **Runtime** — Execution testing

Failures feed back into the world model, improving future generation.

## Who Should Use Shannon Uncontained?

### Security Engineers
- Automate repetitive penetration testing tasks
- Generate working exploits for vulnerability reports
- Validate security controls continuously

### DevOps Teams
- Integrate security testing into CI/CD pipelines
- Catch vulnerabilities before production deployment
- Monitor security posture over time

### Bug Bounty Hunters
- Accelerate reconnaissance and exploitation
- Generate test cases for identified vulnerabilities
- Improve coverage of target applications

### Security Researchers
- Experiment with epistemic reasoning approaches
- Extend Shannon with custom agents
- Contribute to open-source security tools

## What Shannon is NOT

Shannon is **not**:

- ❌ A replacement for manual penetration testing
- ❌ A compliance checkbox tool
- ❌ A static analysis scanner
- ❌ A vulnerability database lookup service
- ❌ A guaranteed exploit generator

Shannon is a **force multiplier** for security professionals, not a replacement for human expertise.

## Relationship with Upstream

Shannon Uncontained is **not a hostile fork**. It is a divergent one.

We maintain compatibility with upstream Shannon where possible and contribute improvements back when appropriate. The core exploitation methodology, agent architecture, and parallel processing remain unchanged from upstream.

**Development timeline:** Shannon Uncontained was created over a 4-day period (December 18-21, 2025):
- **Day 1-2** (Dec 18-20): Fork creation, Docker removal, multi-provider LLM
- **Day 3** (Dec 20): Local Source Generator v1, black-box reconnaissance
- **Day 4** (Dec 21): Complete LSG v2 rewrite (15 agents, epistemic reasoning, validation harness)

If upstream Shannon adopts any of our features, we consider that a success.

## Next Steps

- **[Installation](installation.md)** — Get Shannon running
- **[Quick Start](quick-start.md)** — Run your first scan
- **[Architecture Overview](architecture/README.md)** — Understand how it works
- **[LSG v2](lsg-v2/README.md)** — Deep dive into the world model
