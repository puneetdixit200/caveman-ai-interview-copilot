import type { AppConfig } from "./appConfig";
import { selectRunnableProviders } from "./providerSelection";
import type { AudioDevice, ModelProviderConfig, SttMode } from "../types/settings";

export type ReadinessStatus = "ready" | "warning" | "blocked";

export interface ReadinessItem {
  id: "audio" | "stt" | "provider" | "automation" | "overlay" | "privacy" | "performance";
  label: string;
  status: ReadinessStatus;
  detail: string;
  action?: string;
}

export interface RuntimeBudgetStatus {
  startupMs: number;
  workingSetMb?: number | null;
  processCpuPercent?: number | null;
  startupTargetMs: number;
  memoryTargetMb: number;
  idleCpuTargetPercent: number;
  activeCpuTargetPercent: number;
  sampleCount?: number;
  source?: string;
  message?: string | null;
}

export interface RealUseReadiness {
  overallStatus: ReadinessStatus;
  readyCount: number;
  warningCount: number;
  blockedCount: number;
  items: ReadinessItem[];
}

export interface RealUseReadinessInput {
  config: AppConfig;
  audioDevices: AudioDevice[];
  overlayProtection?: {
    captureExclusion?: string | null;
  } | null;
  runtimeBudget?: RuntimeBudgetStatus | null;
}

const CLOUD_STT_LABELS: Record<Extract<SttMode, "deepgram" | "assemblyai" | "google">, string> = {
  deepgram: "Deepgram",
  assemblyai: "AssemblyAI",
  google: "Google STT"
};

export function evaluateRealUseReadiness(input: RealUseReadinessInput): RealUseReadiness {
  const items = [
    evaluateAudioReadiness(input.config, input.audioDevices),
    evaluateSttReadiness(input.config),
    evaluateProviderReadiness(input.config),
    evaluateAutomationReadiness(input.config),
    evaluateOverlayReadiness(input.config, input.overlayProtection),
    evaluatePrivacyReadiness(input.config),
    evaluateRuntimeBudgetReadiness(input.runtimeBudget)
  ];
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const warningCount = items.filter((item) => item.status === "warning").length;
  const readyCount = items.filter((item) => item.status === "ready").length;

  return {
    overallStatus: blockedCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "ready",
    readyCount,
    warningCount,
    blockedCount,
    items
  };
}

function evaluateAudioReadiness(config: AppConfig, audioDevices: AudioDevice[]): ReadinessItem {
  const mode = config.audio.captureMode;
  if (mode === "manual") {
    return {
      id: "audio",
      label: "Manual audio capture",
      status: "warning",
      detail: "Manual transcript mode works, but it will not listen to a real call.",
      action: "Switch Audio capture mode to Microphone, System, or Dual before a live call."
    };
  }

  if (mode === "dual" && !config.audio.dualStreamEnabled) {
    return {
      id: "audio",
      label: "Dual stream disabled",
      status: "blocked",
      detail: "Dual capture mode needs both microphone and system streams enabled.",
      action: "Enable Dual stream separation or choose a single capture source."
    };
  }

  const needsMicrophone = mode === "microphone" || mode === "dual";
  const needsSystem = mode === "system" || mode === "dual";
  const microphoneReady =
    !needsMicrophone || deviceAvailable(audioDevices, "microphone", config.audio.microphoneDeviceId);
  const systemReady = !needsSystem || deviceAvailable(audioDevices, "system", config.audio.systemDeviceId);

  if (!microphoneReady || !systemReady) {
    return {
      id: "audio",
      label: "Audio device missing",
      status: "blocked",
      detail: missingAudioDetail({ needsMicrophone, needsSystem, microphoneReady, systemReady }),
      action: "Open Audio And STT settings, refresh devices, and choose available microphone/system devices."
    };
  }

  if (needsSystem && config.audio.applicationTargetId !== "all-system-audio") {
    return {
      id: "audio",
      label: "App-aware system capture",
      status: "warning",
      detail: `${config.audio.applicationTargetLabel} is selected, but Windows system capture may still include all output from the chosen device.`,
      action: "Use a virtual cable or dedicated output device when you need strict app/tab isolation."
    };
  }

  return {
    id: "audio",
    label: mode === "dual" ? "Dual audio capture ready" : `${capitalize(mode)} capture ready`,
    status: "ready",
    detail: mode === "dual" ? "Microphone and system streams are configured separately." : "A live audio source is configured."
  };
}

function evaluateSttReadiness(config: AppConfig): ReadinessItem {
  const mode = config.stt.selectedMode;
  if (mode === "manual") {
    return {
      id: "stt",
      label: "Manual transcript mode",
      status: "warning",
      detail: "Automatic transcription is disabled.",
      action: "Choose Local Whisper or a cloud STT provider for live transcription."
    };
  }

  if (mode === "local_whisper") {
    const hasBinary = Boolean(config.stt.localWhisperBinaryPath.trim());
    const hasModel = Boolean(config.stt.localWhisperModelPath.trim());
    if (!hasBinary || !hasModel) {
      return {
        id: "stt",
        label: "Local Whisper incomplete",
        status: "blocked",
        detail: "Local Whisper needs both a whisper.cpp binary and a ggml model file.",
        action: "Set both Whisper binary and ggml model paths, or run Auto Detect Whisper."
      };
    }

    return {
      id: "stt",
      label: "Local Whisper ready",
      status: "ready",
      detail: "Offline STT has a configured binary and model path."
    };
  }

  if (config.security.localOnlyMode && config.security.blockCloudWhenLocalOnly) {
    return {
      id: "stt",
      label: `${CLOUD_STT_LABELS[mode]} blocked`,
      status: "blocked",
      detail: "Local-only mode blocks cloud transcription requests.",
      action: "Use Local Whisper or turn off local-only blocking before using cloud STT."
    };
  }

  const hasKey = Boolean(config.stt.apiKey?.trim() || config.stt.apiKeyStored);
  if (!hasKey) {
    return {
      id: "stt",
      label: `${CLOUD_STT_LABELS[mode]} key missing`,
      status: "blocked",
      detail: `${CLOUD_STT_LABELS[mode]} needs an API key stored before live STT can start.`,
      action: `Save a ${CLOUD_STT_LABELS[mode]} key in the OS keychain before starting cloud STT.`
    };
  }

  return {
    id: "stt",
    label: `${CLOUD_STT_LABELS[mode]} ready`,
    status: "ready",
    detail: "Cloud STT is selected and has a stored key."
  };
}

function evaluateProviderReadiness(config: AppConfig): ReadinessItem {
  const selectedProvider = config.providers.find((provider) => provider.id === config.selectedProviderId);
  const runnableProviders = selectRunnableProviders(config).filter(providerUsable);

  if (!selectedProvider) {
    return {
      id: "provider",
      label: "AI provider missing",
      status: "blocked",
      detail: "The selected provider does not exist in the provider list.",
      action: "Choose a primary provider in Provider Router settings."
    };
  }

  if (
    selectedProvider.kind === "cloud" &&
    config.security.localOnlyMode &&
    config.security.blockCloudWhenLocalOnly &&
    runnableProviders.length === 0
  ) {
    return {
      id: "provider",
      label: "Cloud AI blocked",
      status: "blocked",
      detail: `${selectedProvider.label} is selected, but local-only mode blocks cloud AI requests and no local fallback is enabled.`,
      action: "Enable a local provider or turn off local-only blocking before using cloud AI."
    };
  }

  if (!selectedProvider.enabled && runnableProviders.length > 0) {
    return {
      id: "provider",
      label: "Primary provider disabled",
      status: "warning",
      detail: `${selectedProvider.label} is disabled; Caveman will try ${runnableProviders[0].label} instead.`,
      action: "Enable the primary provider or choose the provider you want to use first."
    };
  }

  if (runnableProviders.length === 0) {
    return {
      id: "provider",
      label: "No runnable AI provider",
      status: "blocked",
      detail: "No enabled provider has enough endpoint, model, and key configuration to generate answers.",
      action: "Enable Ollama/LM Studio locally or save a cloud provider key."
    };
  }

  const selectedUsable = selectedProvider.enabled && providerUsable(selectedProvider);
  if (!selectedUsable) {
    return {
      id: "provider",
      label: "Primary provider incomplete",
      status: "warning",
      detail: `${selectedProvider.label} is not fully configured; Caveman will try ${runnableProviders[0].label} as fallback.`,
      action: "Set the primary provider endpoint/model and save its key if it is a cloud provider."
    };
  }

  return {
    id: "provider",
    label: `${selectedProvider.label} ready`,
    status: "ready",
    detail: `${selectedProvider.label} is enabled with endpoint and model configuration.`
  };
}

function evaluateAutomationReadiness(config: AppConfig): ReadinessItem {
  if (config.autoTrigger.mode === "manual") {
    return {
      id: "automation",
      label: "Manual answer trigger",
      status: "warning",
      detail: "Caveman will wait for you to click Generate instead of reacting to detected questions.",
      action: "Use Suggest on question for automatic answer triggering during a live interview."
    };
  }

  if (config.autoAnswer.enabled && config.autoAnswer.typeIntoActiveWindow && config.autoAnswer.delayMs < 1000) {
    return {
      id: "automation",
      label: "Auto-answer typing is aggressive",
      status: "warning",
      detail: "Generated answers may type into the active app less than one second after creation.",
      action: "Use at least a 1000 ms delay so you can cancel or change focus."
    };
  }

  return {
    id: "automation",
    label: "Question automation ready",
    status: "ready",
    detail:
      config.autoAnswer.enabled && config.autoAnswer.typeIntoActiveWindow
        ? "Question detection and guarded active-window typing are configured."
        : "Question detection is configured; answer typing remains manual."
  };
}

function evaluateOverlayReadiness(
  config: AppConfig,
  overlayProtection: RealUseReadinessInput["overlayProtection"]
): ReadinessItem {
  if (!config.security.captureExclusionEnabled) {
    return {
      id: "overlay",
      label: "Capture exclusion disabled",
      status: "warning",
      detail: "The stealth overlay can be visible to screen capture when capture exclusion is disabled.",
      action: "Enable Windows capture exclusion before a real screen share."
    };
  }

  const captureExclusion = overlayProtection?.captureExclusion;
  if (captureExclusion && captureExclusion !== "enabled") {
    return {
      id: "overlay",
      label: "Overlay protection needs attention",
      status: captureExclusion === "failed" ? "blocked" : "warning",
      detail: `The last overlay protection check reported ${captureExclusion}.`,
      action: "Show the overlay once and verify capture exclusion before joining a call."
    };
  }

  if (!captureExclusion) {
    return {
      id: "overlay",
      label: "Overlay protection not checked",
      status: "warning",
      detail: "Capture exclusion is enabled in settings but has not been verified in this runtime session.",
      action: "Open the overlay once so Caveman can apply and report capture exclusion."
    };
  }

  if (!config.overlay.autoHideOnScreenShare) {
    return {
      id: "overlay",
      label: "Screen-share auto-hide off",
      status: "warning",
      detail: "The overlay is protected, but it will not automatically hide when screen sharing is detected.",
      action: "Enable auto-hide when screen sharing for an extra safety layer."
    };
  }

  return {
    id: "overlay",
    label: "Stealth overlay ready",
    status: "ready",
    detail: "Capture exclusion is enabled and screen-share auto-hide is configured."
  };
}

function evaluatePrivacyReadiness(config: AppConfig): ReadinessItem {
  if (config.security.localOnlyMode && config.security.blockCloudWhenLocalOnly) {
    return {
      id: "privacy",
      label: "Local-only guard ready",
      status: "ready",
      detail: "Cloud AI, cloud STT, OCR, and update checks are blocked by local-only mode."
    };
  }

  const cloudProviderEnabled = config.providers.some((provider) => provider.kind === "cloud" && provider.enabled);
  if (cloudProviderEnabled || isCloudSttMode(config.stt.selectedMode) || config.ocr.provider === "cloud") {
    return {
      id: "privacy",
      label: "Cloud calls allowed",
      status: "warning",
      detail: "At least one cloud AI/STT/OCR path can send interview context off-device.",
      action: "Turn on local-only mode when you need strict offline privacy."
    };
  }

  return {
    id: "privacy",
    label: "Local-first privacy ready",
    status: "ready",
    detail: "No enabled cloud provider path is currently selected."
  };
}

function evaluateRuntimeBudgetReadiness(runtimeBudget?: RuntimeBudgetStatus | null): ReadinessItem {
  if (!runtimeBudget) {
    return {
      id: "performance",
      label: "Runtime Budget",
      status: "warning",
      detail: "Startup time, process memory, and process CPU have not been measured in this runtime session.",
      action: "Refresh Runtime Budget in Settings after launch and before a live interview."
    };
  }

  const overTarget = [
    runtimeBudget.startupMs > runtimeBudget.startupTargetMs
      ? `startup ${Math.round(runtimeBudget.startupMs)}ms > ${runtimeBudget.startupTargetMs}ms`
      : undefined,
    typeof runtimeBudget.workingSetMb === "number" && runtimeBudget.workingSetMb > runtimeBudget.memoryTargetMb
      ? `memory ${formatMetric(runtimeBudget.workingSetMb)}MB > ${runtimeBudget.memoryTargetMb}MB`
      : undefined,
    typeof runtimeBudget.processCpuPercent === "number" &&
    runtimeBudget.processCpuPercent > runtimeBudget.idleCpuTargetPercent
      ? `idle CPU ${formatMetric(runtimeBudget.processCpuPercent)}% > ${runtimeBudget.idleCpuTargetPercent}%`
      : undefined
  ].filter((item): item is string => Boolean(item));

  if (overTarget.length > 0) {
    return {
      id: "performance",
      label: "Runtime budget over target",
      status: "warning",
      detail: overTarget.join("; "),
      action: "Close unused windows, stop capture when idle, and re-check before the live interview."
    };
  }

  if (runtimeBudget.workingSetMb == null || runtimeBudget.processCpuPercent == null) {
    const missing = [
      runtimeBudget.workingSetMb == null ? "process memory" : undefined,
      runtimeBudget.processCpuPercent == null ? "process CPU" : undefined
    ].filter((item): item is string => Boolean(item));

    return {
      id: "performance",
      label: "Runtime Budget",
      status: "warning",
      detail: `Startup is ${Math.round(runtimeBudget.startupMs)}ms; ${missing.join(" and ")} not available yet.`,
      action: "Refresh Runtime Budget in Settings after a few seconds of normal app use."
    };
  }

  return {
    id: "performance",
    label: "Runtime budget ready",
    status: "ready",
    detail: `Startup ${Math.round(runtimeBudget.startupMs)}ms, memory ${formatMetric(
      runtimeBudget.workingSetMb
    )}MB, idle CPU ${formatMetric(runtimeBudget.processCpuPercent)}%.`
  };
}

function providerUsable(provider: ModelProviderConfig): boolean {
  const hasEndpoint = Boolean(provider.endpoint.trim());
  const hasModel = Boolean(provider.model.trim());
  const hasKey = provider.kind === "local" || Boolean(provider.apiKey?.trim() || provider.apiKeyStored);
  return hasEndpoint && hasModel && hasKey;
}

function deviceAvailable(audioDevices: AudioDevice[], kind: AudioDevice["kind"], requestedId: string): boolean {
  const requested = requestedId.trim();
  const kindDefault = kind === "microphone" ? "microphone-default" : kind === "system" ? "system-default" : "virtual-default";
  if (!requested || requested === "default" || requested === kindDefault) {
    return audioDevices.some((device) => device.kind === kind);
  }

  return audioDevices.some((device) => device.kind === kind && (device.id === requested || device.label === requested));
}

function missingAudioDetail(input: {
  needsMicrophone: boolean;
  needsSystem: boolean;
  microphoneReady: boolean;
  systemReady: boolean;
}): string {
  const missing = [
    input.needsMicrophone && !input.microphoneReady ? "microphone" : undefined,
    input.needsSystem && !input.systemReady ? "system audio" : undefined
  ].filter((item): item is string => Boolean(item));

  return `Missing configured ${missing.join(" and ")} device${missing.length === 1 ? "" : "s"}.`;
}

function isCloudSttMode(mode: SttMode): mode is "deepgram" | "assemblyai" | "google" {
  return mode === "deepgram" || mode === "assemblyai" || mode === "google";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatMetric(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
