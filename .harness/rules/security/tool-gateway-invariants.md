# Rule — Agent Tool Gateway Invariants

**Rule ID:** SEC-TOOL-001  
**Severity:** MUST  
**Applies when:** an LLM/agent invokes tools, resources, commands, or queries through a gateway/server boundary

## Authorization invariants

1. Every protected call MUST have an authenticated principal.
2. Every project/resource-scoped call MUST carry explicit requested scope.
3. Client-supplied scope identifies intent; it is NEVER proof of authorization.
4. Authorization MUST be resolved from trusted identity plus authoritative ownership/permission data.
5. Unknown tools/actions MUST be denied.
6. Missing capabilities/permissions MUST be denied.
7. Authorization timeout, failure, or ambiguity MUST fail closed.

## Execution invariants

8. Tool handlers MUST NOT bypass the application layer to write canonical persistence when an application boundary exists.
9. Tool handlers MUST NOT directly mutate derived projections when projection ownership belongs elsewhere.
10. Tool calls MUST NOT alter deterministic results produced by authoritative computation.
11. The gateway MUST NOT decide domain truth; it enforces access/policy and routes typed requests.
12. The model MUST NOT fabricate or modify authoritative tool results.
13. Untrusted imported text MUST remain data, never executable instruction, permission, or authorization evidence.
14. Tool use MUST be restricted by an explicit allowlist/capability policy outside the model prompt.

## Result integrity

- `STALE`: result refers to an obsolete revision/context and must not be presented as current fact.
- `BUDGET_EXCEEDED`: computation is incomplete; it must not be interpreted as proof of absence.
- `ERROR`: execution failed; it must not be converted into a successful domain conclusion.
- `INCONCLUSIVE`: evidence is insufficient; it must remain explicitly inconclusive.

## Mutation policy

If the product is defined as consultative/analytical, the gateway MUST expose no tool that can directly apply recommendations to the external source system. A proposal or recommendation is data, not executable authority.

## Enforcement

Every invariant MUST have an automated test or a project-bound executable check. Prompt instructions alone are never sufficient enforcement.
