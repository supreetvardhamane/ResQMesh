# ResQMesh Documentation

ResQMesh is disconnected-first disaster coordination infrastructure. It keeps SOS, resource discovery, trusted updates, and operational coordination useful when cellular and internet connectivity fail.

## Authority and reading order

The current product requirement and the judging criteria govern this documentation. The supplied frontend and operating-instruction documents are useful implementation references, not authority to add unrequested scope or make unmeasured claims.

1. [Problem and scope](01_PROBLEM_AND_SCOPE.md)
2. [Master specification](02_MASTER_SPEC.md)
3. [Architecture design](03_ARCHITECTURE_DESIGN.md)
4. [Data and privacy](04_DATA_AND_PRIVACY.md)
5. [API contract](05_API_CONTRACT.md)
6. [AI design](06_AI_DESIGN.md)
7. [Evaluation plan](07_EVALUATION_PLAN.md)
8. [Twelve-hour build plan](08_BUILD_PLAN_12_HOURS.md)
9. [Demo script](09_DEMO_SCRIPT.md)
10. [Judge Q and A](10_JUDGE_QA.md)
11. [Architecture decisions](11_DECISIONS.md)
12. [Reliability and operational runbooks](12_RELIABILITY_AND_RUNBOOKS.md)
13. [Contribution and integration guide](13_CONTRIBUTING_AND_INTEGRATION.md)
14. [Risk register](14_RISK_REGISTER.md)
15. [Requirements traceability](15_REQUIREMENTS_TRACEABILITY.md)
16. [Frozen build contract](16_BUILD_CONTRACT.md)

## Judging lens

Every feature, test, and demo moment must create evidence for:

- Impact and scalability
- Technical feasibility and execution
- Innovation and problem relevance
- UX and accessibility

## Scale claim discipline

"Build for billions" means the interfaces, data partitioning, event flow, caches, and federation path are designed to grow without a central bottleneck. It does not mean the hackathon prototype has been load-tested for one billion concurrent users. This distinction is explicit throughout the documents.

## Source register

- Verified product sources: supplied proposal and wireframe scans, repository README, and judging-criteria image.
- Adopted reference constraints: production-oriented React PWA; offline-first, low-bandwidth, India-first usability; accessible and responsive UI; typed contracts; no fake metrics.
- Non-authoritative reference material: agent workflow, team-branching guidance, and suggested tools. These do not replace the product requirements or this implementation plan.

## How to use this set

Use this documentation as the baseline before implementation. A contributor begins with the problem, master specification, and the task they own; they do not need to reread every document for a small change. Any feature that changes an API, event envelope, persistence model, trust policy, or user-visible network state must update the relevant document and the traceability matrix in the same change.

## Coding-agent context rule

For P0 implementation, give a coding agent only [the frozen build contract](16_BUILD_CONTRACT.md) and [the twelve-hour task plan](08_BUILD_PLAN_12_HOURS.md), followed by the source files it owns. The wider set is design, operations, judging, and human-review context; it should not be pasted wholesale into an implementation prompt.

The package intentionally separates **implemented**, **planned**, and **production-evolution** material. A diagram or endpoint written here is a contract to build, not proof that it already exists. The evaluation plan is the only place where a capability becomes verified.

## Documentation lifecycle

| When this changes | Update these files |
| --- | --- |
| User flow, feature boundary, or non-goal | `01`, `02`, `15` |
| Event fields, endpoint, or response | `03`, `04`, `05`, `11`, `15` |
| Threat, retention, or access rule | `04`, `12`, `14`, `15` |
| Model behavior or AI provider | `06`, `04`, `07`, `11` |
| Test result, measurement, or demo evidence | `07`, `09`, `10`, `15` |
| Team ownership or release workflow | `08`, `13`, `14` |
