import { describe, expect, it } from "vitest";
import { DEFAULT_APP_CONFIG } from "./appConfig";
import { selectRunnableProviders } from "./providerSelection";

describe("providerSelection", () => {
  it("orders the selected enabled provider first", () => {
    const providers = selectRunnableProviders({
      ...DEFAULT_APP_CONFIG,
      selectedProviderId: "openrouter",
      providers: DEFAULT_APP_CONFIG.providers.map((provider) => ({
        ...provider,
        enabled: provider.id === "ollama" || provider.id === "openrouter"
      }))
    });

    expect(providers.map((provider) => provider.id)).toEqual(["openrouter", "ollama"]);
  });

  it("blocks cloud providers when local-only mode is enabled", () => {
    const providers = selectRunnableProviders({
      ...DEFAULT_APP_CONFIG,
      selectedProviderId: "openrouter",
      security: { ...DEFAULT_APP_CONFIG.security, localOnlyMode: true, blockCloudWhenLocalOnly: true },
      providers: DEFAULT_APP_CONFIG.providers.map((provider) => ({
        ...provider,
        enabled: true
      }))
    });

    expect(providers.every((provider) => provider.kind === "local")).toBe(true);
    expect(providers.map((provider) => provider.id)).toEqual(["ollama", "lmstudio"]);
  });
});
