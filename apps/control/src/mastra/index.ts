import { Mastra } from "@mastra/core/mastra";
import { registerApiRoute } from "@mastra/core/server";
import { createTool } from "@mastra/core/tools";
import { sum } from "@repro/lib";
import { z } from "zod";

const sumTool = createTool({
  id: "sum",
  description: "Sums numbers",
  inputSchema: z.object({ values: z.array(z.number()) }),
  outputSchema: z.object({ total: z.number() }),
  execute: async ({ values }) => ({ total: sum(values) }),
});

export const mastra = new Mastra({
  tools: { sum: sumTool },
  server: {
    apiRoutes: [
      registerApiRoute("/ping", {
        method: "GET",
        handler: (c) => c.json({ ok: true }),
      }),
    ],
  },
});
