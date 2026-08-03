<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:maintenance-rules -->
# Maintainability First

When fixing bugs or implementing new requirements, do not default to only adding more code on top of the existing system.

## Required workflow

1. Read the relevant existing code paths first and understand how the current feature works.
2. Reuse existing modules, utilities, components, data models, and patterns wherever practical.
3. Before adding new code, check whether the change should instead be handled by:
   - simplifying existing logic
   - extracting duplicated logic
   - removing dead code
   - renaming unclear abstractions
   - splitting oversized files or functions
4. Prefer small, local refactors that improve clarity and maintainability while delivering the requested change.
5. Keep the final implementation simpler than or equal to the current complexity level. Do not increase incidental complexity without a clear reason.

## Refactoring expectations

- If the relevant existing code is messy, duplicated, tightly coupled, or hard to extend, do not ignore that.
- Perform necessary, scoped refactoring before or during the change, as long as it directly supports the requested work.
- Do not preserve poor structure just to minimize diff size.
- Do not perform unrelated large-scale refactors that are not needed for the current task.

## Code quality rules

- Avoid creating parallel implementations when an existing path can be improved.
- Avoid one-off special cases when the logic can be generalized cleanly.
- Prefer explicit, readable code over clever but hard-to-maintain code.
- Keep files, functions, and components focused on one clear responsibility.
- Reduce duplication whenever it appears in the touched area.
- Keep interfaces and naming consistent with the surrounding codebase.

## Anti-bloat rule

Do not solve a task by layering new code onto old code without evaluating whether the old code should be refactored, merged, or removed first.

If a new feature or bugfix introduces duplication, parallel logic, or avoidable complexity, refactor the existing implementation so the final structure remains coherent.

## Before finishing

Before completing any bugfix or feature work, verify:
- whether some newly added code could replace or absorb old code instead
- whether any touched code can be simplified further
- whether the change leaves the area easier to understand than before

The goal is not just to make the feature work, but to leave the relevant part of the codebase easier to maintain, inspect, and extend.
<!-- END:maintenance-rules -->
