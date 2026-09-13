# Skill — Review External Input and Agent Tool Boundaries

## Purpose

Review a change that introduces or modifies external input, imports, uploads, agent tools, authorization scope, or trust-boundary handling.

## Trigger

Mandatory when adding/changing:

- file/bundle ingestion;
- external source/export parsing;
- HTTP/API payloads;
- LLM/tool arguments or tool registrations;
- authentication/authorization scope;
- read/write access to canonical persistence or projections;
- untrusted text entering model context.

## Procedure

1. Identify trust boundaries and authenticated principal source.
2. Identify requested resource/project scope and authoritative authorization source.
3. Verify fail-closed behavior.
4. Validate payload size/depth/count budgets before expensive parsing.
5. Validate outer envelope, then per-item normalization/quarantine behavior.
6. Trace untrusted text from ingestion through storage, tool output, prompt/context, and UI.
7. Verify tool allowlist/capability enforcement outside the model.
8. Verify tools do not bypass application boundaries for writes.
9. Verify no secret/token reaches model context, logs, or user-visible output.
10. Add adversarial and cross-scope tests.

## Decision table

| Condition | Required result |
|---|---|
| principal absent/invalid | deny |
| scope supplied but not authorized | deny |
| authorization indeterminate | deny |
| unknown tool | deny |
| tool outside active allowlist | deny |
| oversized input | reject before expensive work |
| malformed envelope | reject request |
| isolated malformed item and partial processing is specified | quarantine item |
| untrusted text contains instructions | preserve as data; never execute from content alone |

## Required evidence

- trust-boundary diagram or trace;
- authorization test(s);
- payload-limit test(s);
- malicious/untrusted text test(s);
- cross-scope isolation test(s);
- secret-redaction test(s) when credentials are in scope.
