import { describe, expect, it } from "vitest";
import { DEFAULT_APP_CONFIG } from "./appConfig";
import { hydrateProviderApiKeys } from "./providerSecrets";

describe("providerSecrets", () => {
  it("hydrates stored cloud provider API keys from the secret store for runtime use", async () => {
    const config = {
      ...DEFAULT_APP_CONFIG,
      providers: DEFAULT_APP_CONFIG.providers.map((provider) =>
        provider.id === "openrouter"
          ? {
              ...provider,
              enabled: true,
              apiKeyStored: true
            }
          : provider
      )
    };

    const hydrated = await hydrateProviderApiKeys(config, async (providerId) =>
      providerId === "openrouter" ? "sk-runtime-only" : undefined
    );

    expect(hydrated.providers.find((provider) => provider.id === "openrouter")).toMatchObject({
      apiKey: "sk-runtime-only",
      apiKeyStored: true
    });
    expect(hydrated.providers.find((provider) => provider.id === "ollama")?.apiKey).toBeUndefined();
  });

  it("marks a cloud provider as not stored when the keychain has no key", async () => {
    const config = {
      ...DEFAULT_APP_CONFIG,
      providers: DEFAULT_APP_CONFIG.providers.map((provider) =>
        provider.id === "openrouter"
          ? {
              ...provider,
              apiKey: "legacy-local-secret",
              apiKeyStored: true
            }
          : provider
      )
    };

    const hydrated = await hydrateProviderApiKeys(config, async () => undefined);

    expect(hydrated.providers.find((provider) => provider.id === "openrouter")).toMatchObject({
      apiKeyStored: false
    });
    expect(hydrated.providers.find((provider) => provider.id === "openrouter")?.apiKey).toBeUndefined();
  });
});
