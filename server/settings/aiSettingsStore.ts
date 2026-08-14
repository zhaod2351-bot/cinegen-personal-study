import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  AiSettingsUpdate,
  PublicAiSettings,
  PublicProviderSettings,
  ProviderSettingsInput,
  RuntimeAiSettings,
  RuntimeProviderSettings,
} from "./types";

type SecretProtector = {
  protect(value: string): Promise<string>;
  unprotect(value: string): Promise<string>;
};

type StoredProviderSettings = {
  baseUrl: string;
  model: string;
  protectedKey?: string;
};

type StoredAiSettings = {
  version: 1;
  text: StoredProviderSettings;
  image: StoredProviderSettings;
};

type ProviderKind = "text" | "image";

function validateProviderSettings(input: ProviderSettingsInput): RuntimeProviderSettings {
  let url: URL;
  try {
    url = new URL(input.baseUrl);
  } catch {
    throw new Error("baseUrl must be a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("baseUrl must use http or https");
  }
  if (url.username || url.password) {
    throw new Error("baseUrl must not contain credentials");
  }

  const model = input.model.trim();
  if (!model) throw new Error("model must not be empty");

  const apiKey = input.apiKey?.trim();
  return apiKey === undefined
    ? { baseUrl: input.baseUrl, model }
    : { baseUrl: input.baseUrl, model, apiKey };
}

function maskKey(apiKey: string | undefined): string | null {
  if (!apiKey) return null;
  if (apiKey.length <= 7) return "****";
  return `${apiKey.slice(0, 3)}****${apiKey.slice(-4)}`;
}

function toPublicProviderSettings(settings: RuntimeProviderSettings): PublicProviderSettings {
  return {
    baseUrl: settings.baseUrl,
    model: settings.model,
    hasKey: Boolean(settings.apiKey),
    keyMask: maskKey(settings.apiKey),
  };
}

export class AiSettingsStore {
  private settings: RuntimeAiSettings | undefined;

  constructor(
    private readonly options: {
      filePath: string;
      protector: SecretProtector;
      defaults: RuntimeAiSettings;
    },
  ) {}

  async getPublicSettings(): Promise<PublicAiSettings> {
    const settings = await this.load();
    return {
      text: toPublicProviderSettings(settings.text),
      image: toPublicProviderSettings(settings.image),
    };
  }

  async getRuntimeSettings(): Promise<RuntimeAiSettings> {
    const settings = await this.load();
    return {
      text: { ...settings.text },
      image: { ...settings.image },
    };
  }

  async update(input: AiSettingsUpdate): Promise<PublicAiSettings> {
    const current = await this.load();
    const next: RuntimeAiSettings = {
      text: this.mergeProvider(current.text, input.text),
      image: this.mergeProvider(current.image, input.image),
    };
    await this.save(next);
    this.settings = next;
    return this.getPublicSettings();
  }

  async clearKey(kind: ProviderKind): Promise<PublicAiSettings> {
    const current = await this.load();
    const next: RuntimeAiSettings = {
      text: { ...current.text },
      image: { ...current.image },
    };
    delete next[kind].apiKey;
    await this.save(next);
    this.settings = next;
    return this.getPublicSettings();
  }

  private mergeProvider(current: RuntimeProviderSettings, input: ProviderSettingsInput | undefined): RuntimeProviderSettings {
    if (!input) return { ...current };
    const validated = validateProviderSettings(input);
    return "apiKey" in input
      ? validated
      : { ...validated, apiKey: current.apiKey };
  }

  private async load(): Promise<RuntimeAiSettings> {
    if (this.settings) return this.settings;

    let serialized: string;
    try {
      serialized = await readFile(this.options.filePath, "utf8");
    } catch (error: unknown) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        this.settings = this.validateRuntimeSettings(this.options.defaults);
        return this.settings;
      }
      throw error;
    }

    const stored = JSON.parse(serialized) as StoredAiSettings;
    if (stored.version !== 1) throw new Error("unsupported AI settings version");
    const text = await this.unprotectProvider(stored.text);
    const image = await this.unprotectProvider(stored.image);
    this.settings = { text, image };
    return this.settings;
  }

  private async unprotectProvider(stored: StoredProviderSettings): Promise<RuntimeProviderSettings> {
    const apiKey = stored.protectedKey === undefined
      ? undefined
      : await this.options.protector.unprotect(stored.protectedKey);
    return this.validateRuntimeSettings({
      text: { baseUrl: stored.baseUrl, model: stored.model, apiKey },
      image: { baseUrl: stored.baseUrl, model: stored.model, apiKey },
    }).text;
  }

  private validateRuntimeSettings(settings: RuntimeAiSettings): RuntimeAiSettings {
    return {
      text: validateProviderSettings(settings.text),
      image: validateProviderSettings(settings.image),
    };
  }

  private async save(settings: RuntimeAiSettings): Promise<void> {
    const stored: StoredAiSettings = {
      version: 1,
      text: await this.protectProvider(settings.text),
      image: await this.protectProvider(settings.image),
    };
    await mkdir(dirname(this.options.filePath), { recursive: true });
    const temporaryPath = `${this.options.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(stored, null, 2), "utf8");
    await rename(temporaryPath, this.options.filePath);
  }

  private async protectProvider(settings: RuntimeProviderSettings): Promise<StoredProviderSettings> {
    const protectedKey = settings.apiKey === undefined
      ? undefined
      : await this.options.protector.protect(settings.apiKey);
    return protectedKey === undefined
      ? { baseUrl: settings.baseUrl, model: settings.model }
      : { baseUrl: settings.baseUrl, model: settings.model, protectedKey };
  }
}
