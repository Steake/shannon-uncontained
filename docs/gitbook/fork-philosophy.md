# Fork Philosophy

> *"The struggle for a free intelligence has always been a struggle between the ironic and the literal mind."*

## Why Shannon Uncontained Exists

The upstream [Shannon project](https://github.com/KeygraphHQ/shannon) is excellent software. It pioneered AI-assisted penetration testing with working exploits, parallel agent orchestration, and sophisticated vulnerability analysis.

But it was wrapped in three unfortunate assumptions that limit its applicability:

### Assumption 1: Docker is Necessary

**Upstream position:** Shannon runs in Docker containers.

**Reality:** Node.js applications don't require containers to run. Docker is a deployment strategy, not a development prerequisite. Wrapping a JavaScript runtime in a Linux userspace to achieve "portability" is solving a problem that `npm install` solved decades ago.

**Shannon Uncontained approach:** Native execution by default. Docker remains available for those who prefer it, but it's no longer required.

**Why it matters:**
- Faster startup times (no container overhead)
- Simpler development workflow
- Better integration with local tools
- Reduced resource consumption

### Assumption 2: Source Code is Always Available

**Upstream position:** Shannon analyzes application source code.

**Reality:** The real world contains applications whose source you:
- Cannot access (third-party SaaS)
- Must not access (legal/compliance restrictions)
- Have simply lost (legacy systems)

**Shannon Uncontained approach:** Black-box reconnaissance mode with comprehensive tooling (nmap, katana, gau, subfinder, whatweb) that builds a world model from observations.

**Why it matters:**
- Test production applications without source access
- Validate vendor security claims
- Security assessment of legacy systems
- Bug bounty hunting

### Assumption 3: Single LLM Provider

**Upstream position:** Shannon uses Claude exclusively.

**Reality:** Claude is excellent. So is GPT-4. So is Gemini. So are local models. A tool that demands vendor loyalty is a tool with an expiration date. LLM providers change pricing, rate limits, and availability. Vendor lock-in is organizational risk.

**Shannon Uncontained approach:** Multi-provider support with capability-based routing:
- Claude (Anthropic)
- GPT-4/4o (OpenAI)
- GitHub Models (free tier)
- Ollama (local)
- llama.cpp (local)
- LM Studio (local)

**Why it matters:**
- Cost optimization (route tasks to cheapest capable model)
- Privacy (use local models for sensitive targets)
- Availability (fallback when primary provider is down)
- Experimentation (try new models without code changes)

## What "Uncontained" Means

The name "Shannon Uncontained" has three meanings:

### 1. Uncontained by Docker

Shannon runs natively on your system, not trapped in a container.

### 2. Uncontained in Scope

Shannon handles "uncontained" targets where you don't have source code access.

### 3. Uncontained by Vendors

Shannon isn't locked to a single LLM provider or cloud service.

## Fork Relationship with Upstream

### This is NOT a Hostile Fork

We are not competing with upstream Shannon. We are extending it in directions the maintainers may not prioritize.

**We believe:**
- The upstream maintainers built something genuinely useful
- Their architectural decisions (agent system, parallel processing) are sound
- Competition makes both projects better
- If our features prove valuable, upstream should adopt them

### What We Preserve

Shannon Uncontained maintains:
- **Core architecture** — Agent orchestration, parallel processing
- **Exploitation methodology** — Working exploit generation, evidence-based findings
- **Prompt engineering** — Agent prompts and reasoning chains
- **Testing philosophy** — Actual exploitation, not theoretical findings

### What We Add

Shannon Uncontained extends with:
- **LSG v2** — World-model-first architecture with 15 specialized agents
- **Epistemic reasoning** — EBSL/EQBSL uncertainty quantification
- **Multi-provider LLM** — Choose from 6+ providers
- **Black-box mode** — Reconnaissance without source code
- **Validation harness** — 5-stage artifact validation
- **CI/CD integration** — GitHub Actions, SARIF reports

### What We Changed

- **Removed Docker dependency** — Native Node.js execution
- **Added reconnaissance tools** — nmap, katana, gau, subfinder, whatweb
- **Refactored LLM client** — Capability-based routing, multi-provider

## Fork History

Shannon Uncontained was created over a **4-day period in December 2025**:

### December 18-20, 2025: Fork Initiation
- **Fork created** from KeygraphHQ/shannon
- **Initial modifications**: Docker removal, native execution

### December 20, 2025: Multi-Provider LLM & LSG v1
- **18:41** — Multi-provider LLM support (OpenAI, Ollama, llama.cpp, LM Studio)
- **18:38** — Renamed to "Shannon Uncontained", added AGENTS.md
- **17:32** — Local Source Generator v1 with black-box reconnaissance

### December 21, 2025: LSG v2 Complete Rewrite
The entire LSG v2 architecture was implemented in a single day:

- **17:20** — Phase 1: World Model spine, Epistemic Ledger, Orchestrator
- **17:28** — Phase 2: Recon Agents and Tool Integration (6 agents)
- **17:37** — Phase 3: Analysis Agents with LLM Integration (5 agents)
- **17:45** — Phase 4: Synthesis Agents and Validation Harness (4 agents)
- **18:06** — Test suite: 39 comprehensive tests (100% pass rate)
- **22:12** — Feature parity with "Shannon Pro"

**Timeline:** The transformation from upstream Shannon to Shannon Uncontained with LSG v2 took **exactly 4 days** (December 18-21, 2025).

## Philosophical Differences

### Upstream Shannon Philosophy

Shannon (upstream) embraces:
- **Cloud-first**: Docker containers, cloud LLMs
- **Source-available**: White-box analysis
- **Opinionated**: Best practices enforced
- **Simplicity**: One way to do things

### Shannon Uncontained Philosophy

Shannon Uncontained embraces:
- **Runtime-agnostic**: Native execution, containers optional
- **Black-box capable**: Reconnaissance without source
- **Vendor-neutral**: Multi-provider LLM support
- **Flexibility**: Multiple execution modes

**Neither philosophy is wrong.** They optimize for different contexts.

## When to Use Which

### Use Upstream Shannon When:

- ✅ You have application source code
- ✅ You prefer Docker-based workflows
- ✅ Claude is your LLM provider
- ✅ You want upstream support and updates
- ✅ You prefer opinionated tooling

### Use Shannon Uncontained When:

- ✅ You need black-box reconnaissance
- ✅ You prefer native execution
- ✅ You want multi-provider LLM support
- ✅ You need epistemic uncertainty tracking
- ✅ You want CI/CD integration
- ✅ You're experimenting with custom agents

### Use Both When:

- ✅ You're comparing approaches
- ✅ You're contributing to security research
- ✅ You want the best of both worlds

## Contributing Back to Upstream

If we develop features that upstream would benefit from, we will:

1. **Propose the feature** on upstream issues
2. **Provide implementation** if accepted
3. **Maintain compatibility** where possible
4. **Credit upstream** in our documentation

We've already contributed:
- Documentation improvements
- Bug fixes
- Feature suggestions

## License Compliance

Both projects are **AGPL-3.0 licensed**.

Shannon Uncontained:
- ✅ Maintains AGPL license
- ✅ Attributes upstream Shannon
- ✅ Shares source code publicly
- ✅ Documents modifications in MODS.md

## The Meta-Philosophy

> Why fork instead of contributing features upstream?

**Because divergent exploration is valuable.**

Upstream Shannon optimizes for their users' needs. We optimize for ours. Sometimes those needs align. Sometimes they don't.

Forking allows us to:
- **Move fast** without consensus overhead
- **Take risks** upstream might reasonably reject
- **Explore alternatives** without disrupting upstream
- **Prove value** before proposing upstream integration

If our experiments succeed, upstream can cherry-pick. If they fail, upstream is unaffected. This is healthy open-source dynamics.

## Acknowledgments

Shannon Uncontained wouldn't exist without:

- **Upstream Shannon maintainers** — For building the foundation
- **Anthropic** — For Claude and the AI SDK
- **OpenAI** — For GPT-4 and research
- **ProjectDiscovery team** — For reconnaissance tools
- **Open-source community** — For everything else

We stand on the shoulders of giants.

## Next Steps

- **[Architecture Overview](architecture/README.md)** — How Shannon works
- **[LSG v2](lsg-v2/README.md)** — Our world-model innovation
- **[Upstream Comparison](reference/upstream-comparison.md)** — Detailed comparison
