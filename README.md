# Pen Transactions

Try a few simple changes to a design file, compare rough before-and-after diagrams, and apply the group only when its checks pass. The saved project keeps the starting design and an undoable record of those changes.

An automated design edit might rename the wrong object, move something into the wrong frame or overwrite a setting. A final picture alone does not explain which objects changed. You want a review step and a record you can undo later.

**Example:** Select a supported frame, stage a new display name, then stage another supported change. Inspect the object list and rough previews before applying the group. If an object no longer matches the state the edit expected, the whole group is refused rather than partly applied.

**What you install:** A separate design-file workbench with a Windows app and browser version.

**Current scope:** This handles a limited part of the .pen 2.21 format. Its previews are simple outlines, not Pencil's finished rendering. Reopening the result in the real Pencil app has not been verified.

[Live guide](https://az9713.github.io/rea-pencil-transactions/) · [Download packages](https://github.com/az9713/rea-pencil-transactions/releases/tag/v0.1.0)

<!-- rea-release-expectations:start -->
## What to expect from this release

**Status: experimental.** Read the tested scope and remaining work below before choosing this release for your workflow.

- **What you get:** A standalone Windows/browser editor for a limited part of the .pen 2.21 format. Staging, rough previews and undo history live in this tool, outside Pencil.
- **Verified so far:** Supported rename, property and move edits, grouped-change checks, undo/redo and repeat edits were tested with fixtures, the browser and packaged app.
- **Still needs testing or implementation:** Reopening edited files in the real Pencil app and comparing its rendered result remain unverified.
- **Relationship to the original app:** Installing it adds no controls to Pencil. The previews are simple outlines. A workflow inside Pencil and reliable exchange of broader documents would require additional host and format integration work.

<!-- rea-release-expectations:end -->

![Actual Chromium workbench with a staged synthetic transaction](https://az9713.github.io/rea-pencil-transactions/workbench-desktop.png)



## Useful behavior

- Imports strict-JSON `.pen` documents declaring the publicly documented schema2.21, or saved native `.penwork.json` projects.
- Stages guarded display-name changes, limited property sets and absolute-tree moves/reorders. IDs are immutable; unknown fields remain intact.
- Applies up to20 operations atomically with complete-document, target-object and move-destination SHA-256 guards. Stale input, duplicate IDs, unsupported operations, component/opaque/flex move paths and cycles are refused.
- Shows independent before/after wireframes and object-level before/after property values, locations and child order.
- Preserves a durable history/cursor/redo branch in native projects, with record and manifest hashes. Reload verifies every transaction, including inactive redo records.
- Exports the committed `.pen` candidate, original baseline, native project and separately replayable transaction manifest.

This is an **original independent research workbench**, not a modified Pencil client or a demonstrated REA run. The official [public format](https://docs.pencil.dev/for-developers/the-pen-format) is live; it currently declares2.21. Official guidance prefers the app/[CLI](https://docs.pencil.dev/for-developers/pen-cli)/MCP engine for production changes. This app implements its own limited JSON operation grammar and does not implement their executable operation DSL, references/layout engine or rendering.

## Five-minute experiment

1. Open the app. Invented research frames and a measured-sample rectangle are loaded.
2. Stage a rename for `sample-card`. Change the operation to Set → fill and stage a hex color.
3. Review both wireframes and the guarded JSON batch. The committed checkpoint remains unchanged.
4. Commit once with a label. Inspect object values and transaction record SHA-256.
5. Undo, save a native project, import it and redo. The restored tip has the same checkpoint.
6. Download the baseline and manifest. Reload that original baseline and replay the manifest. A different baseline is refused.

New commits after undo replace the redo branch only after an explicit choice. Pending staged operations are excluded from durable exports until committed. There is no automatic storage; save before closing.

## Download or build

**Windows:** extract `PencilTransactions-0.1.0-win-x64.zip` and run the contained `PencilTransactions.exe`. Keep its runtime/resources together. The profile is stored beside the executable unless `REA_PROFILE_DIR` selects another directory. The renderer has no Node integration or privileged IPC; only explicitly bundled docs are served on an ephemeral loopback port.

**Web:** extract `pencil-transactions-web-0.1.0.zip` and open `app.html` directly, or use the live editor. The external bundled JavaScript is self-contained. No network service, account or package manager is required for normal use. No scripts, image URLs, libraries or external fonts from imported documents are fetched or executed.

**Source:** Node22+ and Python3. Always choose the intended project explicitly before npm operations:

```powershell
$projectPrefix = (Get-Location).Path
if (!(Test-Path -LiteralPath (Join-Path $projectPrefix 'package.json'))) { throw 'Missing project package.json' }
npm --prefix $projectPrefix ci --ignore-scripts
npm --prefix $projectPrefix run build
npm --prefix $projectPrefix test
npm --prefix $projectPrefix run test:browser
npm --prefix $projectPrefix run release
```

Browser checks use Playwright; set `BROWSER_EXECUTABLE_PATH` to a Chromium executable or install its browser. Test profiles, cache, synthetic files and downloads stay under `.test-build`.

For a fresh Windows source build, install the pinned Electron45.2.1 runtime with `npm --prefix $projectPrefix rebuild electron`, then run `python scripts/package-desktop.py`. The helper refuses an existing unpacked output. An existing helper-built package can be refreshed from explicitly allowlisted docs by `python scripts/release.py`. Project MIT, `LICENSE.electron` and `LICENSES.chromium.html` are retained separately.

The source CLI can replay project-local baseline/manifest files into a new separate file:

```sh
node scripts/replay.mjs fixtures/research-baseline.pen transactions.json replayed.pen
```

It refuses path escape/symlink escape and output overwrite. The browser exports the matching manifest. Automated tests also verify replay in a fresh Node process.

## Exact contract and limits

The supported native shape is version2.21 with a tree of unique string IDs and children. All imported JSON values and untouched unknown fields are retained; comments, byte formatting, original key order and number spellings are not. Numbers use finite IEEE-754 values. Duplicate/prototype keys, unsafe integers, negative zero, nonfinite numbers, malformed Unicode and other format versions are refused rather than normalized or upgraded.

Checkpoint hashing is SHA-256 over UTF-8 canonical JSON with JavaScript-sorted object keys, unchanged array order and JSON number encoding. This is this tool's documented algorithm, not an RFC8785 claim. It detects a mismatched baseline or ledger. It is not a digital signature, proof of authorship or protection against an actor who recomputes a completely different valid history.

Rename changes `name`, never `id`. Set accepts x/y (±100000), width/height(1–10000), hex fill, opacity(0–1), scalar cornerRadius(0–1000), text content(max4000), fontSize(1–200), with type checks. Moves keep local x/y; their canvas position can change. Source/destination must be root or explicit `layout:none` frames. Same-parent indexes refer to the destination **after removal**. Unsupported/component/flex subtrees, ID/reference writes, insert/delete and unknown property writes are refused. Explicit changes to a supported field are captured with its prior value; other unknown fields remain unchanged.

Input5 MiB; compact baseline/current document1 MiB; document depth30 /30000 JSON values;1500 tree nodes;30 transactions;20 operations per transaction; history2 MiB. Native envelopes also enforce5 MiB/40 depth/200000 JSON values. Each string is bounded to100000 UTF-16 code units. Preview is limited to500 nodes and2000 text characters/20 lines per node, with bounded geometry. Bounds are enforced before committing rather than silently truncating native data.

Wireframes cover literal absolute geometry for frame/rectangle/ellipse/text, simple hex fills, radius and approximate local sans-serif text. Flex layout, refs, theme/variable resolution, assets, effects, scripts, fonts and native shaping are unsupported and listed by JSON path. Unsupported objects remain in the exported JSON. No real Pencil engine/client or private design was accessed; no native engine compatibility or rendering fidelity has been verified. A `.pen` export is explicitly a candidate to review in the official engine, not a claim of validated compatibility.

See [core report](https://az9713.github.io/rea-pencil-transactions/verification.json), [browser report](https://az9713.github.io/rea-pencil-transactions/browser-verification.json), [source receipts](https://az9713.github.io/rea-pencil-transactions/sources.json) and repository tests. Fixtures/screenshots are synthetic. MIT; see `THIRD_PARTY_NOTICES.md`.
