import { writeFileSync } from "node:fs";

writeFileSync(
  "public/build-version.json",
  JSON.stringify({ version: `${process.env.VERCEL_GIT_COMMIT_SHA || "local"}-${Date.now()}` }),
);
