# Shannon Uncontained

## The AI Pentester, Liberated from Its Container

Welcome to Shannon Uncontained — a fork of [Shannon](https://github.com/KeygraphHQ/shannon) that removes Docker dependencies, adds black-box reconnaissance, and supports multiple LLM providers.

Shannon's purpose is refreshingly simple: **break your web application before someone with less noble intentions does it for you.** Consider it the Red Team to your vibe-coding Blue Team, the skeptic in a room full of optimists, the one asking "but have you actually *tried* to exploit this?" while everyone else admires the architecture.

---

## What is Shannon?

Shannon is an AI pentester that delivers **actual exploits, not just alerts.**

While lesser tools content themselves with generating alarming JSON files full of theoretical vulnerabilities, Shannon does the intellectually honest thing: it **attacks your application** and shows you the receipts. If it can't exploit a vulnerability, it doesn't report it. This is not timidity — it is rigor.

### The Problem Shannon Addresses

Your team ships code continuously. Your penetration test happens annually, if you're lucky. This creates what we might charitably call a "security gap" — though "yawning chasm of organizational denial" is more accurate. For 364 days a year, you're shipping code that no adversarial intelligence has examined.

Shannon closes this gap by acting as your on-demand pentester. It doesn't merely *identify* issues; it *exploits* them, providing evidence that even the most determined skeptic cannot dismiss.

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/Steake/shannon.git
cd shannon

# Install dependencies
npm install

# Configure your environment
cp .env.example .env
# Edit .env with your API credentials

# Run Shannon
node shannon.mjs --url https://example.com --mode black-box
```

---

## Documentation Overview

This GitBook covers:

1. **[Introduction](introduction.md)** — Understanding Shannon and this fork
2. **[Installation](installation.md)** — Getting Shannon up and running
3. **[Usage Guide](usage-guide.md)** — Command-line interface and workflows
4. **[Architecture](architecture/)** — How Shannon works under the hood
5. **[LSG v2](lsg-v2/)** — Local Source Generator v2 architecture
6. **[Configuration](configuration.md)** — Environment variables and options
7. **[Advanced Topics](advanced/)** — CI/CD, custom agents, extending Shannon
8. **[API Reference](api-reference/)** — Programmatic usage
9. **[Contributing](contributing.md)** — How to contribute to the project

---

## Fork Philosophy

> *"The struggle for a free intelligence has always been a struggle between the ironic and the literal mind."*

### Why "Uncontained"?

The upstream Shannon project is excellent software wrapped in unfortunate assumptions:

1. **That Docker is the natural habitat of Node.js applications** — It is not. Docker is a deployment strategy, not a prerequisite.
2. **That source code is always available** — The real world contains applications whose source you cannot access, must not access, or have simply lost.
3. **That one LLM provider rules them all** — Claude is excellent. So is GPT-4. A tool that demands vendor loyalty is a tool with an expiration date.

This fork addresses these assumptions. We call it "Uncontained" because:
- It runs **outside** containers by default
- It handles **uncontained** scope (black-box testing)
- It remains **uncontained** by vendor lock-in

---

## Key Features

### Native Execution
No Docker required. Shannon runs as a native Node.js application.

### Black-Box Reconnaissance
Comprehensive reconnaissance without source code access:
- Network scanning (nmap)
- Endpoint discovery (katana, gau)
- Technology fingerprinting (whatweb)
- JavaScript analysis
- API discovery (OpenAPI, GraphQL)

### Multi-Provider LLM Support
Choose your LLM provider:
- **Claude** (Anthropic)
- **GPT-4/4o** (OpenAI)
- **GitHub Models** (via GitHub token)
- **Ollama** (local models)
- **llama.cpp** (local inference)
- **LM Studio** (local GUI)

### LSG v2: World-Model-First Architecture
15 specialized agents organized in a deterministic pipeline:
- **Recon agents** (6): NetRecon, Crawler, TechFingerprinter, JSHarvester, APIDiscoverer, SubdomainHunter
- **Analysis agents** (5): ArchitectInfer, AuthFlowAnalyzer, DataFlowMapper, VulnHypothesizer, BusinessLogic
- **Synthesis agents** (4): SourceGen, SchemaGen, TestGen, Documentation

### Epistemic Reasoning
Quantify uncertainty with EBSL/EQBSL:
- Subjective Logic opinions (belief, disbelief, uncertainty, base rate)
- 13 evidence dimensions
- Source reputation tracking
- Calibration metrics

### Validation Harness
5-stage validation for generated artifacts:
1. **Parse** — Syntax checking
2. **Lint** — Code quality analysis
3. **Typecheck** — Type validation
4. **Build** — Compilation verification
5. **Runtime** — App boot and endpoint testing

---

## Links

- **GitHub Repository**: [Steake/shannon](https://github.com/Steake/shannon)
- **Upstream Project**: [KeygraphHQ/shannon](https://github.com/KeygraphHQ/shannon)
- **Discord Community**: [Join Discord](https://discord.gg/KAqzSHHpRt)

---

## License

Shannon Uncontained is licensed under **AGPL-3.0**, inherited from the upstream project.
