# Walkthrough — Reusable Rules & Skills Refactor

## Goal

Make active Rule and Skill artifacts portable across repositories while preserving all project-specific implementation facts in specifications, manifests, and project-context documentation.

## What changed

### Rules

Old project-coupled rules were replaced by reusable invariant-oriented artifacts:

- artifact authority/conflict resolution;
- execution/evidence discipline;
- refactoring safety;
- runtime vs development-governance separation;
- domain/dependency boundaries;
- improvement proposal governance;
- agent tool gateway security;
- external input/platform security;
- deterministic computation/analysis.

Concrete product names, repository paths, spec numbers, framework/database/engine choices, legacy ChangeSet/Gate types, and one-off history were removed from active rules.

### Skills

Old project-coupled procedures were replaced by reusable trigger-driven skills:

- architecture boundary design;
- domain-oriented repository layout;
- sequential task breakdown;
- specification compliance validation;
- deterministic feature mechanics validation;
- external input/tool-boundary review;
- lesson extraction and promotion.

Concrete paths and commands are resolved from project bindings rather than embedded in skill bodies.

### Agent operational layer

Added reusable agent rules/skills to reduce model discretion:

- deterministic execution contract;
- mandatory skill routing;
- governed change execution;
- governed change review.

If a mandatory binding, authoritative decision, or verification artifact is unavailable, the required result is `BLOCKED` rather than agent improvisation.

## Project-specific information preservation

Concrete current-project information moved outside reusable Rule/Skill bodies to:

- `.agents/manifests/harness-manifest.json` — project bindings, read order, mandatory routing, validation commands;
- `.harness/docs/project-context/current-project-mapping.md` — current technologies, runtime roots, key paths, architectural decisions, tool direction, product-domain additions;
- `.harness/docs/project-context/2026-09-09-web-platform-and-security-decisions.md` — preserved historical project decision record previously embedded in a Rule artifact;
- `.harness/specs/` — remains project-specific and authoritative for intended project behavior.

## Stale references repaired

Project specs that referenced the former validation-skill path or the former security-rule source were updated to point to the new project mapping/decision record.

## Reuse invariant

Active reusable Rule/Skill artifacts contain no concrete project product name, repository runtime path, spec number, framework/database vendor, game-engine vendor, legacy Gate contract, or project-specific command.

## Decision reduction

The new artifact model removes discretionary choices through:

1. deterministic artifact precedence;
2. explicit conflict behavior (`BLOCKED`);
3. mandatory skill-routing table;
4. hard trigger conditions per skill;
5. explicit decision tables;
6. required evidence schemas;
7. no-choice execution lifecycle (`INSPECT -> CLASSIFY -> PLAN -> IMPLEMENT -> VERIFY -> REPORT`).
