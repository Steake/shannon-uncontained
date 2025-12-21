# Epistemic Reasoning in LSG v2

## Overview

LSG v2 doesn't just track *what* it discovered — it tracks *how confident* it is in each discovery and *why*.

This is powered by **Epistemic Reasoning**: the formal study of knowledge, belief, and uncertainty.

## The Problem with Binary Findings

Traditional security tools report findings as binary:

```
✅ Endpoint /api/users exists
✅ Parameter 'id' is required
❌ Authentication not required
```

But reality is probabilistic:

- **Evidence is ambiguous**: One tool finds the endpoint, another doesn't
- **Tools fail**: Network timeouts, rate limits, bugs
- **Observations conflict**: JavaScript suggests one thing, HTTP responses suggest another
- **Confidence varies**: Direct observation vs. heuristic inference

Binary findings hide this complexity.

## LSG v2's Approach: Subjective Logic

LSG v2 uses **Subjective Logic** — a mathematical framework for reasoning under uncertainty.

### The Opinion Tuple

Every claim has an **opinion**: `(b, d, u, a)`

- **b** (belief): Strength of positive evidence
- **d** (disbelief): Strength of negative evidence
- **u** (uncertainty): Lack of evidence
- **a** (base rate): Prior probability

**Constraint:** `b + d + u = 1`

**Expected probability:** `P = b + a·u`

### Example

**Claim:** "Endpoint /api/users accepts parameter 'id' of type integer"

**Evidence:**
- 2 successful probes returned integers
- 1 crawl observation found `?id=123` in URLs
- 1 JavaScript analysis found `parseInt(params.id)`
- 0 failures or contradictions

**Opinion calculation:**
```javascript
r = (2 * 1.0) + (1 * 0.9) + (1 * 0.8) = 4.7  // positive evidence
s = 0                                          // negative evidence
K = 2                                          // prior weight

b = r / (r + s + K) = 4.7 / 6.7 = 0.70
d = s / (r + s + K) = 0.0 / 6.7 = 0.00
u = K / (r + s + K) = 2.0 / 6.7 = 0.30
a = 0.5

Expected probability = 0.70 + (0.5 * 0.30) = 0.85
```

**Interpretation:**
- **85% confident** the claim is true
- **70% belief** from evidence
- **0% disbelief** (no contradictions)
- **30% uncertainty** (could gather more evidence)

## Evidence Dimensions

LSG v2 aggregates evidence across **13 dimensions**:

### Positive Dimensions (contribute to `r`)

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

### Negative Dimensions (contribute to `s`)

| Dimension | Weight | Source |
|:----------|-------:|:-------|
| `active_probe_fail` | 1.0 | Failed HTTP probes |
| `contradiction_count` | 0.8 | Conflicting evidence |
| `tool_error` | 0.5 | Tool execution errors |
| `timeout` | 0.3 | Network timeouts |

### Why Different Weights?

Not all evidence is equally reliable:

- **OpenAPI schema** (1.0) — Authoritative specification
- **Active probe success** (1.0) — Direct observation
- **Crawl observed** (0.9) — Very reliable but might be stale
- **JS AST direct** (0.8) — Reliable but may not reflect runtime
- **Historical URL** (0.6) — May be outdated
- **Heuristic inference** (0.4) — Educated guess

## Evidence Aggregation

### Vector to Scalar

Each claim maintains an **evidence vector**:

```javascript
{
  active_probe_success: 2,
  crawl_observed: 1,
  js_ast_direct: 1,
  openapi_fragment: 0,
  // ... other dimensions
}
```

This is aggregated to scalars `(r, s)`:

```javascript
r = Σ(w_plus[dim] * evidence[dim])
s = Σ(w_minus[dim] * evidence[dim])
```

### Example Calculation

```javascript
evidence_vector = {
  active_probe_success: 2,
  crawl_observed: 1,
  js_ast_direct: 1
}

r = (1.0 * 2) + (0.9 * 1) + (0.8 * 1) = 4.7
s = 0

opinion = ebslOpinion(r, s, K=2, a=0.5)
// → { b: 0.70, d: 0.00, u: 0.30, a: 0.5 }
```

## Source Reputation

Not all tools are equally reliable. LSG v2 tracks **source reputation**.

### Reputation Tracking

Each source (tool or agent) has a reputation:

```javascript
{
  sourceId: 'nmap',
  successes: 47,
  failures: 3
}
```

### Reliability Calculation

Reputation is converted to reliability using EBSL:

```javascript
const opinion = ebslOpinion(successes, failures, K=2, a=0.5);
const reliability = expectedProbability(opinion);

// For nmap: ebslOpinion(47, 3, 2, 0.5)
// → { b: 0.90, d: 0.06, u: 0.04, a: 0.5 }
// → reliability = 0.90 + (0.5 * 0.04) = 0.92
```

### Evidence Discounting

When adding evidence from a source, it's discounted by reliability:

```javascript
addEvidence(claimId, dimension, value, sourceId) {
  const reliability = getSourceReliability(sourceId);
  const adjustedValue = value * reliability;
  claim.addEvidence(dimension, adjustedValue);
}

// Example: nmap reports a port open (value=1.0, reliability=0.92)
// → adjusted value = 1.0 * 0.92 = 0.92
```

This means:
- **Reliable sources** contribute full weight
- **Unreliable sources** are automatically discounted
- **Unknown sources** default to 1.0 (assume reliable initially)

### Updating Reputation

After validation, reputation is updated:

```javascript
// Artifact generation succeeded → source was correct
updateSourceReputation('ArchitectInferAgent', wasCorrect: true);

// Validation failed → source may have been wrong
updateSourceReputation('CrawlerAgent', wasCorrect: false);
```

## Calibration Metrics

LSG v2 computes **Expected Calibration Error (ECE)** — a measure of how well stated probabilities match actual outcomes.

### What is Calibration?

A well-calibrated system:
- When it says "70% confident", it's correct 70% of the time
- When it says "95% confident", it's correct 95% of the time

A poorly calibrated system:
- Says "95% confident" but is only correct 60% of the time (overconfident)
- Says "60% confident" but is correct 90% of the time (underconfident)

### ECE Calculation

```javascript
computeCalibration(validationResults) {
  // 1. Group claims into 10 probability bins (0-10%, 10-20%, ..., 90-100%)
  const bins = Array(10).fill({ correct: 0, total: 0, sum: 0 });

  for (const { claimId, wasCorrect } of validationResults) {
    const prob = getClaim(claimId).getExpectedProbability();
    const binIndex = Math.floor(prob * 10);

    bins[binIndex].total++;
    bins[binIndex].sum += prob;
    if (wasCorrect) bins[binIndex].correct++;
  }

  // 2. Compute error for each bin
  let ece = 0;
  for (const bin of bins) {
    if (bin.total > 0) {
      const avgProb = bin.sum / bin.total;
      const accuracy = bin.correct / bin.total;
      ece += bin.total * Math.abs(avgProb - accuracy);
    }
  }

  // 3. Normalize by total samples
  return ece / totalSamples;
}
```

### Interpreting ECE

- **ECE < 0.05**: Well calibrated
- **ECE 0.05-0.15**: Moderately calibrated
- **ECE > 0.15**: Poorly calibrated (adjust evidence weights)

### Example

```
Bin    Predicted  Actual   Count   Error
0-10%      5%       8%       10    0.03
10-20%    15%      12%       23    0.03
20-30%    25%      27%       18    0.02
...
80-90%    85%      82%       45    0.03
90-100%   95%      94%       67    0.01

ECE = 0.047 (well calibrated)
```

## Practical Examples

### Example 1: High Confidence Claim

**Claim:** "Endpoint /api/login uses JWT authentication"

**Evidence:**
- 3 active probes returned JWT tokens (3 × 1.0 = 3.0)
- 2 JavaScript files contained JWT validation (2 × 0.8 = 1.6)
- 1 OpenAPI fragment specified bearer auth (1 × 1.0 = 1.0)

```javascript
r = 3.0 + 1.6 + 1.0 = 5.6
s = 0
opinion = { b: 0.74, d: 0.00, u: 0.26, a: 0.5 }
probability = 0.87
```

**Interpretation:** **87% confident** — strong evidence, low uncertainty

### Example 2: Low Confidence Claim

**Claim:** "Endpoint /api/admin requires admin role"

**Evidence:**
- 1 URL crawl found `/api/admin` (1 × 0.9 = 0.9)
- 1 heuristic JS analysis suggested role check (1 × 0.4 = 0.4)

```javascript
r = 0.9 + 0.4 = 1.3
s = 0
opinion = { b: 0.39, d: 0.00, u: 0.61, a: 0.5 }
probability = 0.70
```

**Interpretation:** **70% confident** — weak evidence, high uncertainty

**Action:** Gather more evidence (active probes, deeper JS analysis)

### Example 3: Contradictory Evidence

**Claim:** "Parameter 'id' is required"

**Evidence:**
- 2 successful requests with `id` (2 × 1.0 = 2.0)
- 1 successful request without `id` (contradiction)

```javascript
r = 2.0
s = 1 * 0.8 = 0.8
opinion = { b: 0.42, d: 0.17, u: 0.42, a: 0.5 }
probability = 0.63
```

**Interpretation:** **63% confident** — conflicting evidence

**Action:** Investigate why requests without `id` succeeded (conditional requirement?)

## Implementation Details

### Claim Class

```javascript
class Claim {
  constructor({
    id,
    claim_type,
    subject,
    predicate,
    evidence_vector,
    base_rate
  }) {
    this.id = id;
    this.claim_type = claim_type;
    this.subject = subject;
    this.predicate = predicate;
    this.evidence_vector = evidence_vector;
    this.base_rate = base_rate;
  }

  getOpinion(config) {
    const { r, s } = aggregateEvidence(
      this.evidence_vector,
      config.w_plus,
      config.w_minus
    );
    return ebslOpinion(r, s, config.K, this.base_rate);
  }

  getExpectedProbability(config) {
    const opinion = this.getOpinion(config);
    return expectedProbability(opinion);
  }

  addEvidence(dimension, value, evidenceRef) {
    this.evidence_vector[dimension] =
      (this.evidence_vector[dimension] || 0) + value;
    this.evidence_refs.push(evidenceRef);
    this.updated_at = new Date().toISOString();
  }
}
```

### EpistemicLedger Class

```javascript
class EpistemicLedger {
  constructor(config) {
    this.config = config;
    this.claims = new Map();
    this.sourceReputations = new Map();
  }

  upsertClaim({ claim_type, subject, predicate, base_rate }) {
    const id = this.generateClaimId(claim_type, subject, predicate);
    if (this.claims.has(id)) return this.claims.get(id);

    const claim = new Claim({ id, claim_type, subject, predicate, base_rate });
    this.claims.set(id, claim);
    return claim;
  }

  addEvidence(claimId, dimension, value, sourceId, evidenceRef) {
    const claim = this.claims.get(claimId);
    if (!claim) return;

    // Apply source discounting
    let adjustedValue = value;
    if (sourceId) {
      const reliability = this.getSourceReliability(sourceId);
      adjustedValue = value * reliability;
    }

    claim.addEvidence(dimension, adjustedValue, evidenceRef);
  }

  getHighConfidenceClaims(threshold = 0.7) {
    return Array.from(this.claims.values())
      .filter(c => c.getExpectedProbability(this.config) >= threshold);
  }

  getUncertainClaims(threshold = 0.5) {
    return Array.from(this.claims.values())
      .filter(c => c.getOpinion(this.config).u >= threshold);
  }
}
```

## Benefits of Epistemic Reasoning

### 1. Transparency

You can always answer:
- "How confident are you?" → Expected probability
- "Why are you confident?" → Evidence vector
- "What's missing?" → Uncertainty value

### 2. Adaptivity

System improves over time:
- Tools gain reputation
- Evidence weights can be tuned
- Calibration metrics guide adjustments

### 3. Decision Support

Security engineers can prioritize:
- **High confidence findings** → Investigate immediately
- **Low confidence findings** → Gather more evidence
- **High uncertainty claims** → Manual validation needed

### 4. Reproducibility

Same evidence → same opinion (deterministic)

### 5. Auditability

Every claim links to source evidence, enabling full provenance tracking.

## Configuration

Evidence weights are configurable:

```javascript
const config = {
  K: 2,                    // Prior weight
  defaultBaseRate: 0.5,    // 50% prior

  w_plus: {
    active_probe_success: 1.0,
    crawl_observed: 0.9,
    js_ast_direct: 0.8,
    // ... customize weights
  },

  w_minus: {
    active_probe_fail: 1.0,
    contradiction_count: 0.8,
    // ... customize weights
  }
};
```

Adjust weights based on:
- **Tool reliability** in your environment
- **Calibration metrics** from validation
- **Domain expertise**

## Next Steps

- **[Evidence Dimensions](evidence-dimensions.md)** — All 13 dimensions explained
- **[Source Reputation](source-reputation.md)** — How tool reliability is tracked
- **[EBSL/EQBSL](ebsl-eqbsl.md)** — Mathematical foundations
