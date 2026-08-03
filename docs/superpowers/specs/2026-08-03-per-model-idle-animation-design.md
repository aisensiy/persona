# Persona Per-Model Idle Animation Design

## Goal

Restore the older shared idle animation for Virena, Anby, and future models while retaining the current tuned hands-at-waist idle exclusively for Ellen. The selection must be data-driven rather than hard-coded to a model id.

This work also repairs the existing packaged-library baseline: the committed catalog declares local model and animation paths while the committed manifest and several tests still assume an empty catalog.

## Confirmed Assets and Root Cause

The two idle files are distinct VRMA animations:

- Old shared idle: `/Users/shanchuanxu/projects/digital-one/persona-pipeline/vrma/idle.vrma`, SHA-256 `b46a39781e74a8bb3752d2b7284bdf8bcec7e038f46b48cccea0eb14f6cb65c7`.
- Ellen-tuned idle: `/Users/shanchuanxu/projects/digital-one/persona-pipeline/vrma-tuned/idle.vrma`, SHA-256 `18aa0ecc04389bf8ce93e0522b02c30168f2359b6a8cfb7bb96828f0e4172207`.
- Persona's current `public/assets/animations/idle.vrma` is byte-identical to the Ellen-tuned file.

The runtime currently resolves every `IDLE` request from one global `system-idle` slot. It never considers the selected model, so deploying Ellen's tuned file under the global `idle.vrma` path changed every character's resting pose.

## Catalog Contract

Add an optional `idle_asset_path` to each packaged model record:

```json
{
  "id": "ellen",
  "model_name": "艾莲",
  "asset_path": "models/ellen.vrm",
  "idle_asset_path": "animations/idle-ellen.vrma"
}
```

Rules:

- `idle_asset_path` is optional and must be a safe relative `.vrma` path when present.
- A model without the field uses the global `system-idle` clips.
- A model with the field replaces the global clips only for the `IDLE` role.
- Speaking, greeting, happy, finger-gun, dance, and explicit custom/override animation requests are unchanged.
- User-imported models have no override and therefore use the shared idle.
- The catalog schema remains version 1 because the field is optional and old documents remain valid.

The validated model record is resolved into an optional `idle_asset_url` in `PersonaModelSettings`. Both Electron settings snapshots and the browser fallback loader expose the same shape.

## Runtime Selection

Add one pure resolver in the renderer animation-catalog module. It receives the requested animation type, the globally configured URLs, and the selected model:

- For `IDLE`, return the model's single `idle_asset_url` when present.
- Otherwise return the globally configured URLs unchanged.

Use this resolver in both the main avatar (`App.tsx`) and the Settings model preview. This keeps the desktop character and preview behavior consistent and gives the selection logic one independently testable boundary.

The global `system-idle` path remains `animations/idle.vrma`, but that file is restored to the old shared animation. Ellen's current bytes move to `animations/idle-ellen.vrma`, and only Ellen's model record points to it.

## Asset Manifest and Existing Baseline Repair

The asset checker must treat a model's optional `idle_asset_path` as an animation asset. It must:

- include the path in the catalog/manifest exact-set comparison;
- require manifest role `animation` for that path;
- continue rejecting unsafe paths, missing manifest entries, partial local media sets, and release metadata violations.

The committed manifest will be brought into agreement with the committed packaged library so `npm test` and `npm run assets:check` no longer start from three known failures. The user's local catalog is a superset containing Ellen and Anby; deployment must preserve those entries and update the local manifest to the exact corresponding superset.

No character media becomes redistributable: `distributionAllowed` remains `false`, and license/source metadata remains null for local-only assets.

## Deployment and Recovery

Before changing local Persona assets, create a unique backup directory containing:

- the current Persona `idle.vrma` (Ellen-tuned bytes);
- `library.json`;
- `manifest.json`;
- any pre-existing `idle-ellen.vrma`.

Deployment order:

1. Copy the current Ellen-tuned bytes to `idle-ellen.vrma`.
2. Replace global `idle.vrma` with the old shared file.
3. Add `idle_asset_path` only to Ellen in the user's local catalog.
4. Add both idle paths to the local manifest with role `animation`.
5. Restart Persona so Electron reloads the catalog.

On any validation or runtime failure, restore every backed-up file and restart Persona. Do not leave a mixed catalog/asset state.

## Testing and Acceptance

Automated tests must be written before production code and must cover:

- catalog acceptance and rejection of optional model idle paths;
- settings-store and browser-fallback URL resolution;
- model-specific `IDLE` replacement;
- non-IDLE and models-without-overrides preserving global URLs;
- Settings preview using the same resolution rule;
- asset checker exact-set and `animation` role handling;
- the repaired committed catalog/manifest baseline.

Required final gates:

- `npm test` passes with no failures;
- `npm run lint`, `npm run build`, and `npm run assets:check` pass;
- the deployed global and Ellen idle files match their locked SHA-256 values;
- selecting Ellen plays the tuned hands-at-waist idle;
- selecting Anby and Virena plays the old shared idle;
- switching between all three models does not leak the previous model's animation;
- greeting and another non-IDLE action still work for each sampled model;
- renderer logs contain no animation-load or runtime errors.

## Scope Boundaries

This change does not regenerate VRMA files, alter VRM models, change material work, modify retargeting parameters, or introduce general per-action model routing. Only the idle role gains an optional per-model override.
