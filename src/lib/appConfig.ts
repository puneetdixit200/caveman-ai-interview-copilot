import type {
  AudioCaptureMode,
  AudioSettings,
  AutoTriggerMode,
  AutoTriggerSettings,
  ModelProviderConfig,
  OcrProvider,
  OcrSettings,
  OverlaySettings,
  PluginSettings,
  ProviderId,
  SecuritySettings,
  ShortcutSettings,
  SttMode,
  SttSettings,
  TtsSettings
} from "../types/settings";
import {
  DEFAULT_CAPTURE_SHORTCUT,
  DEFAULT_GENERATE_SHORTCUT,
  DEFAULT_OVERLAY_SHORTCUT,
  normalizeShortcut
} from "./hotkeys";

export interface AppConfig {
  selectedProviderId: ProviderId;
  resumeContext: string;
  jobDescriptionContext: string;
  providers: ModelProviderConfig[];
  audio: AudioSettings;
  stt: SttSettings;
  autoTrigger: AutoTriggerSettings;
  ocr: OcrSettings;
  tts: TtsSettings;
  overlay: OverlaySettings;
  shortcuts: ShortcutSettings;
  security: SecuritySettings;
  plugins: PluginSettings;
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
    },
    {
      id: "openai",
      label: "OpenAI",
      kind: "cloud",
      endpoint: "https://api.openai.com/v1/chat/completions",
      model: "gpt-4o-mini",
      enabled: false,
      apiKeyStored: false
    },
    {
      id: "anthropic",
      label: "Anthropic",
      kind: "cloud",
      endpoint: "https://api.anthropic.com/v1/messages",
      model: "claude-3-5-sonnet-latest",
      enabled: false,
      apiKeyStored: false
    },
    {
      id: "groq",
      label: "Groq",
      kind: "cloud",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      model: "llama-3.1-8b-instant",
      enabled: false,
      apiKeyStored: false
    }
  ],
  audio: {
    captureMode: "manual",
    dualStreamEnabled: false,
    systemDeviceId: "default",
    microphoneDeviceId: "default",
    virtualDeviceId: "default",
    noiseGateDb: -45,
    gainDb: 0,
    sttMode: "manual",
    meterSmoothing: 0.35
  },
  stt: {
    selectedMode: "manual",
    language: "en",
    diarizationEnabled: true,
    localWhisperBinaryPath: "",
    localWhisperModelPath: "",
    cloudEndpoint: "",
    apiKeyStored: false
  },
  autoTrigger: {
    mode: "manual",
    silenceTimeoutMs: 1200,
    duplicateWindowMs: 30000,
    minQuestionCharacters: 12,
    requireInterviewerSpeaker: true
  },
  ocr: {
    enabled: false,
    provider: "disabled",
    includeInPrompt: false,
    reviewBeforeSend: true,
    lastText: "",
    lastCapturedAtMs: undefined
  },
  tts: {
    enabled: false,
    autoPlay: false,
    voice: "default",
    language: "en-US",
    rate: 1,
    volume: 0.8,
    muteInStealth: true
  },
  overlay: {
    opacity: 0.82,
    fontSize: 16,
    locked: false,
    hotkey: DEFAULT_OVERLAY_SHORTCUT,
    autoHideOnScreenShare: false,
    bounds: {
      x: 80,
      y: 80,
      width: 680,
      height: 420
    }
  },
  shortcuts: {
    overlayToggle: DEFAULT_OVERLAY_SHORTCUT,
    captureToggle: DEFAULT_CAPTURE_SHORTCUT,
    generateAnswer: DEFAULT_GENERATE_SHORTCUT
  },
  security: {
    localOnlyMode: false,
    captureExclusionEnabled: true,
    blockCloudWhenLocalOnly: true,
    signedUpdatesRequired: false
  },
  plugins: {
    enabled: false,
    directory: "",
    allowPromptTemplates: true,
    allowExportFormats: true,
    allowPracticePacks: true
  }
};

export function parseAppConfig(raw: string | null | undefined): AppConfig {
  if (!raw?.trim()) {
    return cloneConfig(DEFAULT_APP_CONFIG);
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    const providers = mergeProviders(parsed.providers);
    const selectedProviderId =
      isProviderId(parsed.selectedProviderId) && providers.some((provider) => provider.id === parsed.selectedProviderId)
        ? parsed.selectedProviderId
        : DEFAULT_APP_CONFIG.selectedProviderId;

    const overlay = mergeOverlaySettings(parsed.overlay);

    return {
      selectedProviderId,
      resumeContext: typeof parsed.resumeContext === "string" ? parsed.resumeContext : "",
      jobDescriptionContext:
        typeof parsed.jobDescriptionContext === "string" ? parsed.jobDescriptionContext : "",
      providers,
      audio: mergeAudioSettings(parsed.audio),
      stt: mergeSttSettings(parsed.stt),
      autoTrigger: mergeAutoTriggerSettings(parsed.autoTrigger),
      ocr: mergeOcrSettings(parsed.ocr),
      tts: mergeTtsSettings(parsed.tts),
      overlay,
      shortcuts: mergeShortcutSettings(parsed.shortcuts, overlay.hotkey),
      security: mergeSecuritySettings(parsed.security),
      plugins: mergePluginSettings(parsed.plugins)
    };
  } catch {
    return cloneConfig(DEFAULT_APP_CONFIG);
  }
}

export function serializeAppConfig(config: AppConfig): string {
  return JSON.stringify(sanitizeAppConfigForStorage(config), null, 2);
}

export function sanitizeAppConfigForStorage(config: AppConfig): AppConfig {
  const sanitized = cloneConfig(config);

  sanitized.providers = sanitized.providers.map((provider) => {
    const { apiKey: _apiKey, ...providerWithoutSecret } = provider;
    return providerWithoutSecret;
  });

  const { apiKey: _sttApiKey, ...sttWithoutSecret } = sanitized.stt;
  sanitized.stt = sttWithoutSecret;

  return sanitized;
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
    providers: config.providers.map((provider) => ({ ...provider })),
    audio: { ...config.audio },
    stt: { ...config.stt },
    autoTrigger: { ...config.autoTrigger },
    ocr: { ...config.ocr },
    tts: { ...config.tts },
    overlay: { ...config.overlay },
    shortcuts: { ...config.shortcuts },
    security: { ...config.security },
    plugins: { ...config.plugins }
  };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function isProviderId(value: unknown): value is ProviderId {
  return DEFAULT_APP_CONFIG.providers.some((provider) => provider.id === value);
}

function mergeAudioSettings(raw: unknown): AudioSettings {
  const value = isObject(raw) ? raw : {};
  return {
    ...DEFAULT_APP_CONFIG.audio,
    captureMode: isAudioCaptureMode(value.captureMode) ? value.captureMode : DEFAULT_APP_CONFIG.audio.captureMode,
    dualStreamEnabled:
      typeof value.dualStreamEnabled === "boolean"
        ? value.dualStreamEnabled
        : DEFAULT_APP_CONFIG.audio.dualStreamEnabled,
    systemDeviceId: readString(value.systemDeviceId, DEFAULT_APP_CONFIG.audio.systemDeviceId),
    microphoneDeviceId: readString(value.microphoneDeviceId, DEFAULT_APP_CONFIG.audio.microphoneDeviceId),
    virtualDeviceId: readString(value.virtualDeviceId, DEFAULT_APP_CONFIG.audio.virtualDeviceId ?? "default"),
    gainDb: clampNumber(value.gainDb, -24, 12, DEFAULT_APP_CONFIG.audio.gainDb),
    noiseGateDb: readNoiseGateDb(value.noiseGateDb, DEFAULT_APP_CONFIG.audio.noiseGateDb),
    sttMode: isSttMode(value.sttMode) ? value.sttMode : DEFAULT_APP_CONFIG.audio.sttMode,
    meterSmoothing: clampNumber(value.meterSmoothing, 0, 0.95, DEFAULT_APP_CONFIG.audio.meterSmoothing)
  };
}

function mergeSttSettings(raw: unknown): SttSettings {
  const value = isObject(raw) ? raw : {};
  return {
    ...DEFAULT_APP_CONFIG.stt,
    selectedMode: isSttMode(value.selectedMode) ? value.selectedMode : DEFAULT_APP_CONFIG.stt.selectedMode,
    language: readString(value.language, DEFAULT_APP_CONFIG.stt.language),
    diarizationEnabled:
      typeof value.diarizationEnabled === "boolean"
        ? value.diarizationEnabled
        : DEFAULT_APP_CONFIG.stt.diarizationEnabled,
    localWhisperBinaryPath: readString(
      value.localWhisperBinaryPath,
      DEFAULT_APP_CONFIG.stt.localWhisperBinaryPath
    ),
    localWhisperModelPath: readString(value.localWhisperModelPath, DEFAULT_APP_CONFIG.stt.localWhisperModelPath),
    cloudEndpoint: readString(value.cloudEndpoint, DEFAULT_APP_CONFIG.stt.cloudEndpoint),
    apiKeyStored: typeof value.apiKeyStored === "boolean" ? value.apiKeyStored : DEFAULT_APP_CONFIG.stt.apiKeyStored,
    apiKey: typeof value.apiKey === "string" ? value.apiKey : DEFAULT_APP_CONFIG.stt.apiKey
  };
}

function mergeAutoTriggerSettings(raw: unknown): AutoTriggerSettings {
  const value = isObject(raw) ? raw : {};
  return {
    ...DEFAULT_APP_CONFIG.autoTrigger,
    mode: isAutoTriggerMode(value.mode) ? value.mode : DEFAULT_APP_CONFIG.autoTrigger.mode,
    silenceTimeoutMs: clampNumber(
      value.silenceTimeoutMs,
      500,
      10000,
      DEFAULT_APP_CONFIG.autoTrigger.silenceTimeoutMs
    ),
    duplicateWindowMs: readPositiveWindow(
      value.duplicateWindowMs,
      1000,
      300000,
      DEFAULT_APP_CONFIG.autoTrigger.duplicateWindowMs
    ),
    minQuestionCharacters: clampNumber(
      value.minQuestionCharacters,
      4,
      200,
      DEFAULT_APP_CONFIG.autoTrigger.minQuestionCharacters
    ),
    requireInterviewerSpeaker:
      typeof value.requireInterviewerSpeaker === "boolean"
        ? value.requireInterviewerSpeaker
        : DEFAULT_APP_CONFIG.autoTrigger.requireInterviewerSpeaker
  };
}

function mergeOcrSettings(raw: unknown): OcrSettings {
  const value = isObject(raw) ? raw : {};
  return {
    ...DEFAULT_APP_CONFIG.ocr,
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_APP_CONFIG.ocr.enabled,
    provider: isOcrProvider(value.provider) ? value.provider : DEFAULT_APP_CONFIG.ocr.provider,
    includeInPrompt:
      typeof value.includeInPrompt === "boolean" ? value.includeInPrompt : DEFAULT_APP_CONFIG.ocr.includeInPrompt,
    reviewBeforeSend:
      typeof value.reviewBeforeSend === "boolean"
        ? value.reviewBeforeSend
        : DEFAULT_APP_CONFIG.ocr.reviewBeforeSend,
    lastText: readString(value.lastText, DEFAULT_APP_CONFIG.ocr.lastText ?? ""),
    lastCapturedAtMs:
      typeof value.lastCapturedAtMs === "number" && !Number.isNaN(value.lastCapturedAtMs)
        ? value.lastCapturedAtMs
        : DEFAULT_APP_CONFIG.ocr.lastCapturedAtMs
  };
}

function mergeTtsSettings(raw: unknown): TtsSettings {
  const value = isObject(raw) ? raw : {};
  return {
    ...DEFAULT_APP_CONFIG.tts,
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_APP_CONFIG.tts.enabled,
    autoPlay: typeof value.autoPlay === "boolean" ? value.autoPlay : DEFAULT_APP_CONFIG.tts.autoPlay,
    voice: readString(value.voice, DEFAULT_APP_CONFIG.tts.voice),
    language: readString(value.language, DEFAULT_APP_CONFIG.tts.language),
    rate: clampNumber(value.rate, 0.5, 2, DEFAULT_APP_CONFIG.tts.rate),
    volume: clampNumber(value.volume, 0, 1, DEFAULT_APP_CONFIG.tts.volume),
    muteInStealth:
      typeof value.muteInStealth === "boolean" ? value.muteInStealth : DEFAULT_APP_CONFIG.tts.muteInStealth
  };
}

function mergeOverlaySettings(raw: unknown): OverlaySettings {
  const value = isObject(raw) ? raw : {};
  const normalizedHotkey = normalizeShortcut(readString(value.hotkey, DEFAULT_APP_CONFIG.overlay.hotkey));

  return {
    ...DEFAULT_APP_CONFIG.overlay,
    opacity: clampNumber(value.opacity, 0.1, 1, DEFAULT_APP_CONFIG.overlay.opacity),
    fontSize: Math.round(clampNumber(value.fontSize, 12, 28, DEFAULT_APP_CONFIG.overlay.fontSize)),
    locked: typeof value.locked === "boolean" ? value.locked : DEFAULT_APP_CONFIG.overlay.locked,
    hotkey: normalizedHotkey || DEFAULT_APP_CONFIG.overlay.hotkey,
    autoHideOnScreenShare:
      typeof value.autoHideOnScreenShare === "boolean"
        ? value.autoHideOnScreenShare
        : DEFAULT_APP_CONFIG.overlay.autoHideOnScreenShare,
    bounds: mergeOverlayBounds(value.bounds)
  };
}

function mergeOverlayBounds(raw: unknown): OverlaySettings["bounds"] {
  const value = isObject(raw) ? raw : {};

  return {
    x: clampInteger(value.x, -100_000, 100_000, DEFAULT_APP_CONFIG.overlay.bounds.x),
    y: clampInteger(value.y, -100_000, 100_000, DEFAULT_APP_CONFIG.overlay.bounds.y),
    width: clampInteger(value.width, 320, 2_400, DEFAULT_APP_CONFIG.overlay.bounds.width),
    height: clampInteger(value.height, 180, 1_600, DEFAULT_APP_CONFIG.overlay.bounds.height),
    monitorName: typeof value.monitorName === "string" && value.monitorName.trim() ? value.monitorName : undefined
  };
}

function mergeShortcutSettings(raw: unknown, overlayHotkey: string): ShortcutSettings {
  const value = isObject(raw) ? raw : {};
  return {
    overlayToggle: readShortcut(value.overlayToggle, overlayHotkey || DEFAULT_OVERLAY_SHORTCUT),
    captureToggle: readShortcut(value.captureToggle, DEFAULT_CAPTURE_SHORTCUT),
    generateAnswer: readShortcut(value.generateAnswer, DEFAULT_GENERATE_SHORTCUT)
  };
}

function mergeSecuritySettings(raw: unknown): SecuritySettings {
  const value = isObject(raw) ? raw : {};
  return {
    ...DEFAULT_APP_CONFIG.security,
    localOnlyMode:
      typeof value.localOnlyMode === "boolean" ? value.localOnlyMode : DEFAULT_APP_CONFIG.security.localOnlyMode,
    captureExclusionEnabled:
      typeof value.captureExclusionEnabled === "boolean"
        ? value.captureExclusionEnabled
        : DEFAULT_APP_CONFIG.security.captureExclusionEnabled,
    blockCloudWhenLocalOnly:
      typeof value.blockCloudWhenLocalOnly === "boolean"
        ? value.blockCloudWhenLocalOnly
        : DEFAULT_APP_CONFIG.security.blockCloudWhenLocalOnly,
    signedUpdatesRequired:
      typeof value.signedUpdatesRequired === "boolean"
        ? value.signedUpdatesRequired
        : DEFAULT_APP_CONFIG.security.signedUpdatesRequired
  };
}

function mergePluginSettings(raw: unknown): PluginSettings {
  const value = isObject(raw) ? raw : {};
  return {
    ...DEFAULT_APP_CONFIG.plugins,
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_APP_CONFIG.plugins.enabled,
    directory: readString(value.directory, DEFAULT_APP_CONFIG.plugins.directory),
    allowPromptTemplates:
      typeof value.allowPromptTemplates === "boolean"
        ? value.allowPromptTemplates
        : DEFAULT_APP_CONFIG.plugins.allowPromptTemplates,
    allowExportFormats:
      typeof value.allowExportFormats === "boolean"
        ? value.allowExportFormats
        : DEFAULT_APP_CONFIG.plugins.allowExportFormats,
    allowPracticePacks:
      typeof value.allowPracticePacks === "boolean"
        ? value.allowPracticePacks
        : DEFAULT_APP_CONFIG.plugins.allowPracticePacks
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readShortcut(value: unknown, fallback: string): string {
  const normalized = normalizeShortcut(readString(value, fallback));
  return normalized || fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clampNumber(value, min, max, fallback));
}

function readNoiseGateDb(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value) || value > 0 || value < -80) {
    return fallback;
  }

  return value;
}

function readPositiveWindow(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function isAudioCaptureMode(value: unknown): value is AudioCaptureMode {
  return value === "manual" || value === "microphone" || value === "system" || value === "dual";
}

function isSttMode(value: unknown): value is SttMode {
  return value === "manual" || value === "local_whisper" || value === "deepgram" || value === "assemblyai" || value === "google";
}

function isAutoTriggerMode(value: unknown): value is AutoTriggerMode {
  return value === "manual" || value === "suggest_on_question" || value === "continuous_coach";
}

function isOcrProvider(value: unknown): value is OcrProvider {
  return value === "disabled" || value === "local_tesseract" || value === "windows_ocr" || value === "cloud";
}
