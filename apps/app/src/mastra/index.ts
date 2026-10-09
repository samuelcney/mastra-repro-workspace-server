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
