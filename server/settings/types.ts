export interface ProviderSettingsInput {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface PublicProviderSettings {
  baseUrl: string;
  model: string;
  hasKey: boolean;
  keyMask: string | null;
}

export interface RuntimeProviderSettings {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface PublicAiSettings {
  text: PublicProviderSettings;
  image: PublicProviderSettings;
}

export interface RuntimeAiSettings {
  text: RuntimeProviderSettings;
  image: RuntimeProviderSettings;
}

export interface AiSettingsUpdate {
  text?: ProviderSettingsInput;
  image?: ProviderSettingsInput;
}
