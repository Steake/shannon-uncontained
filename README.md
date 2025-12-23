# 🔮 Shannon-Uncontained

**_Epistemic reconnaissance for those who refuse to be confined by their own assumptions_**

[![Node](https://img.shields.io/badge/node-18%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-alpha-orange.svg)](https://github.com/Steake/shannon-uncontained)

> _"What can be asserted without evidence can be dismissed without evidence."_
> — Christopher Hitchens
>
> _"What can be asserted WITH evidence must still account for its uncertainty."_
> — The EQBSL Ledger

---

## What Is This, Exactly?

Shannon-Uncontained is a **penetration testing orchestration framework** that treats security reconnaissance not as a checklist of tools, but as an exercise in **epistemic systems design**. We refuse to contain our observations in the stale categories of "finding" or "non-finding." Reality, as Hitchens might have noted, does not respect such convenient binaries.

Unlike other pentest frameworks that stuff their outputs into Docker containers (ah yes, the great equalizer of modern laziness), we operate **uncontained**. Our world model lives in the open—inspectable, falsifiable, and delightfully uncomfortable for those who prefer their security theater neatly packaged.

### The Core Proposition

Most security tools produce certainty. *They lie.*

A port scan that returns "open" tells you nothing about what lies behind it. A credential that works today may not work tomorrow. A vulnerability that exists in staging may be patched in production. Traditional tools flatten this rich epistemic landscape into boolean flags.

Shannon-Uncontained takes a different approach: every observation is encoded with its **belief**, **disbelief**, **uncertainty**, and **base rate**. We call this the **EQBSL tensor**—Evidence-Quantified Bayesian Subjective Logic—and it is the spine upon which our entire world model hangs.

---

## Philosophy (Or: Why We Built This)

### The Problem With Certainty

Most pentest reports read like religious proclamations: *"The system is vulnerable to SQL injection."* Full stop. No uncertainty. No provenance. No acknowledgment that the tester ran the payload three times on a Tuesday afternoon against a staging environment that shares approximately 40% of its codebase with production.

This is not science. This is **cargo cult security**.

### The EQBSL Alternative

We adopt the epistemic framework of [Evidence-Based Subjective Logic](./EQBSL-Primer.md), extended into tensor space with explicit operator semantics. Every claim in our world model carries:

| Component | Symbol | Meaning |
|-----------|--------|---------|
| **Belief** | `b` | Confidence the claim is true |
| **Disbelief** | `d` | Confidence the claim is false |
| **Uncertainty** | `u` | Lack of evidence either way |
| **Base Rate** | `a` | Prior probability in similar contexts |

With the constraint: `b + d + u = 1`

The **expectation** `E = b + a·u` gives us a probability estimate that honestly accounts for what we don't know. Uncertainty only decreases as evidence accumulates. You cannot hand-wave it into nonexistence.

---

## Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Shannon-Uncontained                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │   Recon      │───▶│   World      │───▶│   Epistemic  │   │
│  │   Agents     │    │   Model      │    │   Ledger     │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│         │                   │                   │            │
│         ▼                   ▼                   ▼            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │   Evidence   │◀──▶│   Claims     │◀──▶│   EQBSL      │   │
│  │   Graph      │    │   & Proofs   │    │   Tensors    │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

- **Recon Agents**: Orchestrate tools (nmap, subfinder, whatweb, etc.) and emit structured evidence
- **World Model**: Central knowledge graph of entities, claims, and relations
- **Epistemic Ledger**: Manages EQBSL tensors for all subjects; tracks uncertainty honestly
- **Evidence Graph**: Append-only store with content-addressed events and provenance
- **Budget Manager**: Resource constraints (time, tokens, network) to prevent runaway agents

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/Steake/shannon-uncontained.git
cd shannon-uncontained
npm install

# Configure your LLM provider (see LLM Provider Setup below)
cp .env.example .env
# Edit .env with your API key or local provider settings

# Generate reconnaissance for a target
./shannon.mjs generate https://example.com

# View the world model
./shannon.mjs model show --workspace shannon-results/repos/example.com

# Export interactive knowledge graph
./shannon.mjs model export-html --workspace shannon-results/repos/example.com --view provenance
```

> **⚠️ Important:** Shannon requires an LLM provider to function. See the [LLM Provider Setup](#llm-provider-setup) section below for configuration instructions.

### Graph View Modes

| Mode | Description |
|------|-------------|
| `topology` | Infrastructure network: subdomains → path categories → ports |
| `evidence` | Agent provenance: which agent discovered what evidence |
| `provenance` | EBSL-native: source → event_type → target with tensor edges |

---

## LLM Provider Setup

Shannon requires an LLM provider to perform analysis and generate code. We support multiple providers to fit different needs and budgets.

### Quick Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Choose and configure **one** of the providers below.

### Cloud Providers (Require API Key)

#### GitHub Models (Recommended for Free Tier)

Free access to GPT-4 and other models via GitHub's infrastructure:

```bash
# .env
GITHUB_TOKEN=ghp_your_token_here
```

Get your token: [github.com/settings/tokens](https://github.com/settings/tokens)

**Cost:** Free (with rate limits)

#### OpenAI

Access to GPT-4, GPT-4o, and other OpenAI models:

```bash
# .env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your_key_here
```

Get your key: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

**Cost:** ~$0.01-0.10 per request

#### Anthropic Claude

Access to Claude 3.5 Sonnet, Opus, and other Claude models:

```bash
# .env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your_key_here
```

Get your key: [console.anthropic.com](https://console.anthropic.com/)

**Cost:** ~$0.01-0.10 per request

### Local Providers (No API Key Required)

Run models entirely on your machine with no API costs:

#### Ollama

```bash
# Install Ollama from ollama.com
ollama pull llama3.2

# .env
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2
```

Default endpoint: `http://localhost:11434/v1`

#### llama.cpp

```bash
# Run llama.cpp server
python -m llama_cpp.server --model your_model.gguf

# .env
LLM_PROVIDER=llamacpp
LLM_MODEL=local-model
```

Default endpoint: `http://localhost:8080/v1`

#### LM Studio

```bash
# Download and start LM Studio from lmstudio.ai
# Start local server from the UI

# .env
LLM_PROVIDER=lmstudio
LLM_MODEL=local-model
```

Default endpoint: `http://localhost:1234/v1`

### Custom Endpoint

Use any OpenAI-compatible API endpoint:

```bash
# .env
LLM_PROVIDER=custom
LLM_BASE_URL=https://your-endpoint.com/v1
LLM_MODEL=your-model-name
# Optional: Include an API key if needed
OPENAI_API_KEY=your-key-here
```

This works with:
- Azure OpenAI endpoints
- Self-hosted inference servers (vLLM, TGI)
- Corporate proxies
- Any OpenAI-compatible API

### Advanced Configuration

Override specific models for different tasks:

```bash
# .env
LLM_FAST_MODEL=gpt-3.5-turbo      # For quick classification
LLM_SMART_MODEL=gpt-4o            # For architecture inference
LLM_CODE_MODEL=claude-sonnet-3.5  # For code generation
```

Set custom endpoints for any provider:

```bash
# Override base URL (useful for proxies)
LLM_BASE_URL=https://your-proxy.com/v1
```

For complete configuration options, see [`.env.example`](.env.example).

---

## The Evidence-First Workflow

### 1. Reconnaissance Phase

Agents emit **evidence events** into the graph:

```javascript
{
  source: 'NetRecon',
  event_type: 'PORT_SCAN',
  target: 'example.com',
  payload: { port: 443, state: 'open', service: 'https' },
  timestamp: '2024-01-15T10:30:00Z'
}
```

### 2. Claim Derivation

Evidence supports **claims** with explicit confidence:

```javascript
{
  subject: 'example.com:443',
  predicate: 'runs_service',
  object: 'nginx',
  confidence: 0.85,
  evidenceIds: ['ev_a1b2c3', 'ev_d4e5f6']
}
```

### 3. EQBSL Tensor Assignment

Every claim carries a tensor: `(b, d, u, a)`

```javascript
// High-confidence claim from strong evidence
{ b: 0.82, d: 0.03, u: 0.15, a: 0.5 }
// Expectation: 0.82 + 0.5 × 0.15 = 0.895

// Low-confidence claim from weak evidence  
{ b: 0.20, d: 0.10, u: 0.70, a: 0.5 }
// Expectation: 0.20 + 0.5 × 0.70 = 0.55
```

### 4. Visualization

The knowledge graph renders edges styled by their epistemic state:
- **Color**: Cyan (high belief) → Yellow (uncertain) → Red (low belief)
- **Width**: Thicker edges = higher expectation
- **Opacity**: More opaque = less uncertainty

---

## Why "Uncontained"?

Because Docker containers are a confession of architectural defeat.

More seriously: traditional pentest tools often operate in isolated silos. Nmap knows nothing of what Burp discovered. Nuclei doesn't care what your manual testing revealed. Each tool produces its own artifact, and some poor analyst must stitch together a coherent narrative.

Shannon-Uncontained rejects this fragmentation. All evidence flows into a single world model. All claims reference their evidentiary basis. All uncertainty is tracked, not hidden.

We are uncontained in the sense that our knowledge refuses to be boxed, our uncertainty refuses to be denied, and our architecture refuses to pretend that security is a simple matter of running the right script.

---

## Project Structure

```
shannon-uncontained/
├── shannon.mjs                 # CLI entry point
├── local-source-generator.mjs  # Black-box recon orchestration
├── src/
│   ├── core/
│   │   ├── WorldModel.js       # Central knowledge graph
│   │   ├── BudgetManager.js    # Resource constraints
│   │   └── EpistemicLedger.js  # EQBSL tensor management
│   ├── cli/
│   │   └── commands/           # CLI command handlers
│   └── local-source-generator/
│       └── v2/
│           └── worldmodel/
│               └── evidence-graph.js  # Append-only event store
├── EQBSL-Primer.md             # Full EQBSL specification
└── workspaces/                 # Generated reconnaissance outputs
```

---

## CLI Reference

```bash
# Core commands
shannon run <target> [options]        # Full pentest pipeline
shannon generate <target> [options]   # Recon-only, builds world model

# Model introspection
shannon model show --workspace <dir>           # ASCII visualization
shannon model graph --workspace <dir>          # ASCII knowledge graph
shannon model export-html --workspace <dir>    # Interactive D3.js graph
shannon model why <claim_id> --workspace <dir> # Explain a claim's evidence

# Evidence commands
shannon evidence stats --workspace <dir>  # Evidence statistics
```

---

## EQBSL In Practice

For the mathematically inclined, see [EQBSL-Primer.md](./EQBSL-Primer.md) for the complete specification.

The short version:

1. **Evidence is vector-valued**: Multiple channels (positive/negative) per observation
2. **Opinions derive from evidence**: `b = r/(r+s+K)`, `d = s/(r+s+K)`, `u = K/(r+s+K)`
3. **Decay is mandatory**: Evidence loses weight over time (configurable per channel)
4. **Propagation is explicit**: Transitive trust uses damped witness discounting
5. **Embeddings are deterministic**: ML-ready features derived reproducibly from state

---

## Contributing

We welcome contributions, particularly from those who:

- Find certainty suspicious
- Think Bayesian priors are a good start but not enough
- Believe security tools should explain their reasoning
- Have opinions about epistemic humility in adversarial contexts

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Roadmap

### v0.1 ✅ (Foundation)
- [x] World Model with EQBSL tensors
- [x] Evidence Graph (append-only)
- [x] CLI with `generate`, `model show/graph/export-html`
- [x] Three graph view modes (topology, evidence, provenance)

### v0.2 ✅ (Current)
- [x] Full pentest pipeline with agent orchestration
- [x] LLM-integrated analysis agents
- [x] Claim propagation with transitive discounting
- [x] Ground-truth validation for endpoint verification
- [x] **12 new LSGv2 agents** (exploitation, recon, blue team)
- [x] OWASP ASVS compliance mapping (14 chapters)
- [x] Enhanced reports with EBSL confidence scores

### v1.0 (Future)
- [ ] ZK proofs for evidence provenance
- [ ] Adversarial simulation mode
- [ ] Integration with external vulnerability databases
- [ ] Browser-based interactive reporting dashboard

---

## FAQ

**Q: Is this just another wrapper around existing tools?**

A: No. It's an epistemic framework that happens to orchestrate tools. The tools produce observations; we produce knowledge—with explicit uncertainty.

**Q: Why EQBSL instead of simple confidence scores?**

A: Because "80% confident" conflates two very different states: "I have strong evidence for yes" and "I have weak evidence both ways." EQBSL separates belief, disbelief, and uncertainty. This matters when making decisions.

**Q: Why the Hitchens quote?**

A: Because penetration testing is, at its core, an exercise in skepticism. We question the claims of system administrators, developers, and security vendors. Our evidence must be solid enough to survive cross-examination.

---

## License

AGPL-3.0. Because if you're going to use epistemic tools, you should share your improvements with the epistemic commons.

---

## Credits

- **EBSL foundations**: Audun Jøsang (Subjective Logic), Boris Škorić et al. (Evidence-Based Subjective Logic)
- **Name inspiration**: Claude Shannon, the father of information theory
- **Philosophical guidance**: Christopher Hitchens, who reminded us that skepticism is a virtue

---

## Fork Acknowledgment

Shannon-Uncontained is a fork of [**Shannon**](https://github.com/KeygraphHQ/shannon) by [Keygraph, Inc.](https://keygraph.io/)

We gratefully acknowledge the original authors for building the foundation upon which this epistemic extension stands. The original Shannon project provided the pentest orchestration architecture; we have extended it with EQBSL-based uncertainty quantification, knowledge graph visualization, and a rather more skeptical worldview.

If you find value in the epistemic additions, consider also starring the [upstream repository](https://github.com/KeygraphHQ/shannon).

---

<p align="center">
  <i>"That which can be measured should be measured with uncertainty."</i>
</p>
