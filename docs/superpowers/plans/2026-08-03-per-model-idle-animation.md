# Per-Model Idle Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Ellen's tuned hands-at-waist idle exclusive to Ellen while restoring the older shared idle for Virena, Anby, user-imported models, and future packaged models.

**Architecture:** Packaged model records gain one optional `idle_asset_path`, resolved to `idle_asset_url` in renderer settings. A pure renderer resolver replaces global animation URLs only for an `IDLE` request when the selected model has an override; the asset checker treats the override as an animation dependency. The committed catalog/manifest baseline is repaired first, and local media deployment remains reversible and separate from tracked code.

**Tech Stack:** Electron/Node.js CommonJS, React 19, TypeScript, Vitest, Node test runner, Vite, VRM/VRMA local assets.

## Global Constraints

- Old shared idle source: `/Users/shanchuanxu/projects/digital-one/persona-pipeline/vrma/idle.vrma`, SHA-256 `b46a39781e74a8bb3752d2b7284bdf8bcec7e038f46b48cccea0eb14f6cb65c7`.
- Ellen-tuned idle source: `/Users/shanchuanxu/projects/digital-one/persona-pipeline/vrma-tuned/idle.vrma`, SHA-256 `18aa0ecc04389bf8ce93e0522b02c30168f2359b6a8cfb7bb96828f0e4172207`.
- `idle_asset_path` is optional, accepts only a safe relative `.vrma` path, and does not bump packaged-library schema version 1.
- A model override replaces only `IDLE`; speaking, greeting, happy, finger-gun, dance, and explicit custom overrides remain unchanged.
- Models without an override, including user-imported models, use the global `system-idle` clips.
- Do not regenerate VRMA, alter VRM models/materials, modify retargeting parameters, or generalize routing beyond the idle role.
- Preserve the user's local Ellen/Anby catalog entries and unrelated dirty files.
- All production asset/catalog writes require a unique backup and complete rollback on failure.

---

### Task 1: Repair the Existing Packaged Catalog/Manifest Baseline

**Files:**

- Modify: `electron/library-catalog.test.cjs`
- Modify: `public/assets/manifest.json`
- Verify: `scripts/check-assets.test.cjs`

**Interfaces:**

- Consumes: the committed `public/assets/library.json` containing Virena plus one model path and eight animation paths.
- Produces: a committed manifest whose path/role map exactly equals `readAssetContract(public/assets/library.json)`.

- [ ] **Step 1: Reproduce the three existing failures**

Run:

```bash
npm run test:node
```

Expected: exactly three failures:

- `keeps permanent empty system actions in the packaged library` expects an obsolete empty committed library;
- `development accepts an empty catalog and ignored local media` fails because manifest paths are empty;
- `manifest assigns every catalog asset its intended generic role` fails because the manifest has no roles.

- [ ] **Step 2: Update the committed-library assertion to describe the actual baseline**

Rename the first catalog test to `keeps the committed Virena library and permanent system actions valid`. Keep reading `git show HEAD:public/assets/library.json`, then assert:

```js
assert.equal(library.default_model_id, "virena");
assert.deepEqual(library.models, [
  {
    id: "virena",
    model_name: "维琳娜",
    asset_path: "models/model.vrm",
  },
]);
assert.deepEqual(
  library.animations.map(({ id, animation_type, asset_paths }) => ({
    id,
    animation_type,
    asset_paths,
  })),
  [
    { id: "system-idle", animation_type: "IDLE", asset_paths: ["animations/idle.vrma"] },
    { id: "system-speaking", animation_type: "TALK", asset_paths: ["animations/talk1.vrma", "animations/talk2.vrma", "animations/talk3.vrma"] },
    { id: "greeting", animation_type: "GREETING", asset_paths: ["animations/greeting.vrma"] },
    { id: "happy", animation_type: "HAPPY", asset_paths: ["animations/happy.vrma"] },
    { id: "finger-gun", animation_type: "FINGER_GUN", asset_paths: ["animations/finger-gun.vrma"] },
    { id: "dance", animation_type: "DANCE", asset_paths: ["animations/dance.vrma"] },
  ],
);
```

- [ ] **Step 3: Populate the committed manifest with the exact baseline contract**

Keep `schemaVersion`, `distributionAllowed:false`, and the notice. Set `assets` to these nine records, each with `license:null` and `source:null`:

```text
models/model.vrm                         model
animations/idle.vrma                    animation
animations/talk1.vrma                   animation
animations/talk2.vrma                   animation
animations/talk3.vrma                   animation
animations/greeting.vrma                animation
animations/happy.vrma                   animation
animations/finger-gun.vrma              animation
animations/dance.vrma                   animation
```

- [ ] **Step 4: Verify the original failures are green**

Run:

```bash
npm run test:node
npm run assets:check
```

Expected: all Node tests pass and the asset contract prints `Persona asset contract is valid`.

- [ ] **Step 5: Commit the repaired baseline**

```bash
git add electron/library-catalog.test.cjs public/assets/manifest.json
git commit -m "fix: align packaged asset contract"
```

---

### Task 2: Carry an Optional Idle Override Through Catalog and Settings

**Files:**

- Modify: `electron/library-catalog.cjs`
- Modify: `electron/library-catalog.test.cjs`
- Modify: `electron/settings-store.cjs`
- Modify: `electron/settings-store.test.cjs`
- Modify: `src/settings-defaults.ts`
- Modify: `src/settings-defaults.test.ts`
- Modify: `src/vite-env.d.ts`

**Interfaces:**

- Produces validated packaged model shape `{ id, model_name, asset_path, idle_asset_path?: string }`.
- Produces renderer model shape `PersonaModelSettings` with `idle_asset_url?: string`.
- `idle_asset_url` is absent for packaged/user models without an override.

- [ ] **Step 1: Write catalog RED tests**

Add a test that validates:

```js
const library = validatePackagedLibrary({
  schema_version: 1,
  default_model_id: "ellen",
  models: [{
    id: "ellen",
    model_name: "艾莲",
    asset_path: "models/ellen.vrm",
    idle_asset_path: "animations/idle-ellen.vrma",
  }],
  animations: [],
});
assert.equal(
  library.models[0].idle_asset_path,
  "animations/idle-ellen.vrma",
);
```

In the same test assert `../idle.vrma`, `/idle.vrma`, and `animations/idle.vrm` each throw an error matching `/relative \.vrma asset path/`.

- [ ] **Step 2: Write settings-store RED test**

Extend the packaged model in `writePackagedLibrary()` with:

```js
idle_asset_path: "animations/idle-configured.vrma",
```

In the existing packaged settings test assert:

```js
assert.equal(
  snapshot.models.find((model) => model.id === "configured-model")
    ?.idle_asset_url,
  "./assets/animations/idle-configured.vrma",
);
```

Also assert a user-imported model has no own `idle_asset_url` property.

- [ ] **Step 3: Write browser-fallback RED test**

In `src/settings-defaults.test.ts`, import `afterEach`, `vi`, and `loadPackagedSettingsFallback`. Stub `fetch` with a schema-1 document containing Ellen and `idle_asset_path`, then assert:

```ts
expect(snapshot.models[0]).toMatchObject({
  id: 'ellen',
  asset_url: './assets/models/ellen.vrm',
  idle_asset_url: './assets/animations/idle-ellen.vrma',
});
```

Use `afterEach(() => vi.unstubAllGlobals())` so no other test inherits the stub.

- [ ] **Step 4: Run RED tests**

```bash
node --test electron/library-catalog.test.cjs electron/settings-store.test.cjs
npx vitest run src/settings-defaults.test.ts
```

Expected: failures show `idle_asset_path` is dropped and `idle_asset_url` is undefined.

- [ ] **Step 5: Implement the minimal catalog and settings mapping**

In `validatePackagedLibrary()`, add only when present:

```js
const idle_asset_path =
  model?.idle_asset_path == null
    ? undefined
    : assetPath(
        model.idle_asset_path,
        ".vrma",
        `models[${index}].idle_asset_path`,
      );
return {
  id,
  model_name,
  asset_path,
  ...(idle_asset_path === undefined ? {} : { idle_asset_path }),
};
```

In `availableModels()` add to packaged model snapshots:

```js
...(model.idle_asset_path == null
  ? {}
  : { idle_asset_url: packagedAssetUrl(model.idle_asset_path) }),
```

Do not add the property to user-model snapshots.

In `src/vite-env.d.ts` add:

```ts
idle_asset_url?: string;
```

In `PackagedLibraryDocument.models` add `idle_asset_path?: string`, and map it in `loadPackagedSettingsFallback()` using `packagedAssetUrl` only when present.

- [ ] **Step 6: Run GREEN tests and full type build**

```bash
node --test electron/library-catalog.test.cjs electron/settings-store.test.cjs
npx vitest run src/settings-defaults.test.ts
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit the catalog/settings contract**

```bash
git add electron/library-catalog.cjs electron/library-catalog.test.cjs electron/settings-store.cjs electron/settings-store.test.cjs src/settings-defaults.ts src/settings-defaults.test.ts src/vite-env.d.ts
git commit -m "feat: expose per-model idle overrides"
```

---

### Task 3: Resolve Idle URLs for the Selected Model

**Files:**

- Modify: `src/animation-catalog.ts`
- Modify: `src/animation-catalog.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/SettingsPage.tsx`

**Interfaces:**

- Produces:

```ts
animationUrlsForModel(
  type: PlayableAnimationType,
  configuredUrls: readonly string[],
  model?: Pick<PersonaModelSettings, 'idle_asset_url'> | null,
): readonly string[]
```

- The body override's explicit `animationUrls` remains higher priority than this resolver.

- [ ] **Step 1: Write resolver RED tests**

Add these assertions to `src/animation-catalog.test.ts`:

```ts
expect(
  animationUrlsForModel(
    'IDLE',
    ['global-idle.vrma'],
    { idle_asset_url: 'ellen-idle.vrma' },
  ),
).toEqual(['ellen-idle.vrma']);

expect(
  animationUrlsForModel(
    'IDLE',
    ['global-idle.vrma'],
    {},
  ),
).toEqual(['global-idle.vrma']);

expect(
  animationUrlsForModel(
    'TALK',
    ['talk1.vrma', 'talk2.vrma'],
    { idle_asset_url: 'ellen-idle.vrma' },
  ),
).toEqual(['talk1.vrma', 'talk2.vrma']);
```

- [ ] **Step 2: Run the RED test**

```bash
npx vitest run src/animation-catalog.test.ts
```

Expected: FAIL because `animationUrlsForModel` is not exported.

- [ ] **Step 3: Implement the pure resolver**

```ts
export function animationUrlsForModel(
  type: PlayableAnimationType,
  configuredUrls: readonly string[],
  model?: Pick<PersonaModelSettings, 'idle_asset_url'> | null,
): readonly string[] {
  return type === 'IDLE' && model?.idle_asset_url
    ? [model.idle_asset_url]
    : configuredUrls;
}
```

- [ ] **Step 4: Wire the main avatar without weakening explicit overrides**

In `App.tsx`, keep `configuredAnimationUrls` unchanged, add a memoized selected-model result, then retain override priority:

```ts
const modelAnimationUrls = useMemo(
  () => animationUrlsForModel(animation, configuredAnimationUrls, defaultModel),
  [animation, configuredAnimationUrls, defaultModel],
);
const animationUrls = bodyOverride?.animationUrls ?? modelAnimationUrls;
```

- [ ] **Step 5: Wire the Settings preview through the same resolver**

Replace the preview's raw `idleAnimationUrls` fallback with:

```ts
const selectedModelIdleUrls = useMemo(
  () => animationUrlsForModel('IDLE', idleAnimationUrls, selectedModel),
  [idleAnimationUrls, selectedModel],
);
const previewAnimationUrls = useMemo(
  () => (previewClip ? [previewClip.asset_url] : selectedModelIdleUrls),
  [previewClip, selectedModelIdleUrls],
);
```

- [ ] **Step 6: Verify runtime-selection tests and compilation**

```bash
npx vitest run src/animation-catalog.test.ts
npm run lint
npm run build
```

Expected: all commands exit 0 with no React hook dependency warnings.

- [ ] **Step 7: Commit runtime routing**

```bash
git add src/animation-catalog.ts src/animation-catalog.test.ts src/App.tsx src/components/SettingsPage.tsx
git commit -m "feat: route idle animation by model"
```

---

### Task 4: Include Model Idle Overrides in the Asset Contract

**Files:**

- Modify: `scripts/check-assets.cjs`
- Modify: `scripts/check-assets.test.cjs`

**Interfaces:**

- `readAssetContract()` returns every model VRM as role `model`, every model `idle_asset_path` as role `animation`, and every animation action path as role `animation`.
- Duplicate paths across all three sources fail closed.

- [ ] **Step 1: Write asset-contract RED tests**

Extend `configureFixtureAssets()` with:

```js
idle_asset_path: "animations/configured-idle.vrma",
```

and add its manifest record:

```js
{
  path: "animations/configured-idle.vrma",
  role: "animation",
  license: null,
  source: null,
}
```

Assert:

```js
const contract = readAssetContract(fixture.libraryPath);
assert.equal(
  contract.roles["animations/configured-idle.vrma"],
  "animation",
);
assert.deepEqual(validateAssets(fixture), []);
```

Add a second fixture where `idle_asset_path` duplicates the system idle path and assert `readAssetContract()` throws `/declared more than once/`.

- [ ] **Step 2: Run RED tests**

```bash
node --test scripts/check-assets.test.cjs
```

Expected: the new idle path is absent from `contract.roles`, causing the role assertion to fail.

- [ ] **Step 3: Refactor path insertion into one fail-closed helper**

Inside `readAssetContract()` add:

```js
function addRole(assetPath, role) {
  if (roles.has(assetPath)) {
    throw new Error(`Packaged asset path is declared more than once: ${assetPath}`);
  }
  roles.set(assetPath, role);
}
```

Use it for `model.asset_path`, optional `model.idle_asset_path`, and every `animation.asset_paths` entry. Do not change release/media-presence behavior.

- [ ] **Step 4: Run GREEN and regression tests**

```bash
node --test scripts/check-assets.test.cjs
npm run test:node
npm run assets:check
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit the asset-contract support**

```bash
git add scripts/check-assets.cjs scripts/check-assets.test.cjs
git commit -m "feat: validate model idle assets"
```

---

### Task 5: Reversible Three-Model Runtime Staging

**Files:**

- Temporarily modify, then restore: `public/assets/library.json`
- Temporarily modify, then restore: `public/assets/manifest.json`
- Create ignored staging media under: `public/assets/models/`, `public/assets/animations/`
- Create evidence under: `/private/tmp/persona-idle-stage-*`

**Interfaces:**

- Consumes code from Tasks 1–4 and the user's current local catalog/media from `/Users/shanchuanxu/projects/persona/public/assets`.
- Produces proof that resource selection and rendered poses change per model without changing other actions.

- [ ] **Step 1: Run the complete tracked-code gate**

```bash
npm run lint
npm test
npm run assets:check
npm run build
git status --short
```

Expected: all commands exit 0; the worktree is clean after the four feature commits and design/plan commits.

- [ ] **Step 2: Create a unique staging backup and copy ignored local media**

Create `mktemp -d /private/tmp/persona-idle-stage.XXXXXX`. Back up the feature worktree's committed library/manifest and the user's current local library/manifest. Copy the user's ignored `models/*.vrm` and `animations/*.vrma` into the feature worktree's corresponding ignored directories.

Verify before mutation:

```text
current Persona idle.vrma SHA = 18aa0ecc04389bf8ce93e0522b02c30168f2359b6a8cfb7bb96828f0e4172207
old shared source SHA          = b46a39781e74a8bb3752d2b7284bdf8bcec7e038f46b48cccea0eb14f6cb65c7
```

- [ ] **Step 3: Prepare and install staging media/catalog only inside the feature worktree**

- Preserve current staged `animations/idle.vrma` as `animations/idle-ellen.vrma`.
- Replace staged global `animations/idle.vrma` with the locked old shared source.
- Starting from the user's local catalog copies, use `apply_patch` on temporary JSON files to add only:

```json
"idle_asset_path": "animations/idle-ellen.vrma"
```

to Ellen, and add `animations/idle-ellen.vrma` with role `animation` to the manifest.
- Copy those temporary documents into the feature worktree.
- Run `npm run assets:check`, expecting GREEN.

- [ ] **Step 4: Start the feature runtime and verify requested resources**

Stop/restart only Persona's development Vite/Electron processes, then start this feature worktree at `127.0.0.1:5173` with CDP `9333`. For each model id in order `ellen`, `anby`, `virena`, then `ellen` again:

1. select the model through `window.personaSettings.setDefaultModel()`;
2. reload and wait for two consecutive non-empty render frames;
3. query `performance.getEntriesByType('resource')` and require:
   - Ellen: `animations/idle-ellen.vrma` requested and old global idle not selected;
   - Anby/Virena: `animations/idle.vrma` requested and Ellen idle not selected;
4. capture `/private/tmp/persona-idle-stage-<model>.png`;
5. reject renderer exceptions and animation-load warnings.

- [ ] **Step 5: Verify visuals and non-IDLE behavior**

Use `view_image` on all captures. Require:

- Ellen retains the accepted hands-at-waist pose;
- Anby and Virena no longer use that pose and visibly play the old shared idle;
- returning to Ellen restores her pose, proving no clip leak.

Trigger `greeting`, require the bridge response `{"accepted":true}`, and confirm the request still uses `animations/greeting.vrma` for Ellen and one non-Ellen model.

- [ ] **Step 6: Restore the feature worktree staging documents**

Stop the staging runtime. Restore the exact feature library/manifest backups, verify `cmp` equality, and confirm `git status --short` is clean. Ignored copied media may remain only until the worktree is removed; no ignored media is committed.

On any failure in Tasks 5.3–5.5, perform this restore before reporting the failure.

---

### Task 6: Merge, Deploy Local Assets, and Run Final Safety Checks

**Files:**

- Deploy: `/Users/shanchuanxu/projects/persona/public/assets/animations/idle.vrma`
- Create/deploy: `/Users/shanchuanxu/projects/persona/public/assets/animations/idle-ellen.vrma`
- Modify local config: `/Users/shanchuanxu/projects/persona/public/assets/library.json`
- Modify local contract: `/Users/shanchuanxu/projects/persona/public/assets/manifest.json`

**Interfaces:**

- Runs only after tracked code passes review and the user chooses local merge.
- Produces the final installed per-model idle behavior with a recoverable backup.

- [ ] **Step 1: Finish the development branch normally**

Use `superpowers:requesting-code-review`, fix all Critical/Important findings, then use `superpowers:finishing-a-development-branch`. Do not merge without the user's explicit integration choice.

- [ ] **Step 2: Create a unique production backup immediately before local writes**

Create `mktemp -d /private/tmp/persona-idle-final.XXXXXX` and copy:

- current `library.json` and `manifest.json`;
- current `animations/idle.vrma`;
- existing `animations/idle-ellen.vrma` when present, otherwise record that it was absent.

Record SHA-256 values and require the current global file to equal the Ellen-tuned SHA before proceeding.

- [ ] **Step 3: Prepare final local catalog/manifest off-path**

Copy the backed-up JSON documents to temporary final copies and use `apply_patch` only on those copies:

- add `idle_asset_path: animations/idle-ellen.vrma` only to Ellen;
- retain Virena and Anby with no override;
- add exactly one manifest record for `animations/idle-ellen.vrma` with role `animation`, null license/source;
- preserve `distributionAllowed:false`, notice, all models, and all other animation paths.

Validate JSON and use the merged `readAssetContract()`/asset checker against these temporary documents before installing them.

- [ ] **Step 4: Deploy media and documents atomically enough for rollback**

```text
copy current tuned idle -> animations/idle-ellen.vrma
copy locked old source -> animations/idle.vrma
copy final library      -> public/assets/library.json
copy final manifest     -> public/assets/manifest.json
```

Verify:

```text
animations/idle.vrma       SHA = b46a39781e74a8bb3752d2b7284bdf8bcec7e038f46b48cccea0eb14f6cb65c7
animations/idle-ellen.vrma SHA = 18aa0ecc04389bf8ce93e0522b02c30168f2359b6a8cfb7bb96828f0e4172207
```

- [ ] **Step 5: Run merged production checks and repeat runtime acceptance**

```bash
npm run lint
npm test
npm run assets:check
npm run build
```

Restart production Persona and repeat the Task 5 selection/resource/capture sequence for Ellen, Anby, Virena, and Ellen. Require the same resource URLs, visual poses, no clip leak, greeting behavior, and clean renderer logs.

- [ ] **Step 6: Roll back every local destination on any failure**

Restore library, manifest, and global idle from the unique backup. Restore `idle-ellen.vrma` if it existed; otherwise move the failed new file into the backup directory. Restart Persona, require the pre-change asset contract/runtime to load, and report the exact failed gate.

- [ ] **Step 7: Report final state**

Report:

- merge commit/HEAD;
- full command results and test counts;
- both deployed idle hashes;
- backup directory;
- catalog/manifest semantic diff;
- resource URLs and screenshots for Ellen/Anby/Virena;
- confirmation that unrelated dirty files and VRM material work were untouched.
