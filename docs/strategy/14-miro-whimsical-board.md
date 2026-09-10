# Board Miro et Whimsical

Ce board peut être recréé avec des frames reliées. Les éléments entre crochets sont des composants ; les flèches décrivent des transitions.

## Frame 1 — North star

```text
[Website / explanation]
          ↓
[Company understanding]
          ↓
[Multiple opportunities]
          ↓
[Chosen capability]
          ↓
[Context + policy]
          ↓
[Evidence-based evaluation]
          ↓
[Supervised operation]
          ↓
[Measured improvement]
          └──────────────→ better next capability
```

## Frame 2 — Product layers

```text
[Discover]  → recommendations · marketplace · free-form request
[Compose]   → mission · knowledge · instructions · tools · policy
[Prove]     → test cases · sources · evaluators · feedback
[Operate]   → decisions · runs · approvals · artifacts · cost
[Extend]    → packages · connectors · protocols · experts
```

## Frame 3 — Example mission

```text
Goal: prepare a customer response
  ├─ Read request
  ├─ Extract requirements
  ├─ Find approved company facts
  ├─ Detect missing information
  ├─ Draft response
  ├─ Verify claims and prices
  └─ Ask for approval before sending
```

## Frame 4 — Shared context graph

```text
[Company profile] ─┬─ [Offer catalog]
                  ├─ [Customer objects]
                  ├─ [Approved instructions]
                  ├─ [Knowledge sources]
                  └─ [Policies]
                           ↓
                 [Mission-specific harness]
                           ↓
                [Protocol and agent graph]
```

## Frame 5 — Trust boundary

```text
User request → product API → policy check → mission runtime
                                      ↓
                                tool broker
                           ↙       ↓       ↘
                       read       draft     external write
                    allowed      allowed    approval required
```

## Frame 6 — Feedback loop

```text
[Result]
   ↓
[Human correction]
   ↓
[Choose scope: result / customer / general rule]
   ↓
[Memory or policy proposal]
   ↓
[Regression tests]
   ↓
[New version]
```

## Frame 7 — Capability maturity

```text
PLANNED → COMPOSABLE → READY TO TEST → SUPERVISED → AUTONOMY SCOPED
```

Each transition has acceptance criteria. The label `autonomous` never means unlimited authority.

## Frame 8 — Ecosystem

```text
[Company]
   ↕ uses
[Capabilities] ← built from → [Protocols]
   ↕ connect                     ↕ verify
[Connectors]                 [Evaluators]
   ↕ run                       ↕ publish evidence
[Runtime] ───────────────→ [Reputation / package registry]
```

## Workshop sequence

1. Place the north-star frame.
2. Choose three target capabilities from the marketplace frame.
3. Walk one capability through the example mission.
4. Mark every human decision and external effect.
5. Define the minimum evidence for `READY TO TEST`.
6. Identify what context the second capability can reuse.
7. Convert unresolved assumptions into backlog items.
