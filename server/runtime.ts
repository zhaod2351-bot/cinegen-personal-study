import type { OpenAIClientFactory } from "./openaiGateway";
import { OpenAIGateway } from "./openaiGateway";
import { JobRunner } from "./jobs/jobRunner";
import { JobStore } from "./jobs/jobStore";
import { AiSettingsStore } from "./settings/aiSettingsStore";
import type { RuntimeAiSettings } from "./settings/types";
import { WindowsDpapiProtector, type SecretProtector } from "./settings/windowsDpapi";

export interface AiRuntimeOptions {
  settingsFilePath: string;
  jobDirectory: string;
  archiveRoot: string;
  defaults: RuntimeAiSettings;
  protector?: SecretProtector;
  clientFactory?: OpenAIClientFactory;
  retryDelayMs?: number;
}

export function createAiRuntime(options: AiRuntimeOptions) {
  const settingsStore = new AiSettingsStore({
    filePath: options.settingsFilePath,
    protector: options.protector ?? new WindowsDpapiProtector(),
    defaults: options.defaults,
  });
  const jobStore = new JobStore(options.jobDirectory);
  const gateway = new OpenAIGateway(
    () => settingsStore.getRuntimeSettings(),
    options.clientFactory,
  );
  const runner = new JobRunner({
    store: jobStore,
    gateway,
    archiveRoot: options.archiveRoot,
    retryDelayMs: options.retryDelayMs,
  });
  return { settingsStore, jobStore, gateway, runner };
}
