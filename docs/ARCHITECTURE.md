# Architecture and change map (1.16)

This is a companion plugin loaded by DSH, not a replacement model host. The model chooses meaning, names and relationships; the plugin enforces scope, source roles, bounded resources and durable changes. Keep the star visual design frozen unless the user explicitly changes that requirement.

## Runtime map

| Responsibility | Owner | Change verification |
|---|---|---|
| Host registration, hooks, timers and disposal | plugin/index.js | reflection-worker, soul, api |
| Configuration/schema, scope mapping | plugin/runtime/config.js, environment.js, memory-scope.js | worker group/custom-scope tests, api |
| Existing file helpers/defaults/reset | plugin/runtime/storage.js, lifecycle.js | core, backup/worker, api |
| Emotion, contact, pulse, proactive behavior | plugin/runtime/mood.js, contact.js, pulse-store.js, proactive.js | mood, appraisal, soul, reflection-worker |
| Journal, learning, self, stickers, activity | corresponding plugin/runtime files | soul, migration, compat-memory, retrieval |
| Search/recall | plugin/memory-search.js, retrieval.js, runtime/recall.js | memory-search, retrieval, actual fresh-session dialogue |
| Core data and shared operation fields | plugin/core-memory.js, memory-contract.js | core-memory, evolution, migration, maintainability |
| Reflection queue/materials, worker, health | plugin/reflection*.js | reflection, management, worker, health |
| Review/proposal constraints and diagnostics | plugin/memory-review.js, maintenance-proposals.js, maintenance-errors.js | maintenance, proposals, maintainability |
| Model tools | plugin/tools/index.js and one file per tool | actual tool tests across core/worker/maintenance |
| HTTP policy/rate boundary | plugin/http/api.js, transport.js | api, reflection-ui, worker, ui |
| HTTP feature handlers | plugin/http/*-routes.js | corresponding API/React tests |
| Star assets/service | plugin/star, plugin/http/star.js | client, pack, native star smoke |
| QQ delivery/outbox | plugin/channels, outbox.js | package, soul/worker and scoped integration |

`reflection-material-reader.js` owns bounded sequential archive reads. `reflection-segments.js` owns deterministic Unicode-safe excerpts, quoted-note validation and public progress summaries. The queue persists optional digest-bound `segmentation` checkpoints; details expose counts/phase only. Existing queue files remain readable; malformed progress fails closed. `reflection-worker.js` selects a full-input call or one segment/final-synthesis call per tick. Every request shares the existing daily budget/cooldown and24000-byte input ceiling. Complete text up to40000 serialized bytes/eight segments may be summarized provisionally; no core write occurs before all segments and final synthesis. Final commit still uses the original archive's lease-bound readToken/source-role checks and current core revision/receipt. Foreground claims retain their default. Larger/incomplete/missing archives remain manual; dense/overlimit notes are parked without silent truncation. Quoted membership is not proof of semantic completeness.

Imports point from composition into behavior. Business modules must not import index.js, and no runtime/client-source dependency cycle is allowed. `verify-architecture` parses syntax, checks unresolved identifiers and unused imports, rejects missing local modules and cycles, and checks the original public export list. Moving code must preserve import.meta-relative assets and the live mutable host references.

`runtime/host-state.js` holds the existing single-host live references. Callers access its properties instead of destructuring stale values. Its scope is the same as the original plugin module; supporting multiple simultaneous plugin instances with different hosts would need a separate lifecycle design, not an untested claim from this refactor.

## Panel source and output

Edit **plugin/client-src**, not plugin/client.js. The generated client remains the existing `window.__ModuleLoader__` registration and resolves React from the host's `require`. No bundler/React runtime is installed by users.

- `index.js`: slot registration and overlay composition; `boundary.js`: render-error boundary.
- `panel.js`: composition; `panel-model.js`: state/effect ownership. Hook order and group-clearing behavior are preserved.
- `actions-*.js`: explicit state/setter inputs for group/persona/resources/settings side effects.
- `view-*.js`: rendering with explicit inputs; `reflection-manager.js`: leased material UI.
- `styles.js`, `zoom.js`, `api.js`, `components.js`, `overlay.js`: shared concerns.

Run `npm run build:client` after editing. `npm run check:client` rebuilds in memory and rejects an outdated committed artifact. The generated output may be large; review the source modules and generated diff together. The two star HTML files remain unchanged in this refactor.

## Contracts and permissions

`memory-contract.js` freezes canonical required/optional fields and produces both model-tool schema and core allowed fields. `backgroundOperations` and `proposalFields` are intentionally stricter policies, not aliases for all foreground operations. Adding a field requires updating the canonical definition, implementation and source-role tests; expanding a background policy requires a separate behavior decision.

The complete core validator still decides storage validity. Frontend preview and commit share that validator; worker source checking and queue receipt semantics remain intact. A stable diagnostic is not permission to retry a destructive plan automatically.

## Dependencies and gates

The single committed **package-lock.json** pins the dev tree; `npm ci --ignore-scripts` is used locally and in CI. The old ignored pnpm lock is no longer the installation contract. esbuild, parser/scope analysis, formatter and React/jsdom are dev tools only. Runtime peer requirements stay in both package manifests.

Scoped `.gitattributes` forces LF for the checked source modules even when Windows has `core.autocrlf=true`; frozen star assets are outside these patterns. This was verified using a fresh Windows checkout after the first remote formatting failure, and the architecture gate checks the attribute contract.

`npm test` requires dev dependencies, then runs all suites including package/clean-install, source architecture, client build and deployment fault recovery. Missing React/jsdom must not become a successful full verification. Focused old scripts may still support their original standalone fallback; the full gate preflights dependencies.

## Data and compatibility

No core/queue schema migration is introduced. Existing IDs, source bodies, revisions, self hierarchy, snapshots, history and receipts keep their formats. Auxiliary suggestions remain capped and are not added to memory text export by this refactor; core-history snapshots likewise retain their existing backup limitations. Package and named exports/API/tool names stay compatible. See RUNBOOK.md for install, recovery and real acceptance.

1.16 adds material-privacy masking before capture and historical material views, explicit trusted memory-policy at tool/capture/worker boundaries, and reflection-guidance for actionable queue states. Empty new outcomes share current core-revision validation. Read-only mood/recall use snapshots without persisting relationship, self or voice-cue changes. These are plugin boundaries, not a host filesystem sandbox or proof of semantic truth.
