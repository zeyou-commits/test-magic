import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  // TanStack owns the SSR entry via src/server.ts. A stray root server.ts must
  // never replace Nitro's Vite SSR service and lose the production manifest.
  serverEntry: false,
});
