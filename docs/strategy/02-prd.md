# Product requirements

## Users

The primary user is a non-technical operator who knows the business and wants useful work delegated quickly. Secondary users configure procedures, review results, administer access and build advanced capabilities.

## Alpha scope

The first product supports a broad marketplace surface with four deeply testable capabilities:

- targeted research and monitoring;
- meeting preparation;
- sourced content drafting;
- customer-request analysis.

It supports website or free-text onboarding, recommendations, capability discovery, manual file upload, one document connection, mission configuration, test runs, feedback, supervised activation and cost visibility.

Quotes, CRM actions, tender responses, publishing and outbound communication are later extensions with explicit approvals.

## Requirements

| ID | Requirement | Acceptance signal |
|---|---|---|
| P01 | Build a company profile from site or explanation | Facts, hypotheses and missing data are separately visible |
| P02 | Recommend multiple useful capabilities | Each card shows outcome, prerequisites, maturity and first test |
| P03 | Browse a marketplace | Search by outcome, role, tool, industry and maturity |
| P04 | Resolve a free-form request | Existing package, bounded composition or honest unsupported result |
| P05 | Configure knowledge and instructions | User selects sources, scope, policy, tools, triggers and approvals |
| P06 | Test without side effects | External writes are blocked in the tool broker in test mode |
| P07 | Evaluate with evidence | Report includes sources, checks, unknowns and human feedback |
| P08 | Activate a tested version | Server verifies package, policy, access, budget and approvals |
| P09 | Run durably | Retry and resume without duplicate internal work; ambiguous external effects reconcile |
| P10 | Learn from correction | User chooses one result, one customer, or general rule scope |
| P11 | Support BYOK and managed models | Credentials stay server-side; model is selected through an internal contract |
| P12 | Expose cost | Provider cost, platform fee, reservations and human review stay distinguishable |
| P13 | Preserve tenant isolation | All reads and writes are authorized server-side with tenant boundary tests |
| P14 | Export configuration and artifacts | User can leave with documented configuration and deliverables |

## Success metrics

Track time to first useful result, activation rate, repeat usage, correction rate, accepted-result cost, support minutes per account, second-capability activation, external-side-effect incidents and percentage of runs requiring human escalation.

Do not report only model quality scores. A cheaper model that creates more human work is not cheaper.

## Explicit non-goals for the first release

An open third-party marketplace, autonomous account creation, autonomous spending, universal app support, fully generated business software, unsupervised public publishing and a custom identity protocol. Design extension points now; implement after validated demand.
