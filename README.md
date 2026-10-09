# mastra dev: raw-TS workspace package imported by an API route handler

`mastra dev` fails to boot when a `server.apiRoutes` handler imports a workspace package that exports TypeScript sources. `mastra build` + `node .mastra/output/index.mjs` works.

## Layout

- `packages/lib` - workspace package, `exports: "./src/index.ts"`
- `apps/route-import` - imports `@repro/lib` inside a `registerApiRoute` handler (mastra 1.30.0, @mastra/core 1.67.0) - **fails**
- `apps/route-import-latest` - same app on mastra 1.33.0, @mastra/core 1.75.0 - **fails**
- `apps/tool-import` - imports `@repro/lib` only inside a tool (control) - **works**

## Reproduce

```bash
bun install
cd apps/route-import-latest
rm -rf .mastra
bun run dev
```

Node 22.15:

```
ERROR (Mastra CLI): Unknown file extension ".ts" for .../packages/lib/src/index.ts
```

Node 24.8 (native type stripping):

```
ERROR (Mastra CLI): Cannot find module '.../packages/lib/src/sum' imported from .../packages/lib/src/index.ts
```

Production path works:

```bash
bun run build
node .mastra/output/index.mjs
curl localhost:4111/sum   # {"total":6}
```

## Cause

To read the `server` option, `mastra dev` calls `getServerOptions` -> `extractMastraOption("server")`, which bundles the entry with `extractMastraOptionBundler` (`packages/deployer/src/build/shared/extract-mastra-option.ts`) and then `import()`s `.mastra/output/server-config.mjs` with plain Node.

That bundler has no node-resolve / workspace handling, so every bare import stays external. The generated file contains:

```js
import { sum } from '@repro/lib';
```

Node then resolves `@repro/lib` to its raw `.ts` source and fails. The main bundle (`mastra.mjs`) does not have this problem because it inlines and transpiles workspace packages via the workspace map.

## Expected

`mastra dev` should boot, same as `mastra build`. Possible fix: have `extractMastraOptionBundler` inline and transpile workspace packages, as the main bundle does.
