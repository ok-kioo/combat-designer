# Skill — Lesson Extraction and Promotion

## Purpose

Convert a corrected failure pattern into reusable knowledge without turning project history into a hard-coded rule or skill.

## Trigger

Use after a meaningful correction, regression, architecture review, security fix, validation failure, or repeated implementation mistake that can recur in other projects.

## Inputs

- observed failure/correction;
- evidence of impact;
- root cause;
- final validated approach.

## Procedure

1. Describe the failure pattern without project-specific names or paths.
2. Explain why the pattern matters.
3. State the reusable principle.
4. Define detection signals.
5. Define the recommended approach.
6. Define anti-patterns.
7. Define how to validate prevention/correction.
8. Decide whether the lesson should be promoted:
   - to a **Rule** if it is a permanent invariant;
   - to a **Skill** if it defines a repeatable procedure;
   - remain a **Lesson** if it is explanatory/advisory knowledge.
9. Keep project-specific examples in project mappings/walkthroughs, not in the reusable lesson core.

## Promotion decision table

| Knowledge type | Destination |
|---|---|
| "must/must not" invariant | Rule |
| repeatable ordered procedure | Skill |
| explanation of failure and prevention | Lesson |
| project-specific required behavior | Project spec |
| evidence of one implementation | Walkthrough/report |

## Required lesson fields

```text
Context
Problem Pattern
Why It Matters
General Principle
Detection
Recommended Approach
Anti-Patterns
Validation
Related Rule/Skill IDs (optional)
```
