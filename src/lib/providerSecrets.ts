import type { AppConfig } from "./appConfig";
import { getProviderApiKey } from "./tauri";

export type ProviderSecretLoader = (providerId: string) => Promise<string | undefined>;

export async function hydrateProviderApiKeys(
  config: AppConfig,
  loadSecret: ProviderSecretLoader = getProviderApiKey
): Promise<AppConfig> {
  const providers = await Promise.all(
    config.providers.map(async (provider) => {
      if (provider.kind !== "cloud" || !provider.apiKeyStored) {
        return { ...provider };
      }

      const secret = await loadSecret(provider.id);
      if (!secret?.trim()) {
        const { apiKey: _apiKey, ...providerWithoutSecret } = provider;
        return {
          ...providerWithoutSecret,
          apiKeyStored: false
        };
      }

      return {
        ...provider,
        apiKey: secret,
        apiKeyStored: true
      };
    })
  );

  return {
    ...config,
    providers
  };
}
