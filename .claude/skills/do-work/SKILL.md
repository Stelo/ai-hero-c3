---
name: do-work
description: Full end-to-end workflow: write a PRD, convert it to a phased plan, implement each phase with feedback loops, then commit. Use when the user wants to plan and build a new feature, says "do the work", or wants to go from idea to committed code.
---

# Do Work

Full workflow from idea to committed code: PRD → plan → implementation → commit.

## Workflow

### 1. Write a PRD (optional)

Read any referenced PRD if provided, otherwise invoke the `write-a-prd` skill to produce a requirements document in `./plans/`.

### 2. Create a plan (optional)

Read any referenced Plan if provided, otherwise invoke the `prd-to-plan` skill to break the PRD into phased vertical slices and store in `./plans/`.

### 3. Implement phase by phase, validating as you go

For each phase in the plan:

1. Announce which phase you are starting
2. Implement the vertical slice end-to-end
3. Run feedback loops after each phase:
   - `pnpm run type-check` — fix all type errors before continuing
   - `pnpm run test` — fix all test failures before continuing
   - Address any other relevant checks (lint, build) if they exist
4. Confirm acceptance criteria are met and automated tests have been created to validate this
5. Ask the user: **"Phase N complete. Anything to change before I move on?"** — incorporate feedback, then proceed

> Do not start the next phase until the current phase passes all checks and the user has approved.

### 4. Prepare and confirm commit

1. After all phases are complete, run the full suite one more time:
   - `pnpm run typecheck` — fix all type errors before continuing
   - `pnpm run test` — fix all test failures before continuing
   - Address any other relevant checks (lint, build) if they exist
2. Stage relevant files and draft a commit message that summarises *what* changed and *why* in one or two concise sentences
3. Present the staged diff and message to the user:
   > "Here is the proposed commit:
   >
   > **Message**: `<your message>`
   >
   > **Files**: `<list of staged files>`
   >
   > Shall I commit?"
4. Only run `git commit` after the user explicitly confirms.
