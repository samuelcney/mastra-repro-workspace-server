# mastra dev fails when an apiRoutes handler imports a raw-TS workspace package

Minimal reproduction for a `mastra dev` bug in monorepos.

When a `server.apiRoutes` handler imports a workspace package whose `exports` point to TypeScript sources (`./src/index.ts`), `mastra dev` fails before the server starts. The same code works with `mastra build` + `node .mastra/output/index.mjs`. Importing the same package only from a tool (or agent) also works.

## Layout

```
.
├── package.json            # Bun workspaces: packages/*, apps/*
├── packages/
│   └── lib/                # @repro/lib, exports "./src/index.ts" (raw TypeScript)
│       └── src/
│           ├── index.ts    # export * from "./sum";
│           └── sum.ts
└── apps/
    ├── app/                # FAILS: imports @repro/lib inside a registerApiRoute handler
    └── control/            # WORKS: imports @repro/lib only inside a tool
```

`apps/app/src/mastra/index.ts`:

```ts
import { Mastra } from "@mastra/core/mastra";
import { registerApiRoute } from "@mastra/core/server";
import { sum } from "@repro/lib";

export const mastra = new Mastra({
  server: {
    apiRoutes: [
      registerApiRoute("/sum", {
        method: "GET",
        handler: (c) => c.json({ total: sum([1, 2, 3]) }),
      }),
    ],
  },
});
```

`apps/control` uses the same package, but only inside a `createTool` `execute`. Its only API route does not import the package.

No LLM provider, API keys, `.env` file or external services are required.

## Steps to reproduce

```bash
bun install

cd apps/app
rm -rf .mastra   # make sure no previous build output is present (see #25747)
bun run dev      # runs `mastra dev`
```

The command that triggers the error is `mastra dev`.

## Expected behavior

`mastra dev` starts the server, and `GET http://localhost:4111/sum` returns `{"total":6}`, the same as the production build does.

## Actual behavior

`mastra dev` exits before the server starts. The error depends on the Node version.

Node 22.15.0 (no native type stripping):

```
ERROR (Mastra CLI): Unknown file extension ".ts" for /<repo>/packages/lib/src/index.ts
```

Node 24.8.0 (native type stripping enabled, but Node ESM requires explicit file extensions in relative imports):

```
ERROR (Mastra CLI): Cannot find module '/<repo>/packages/lib/src/sum' imported from /<repo>/packages/lib/src/index.ts
```

## What works

| Scenario | Result |
| --- | --- |
| `apps/app` with `mastra dev` | fails (errors above) |
| `apps/control` with `mastra dev` | starts (`mastra 1.33.0 ready in ~2.5s`) |
| `apps/app` with `mastra build`, then `node .mastra/output/index.mjs` | works, `GET /sum` returns `{"total":6}` |

So the bug only happens when all of these are true:

1. you run `mastra dev` (not `mastra build`);
2. a raw-TS workspace package is imported;
3. that import is reachable from the `server` option of `new Mastra({...})` (for example, an `apiRoutes` handler).

## Root cause

Before starting, `mastra dev` reads the `server` option to get settings like the port and the API routes:

1. `getServerOptions` calls `extractMastraOption("server", ...)`.
2. `extractMastraOptionBundler` (`packages/deployer/src/build/shared/extract-mastra-option.ts`) bundles the entry file with Rollup. Its only plugins are `tsConfigPaths`, `esbuild`, `commonjs`, `json` and the option-stripping plugins. It has no node-resolve or workspace handling.
3. Because of that, bare imports stay external. The generated `.mastra/output/server-config.mjs` contains:

   ```js
   import { sum } from '@repro/lib';
   ```

4. The CLI then loads that file with plain Node (`import(pathToFileURL(configPath).href)`). Node resolves `@repro/lib` to `packages/lib/src/index.ts`, which it cannot execute, and the process exits.

The main bundle (`.mastra/output/mastra.mjs`) does not have this problem, because it resolves workspace packages through the workspace map and inlines and transpiles them. Only the option-extraction step is affected. That is why `apps/control` works: the package is used only from a tool, and tools are stripped from the `server-config` bundle.

This is different from #25747, which was about stale `mastra build` output in `.mastra/output/node_modules`. This reproduction fails with a clean `.mastra` directory, on the latest versions.

## Possible fix

Have `extractMastraOptionBundler` resolve, inline and transpile workspace packages the same way the main bundle does, so that `server-config.mjs` does not keep external imports to raw-TS workspace sources.

## Environment

- mastra 1.33.0, @mastra/core 1.75.0 (also reproduced on mastra 1.30.0 / @mastra/core 1.67.0)
- Node 22.15.0 and 24.8.0
- Bun 1.2.10 (workspaces)
- Ubuntu 24.04.4 LTS (WSL2)
