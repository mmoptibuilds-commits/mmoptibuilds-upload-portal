# SDD ledger — plan: docs/superpowers/plans/2026-09-21-portal-ui-storage.md

## Workspace

- Repository worktree: `/workspace/scratch/de06732e200d/portal-clean`
- Branch: `backend-reliability-stalls`
- Plan committed at: `126ba99`
- Spec committed at: `cc020b4`
- Isolation check: this checkout is a linked worktree; `main` is a separate worktree.

## Preflight scan

The plan was scanned before implementation. Rows below cover every task's internal consistency and every shared file/interface boundary that has a downstream dependency.

### Task self-consistency

| Task | Own inputs/outputs | Result |
|---|---|---|
| 0.1 | Baseline commands produce evidence for later release claims | Consistent; failures must be recorded, not hidden |
| 0.2 | Official API/source verification produces implementation decisions | Consistent; must precede storage/background implementation |
| 1.1 | Env/client contract produces server-only storage configuration | Consistent; health/tests consume the readiness shape |
| 1.2 | Schema/migration produces nullable storage path and legacy compatibility | Consistent; later API tasks consume nullable fields |
| 1.3 | Path/verification helpers consume env and produce bounded storage operations | Consistent; API tasks consume derived paths and verification |
| 2.1 | Batch route creates storage-neutral metadata | Consistent; no provider object is needed before file initialization |
| 2.2 | Init route consumes schema/path helper and returns signed authorization | Consistent; browser worker consumes the response |
| 2.3 | Complete route consumes derived object verification and updates notification state | Consistent; browser worker sends only the supported completion signal |
| 2.4 | Browser worker consumes init/complete contracts and emits progress/retry states | Consistent; protocol choice is gated by Task 0.2 |
| 3.1 | Tailwind/shadcn foundation provides tokens/primitives for all route tasks | Consistent; route tasks must not reintroduce competing resets |
| 3.2 | Local sourced backgrounds consume the foundation/motion package | Consistent; route tasks consume accessible effect variants |
| 4.1 | Login/shell consumes foundation/backgrounds and preserves auth behavior | Consistent |
| 4.2 | Upload/history consumes the new API worker and visual primitives | Consistent; no provider links are rendered |
| 4.3 | Admin routes consume schema/readiness data and visual primitives | Consistent; no provider links are rendered |
| 4.4 | Root metadata/redirect consistency consumes the shared shell/foundation | Consistent |
| 5.1 | Focused tests assert storage/API/config invariants | Consistent; network-independent by default |
| 5.2 | Setup docs consume the final env/migration/deployment contract | Consistent; must follow implementation |
| 5.3 | Full verification consumes all implementation and documentation outputs | Consistent |
| 6.1 | GitHub PR consumes verified commits and evidence | Consistent; external publish is after local verification |
| 6.2 | Vercel/Supabase production setup consumes merged code, migration, and env contract | Consistent; external production side effects are last |

### Shared files and interfaces

| Tasks | Shared boundary | Finding / ruling |
|---|---|---|
| 0.2 → 1.1, 1.3, 2.2, 2.4, 3.2 | Official Supabase and sourced-component APIs | The exact response/method shapes are unknown until authoritative verification. **Ruling:** Task 0.2 is a gate; no remembered API shape may be implemented. Cost if wrong: storage/client rework. |
| 1.1 ↔ 1.3 | `src/lib/env.ts` and server storage client | 1.3 depends on the names/validation from 1.1. **Ruling:** implement env contract first; storage helpers may only import the server-only client. |
| 1.1 ↔ 4.3 | `getOptionalConfig()` and diagnostics/health | Diagnostics must consume the final storage readiness key. **Ruling:** use `storageConfiguration`, never a Drive-shaped key. |
| 1.1 ↔ 5.2 | `.env.example` and setup guide | Docs must match validated env names. **Ruling:** update `.env.example` and setup docs together in the documentation phase, while code validation lands first. |
| 1.2 ↔ 1.3 | `storage_path` schema and derived object path | Helper output must fit the nullable schema field. **Ruling:** storage path is application-owned and persisted; no signed token is persisted. |
| 1.2 ↔ 2.1, 2.2, 2.3 | `upload_batches`/`upload_files` writes | API code must explicitly handle nullable legacy Drive columns and write them null for new rows. **Ruling:** preserve legacy columns for rollback; do not drop them in this release. |
| 1.3 ↔ 2.2, 2.3 | Derived path, signed authorization, server verification | Init and complete must use the same derivation function; complete must not trust a client path. **Ruling:** server derives from the row's immutable metadata and authenticated owner. |
| 2.1 ↔ 2.2 | Batch status and first file reservation | Batch creation must not call provider APIs; init owns provider authorization. **Ruling:** route boundary remains database-only then direct storage. |
| 2.2 ↔ 2.3 | API response/completion contract | Completion must use the database file id and server-derived path. **Ruling:** no Drive id/session URL or arbitrary provider id crosses the contract. |
| 2.2 ↔ 2.4 | Signed upload response and browser transport | Browser code cannot be finalized until the official response shape is verified. **Ruling:** Task 2.4 follows Task 2.2 and uses only the minimal short-lived authorization. |
| 2.3 ↔ 2.4 | Completion request and status transitions | Worker retries must be safe against server idempotency. **Ruling:** completion remains conditional under the batch lock; worker treats repeated success as success. |
| 2.3 ↔ 5.1 | API invariants and test assertions | Focused tests must cover path/size/ownership and repeated completion. **Ruling:** tests use mocks/fixtures, never production storage. |
| 3.1 ↔ 3.2 | Tailwind v4 tokens/imports and sourced effects | Effects need the final Tailwind/motion setup. **Ruling:** foundation precedes backgrounds. |
| 3.1 ↔ 4.1, 4.2, 4.3, 4.4 | Shared styles/primitives and all routes | Route redesign consumes the same tokens, focus rules, and primitives. **Ruling:** no route-specific framework is introduced. |
| 3.2 ↔ 4.1, 4.2, 4.3 | Background layering | Effects must remain pointer-transparent, SSR-safe, and reduced-motion aware. **Ruling:** dense admin surfaces use quieter/static treatment. |
| 4.1 ↔ 4.2, 4.4 | Shell, route navigation, root redirect/metadata | Authenticated navigation and redirects must remain consistent. **Ruling:** preserve server auth checks and the bounded logout fallback while restyling. |
| 4.2 ↔ 2.4 | Upload worker state and intake UI | UI status labels must map to actual worker/API states. **Ruling:** worker contract is authoritative; do not invent a visual-only state. |
| 4.3 ↔ 1.1, 1.2 | Diagnostics/admin data | Admin UI must use storage readiness and nullable legacy data safely. **Ruling:** remove Drive links and render metadata only. |
| 4.4 ↔ 5.3 | Root metadata/build/runtime behavior | Final verification must include redirects and hydration checks. **Ruling:** no metadata change is accepted without production-build smoke coverage. |
| 5.1 ↔ 5.3 | Focused tests and full verification | Full verification consumes the focused suite. **Ruling:** no network-dependent test is required for the default suite. |
| 5.2 ↔ 6.2 | Setup guide and Vercel/Supabase configuration | Deployment instructions must name the exact final env/migration setup. **Ruling:** documentation is updated only after code and migration settle. |
| 5.3 ↔ 6.1, 6.2 | Verification evidence and release | Publishing/deploying before checks would make the live result ambiguous. **Ruling:** no PR merge or production verification claim before local checks are recorded. |
| 6.1 ↔ 6.2 | GitHub merge and Vercel deployment | Vercel must deploy the merged `main` commit. **Ruling:** inspect deployment commit and health after merge; do not claim a live change from a branch push alone. |

## Execution order

1. Task 0.1 baseline.
2. Task 0.2 official source/API verification.
3. Tasks 1.1–1.3 storage contract and migration.
4. Tasks 2.1–2.4 upload API and browser worker.
5. Tasks 3.1–3.2 UI foundation/effects.
6. Tasks 4.1–4.4 route redesign.
7. Tasks 5.1–5.3 tests/docs/full verification.
8. Tasks 6.1–6.2 GitHub/Vercel release.

## Decisions

- Keep legacy Drive columns nullable for the first release to preserve rollback and existing metadata; remove them only in a later reviewed migration.
- Use one minimal UI runtime foundation (Tailwind v4 plus local shadcn-style components), not several competing component frameworks.
- Prefer the official Supabase signed-upload flow and add resumability only if the verified current API supports it cleanly; never proxy large bytes through Vercel.
- Use the least expensive capable subagent for mechanical tasks, standard reasoning for integration, and the strongest available review model only for the final whole-branch review.

## Rulings

- Ruling: Task 0.2's Tailwind compilation acceptance is sequenced before Task 3.1 creates the Tailwind v4 setup — I moved compilation verification to Task 3.2, while Task 0.2 remains responsible for source/API/import/license research and an explicit handoff. This follows the spec's implementation boundary and avoids claiming a compile that cannot run yet. Cost if wrong: the background component could still fail during Task 3.2, which remains a blocking compile gate.
- Ruling: Task 1.2's null-write requirement belongs at the Task 2.1 route replacement boundary, not in the schema-only migration. Existing Drive routes remain temporarily functional until then; Task 1.2 will add explicit null guards so typecheck stays green, and Task 2.1 must remove all new Drive-field writes. Cost if wrong: a short-lived intermediate branch still writes legacy Drive metadata, but the final storage-route review must prove those writes are gone.

## Task progress

- Task 0.1: complete (baseline report and task review passed; no source commits)
- Task 0.2: complete (research/fix re-review passed; source SHA pin deferred as a minor, Tailwind/Aurora handoffs recorded)
- Task 1.1: complete (commits `7e5d7e7..49d4736`, task review approved; generated metadata remains uncommitted)
- Task 1.2: complete (commits `cafd5f1..a70da39`, schema review/fix re-review passed; Task 2.1 owns removal of legacy Drive writes)
- Task 1.3: minor (deferred): add exact 1,024/1,025-byte boundary assertions during the broader storage test pass; security boundary itself approved.
- Task 1.3: complete (commit `bc5a4d9`, security review approved)
- Task 2.1: complete (commits `839e888..81d9ab1`, route contract fix re-review passed; integration-harness gap documented)
- Task 2.2: complete (commits `1200eab..0e4bdd3`, API race/error/test fix re-review passed; no live provider/database test)
- Task 2.3: complete (commits `2a7b536..6b26c4d`; completion review/fix re-review passed; 89 focused tests pass; no live provider/database test)
- Task 2.4: complete (commits `8c91748..c1d7cce`; scoped review findings fixed for lost completion responses, unsafe reset, retry scheduling, and duplicate paths; 91 tests, typecheck, lint, and production build pass; no live provider/database test)
- Task 3.1: complete (commit `875e912`; Tailwind v4, shadcn-style primitives, design tokens, and accessible motion foundation added)
- Task 3.2: complete (commit `875e912`; Aurora and Beams backgrounds adapted from the requested open-source component sources with reduced-motion, pointer, and DPR safeguards)
- Task 4.1: complete (commit `eee2280`; login and authenticated shell redesigned with route-aware visual treatments while preserving auth behavior)
- Task 4.2: complete (commit `eee2280`; upload and history surfaces redesigned around real transfer state with no provider links)
- Task 4.3: complete (commit `eee2280`; admin surfaces now expose private-storage readiness and metadata only)
- Task 4.4: complete (commit `eee2280`; metadata and health response updated to the Supabase Storage contract)
- Task 5.1: complete (91 tests pass; provider-neutral configuration, path, upload, completion, notification, and retry contracts are covered)
- Task 5.2: complete (current working changes; removed dead Google provider code/dependency and replaced the setup, architecture, security, and QA docs with Supabase Storage + Vercel instructions)
