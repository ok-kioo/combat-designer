# Skill — Domain-Oriented Repository Layout

## Purpose

Organize source code so directory structure reflects stable capabilities and architectural layers instead of accumulating generic technical buckets or project-specific historical scaffolding.

## Trigger

Use when creating, moving, renaming, splitting, or consolidating source directories/packages/modules.

## Inputs

- current repository tree;
- project-defined module roots;
- capability/domain ownership;
- dependency rules;
- architecture-test bindings.

## Preconditions

- discover the actual tree before proposing paths;
- identify existing responsibility owners;
- identify public imports/contracts that a move would affect.

## Layout rules

1. Prefer stable capability/domain names over generic catch-all folders.
2. Use formal architectural layer names only where they represent real responsibility (`domain`, `application`, `ports`, `adapters`, `infrastructure`, `delivery`, etc.).
3. Core/domain directories MUST NOT depend on concrete drivers/frameworks.
4. Infrastructure implements ports owned by inner layers; it does not define domain policy.
5. Avoid empty speculative scaffolding.
6. Avoid permanent symbolic-link architecture.
7. Runtime and development-governance trees remain independent.
8. Shared code is justified only when at least two real consumers share the same semantic abstraction; "shared" must not become a dumping ground.
9. A structural move MUST update all affected imports, tests, architecture constraints, project specifications, impact contracts, and documentation atomically.
10. Do not create a second folder convention beside an existing canonical one.

## Procedure

1. Inventory current tree and imports.
2. Classify files by capability and layer.
3. Identify duplicate or misplaced responsibilities.
4. Propose a target tree using placeholders rather than technology-specific assumptions.
5. Produce a move map: `old -> new -> dependent imports -> tests/specs affected`.
6. Move in dependency-safe order, preserving public contracts where required.
7. Update architecture tests before declaring completion.
8. Verify there are no stale references to old paths.

## Decision table

| Condition | Required decision |
|---|---|
| Existing canonical owner exists | Extend/reuse it. |
| Two modules own same responsibility | Resolve ownership before adding code. |
| Folder is purely technical and cross-domain | Place under explicit adapter/infrastructure/shared abstraction only if justified. |
| Proposed folder has no immediate code | Do not create it. |
| Move changes public contract | Treat as migration, not cosmetic refactor. |

## Required evidence

- before/after tree;
- stale-reference search;
- architecture tests;
- type/build tests;
- updated project-specific specs/impact records.
