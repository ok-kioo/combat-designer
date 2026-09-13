# Agent Rule — Mandatory Skill Routing

**Agent Rule ID:** AGENT-ROUTE-001  
**Severity:** MUST

When any trigger below is true, execute the mapped skill. Multiple rows may apply; execute all applicable skills.

| Trigger | Mandatory skill |
|---|---|
| any public contract/spec/architecture change | Specification Compliance Validation |
| refactor/restructure/rename/consolidation | Domain-Oriented Repository Layout + Specification Compliance Validation |
| module/dependency boundary change | Architecture Boundary Design + Specification Compliance Validation |
| deterministic/mechanical logic change | Validate Deterministic Feature Mechanics + Specification Compliance Validation |
| external input/upload/import/tool/auth change | Review External Input and Agent Tool Boundaries + Specification Compliance Validation |
| change spans multiple boundaries | Sequential Task Breakdown |
| repeated/corrected failure pattern | Lesson Extraction and Promotion |

## Routing rule

The agent may add additional skills but may not omit a mandatory one. If the required skill or project binding is unavailable, return `BLOCKED`.
