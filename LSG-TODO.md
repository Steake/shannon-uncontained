# Local Source Generator (LSG) — A Manifesto for the Sourceless

## Preamble

> *"The essence of the independent mind lies not in what it thinks, but in how it thinks."*

The Local Source Generator exists because the universe, in its infinite cruelty, sometimes denies us source code. Rather than weep into our terminals, we choose to reconstruct reality from its shadows—inferring architecture from behavior, divining endpoints from the digital ether, and generally making educated guesses that would make any statistician weep.

This document charts our path from "barely functional prototype" to "instrument of genuine utility."

---

## Current State of Affairs

### ✅ The Things That Actually Work (Miraculously)

- [x] Basic endpoint discovery via `gau` — passive URL harvesting from the internet's collective memory
- [x] Active crawling via `katana` — like a very polite burglar casing the joint
- [x] JavaScript analysis via Playwright — because SPAs weren't annoying enough already
- [x] Pseudo-source generation — synthetic code that looks almost real if you squint
- [x] Progress bar with `cli-progress` — the only honest indicator of progress in software
- [x] CLI interface with `--help` — for those who read manuals (all three of you)
- [x] Integration with `nmap`, `subfinder`, `whatweb` — the classics never die

### 🚧 Works In Progress (The Eternal Optimist's Section)

- [ ] Full pipeline integration — making Shannon aware that source code is a privilege, not a right
- [ ] Configuration file support — YAML, because JSON isn't painful enough
- [ ] Output validation — ensuring our lies are at least internally consistent

---

## Phase 1: Core Stability (The "Please Don't Crash" Initiative)

### 1.1 LLM & Proxy Infrastructure

*Because intelligence should be plug-and-play.*

- [x] Multi-provider support — OpenAI, Anthropic, and the local heroes (Ollama, Llama.cpp)
- [x] Web-to-Local API Proxies — bridging the gap between browser-based models and our CLI
- [x] Unified API interface — because switching providers shouldn't require a rewrite
- [x] Custom endpoint configuration — for when you're running your own cluster in a basement

### 1.2 Error Handling & Robustness

*Because hope is not a strategy.*

- [x] Graceful degradation when tools are missing — fail like a gentleman
- [x] Retry logic for network failures — the internet is held together with duct tape and prayers
- [x] Timeout handling for external commands — some processes, like some meetings, must be forcibly terminated
- [x] URL validation before processing — garbage in, garbage out, but let's at least check at the door

### 1.3 Output Quality

*Lies, damned lies, and synthetic source code.*

- [x] Improve pseudo-source fidelity — make our fabrications more convincing
- [x] Parameter type inference from URL patterns — `?id=1` is probably an integer, one hopes
- [x] Realistic model schemas from form analysis — if it asks for an email, it probably stores one
- [x] HTTP method inference — distinguishing GET from POST is left as an exercise to the reader

### 1.4 Testing

*Trust, but verify. Then verify again. Then write a test.*

- [x] Unit tests for core functions — the bare minimum of professional integrity
- [x] Integration tests with mock targets — controlled environments for controlled chaos
- [ ] Benchmarks against known targets — how wrong are we, exactly?

---

## Phase 2: Pipeline Integration (Making Friends With Shannon)

### 2.1 Shannon Core Integration

*Teaching an old dog new tricks, or at least a new flag.*

- [x] Auto-detect black-box mode when source directory is empty — absence of evidence as evidence of absence
- [x] Add `--blackbox` flag to `shannon.mjs` — explicit is better than implicit, they say
- [x] Invoke LSG automatically in pre-recon phase — seamless integration, or so we claim
- [x] Pass LSG output to downstream agents — the synthetic becomes the real

### 2.2 Configuration System

*For those who prefer their chaos organized.*

- [x] YAML config file support — see `configs/blackbox-templates/` for examples of our hubris
- [x] Authenticated scanning — because sometimes you need to log in before you break in
- [x] Scope limiting — include/exclude patterns for the discerning attacker
- [x] Rate limiting — politeness as a service

### 2.3 Agent Coordination

*Herding cats, but the cats are LLMs.*

- [x] Update prompts for synthetic sources — teaching AI to work with our fabrications
- [x] Add metadata markers — "WARNING: This code is a beautiful lie"
- [x] Ensure agents understand limitations — managing expectations, always managing expectations

---

## Phase 3: Advanced Features (Where Things Get Interesting)

### 3.1 LLM-Powered Analysis

*Using intelligence to compensate for our lack of information.*

- [x] Infer architecture from crawled data — reading tea leaves, but scientifically
- [x] Generate accurate data flow models — tracing the paths we cannot see
- [x] Identify API patterns (REST, GraphQL) — because everyone thinks they're special
- [x] Detect authentication flows from forms — reverse-engineering trust

### 3.2 Source-to-Sink Inference

*Vulnerability cartography without a map.*

- [x] Map endpoints to vulnerability classes — educated paranoia
- [x] Identify input vectors — query params, forms, headers, hopes, dreams
- [x] Generate synthetic "sources" for data flow analysis — manufacturing context
- [x] Create hypothesis queue for exploitation — organized speculation

### 3.3 Technology Fingerprinting

*Know thy enemy's stack.*

- [x] Enhanced `whatweb` integration — structured output for structured thinking
- [x] Framework detection — React, Angular, Vue, Rails, Django, and whatever fresh hell ships next week
- [x] CMS detection — WordPress: the gift that keeps on giving (vulnerabilities)
- [x] WAF/CDN detection — knowing where the walls are before running into them

### 3.4 API Discovery

*Finding doors that weren't meant to be found.*

- [x] OpenAPI/Swagger detection — developers documenting themselves into exposure
- [x] GraphQL introspection — "Here is everything we do, please don't abuse it"
- [x] API enumeration from JS bundles — JavaScript: the world's most verbose confession
- [x] Schema generation for `schemathesis` — automated API harassment

### 3.5 "Ghost" Traffic Generation

*Haunting applications with synthetic requests.*

- [x] Replay sanitized traffic patterns — echoes of legitimate users
- [x] Adversarial fuzzing lite — chaos, but artisanal
- [x] Race condition simulation — because timing is everything
- [x] Behavioral mimicry — looking human to machines

### 3.6 Shadow IT Hunter

*Finding what they forgot they deployed.*

- [x] Correlate assets with cloud ranges — connecting dots across the digital sky
- [x] Detect forgotten dev/staging environments — the skeletons in every org's closet
- [x] Identify S3 buckets in client-side code — "oops" as a security posture
- [x] Git leakage detection — `.git` folder reconstruction attempts

### 3.7 "Dark Matter" Analysis

*Detecting the invisible through its gravitational effects.*

- [x] Hidden endpoints in comments — developers leaving breadcrumbs
- [x] Obfuscated code pattern detection — suspicion as a heuristic
- [x] WebSocket identification — the forgotten protocol
- [x] Hidden directory scanning — `/admin`, `/backup`, and other classics

### 3.8 The IQ 9000 Hacker

*Techniques that make you feel clever, possibly too clever.*

- [x] Response latency analysis — distinguishing serverless from persistent infra
- [x] "Dark" endpoint prediction via naming conventions — reverse-engineering developer psychology
- [x] Side-channel dependency fingerprinting — inferring `package.json` without seeing it
- [x] Differential timing for database relationships — foreign keys through the looking glass
- [x] Legacy debt identification via JS archaeology — old code never dies, it just becomes vulnerable
- [x] Multi-egress CDN/WAF bypass mapping — regional variations in security theater
- [x] LLM-driven state machine analysis — hypothesizing business logic the hard way

### 3.9 They Did It Wrong (And We Found It)

*A celebration of developer optimism meeting production reality.*

- [x] "God Mode" flag detection — `?debug=true`, `?admin=1`, `?bypass=all`
- [x] CSS-hidden admin features — security through `display:none`
- [x] Hardcoded `localhost` in production bundles — "it works on my machine" made permanent
- [x] Build path fingerprinting — `/Users/dev/work/...` tells a story
- [x] Misconfigured CORS policies — `Access-Control-Allow-Origin: *` is not a policy, it's a prayer
- [x] CVE correlation with hidden dependencies — knowing what they run before they do
- [x] Leaked TODOs and FIXMEs — reading developers' inner monologue

---

## Phase 4: Enterprise Features *(The Boring But So-Called "Necessary" Bits)*

*For those who must justify budgets and satisfy auditors.*

### 4.1 CI/CD Integration

- [ ] GitHub Actions workflow template — DevSecOps buzzword compliance
- [ ] GitLab CI template — for the self-hosted crowd
- [ ] Jenkins pipeline — because some organizations never left 2015
- [ ] Artifact upload — proof that something happened

### 4.2 Reporting

- [ ] Structured JSON output — for robots
- [ ] HTML reports — for humans who pretend to read them
- [ ] SARIF format — GitHub Security tab population
- [ ] Jira/Linear integration — automated ticket creation (automated developer sadness)

### 4.3 Compliance Theater

- [ ] OWASP Top 10 mapping — the canonical list of ways to fail
- [ ] PCI-DSS tagging — for those handling other people's money
- [ ] Audit trail evidence — CYA documentation

---

## Implementation Priority

*A hierarchy of importance, subject to change based on whim and circumstance.*

| Priority | Task | Effort | Impact |
|:---------|:-----|:------:|:------:|
| **P0** | Error handling & graceful degradation | Medium | High |
| **P0** | Auto-detect black-box mode | Low | High |
| **P0** | Multi-provider LLM support | Medium | High |
| **P1** | YAML config support | Medium | Medium |
| **P1** | Improve pseudo-source quality | Medium | High |
| **P1** | "God Mode" flag & leaked URL detection | Low | High |
| **P2** | LLM-powered architecture inference | High | High |
| **P2** | API discovery from JS bundles | High | Medium |
| **P2** | CSS-hidden admin feature mapping | Medium | High |
| **P3** | "Dark" endpoint prediction | High | High |
| **P3** | CI/CD templates & SARIF output | Medium | Medium |

---

## Technical Notes

### Black-Box Strategy Selection

*Different targets require different approaches. One size fits none.*

| Target Type | Strategy | Rationale |
|:------------|:---------|:----------|
| **Static Sites** | Link extraction, form analysis | Simple things simply observed |
| **SPAs** | JS bundle analysis, API extraction | The code is the confession |
| **Traditional Web Apps** | Session crawling, form enumeration | Old school, still effective |
| **Pure APIs** | OpenAPI detection, GraphQL introspection | Let them document their own exposure |

### Tool Dependencies

*Our external dependencies, ranked by how much we'll cry if they're missing.*

| Tool | Purpose | Required | Notes |
|:-----|:--------|:--------:|:------|
| `gau` | Passive URL harvesting | **Yes** | The foundation of everything |
| `katana` | Active crawling | Recommended | Significantly improves coverage |
| `playwright` | JavaScript rendering | Recommended | SPAs are everywhere |
| `whatweb` | Technology fingerprinting | Recommended | Know thy stack |
| `nmap` | Port/service discovery | Optional | Sometimes ports matter |
| `subfinder` | Subdomain enumeration | Optional | Finding the forgotten |

### Output Structure

```
output/
├── routes/           # Synthetic route handlers (our best guesses)
├── models/           # Inferred data models (educated fiction)
├── config/           # Configuration stubs (plausible defaults)
├── outputs/
│   └── schemas/      # Discovered API schemas (actual artifacts)
└── deliverables/     # Analysis reports (what we tell the agents)
```

---

## Closing Thoughts

> *"That which can be asserted without evidence, can be dismissed without evidence."*

In black-box testing, we assert *with* evidence—just not the kind we'd prefer. Every endpoint discovered, every parameter inferred, every vulnerability hypothesized represents a small victory of observation over obscurity.

The goal is not perfection. The goal is to be less wrong than random chance, and more useful than nothing at all.

---

## References

- [LLM-driven Data-Flow Analysis](https://arxiv.org/abs/2402.10754) — The academic foundation for our educated guessing
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/) — The canonical methodology
- [The Pragmatic Programmer](https://pragprog.com/titles/tpp20/) — Because all code is technical debt in waiting
