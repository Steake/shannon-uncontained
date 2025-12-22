## EQBSL Primer for Devs / Agents (v1.0)

### Metadata

* id: `EQBSL_PRIMER_V1`
* author: `Oliver C. Hirst`
* scope: evidence-based trust state + operator semantics + hypergraph support + embedding interface
* upstream credits:

  * Subjective Logic: Audun Jøsang
  * Evidence-Based Subjective Logic / evidence-flow emphasis: Boris Škorić et al.

---

## 0. One-sentence definition

**EQBSL = EBSL lifted into (1) vector/tensor evidence, (2) explicit operator-defined state evolution over time, (3) hypergraph-native interactions, (4) embedding-first outputs, with optional proof-carrying updates.**

---

## 1. Core objects

### 1.1 Entities

* Node / Agent: `i ∈ V`
* Directed edge: `(i → j)`
* Hyperedge: `h ⊆ V`, `|h| ≥ 2`, may have roles

### 1.2 Evidence tensors

EQBSL stores **typed evidence** as vectors (or higher tensors):

* Pairwise evidence tensor: `e_ij(t) ∈ ℝ^m`
* Hyperedge evidence tensor: `e_h(t) ∈ ℝ^m`

Constraints (recommended):

* Evidence channels are **nonnegative** by construction (counts/masses), or
* Evidence channels can be signed, but you MUST define how they map into positive/negative evidence.

### 1.3 Opinion (binomial Subjective Logic)

Opinion about `j` as viewed by `i`:

* `ω_ij(t) = (b_ij, d_ij, u_ij, a_ij)`
* Constraint: `b + d + u = 1`

### 1.4 Scalar evidence interface (EBSL-compatible)

To obtain the classical EBSL scalars `(r,s)` from vector evidence:

* `r_ij(t) = φ_+(e_ij(t)) ≥ 0`
* `s_ij(t) = φ_-(e_ij(t)) ≥ 0`

Recommended baseline (linear projections):

* `r_ij = <w^+, e_ij>`
* `s_ij = <w^-, e_ij>`
  with `w^+, w^- ∈ ℝ^m_{≥0}`

### 1.5 Evidence→opinion mapping (EBSL mapping)

Given constant `K>0` (prior weight / pseudocount mass):

* `b = r / (r+s+K)`
* `d = s / (r+s+K)`
* `u = K / (r+s+K)`
* `a` is a domain prior (often fixed)

This is the main “ledger integrity” move: uncertainty cannot be hand-waved; it falls only when evidence rises.

---

## 2. State model

Define the EQBSL state at time `t`:

* Graph snapshot: `G_t = (V, E_t)` (or hypergraph `H_t`)
* Pairwise evidence field: `E_t := { e_ij(t) }`
* Hyperedge evidence field: `H_t^E := { e_h(t) }`
* Parameters: `θ := {K, w^+, w^-, decay, attribution, damping, embedding params,...}`

Optional caches:

* Opinions cache: `Ω_t := { ω_ij(t) }` (derivable)
* Embeddings: `U_t := { u_i(t) }`

---

## 3. Operator semantics (the point of EQBSL)

EQBSL is defined by a **state update operator**:

* `F_θ : (E_t, H_t^E, events_t) → (E_{t+1}, H_{t+1}^E)`

And an **embedding operator**:

* `Γ_ψ : (i, E_t, G_t, Ω_t) → u_i(t) ∈ ℝ^d`

A practical instantiation is a pipeline of sub-operators:

1. **Ingest** events → evidence deltas
2. **Decay** prior evidence (time)
3. **Hyperedge attribution** (optional)
4. **Propagation / transitive aggregation** (optional depth/iterations)
5. **Opinion lift** (derive `ω`)
6. **Embed** (derive `u`)

---

## 4. Event model (inputs)

### 4.1 Pairwise events

Each event is mapped into an evidence delta vector:

* `Δe_ij ∈ ℝ^m_{≥0}`

Minimal event schema:

* `event_id`
* `t_event`
* `src = i`, `dst = j`
* `channel_mass: [(k, mass_k)]` OR raw features that deterministically map to this

### 4.2 Hyperedge events

* `Δe_h ∈ ℝ^m_{≥0}`, where `h` is a set of participants + roles

---

## 5. Temporal decay (required in any real system)

Define a decay operator per edge/hyperedge:

* Exponential: `e ← β^Δt ⊙ e`, with `β ∈ (0,1]^m`
* Or half-life per channel: `β_k = 2^{-(Δt / half_life_k)}`

Normative constraints:

* Decay MUST be deterministic (same inputs → same outputs).
* Decay MUST be channel-wise definable (so you can make “late payment” decay slower than “missed ping”).

---

## 6. Hyperedge attribution (how group events affect pairwise trust)

Hyperedge evidence may remain first-class, but most systems need a **projection** into pairwise evidence for transitive reasoning.

Generic attribution rule:

* For each hyperedge `h` and each ordered pair `(i,j)` with `i≠j` and `i,j ∈ h`:

  * `e_ij += α_ijh * Π_ij(e_h)`

Where:

* `Π_ij` is a deterministic projection (often identity)
* `α_ijh` are coefficients (symmetric, role-weighted, stake-weighted, etc.)

Normative constraints:

* `α_ijh ≥ 0`
* total allocated mass SHOULD be bounded to prevent hyperedge events from exploding pairwise evidence:

  * e.g. `Σ_{i≠j, i,j∈h} α_ijh ≤ 1` (or another declared bound)

---

## 7. Propagation (transitivity) — a reference instantiation

EQBSL doesn’t force one propagation law; it forces you to **declare it**.

### 7.1 Discount factor from opinions

Define the trust-weight discount from `i` to witness `k`:

* `δ_ik := E(ω_ik) = b_ik + a_ik * u_ik`
  This yields `δ_ik ∈ [0,1]`.

### 7.2 One-step indirect evidence aggregation (depth-1)

Given direct evidence `(r_ij, s_ij)` and witness evidence `(r_kj, s_kj)`:

* `r_ij^indirect = Σ_{k∈N(i)} λ * δ_ik * r_kj`
* `s_ij^indirect = Σ_{k∈N(i)} λ * δ_ik * s_kj`

Where:

* `N(i)` is a selected witness set (neighbors, top-K, same context, etc.)
* `λ ∈ (0,1]` is a damping constant to prevent runaway transitivity

Then:

* `r_ij^total = r_ij^direct + r_ij^indirect`
* `s_ij^total = s_ij^direct + s_ij^indirect`

### 7.3 Multi-hop propagation (depth>1)

Either:

* iterate depth-1 multiple times with a stopping rule, or
* cap path length explicitly, or
* solve a fixed point with damping

Normative constraints:

* MUST be stable (bounded evidence) under reasonable parameterization.
* SHOULD be monotone in evidence (adding evidence doesn’t decrease totals unless decay applies).

---

## 8. Embeddings (the ML interface)

EQBSL’s ML output is typically `u_i(t) ∈ ℝ^d` derived from evidence/opinion statistics.

### 8.1 Deterministic feature vector (recommended baseline)

Define a feature extractor `f_i(t)` such as:

* inbound evidence totals: `Σ_j r_ji`, `Σ_j s_ji`
* outbound evidence totals: `Σ_j r_ij`, `Σ_j s_ij`
* mean inbound uncertainty: `mean_j u_ji`
* mean outbound uncertainty: `mean_j u_ij`
* concentration measures: entropy of inbound opinions; variance of expectations
* structural: degrees (in/out), hyperedge participation counts
* context slicing: same features per context bucket (optional)

Then define:

* `u_i(t) = W * f_i(t)` (linear)
  or
* `u_i(t) = MLP(f_i(t))` (learned)

Normative constraints:

* Embeddings MUST be reproducible from committed state (if you want proof-carrying updates).
* Embeddings SHOULD preserve uncertainty signals (avoid collapsing epistemic humility into fake confidence).

---

## 9. Invariants and sanity checks (non-negotiable)

For every `(i,j,t)`:

1. `r_ij ≥ 0`, `s_ij ≥ 0`
2. `b,d,u ∈ [0,1]`
3. `b + d + u = 1` (within numeric tolerance)
4. `u` decreases as `(r+s)` increases (holding `K` constant)
5. Decay does not increase evidence (`β ≤ 1`)
6. Propagation is bounded (use `λ`, witness caps, or normalization)

---

## 10. ZK / verifiable computation hooks (optional, but cleanly defined)

### 10.1 Proof-carrying update statement (canonical)

Prover publishes:

* commitments to prior state: `Com(E_t)`, `Com(H_t^E)`
* commitments to events: `Com(events_t)`
* public parameters: `θ_public` (or commitment to `θ_private`)
* outputs: `E_{t+1}` (maybe committed), `U_{t+1}` (maybe public or committed)
* proof: `π`

Verifier checks:

* `Verify(π, Com(E_t), Com(events_t), θ, outputs) = true`

What is proven:

* “The declared operator `F_θ` (and optionally `Γ`) was applied correctly.”

What is not proven:

* that events correspond to reality, are sybil-resistant, or incentive-compatible.

---

## 11. JSON schema (canonical, minimal)

```json
{
  "params": {
    "K": 2.0,
    "w_pos": [/* m floats >=0 */],
    "w_neg": [/* m floats >=0 */],
    "decay_beta": [/* m floats in (0,1] */],
    "lambda": 0.5,
    "witness_top_k": 32
  },
  "state": {
    "t": 1234567890,
    "edges": [
      {"src":"A","dst":"B","e":[/* m floats >=0 */]}
    ],
    "hyperedges": [
      {"id":"h1","nodes":["A","B","C"],"roles":{"A":"payer","B":"payee","C":"arbiter"},"e":[/* m */]}
    ]
  },
  "events": [
    {"id":"ev1","t":1234567891,"type":"pair","src":"A","dst":"B","de":[/* m */]},
    {"id":"ev2","t":1234567891,"type":"hyper","hid":"h1","de":[/* m */]}
  ]
}
```

---

## 12. Reference implementation (complete, minimal, deterministic)

This is a **minimal working EQBSL core**: ingest → decay → hyperedge attribution → opinion lift → embeddings. Propagation is included as depth-1 optional.

```python
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional, Iterable
import math

NodeId = str
EdgeKey = Tuple[NodeId, NodeId]
HyperId = str


def dot(a: List[float], b: List[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def vec_add_inplace(a: List[float], b: List[float]) -> None:
    for i in range(len(a)):
        a[i] += b[i]


def vec_mul_inplace(a: List[float], b: List[float]) -> None:
    for i in range(len(a)):
        a[i] *= b[i]


@dataclass(frozen=True)
class Opinion:
    b: float
    d: float
    u: float
    a: float

    def expectation(self) -> float:
        # E(ω) = b + a*u  (standard Subjective Logic expectation)
        return self.b + self.a * self.u


@dataclass
class Params:
    K: float
    w_pos: List[float]          # length m, nonnegative
    w_neg: List[float]          # length m, nonnegative
    decay_beta: List[float]     # length m, each in (0,1]
    damping_lambda: float = 0.5
    witness_top_k: int = 32

    def validate(self) -> None:
        if self.K <= 0:
            raise ValueError("K must be > 0")
        m = len(self.w_pos)
        if m == 0 or len(self.w_neg) != m or len(self.decay_beta) != m:
            raise ValueError("w_pos, w_neg, decay_beta must have same nonzero length")
        if any(x < 0 for x in self.w_pos) or any(x < 0 for x in self.w_neg):
            raise ValueError("w_pos and w_neg must be nonnegative")
        if any((x <= 0 or x > 1) for x in self.decay_beta):
            raise ValueError("decay_beta must be in (0,1]")
        if not (0 < self.damping_lambda <= 1):
            raise ValueError("damping_lambda must be in (0,1]")


@dataclass
class Hyperedge:
    hid: HyperId
    nodes: List[NodeId]
    roles: Dict[NodeId, str] = field(default_factory=dict)
    e: List[float] = field(default_factory=list)


@dataclass
class State:
    t: int
    # pairwise evidence tensors
    edges: Dict[EdgeKey, List[float]] = field(default_factory=dict)
    # hyperedge evidence tensors
    hypers: Dict[HyperId, Hyperedge] = field(default_factory=dict)


@dataclass(frozen=True)
class PairEvent:
    eid: str
    t: int
    src: NodeId
    dst: NodeId
    de: List[float]


@dataclass(frozen=True)
class HyperEvent:
    eid: str
    t: int
    hid: HyperId
    de: List[float]


def lift_opinion_from_evidence(r: float, s: float, K: float, a: float = 0.5) -> Opinion:
    denom = r + s + K
    b = r / denom
    d = s / denom
    u = K / denom
    # numeric safety
    b = min(max(b, 0.0), 1.0)
    d = min(max(d, 0.0), 1.0)
    u = min(max(u, 0.0), 1.0)
    # enforce sum close to 1 by renormalizing (deterministic)
    total = b + d + u
    b, d, u = b / total, d / total, u / total
    return Opinion(b=b, d=d, u=u, a=a)


def rs_from_vec(e: List[float], w_pos: List[float], w_neg: List[float]) -> Tuple[float, float]:
    r = dot(w_pos, e)
    s = dot(w_neg, e)
    # enforce nonnegativity
    return max(r, 0.0), max(s, 0.0)


def decay_state(state: State, params: Params, dt_steps: int = 1) -> None:
    """
    Applies per-channel exponential decay dt_steps times:
      e <- (decay_beta ** dt_steps) ⊙ e
    Deterministic for integer dt_steps.
    """
    params.validate()
    if dt_steps <= 0:
        return

    # precompute beta^dt for determinism
    beta_dt = [x ** dt_steps for x in params.decay_beta]

    for e in state.edges.values():
        vec_mul_inplace(e, beta_dt)

    for h in state.hypers.values():
        vec_mul_inplace(h.e, beta_dt)


def ingest_events(state: State, pair_events: Iterable[PairEvent], hyper_events: Iterable[HyperEvent]) -> None:
    for ev in pair_events:
        key = (ev.src, ev.dst)
        if key not in state.edges:
            state.edges[key] = [0.0] * len(ev.de)
        vec_add_inplace(state.edges[key], ev.de)

    for ev in hyper_events:
        if ev.hid not in state.hypers:
            raise KeyError(f"Unknown hyperedge id: {ev.hid}")
        vec_add_inplace(state.hypers[ev.hid].e, ev.de)


def default_alpha(i: NodeId, j: NodeId, h: Hyperedge) -> float:
    """
    Simple symmetric allocation: spread equally across ordered pairs in h.
    This is a baseline. Replace with role/stake logic as needed.
    """
    n = len(h.nodes)
    if n < 2 or i == j:
        return 0.0
    # number of ordered pairs: n*(n-1)
    return 1.0 / (n * (n - 1))


def attribute_hyperedges_to_pairs(state: State) -> None:
    """
    Baseline: allocate hyperedge evidence equally to all ordered pairs (i->j), i!=j, within h.
    """
    for h in state.hypers.values():
        for i in h.nodes:
            for j in h.nodes:
                if i == j:
                    continue
                a = default_alpha(i, j, h)
                if a <= 0:
                    continue
                key = (i, j)
                if key not in state.edges:
                    state.edges[key] = [0.0] * len(h.e)
                # add a * h.e
                scaled = [a * x for x in h.e]
                vec_add_inplace(state.edges[key], scaled)


def compute_opinions(state: State, params: Params, base_rate: float = 0.5) -> Dict[EdgeKey, Opinion]:
    params.validate()
    out: Dict[EdgeKey, Opinion] = {}
    for (i, j), e in state.edges.items():
        r, s = rs_from_vec(e, params.w_pos, params.w_neg)
        out[(i, j)] = lift_opinion_from_evidence(r, s, params.K, a=base_rate)
    return out


def depth1_propagation_rs(
    nodes: List[NodeId],
    opinions: Dict[EdgeKey, Opinion],
    direct_rs: Dict[EdgeKey, Tuple[float, float]],
    params: Params
) -> Dict[EdgeKey, Tuple[float, float]]:
    """
    Reference depth-1 transitive aggregation in (r,s) space:
      r_ij_total = r_ij_direct + Σ_k λ * δ_ik * r_kj
      s_ij_total = s_ij_direct + Σ_k λ * δ_ik * s_kj
    Witness set is all k with defined ω_ik and (r_kj,s_kj). For scalability, cap top_k by δ_ik.
    """
    params.validate()
    result: Dict[EdgeKey, Tuple[float, float]] = {}

    # precompute witness lists per i by δ_ik (descending)
    witness_by_i: Dict[NodeId, List[Tuple[float, NodeId]]] = {}
    for i in nodes:
        lst: List[Tuple[float, NodeId]] = []
        for k in nodes:
            if i == k:
                continue
            ok = opinions.get((i, k))
            if ok is None:
                continue
            lst.append((ok.expectation(), k))
        lst.sort(reverse=True, key=lambda x: x[0])
        witness_by_i[i] = lst[: params.witness_top_k]

    for i in nodes:
        for j in nodes:
            if i == j:
                continue
            r0, s0 = direct_rs.get((i, j), (0.0, 0.0))
            rind = 0.0
            sind = 0.0
            for delta_ik, k in witness_by_i[i]:
                rk, sk = direct_rs.get((k, j), (0.0, 0.0))
                if rk == 0.0 and sk == 0.0:
                    continue
                w = params.damping_lambda * delta_ik
                rind += w * rk
                sind += w * sk
            result[(i, j)] = (r0 + rind, s0 + sind)
    return result


def embed_nodes_basic(
    nodes: List[NodeId],
    opinions: Dict[EdgeKey, Opinion]
) -> Dict[NodeId, List[float]]:
    """
    Deterministic baseline embedding:
      [in_expect_mean, in_u_mean, out_expect_mean, out_u_mean, in_count, out_count]
    """
    out: Dict[NodeId, List[float]] = {}
    for i in nodes:
        in_exps, in_us = [], []
        out_exps, out_us = [], []
        in_count = out_count = 0

        for (src, dst), w in opinions.items():
            if dst == i:
                in_count += 1
                in_exps.append(w.expectation())
                in_us.append(w.u)
            if src == i:
                out_count += 1
                out_exps.append(w.expectation())
                out_us.append(w.u)

        def mean(x: List[float]) -> float:
            return sum(x) / len(x) if x else 0.0

        out[i] = [
            mean(in_exps), mean(in_us),
            mean(out_exps), mean(out_us),
            float(in_count), float(out_count),
        ]
    return out
```

---

## 13. Operational contract for an IDE/agent planner

An AI agent implementing EQBSL MUST produce:

1. `Params.validate()` / parameter sanity
2. Deterministic `F_θ` pipeline order (ingest/decay/attribute/propagate/lift/embed)
3. A serialization format for:

   * state (`E_t`, hyperedges)
   * events
   * outputs (`Ω_t`, `U_t`)
4. Unit tests for invariants (Section 9)
5. Benchmark hooks:

   * time per update step
   * memory footprint
   * stability under repeated propagation/decay

---

## 14. “Full explanation” in one block (for agents that need the gist)

EQBSL treats “trust” as a **ledgered state**: typed evidence vectors live on edges and hyperedges; a declared operator updates them over time with decay, attribution, and (optionally) transitive aggregation; opinions are derived from evidence via the EBSL mapping; embeddings are derived from opinion/evidence statistics as the primary ML interface; optional ZK proofs bind outputs to the declared operator and committed inputs.

