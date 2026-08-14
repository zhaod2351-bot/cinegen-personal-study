import "dotenv/config";
import { resolve } from "node:path";
import { createApp } from "./app";
import { loadServerConfig } from "./config";
import { createAiRuntime } from "./runtime";

const config = loadServerConfig(process.env);
const runtime = createAiRuntime({
  settingsFilePath: resolve(
    process.env.LOCALAPPDATA ?? ".cinegen-ai",
    "CineGen",
    "ai-settings.json",
  ),
  jobDirectory: resolve(".cinegen-ai", "jobs"),
  archiveRoot: config.assetRoot,
  defaults: config.aiDefaults,
});
const app = createApp({
  store: runtime.jobStore,
  runner: runtime.runner,
  settingsStore: runtime.settingsStore,
  connectionTester: runtime.gateway,
  models: { text: config.aiDefaults.text.model, image: config.aiDefaults.image.model },
  archiveRoot: config.assetRoot,
  distPath: resolve("dist"),
});

app.listen(config.port, config.host, () => {
  console.log(`CineGen AI server: http://${config.host}:${config.port}`);
});
