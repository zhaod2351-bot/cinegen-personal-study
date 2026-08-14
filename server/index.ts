import "dotenv/config";
import { resolve } from "node:path";
import { createApp } from "./app";
import { loadServerConfig } from "./config";
import { JobRunner } from "./jobs/jobRunner";
import { JobStore } from "./jobs/jobStore";
import { OpenAIGateway } from "./openaiGateway";

const config = loadServerConfig(process.env);
const store = new JobStore(resolve(".cinegen-ai", "jobs"));
const runner = new JobRunner({
  store,
  gateway: new OpenAIGateway(async () => config.aiDefaults),
  archiveRoot: config.assetRoot,
});
const app = createApp({
  store,
  runner,
  models: { text: config.aiDefaults.text.model, image: config.aiDefaults.image.model },
  archiveRoot: config.assetRoot,
  distPath: resolve("dist"),
});

app.listen(config.port, config.host, () => {
  console.log(`CineGen AI server: http://${config.host}:${config.port}`);
});
