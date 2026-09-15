# SCOOP — Launch Website Field Implementation

## 1. Verdict

```text
PASS — OPTIONAL LAUNCH WEBSITE FIELD IMPLEMENTED
```

## 2. UTC timestamp

```text
2026-09-15T16:30:22Z
```

## 3. Branch / pre-HEAD / final HEAD

```text
branch:   main
pre-HEAD: 8305e198658b7a2add538f558464316bc5e4a280
final:    c7d8795b3d7aadb7b5a067c6a53aad9947ff5ed9
```

## 4. Files changed

```text
apps/web/src/lib/launch/types.ts
apps/web/src/components/launch/steps/TokenStep.tsx
apps/web/src/lib/launch/validation.ts
apps/web/src/lib/launch/validation.test.ts
apps/web/src/lib/launch/build-launch-params.ts
apps/web/src/lib/launch/build-launch-params.test.ts
apps/web/src/components/token/TokenMarketShell.test.tsx
audit/launch-website-field-implementation.md
```

## 5. Launch form implementation

`TokenStep` gains an optional Website input after Telegram, same field styling:

- `id="launch-website"`
- placeholder: `Website (optional) · https://example.com`
- `aria-label="Website (optional)"`
- patches `state.website`

Discord/Farcaster were not added.

## 6. State / default implementation

`LaunchFormState.website: string` with `createInitialLaunchState()` default `website: ''`. Existing flows remain compatible via empty default and `Partial` prefill.

## 7. Validation behavior

`validateTokenStep` (optional):

| Input | Result |
| --- | --- |
| empty / whitespace | valid |
| `https://scoop.fun` | valid |
| `https://example.com/x` | valid |
| `example.com` | invalid (must start with `https://`) |
| `http://example.com` | invalid |
| `javascript:alert(1)` | invalid |
| `data:text/html,…` | invalid |
| >256 chars | invalid |

Aligned with protocol `optionalHttps('website', …)` — no bare-domain auto-HTTPS.

## 8. Launch params proof

```text
TokenStep
→ LaunchFormState.website
→ validateTokenStep
→ buildLaunchParams
→ FactoryLaunchParams.metadata.website
```

Builder now uses:

```ts
website: input.state.website.trim()
// → params.metadata.website = metadataInput.website ?? ''
```

Hardcoded `website: ''` removed from the live construction path.

## 9. Existing deployed persistence proof

No changes required for:

| Layer | Status |
| --- | --- |
| Factory `LaunchMetadata.website` | reused |
| ScoopToken `socials().website` | reused |
| Indexer `socials()[3]` | reused |
| `tokens.website` | reused |
| API / `TokenDetail.website` | reused |
| Token-page About “Website” | reused (`TokenMarketLiveView` + `safeHttpsUrl`) |

## 10. Tests added/updated

- Initial state `website: ''`
- Website validation cases (valid HTTPS + reject bare/http/unsafe/overlong)
- `buildLaunchParams` trim passthrough + empty preserve
- Existing X/Telegram metadata assertions retained/extended
- Focused About href regression via `safeHttpsUrl(baseToken().website)` in `TokenMarketShell.test.tsx`

## 11. Exact test / typecheck results

```text
vitest: validation.test.ts + build-launch-params.test.ts + TokenMarketShell.test.tsx
  Test Files  3 passed (3)
  Tests       43 passed (43)

pnpm --filter @scoop/web run typecheck
  tsc -p tsconfig.json --noEmit → exit 0

git diff --check → clean
```

## 12. Existing-launch compatibility

Empty website remains the default and is still written as `''` on-chain when omitted. Past launches with empty `tokens.website` unchanged; About still hides empty links.

## 13. Environment / config impact

```text
NONE
```

## 14. Schema / migration impact

```text
NONE
```

## 15. Protocol / indexer impact

```text
NONE
```

Scope verification:

```text
Uniswap v4: NONE
protocol contracts: NONE
ABIs: NONE
database/schema: NONE
migration: NONE
indexer: NONE
API: NONE
IPFS/Pinata: NONE
environment variables: NONE
launch wizard: CHANGED
launch params builder: CHANGED
token page implementation: NONE (regression assertion only)
```

## 16. Review-step decision

**Unchanged.** Review still omits all socials (X/Telegram/Website). Adding Website alone would be inconsistent with X/Telegram; left as future polish.

## 17. Git hygiene

Committed only the files in §4. Unrelated dirty/untracked audits and P10.4 reports preserved.

## 18. Commit SHA / message

```text
c7d8795b3d7aadb7b5a067c6a53aad9947ff5ed9
feat(launch): add website field
```

## 19. Push / deploy status

```text
push: NOT PERFORMED
deploy: NOT PERFORMED
```

## 20. Final gate

```text
WEBSITE FIELD IMPLEMENTATION COMPLETE — SAFE FOR ALEX REVIEW BEFORE PUSH/DEPLOY
```
