import type { ModelProviderConfig, ProviderId } from "../types/settings";

export interface AppConfig {
  selectedProviderId: ProviderId;
  resumeContext: string;
  jobDescriptionContext: string;
  providers: ModelProviderConfig[];
}

export const APP_CONFIG_SETTING_KEY = "app.config";

export const DEFAULT_APP_CONFIG: AppConfig = {
  selectedProviderId: "ollama",
  resumeContext: "",
  jobDescriptionContext: "",
  providers: [
    {
      id: "ollama",
      label: "Ollama",
      kind: "local",
      endpoint: "http://localhost:11434/api/chat",
      model: "llama3.1:8b",
      enabled: true,
      apiKeyStored: false
    },
    {
      id: "lmstudio",
      label: "LM Studio",
      kind: "local",
      endpoint: "http://localhost:1234/v1/chat/completions",
      model: "local-model",
      enabled: false,
      apiKeyStored: false
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      kind: "cloud",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      model: "openai/gpt-4o-mini",
      enabled: false,
      apiKeyStored: false
    }
  ]
};

export function parseAppConfig(raw: string | null | undefined): AppConfig {
  if (!raw?.trim()) {
    return cloneConfig(DEFAULT_APP_CONFIG);
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    const providers = mergeProviders(parsed.providers);
    const selectedProviderId = providers.some((provider) => provider.id === parsed.selectedProviderId)
      ? parsed.selectedProviderId
      : DEFAULT_APP_CONFIG.selectedProviderId;

    return {
      selectedProviderId,
      resumeContext: typeof parsed.resumeContext === "string" ? parsed.resumeContext : "",
      jobDescriptionContext:
        typeof parsed.jobDescriptionContext === "string" ? parsed.jobDescriptionContext : "",
      providers
    };
  } catch {
    return cloneConfig(DEFAULT_APP_CONFIG);
  }
}

export function serializeAppConfig(config: AppConfig): string {
  return JSON.stringify(config, null, 2);
}

function mergeProviders(rawProviders: unknown): ModelProviderConfig[] {
  if (!Array.isArray(rawProviders)) {
    return cloneConfig(DEFAULT_APP_CONFIG).providers;
  }

  return DEFAULT_APP_CONFIG.providers.map((defaultProvider) => {
    const matching = rawProviders.find(
      (provider): provider is Partial<ModelProviderConfig> =>
        typeof provider === "object" && provider !== null && "id" in provider && provider.id === defaultProvider.id
    );

    return {
      ...defaultProvider,
      ...matching,
      id: defaultProvider.id,
      label: typeof matching?.label === "string" ? matching.label : defaultProvider.label,
      kind: defaultProvider.kind,
      endpoint: typeof matching?.endpoint === "string" ? matching.endpoint : defaultProvider.endpoint,
      model: typeof matching?.model === "string" ? matching.model : defaultProvider.model,
      enabled: typeof matching?.enabled === "boolean" ? matching.enabled : defaultProvider.enabled,
      apiKeyStored:
        typeof matching?.apiKeyStored === "boolean" ? matching.apiKeyStored : defaultProvider.apiKeyStored,
      apiKey: typeof matching?.apiKey === "string" ? matching.apiKey : defaultProvider.apiKey,
      headers: isStringRecord(matching?.headers) ? matching.headers : defaultProvider.headers
    };
  });
}

function cloneConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    providers: config.providers.map((provider) => ({ ...provider }))
  };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}
