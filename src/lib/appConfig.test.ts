import { describe, expect, it } from "vitest";
import { DEFAULT_APP_CONFIG, parseAppConfig, serializeAppConfig } from "./appConfig";

describe("appConfig", () => {
  it("defaults to real local provider endpoints and keeps cloud providers disabled until configured", () => {
    const ollama = DEFAULT_APP_CONFIG.providers.find((provider) => provider.id === "ollama");
    const lmstudio = DEFAULT_APP_CONFIG.providers.find((provider) => provider.id === "lmstudio");
    const openrouter = DEFAULT_APP_CONFIG.providers.find((provider) => provider.id === "openrouter");

    expect(ollama).toMatchObject({
      enabled: true,
      endpoint: "http://localhost:11434/api/chat",
      model: "llama3.1:8b"
    });
    expect(lmstudio).toMatchObject({
      enabled: false,
      endpoint: "http://localhost:1234/v1/chat/completions"
    });
    expect(openrouter).toMatchObject({
      enabled: false,
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      apiKeyStored: false
    });
  });

  it("falls back to defaults when stored JSON is malformed", () => {
    expect(parseAppConfig("{not-json")).toEqual(DEFAULT_APP_CONFIG);
  });

  it("round trips enabled provider and resume context settings", () => {
    const parsed = parseAppConfig(
      serializeAppConfig({
        ...DEFAULT_APP_CONFIG,
        selectedProviderId: "openrouter",
        resumeContext: "Backend engineer with React projects.",
        providers: DEFAULT_APP_CONFIG.providers.map((provider) =>
          provider.id === "openrouter"
            ? {
                ...provider,
                enabled: true,
                apiKey: "sk-test",
                apiKeyStored: true
              }
            : provider
        )
      })
    );

    expect(parsed.selectedProviderId).toBe("openrouter");
    expect(parsed.resumeContext).toBe("Backend engineer with React projects.");
    expect(parsed.providers.find((provider) => provider.id === "openrouter")).toMatchObject({
      enabled: true,
      apiKey: "sk-test",
      apiKeyStored: true
    });
  });
});
