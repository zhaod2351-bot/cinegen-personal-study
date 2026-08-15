import "dotenv/config";
import { resolve } from "node:path";
import { createApp } from "./app";
import { loadServerConfig } from "./config";
import { createAiRuntime } from "./runtime";

const config = loadServerConfig(process.env);
const localDataRoot = resolve(process.env.LOCALAPPDATA ?? ".cinegen-ai", "CineGen");
const runtime = createAiRuntime({
  settingsFilePath: resolve(localDataRoot, "ai-settings.json"),
  jobDirectory: resolve(localDataRoot, "jobs"),
  archiveRoot: config.assetRoot,
  defaults: config.aiDefaults,
});
await runtime.runner.reconcilePersistedJobs();
const app = createApp({
  store: runtime.jobStore,
  runner: runtime.runner,
  settingsStore: runtime.settingsStore,
  connectionTester: runtime.gateway,
  archiveRoot: config.assetRoot,
  distPath: resolve("dist"),
});

app.listen(config.port, config.host, () => {
  console.log(`CineGen AI server: http://${config.host}:${config.port}`);
});
