import { describe, expect, it } from "vitest";
import { DEFAULT_APP_CONFIG, parseAppConfig, serializeAppConfig } from "./appConfig";

describe("appConfig", () => {
  it("defaults to real local provider endpoints and keeps cloud providers disabled until configured", () => {
    const ollama = DEFAULT_APP_CONFIG.providers.find((provider) => provider.id === "ollama");
    const lmstudio = DEFAULT_APP_CONFIG.providers.find((provider) => provider.id === "lmstudio");
    const openrouter = DEFAULT_APP_CONFIG.providers.find((provider) => provider.id === "openrouter");
    const openai = DEFAULT_APP_CONFIG.providers.find((provider) => provider.id === "openai");
    const anthropic = DEFAULT_APP_CONFIG.providers.find((provider) => provider.id === "anthropic");
    const groq = DEFAULT_APP_CONFIG.providers.find((provider) => provider.id === "groq");
    const google = DEFAULT_APP_CONFIG.providers.find((provider) => provider.id === "google");
    const mistral = DEFAULT_APP_CONFIG.providers.find((provider) => provider.id === "mistral");
    const together = DEFAULT_APP_CONFIG.providers.find((provider) => provider.id === "together");
    const fireworks = DEFAULT_APP_CONFIG.providers.find((provider) => provider.id === "fireworks");

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
    expect(openai).toMatchObject({
      enabled: false,
      endpoint: "https://api.openai.com/v1/chat/completions",
      model: "gpt-4o-mini"
    });
    expect(anthropic).toMatchObject({
      enabled: false,
      endpoint: "https://api.anthropic.com/v1/messages",
      model: "claude-3-5-sonnet-latest"
    });
    expect(groq).toMatchObject({
      enabled: false,
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      model: "llama-3.1-8b-instant"
    });
    expect(google).toMatchObject({
      enabled: false,
      endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent",
      model: "gemini-2.5-flash"
    });
    expect(mistral).toMatchObject({
      enabled: false,
      endpoint: "https://api.mistral.ai/v1/chat/completions",
      model: "mistral-large-latest"
    });
    expect(together).toMatchObject({
      enabled: false,
      endpoint: "https://api.together.ai/v1/chat/completions",
      model: "meta-llama/Llama-3.3-70B-Instruct-Turbo"
    });
    expect(fireworks).toMatchObject({
      enabled: false,
      endpoint: "https://api.fireworks.ai/inference/v1/chat/completions",
      model: "accounts/fireworks/models/llama-v3p1-8b-instruct"
    });
  });

  it("falls back to defaults when stored JSON is malformed", () => {
    expect(parseAppConfig("{not-json")).toEqual(DEFAULT_APP_CONFIG);
  });

  it("round trips enabled provider, stored-key marker, and resume context settings", () => {
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
      apiKeyStored: true
    });
    expect(parsed.providers.find((provider) => provider.id === "openrouter")?.apiKey).toBeUndefined();
  });

  it("round trips saved interview profiles without raw secrets", () => {
    const parsed = parseAppConfig(
      JSON.stringify({
        profiles: [
          {
            id: "system-design",
            name: "System Design",
            interviewType: "system_design",
            providerId: "openrouter",
            sttMode: "deepgram",
            overlay: {
              ...DEFAULT_APP_CONFIG.overlay,
              opacity: 0.7
            },
            shortcuts: {
              ...DEFAULT_APP_CONFIG.shortcuts,
              generateAnswer: "control + shift + y"
            }
          },
          {
            id: "",
            name: "",
            interviewType: "bad",
            providerId: "bad",
            sttMode: "bad"
          }
        ]
      })
    );

    expect(parsed.profiles).toEqual([
      expect.objectContaining({
        id: "system-design",
        name: "System Design",
        interviewType: "system_design",
        providerId: "openrouter",
        sttMode: "deepgram",
        overlay: expect.objectContaining({ opacity: 0.7 }),
        shortcuts: expect.objectContaining({ generateAnswer: "CommandOrControl+Shift+Y" })
      })
    ]);
    expect(serializeAppConfig(parsed)).toContain('"profiles"');
  });

  it("does not serialize raw provider or STT API keys into local settings", () => {
    const serialized = serializeAppConfig({
      ...DEFAULT_APP_CONFIG,
      providers: DEFAULT_APP_CONFIG.providers.map((provider) =>
        provider.id === "openrouter"
          ? {
              ...provider,
              enabled: true,
              apiKey: "sk-openrouter-secret",
              apiKeyStored: true
            }
          : provider
      ),
      stt: {
        ...DEFAULT_APP_CONFIG.stt,
        apiKey: "dg-secret",
        apiKeyStored: true
      }
    });

    expect(serialized).not.toContain("sk-openrouter-secret");
    expect(serialized).not.toContain("dg-secret");
    expect(JSON.parse(serialized)).toMatchObject({
      providers: expect.arrayContaining([
        expect.objectContaining({
          id: "openrouter",
          apiKeyStored: true
        })
      ]),
      stt: expect.objectContaining({
        apiKeyStored: true
      })
    });
  });

  it("defaults live interview features to safe local-first settings", () => {
    const config = parseAppConfig(undefined);

    expect(config.audio).toMatchObject({
      captureMode: "manual",
      dualStreamEnabled: false,
      microphoneDeviceId: "default",
      systemDeviceId: "default",
      gainDb: 0,
      noiseGateDb: -45
    });
    expect(config.stt).toMatchObject({
      selectedMode: "manual",
      diarizationEnabled: true,
      language: "en",
      speakerCalibration: {
        systemAudioSpeaker: "interviewer",
        microphoneSpeaker: "candidate",
        providerSpeaker0: "interviewer",
        providerSpeaker1: "candidate",
        preferProviderDiarization: true
      }
    });
    expect(config.autoTrigger).toMatchObject({
      mode: "manual",
      silenceTimeoutMs: 1200,
      duplicateWindowMs: 30000,
      requireInterviewerSpeaker: true
    });
    expect(config.ocr).toMatchObject({
      enabled: false,
      provider: "disabled",
      reviewBeforeSend: true
    });
    expect(config.security).toMatchObject({
      localOnlyMode: false,
      captureExclusionEnabled: true,
      blockCloudWhenLocalOnly: true
    });
    expect(config.overlay).toMatchObject({
      opacity: 0.82,
      fontSize: 16,
      locked: false,
      hotkey: "CommandOrControl+Shift+H",
      autoHideOnScreenShare: false,
      bounds: {
        x: 80,
        y: 80,
        width: 680,
        height: 420
      }
    });
    expect(config.shortcuts).toMatchObject({
      overlayToggle: "CommandOrControl+Shift+H",
      captureToggle: "CommandOrControl+Shift+S",
      generateAnswer: "CommandOrControl+Shift+G",
      typeLatestAnswer: "CommandOrControl+Shift+T"
    });
  });

  it("sanitizes invalid live feature settings while preserving valid values", () => {
    const parsed = parseAppConfig(
      JSON.stringify({
        audio: {
          captureMode: "dual",
          dualStreamEnabled: true,
          microphoneDeviceId: "mic-7",
          systemDeviceId: "speaker-loopback",
          gainDb: 18,
          noiseGateDb: 10
        },
        stt: {
          selectedMode: "deepgram",
          language: "hi",
          diarizationEnabled: false,
          speakerCalibration: {
            systemAudioSpeaker: "candidate",
            microphoneSpeaker: "bad",
            providerSpeaker0: "candidate",
            providerSpeaker1: "interviewer",
            preferProviderDiarization: false
          }
        },
        autoTrigger: {
          mode: "suggest_on_question",
          silenceTimeoutMs: 350,
          duplicateWindowMs: -1,
          requireInterviewerSpeaker: false
        },
        tts: {
          enabled: true,
          rate: 5,
          volume: 4,
          muteInStealth: false
        },
        overlay: {
          opacity: 0.02,
          fontSize: 64,
          locked: true,
          hotkey: "control + alt + space",
          autoHideOnScreenShare: true,
          bounds: {
            x: -1920,
            y: 40,
            width: 120,
            height: 90
          }
        },
        shortcuts: {
          overlayToggle: "control + alt + h",
          captureToggle: "control + alt + s",
          generateAnswer: "control + alt + g",
          typeLatestAnswer: "control + alt + t"
        }
      })
    );

    expect(parsed.audio).toMatchObject({
      captureMode: "dual",
      dualStreamEnabled: true,
      microphoneDeviceId: "mic-7",
      systemDeviceId: "speaker-loopback",
      gainDb: 12,
      noiseGateDb: -45
    });
    expect(parsed.stt).toMatchObject({
      selectedMode: "deepgram",
      language: "hi",
      diarizationEnabled: false,
      speakerCalibration: {
        systemAudioSpeaker: "candidate",
        microphoneSpeaker: "candidate",
        providerSpeaker0: "candidate",
        providerSpeaker1: "interviewer",
        preferProviderDiarization: false
      }
    });
    expect(parsed.autoTrigger).toMatchObject({
      mode: "suggest_on_question",
      silenceTimeoutMs: 500,
      duplicateWindowMs: 30000,
      requireInterviewerSpeaker: false
    });
    expect(parsed.tts).toMatchObject({
      enabled: true,
      rate: 2,
      volume: 1,
      muteInStealth: false
    });
    expect(parsed.overlay).toMatchObject({
      opacity: 0.1,
      fontSize: 28,
      locked: true,
      hotkey: "CommandOrControl+Alt+Space",
      autoHideOnScreenShare: true,
      bounds: {
        x: -1920,
        y: 40,
        width: 320,
        height: 180
      }
    });
    expect(parsed.shortcuts).toMatchObject({
      overlayToggle: "CommandOrControl+Alt+H",
      captureToggle: "CommandOrControl+Alt+S",
      generateAnswer: "CommandOrControl+Alt+G",
      typeLatestAnswer: "CommandOrControl+Alt+T"
    });
  });
});
