import {
  BookOpen,
  Bot,
  Copy,
  DownloadCloud,
  FilePlus2,
  Keyboard,
  KeyRound,
  Mic,
  Play,
  Puzzle,
  RefreshCw,
  Save,
  ScanText,
  ShieldCheck,
  Square,
  Trash2,
  Volume2,
  Wifi
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/common/Button";
import {
  APP_CONFIG_SETTING_KEY,
  DEFAULT_APP_CONFIG,
  type AppConfig,
  parseAppConfig,
  serializeAppConfig
} from "../lib/appConfig";
import { runAudioCaptureRehearsal, type AudioRehearsalResult } from "../lib/audioRehearsal";
import {
  createKnowledgeBase,
  searchKnowledgeBase,
  type KnowledgeBase
} from "../lib/knowledge";
import { isCloudOcrBlocked, runScreenOcr } from "../lib/ocr";
import {
  PLUGIN_CATALOG_SETTING_KEY,
  buildPluginCatalog,
  createEmptyPluginCatalog,
  parsePluginCatalog,
  serializePluginCatalog,
  type PluginCatalog
} from "../lib/pluginLoader";
import { buildPreflightReport, PREFLIGHT_REPORT_SETTING_KEY } from "../lib/preflightReport";
import { createConfiguredProvider } from "../lib/providerClients";
import { hydrateProviderApiKeys } from "../lib/providerSecrets";
import {
  clearKnowledgeBaseNative,
  deleteKnowledgeDocumentNative,
  deleteProviderApiKey,
  detectLocalWhisperSetup,
  downloadWhisperModel,
  listKnowledgeBase,
  getRuntimeBudgetStatus,
  getProviderApiKey,
  getSetting,
  getOverlayWindowBounds,
  listAudioApplications,
  loadPluginManifests,
  listAudioDevices,
  listSecurityEvents,
  saveProviderApiKey,
  saveKnowledgeDocumentNative,
  saveSetting,
  setOverlayWindowBounds,
  transcribeWithCloudStt,
  transcribeWithLocalWhisper,
  type SecurityEvent
} from "../lib/tauri";
import { promptTemplates } from "../lib/promptTemplates";
import { evaluateRealUseReadiness, type ReadinessStatus, type RuntimeBudgetStatus } from "../lib/readiness";
import { enqueueTtsResponse, playTtsItem, stopTtsPlayback } from "../lib/tts";
import { checkForSignedUpdate, downloadInstallAndRelaunchSignedUpdate } from "../lib/updater";
import type {
  AudioSettings,
  AudioApplication,
  AudioDevice,
  AppProfile,
  AutoAnswerSettings,
  AutoTriggerSettings,
  ContextWindowSettings,
  ModelProviderConfig,
  OcrSettings,
  OverlaySettings,
  PluginSettings,
  ProviderId,
  SecuritySettings,
  ShortcutSettings,
  SpeakerCalibrationSettings,
  SttSettings,
  TtsSettings
} from "../types/settings";
import type { ModelInfo } from "../types/ai";
import type { Speaker } from "../types/session";

const SPEAKER_ROLE_OPTIONS: Array<{ value: Speaker; label: string }> = [
  { value: "interviewer", label: "Interviewer" },
  { value: "candidate", label: "You" },
  { value: "unknown", label: "Unknown" }
];

const STT_LANGUAGE_OPTIONS = [
  { value: "auto", label: "Auto detect" },
  { value: "en-US", label: "English (US)" },
  { value: "en", label: "English" },
  { value: "hi-IN", label: "Hindi (India)" },
  { value: "es-ES", label: "Spanish (Spain)" },
  { value: "fr-FR", label: "French (France)" },
  { value: "de-DE", label: "German (Germany)" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "ja-JP", label: "Japanese" },
  { value: "ko-KR", label: "Korean" },
  { value: "zh-CN", label: "Chinese (Simplified)" }
];

export function Settings() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [status, setStatus] = useState("Loading settings...");
  const [testingProviderId, setTestingProviderId] = useState<ProviderId | null>(null);
  const [loadingProviderModelsId, setLoadingProviderModelsId] = useState<ProviderId | null>(null);
  const [providerModelOptions, setProviderModelOptions] = useState<Partial<Record<ProviderId, ModelInfo[]>>>({});
  const [sttSampleAudioPath, setSttSampleAudioPath] = useState("");
  const [testingStt, setTestingStt] = useState(false);
  const [testingAudioRehearsal, setTestingAudioRehearsal] = useState(false);
  const [audioRehearsalResult, setAudioRehearsalResult] = useState<AudioRehearsalResult | null>(null);
  const [detectingWhisper, setDetectingWhisper] = useState(false);
  const [downloadingWhisper, setDownloadingWhisper] = useState(false);
  const [providerSecretInputs, setProviderSecretInputs] = useState<Partial<Record<ProviderId, string>>>({});
  const [sttSecretInput, setSttSecretInput] = useState("");
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [audioApplications, setAudioApplications] = useState<AudioApplication[]>([]);
  const [ocrReviewText, setOcrReviewText] = useState("");
  const [capturingOcr, setCapturingOcr] = useState(false);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase>(createKnowledgeBase());
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeSourceType, setKnowledgeSourceType] = useState("project");
  const [knowledgeText, setKnowledgeText] = useState("");
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [pluginCatalog, setPluginCatalog] = useState<PluginCatalog>(createEmptyPluginCatalog());
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [runtimeBudget, setRuntimeBudget] = useState<RuntimeBudgetStatus | null>(null);
  const [refreshingRuntimeBudget, setRefreshingRuntimeBudget] = useState(false);
  const [preflightReport, setPreflightReport] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileInterviewType, setProfileInterviewType] = useState<AppProfile["interviewType"]>("mixed");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState("");
  const readiness = useMemo(
    () =>
      evaluateRealUseReadiness({
        config,
        audioDevices,
        runtimeBudget
      }),
    [audioDevices, config, runtimeBudget]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [
        rawConfig,
        devices,
        applications,
        loadedKnowledgeBase,
        rawPluginCatalog,
        events,
        loadedRuntimeBudget,
        savedPreflightReport
      ] = await Promise.all([
        getSetting(APP_CONFIG_SETTING_KEY),
        listAudioDevices(),
        listAudioApplications(),
        listKnowledgeBase(),
        getSetting(PLUGIN_CATALOG_SETTING_KEY),
        listSecurityEvents(8),
        getRuntimeBudgetStatus(),
        getSetting(PREFLIGHT_REPORT_SETTING_KEY)
      ]);
      const stored = parseAppConfig(rawConfig);
      const hydrated = await hydrateProviderApiKeys(stored);
      const sttSecret = isCloudSttMode(hydrated.stt.selectedMode)
        ? await getProviderApiKey(sttSecretProviderId(hydrated.stt.selectedMode))
        : undefined;
      const nextConfig = {
        ...hydrated,
        stt: {
          ...hydrated.stt,
          apiKey: sttSecret,
          apiKeyStored: Boolean(sttSecret)
        }
      };
      if (!cancelled) {
        setConfig(nextConfig);
        setKnowledgeBase(loadedKnowledgeBase);
        setPluginCatalog(parsePluginCatalog(rawPluginCatalog));
        setSttSecretInput(sttSecret ?? "");
        setOcrReviewText(nextConfig.ocr.lastText ?? "");
        setAudioDevices(devices);
        setAudioApplications(applications);
        setSecurityEvents(events);
        setRuntimeBudget(loadedRuntimeBudget);
        setPreflightReport(savedPreflightReport ?? "");
        setProviderSecretInputs(
          nextConfig.providers.reduce<Partial<Record<ProviderId, string>>>((values, provider) => {
            if (provider.kind === "cloud") {
              values[provider.id] = provider.apiKey ?? "";
            }
            return values;
          }, {})
        );
        setStatus("Settings loaded");
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveConfig() {
    await saveSetting(APP_CONFIG_SETTING_KEY, serializeAppConfig(config));
    setStatus("Settings saved");
  }

  async function testProvider(provider: ModelProviderConfig) {
    if (isCloudProviderBlocked(provider, config)) {
      setStatus("Cloud providers are blocked by local-only mode.");
      return;
    }

    setTestingProviderId(provider.id);
    setStatus(`Testing ${provider.label}...`);
    const result = await createConfiguredProvider(provider).healthCheck();
    setTestingProviderId(null);
    setStatus(
      result.ok
        ? `${provider.label} is reachable${result.latencyMs ? ` in ${result.latencyMs}ms` : ""}`
        : `${provider.label} failed: ${result.error ?? "unavailable"}`
    );
  }

  async function refreshSecurityEvents() {
    setSecurityEvents(await listSecurityEvents(8));
  }

  async function refreshRuntimeBudget() {
    setRefreshingRuntimeBudget(true);
    setStatus("Refreshing runtime budget...");
    try {
      const nextRuntimeBudget = await getRuntimeBudgetStatus();
      setRuntimeBudget(nextRuntimeBudget);
      setStatus("Runtime budget refreshed");
    } catch (error) {
      setStatus(`Runtime budget check failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRefreshingRuntimeBudget(false);
    }
  }

  function createPreflightReport() {
    return buildPreflightReport({
      readiness,
      runtimeBudget,
      audioRehearsal: audioRehearsalResult
    });
  }

  async function savePreflightReport() {
    const report = createPreflightReport();
    setPreflightReport(report);
    await saveSetting(PREFLIGHT_REPORT_SETTING_KEY, report);
    setStatus("Preflight report saved");
  }

  async function copyPreflightReport() {
    const report = preflightReport || createPreflightReport();
    setPreflightReport(report);
    await saveSetting(PREFLIGHT_REPORT_SETTING_KEY, report);
    if (!navigator.clipboard) {
      setStatus("Clipboard is not available for the preflight report");
      return;
    }

    await navigator.clipboard.writeText(report);
    setStatus("Preflight report copied");
  }

  async function refreshProviderModels(provider: ModelProviderConfig) {
    if (isCloudProviderBlocked(provider, config)) {
      setStatus("Cloud providers are blocked by local-only mode.");
      return;
    }

    setLoadingProviderModelsId(provider.id);
    setStatus(`Loading models for ${provider.label}...`);

    try {
      const models = await createConfiguredProvider(provider).listModels?.();
      if (!models) {
        setStatus(`${provider.label} does not expose model listing.`);
        return;
      }

      setProviderModelOptions((current) => ({ ...current, [provider.id]: models }));
      setStatus(`Loaded ${models.length} model${models.length === 1 ? "" : "s"} for ${provider.label}`);
    } catch (error) {
      setStatus(`Could not load ${provider.label} models: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoadingProviderModelsId(null);
    }
  }

  async function testLocalWhisper() {
    setTestingStt(true);
    setStatus("Running local Whisper test...");

    try {
      const events = await transcribeWithLocalWhisper({
        binaryPath: config.stt.localWhisperBinaryPath,
        modelPath: config.stt.localWhisperModelPath,
        audioPath: sttSampleAudioPath,
        language: config.stt.language || "auto",
        diarizationEnabled: config.stt.diarizationEnabled
      });
      setStatus(`Local Whisper returned ${events.length} transcript segment${events.length === 1 ? "" : "s"}`);
    } catch (error) {
      setStatus(`Local Whisper failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTestingStt(false);
    }
  }

  async function testCloudStt() {
    if (!isCloudSttMode(config.stt.selectedMode)) {
      setStatus("Choose Deepgram, AssemblyAI, or Google STT before testing cloud transcription.");
      return;
    }
    if (isCloudBlocked(config)) {
      setStatus("Cloud STT is blocked by local-only mode.");
      return;
    }

    const apiKey = (sttSecretInput || config.stt.apiKey || "").trim();
    if (!apiKey) {
      setStatus(`Save a ${config.stt.selectedMode} STT API key before testing.`);
      return;
    }

    setTestingStt(true);
    setStatus(`Running ${config.stt.selectedMode} STT test...`);

    try {
      const events = await transcribeWithCloudStt({
        provider: config.stt.selectedMode,
        apiKey,
        audioPath: sttSampleAudioPath,
        language: normalizeSttLanguage(config.stt.language),
        diarizationEnabled: config.stt.diarizationEnabled,
        endpoint: config.stt.cloudEndpoint || undefined,
        localOnlyMode: config.security.localOnlyMode,
        blockCloudWhenLocalOnly: config.security.blockCloudWhenLocalOnly
      });
      setStatus(`${config.stt.selectedMode} returned ${events.length} transcript segment${events.length === 1 ? "" : "s"}`);
    } catch (error) {
      setStatus(`${config.stt.selectedMode} failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTestingStt(false);
    }
  }

  async function runAudioRehearsal() {
    setTestingAudioRehearsal(true);
    setStatus("Running audio rehearsal...");

    try {
      const result = await runAudioCaptureRehearsal({ config });
      setAudioRehearsalResult(result);
      setStatus(
        result.status === "ready"
          ? "Audio rehearsal complete"
          : `Audio rehearsal ${result.status === "blocked" ? "blocked" : "needs attention"}`
      );
    } catch (error) {
      setAudioRehearsalResult(null);
      setStatus(`Audio rehearsal failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTestingAudioRehearsal(false);
    }
  }

  async function autoDetectWhisperSetup() {
    setDetectingWhisper(true);
    setStatus("Scanning for local Whisper binary and ggml model...");

    try {
      const setup = await detectLocalWhisperSetup();
      setConfig((current) => ({
        ...current,
        stt: {
          ...current.stt,
          selectedMode: setup.ready ? "local_whisper" : current.stt.selectedMode,
          localWhisperBinaryPath: setup.binaryPath ?? current.stt.localWhisperBinaryPath,
          localWhisperModelPath: setup.modelPath ?? current.stt.localWhisperModelPath
        }
      }));
      setStatus(
        setup.ready
          ? "Local Whisper setup detected"
          : setup.messages.join(" ")
      );
    } catch (error) {
      setStatus(`Whisper setup detection failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setDetectingWhisper(false);
    }
  }

  async function downloadBaseWhisperModel() {
    setDownloadingWhisper(true);
    setStatus("Downloading Whisper base.en model...");

    try {
      const modelsDir = parentDirectory(config.stt.localWhisperModelPath);
      const downloaded = await downloadWhisperModel({
        model: "base.en",
        modelsDir: modelsDir || undefined
      });
      updateStt({
        selectedMode: "local_whisper",
        localWhisperModelPath: downloaded.modelPath
      });
      setStatus(`Downloaded ${downloaded.model} Whisper model (${downloaded.bytes} bytes)`);
    } catch (error) {
      setStatus(`Whisper model download failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setDownloadingWhisper(false);
    }
  }

  function updateProvider(id: ProviderId, patch: Partial<ModelProviderConfig>) {
    setConfig((current) => ({
      ...current,
      providers: current.providers.map((provider) => (provider.id === id ? { ...provider, ...patch } : provider))
    }));
  }

  async function saveCurrentProfile() {
    const name = profileName.trim();
    if (!name) {
      setStatus("Name the profile before saving it.");
      return;
    }

    const profile: AppProfile = {
      id: createProfileId(name),
      name,
      interviewType: profileInterviewType,
      providerId: config.selectedProviderId,
      sttMode: config.stt.selectedMode,
      overlay: cloneOverlaySettings(config.overlay),
      shortcuts: { ...config.shortcuts }
    };
    const nextConfig = {
      ...config,
      profiles: [profile, ...config.profiles.filter((item) => item.id !== profile.id)]
    };

    setConfig(nextConfig);
    setProfileName("");
    await saveSetting(APP_CONFIG_SETTING_KEY, serializeAppConfig(nextConfig));
    setStatus(`Saved ${profile.name} profile`);
  }

  async function applyProfile(profile: AppProfile) {
    const nextConfig = {
      ...config,
      selectedProviderId: profile.providerId,
      audio: {
        ...config.audio,
        sttMode: profile.sttMode
      },
      stt: {
        ...config.stt,
        selectedMode: profile.sttMode
      },
      overlay: cloneOverlaySettings(profile.overlay),
      shortcuts: { ...profile.shortcuts }
    };

    setConfig(nextConfig);
    await saveSetting(APP_CONFIG_SETTING_KEY, serializeAppConfig(nextConfig));
    setStatus(`Applied ${profile.name} profile`);
  }

  async function deleteProfile(profile: AppProfile) {
    const nextConfig = {
      ...config,
      profiles: config.profiles.filter((item) => item.id !== profile.id)
    };

    setConfig(nextConfig);
    await saveSetting(APP_CONFIG_SETTING_KEY, serializeAppConfig(nextConfig));
    setStatus(`Deleted ${profile.name} profile`);
  }

  function patchProviderConfig(
    current: AppConfig,
    id: ProviderId,
    patch: Partial<ModelProviderConfig>
  ): AppConfig {
    return {
      ...current,
      providers: current.providers.map((provider) => (provider.id === id ? { ...provider, ...patch } : provider))
    };
  }

  function updateProviderSecretInput(id: ProviderId, secret: string) {
    setProviderSecretInputs((current) => ({ ...current, [id]: secret }));
    setConfig((current) => patchProviderConfig(current, id, { apiKey: secret }));
  }

  async function saveProviderSecret(provider: ModelProviderConfig) {
    const secret = (providerSecretInputs[provider.id] ?? provider.apiKey ?? "").trim();
    if (!secret) {
      setStatus(`Paste a ${provider.label} API key before saving.`);
      return;
    }

    try {
      const result = await saveProviderApiKey(provider.id, secret);
      const nextConfig = patchProviderConfig(config, provider.id, {
        apiKey: secret,
        apiKeyStored: result.stored
      });
      setConfig(nextConfig);
      await saveSetting(APP_CONFIG_SETTING_KEY, serializeAppConfig(nextConfig));
      await refreshSecurityEvents();
      setStatus(`${provider.label} API key stored in OS keychain`);
    } catch (error) {
      setStatus(`Could not store ${provider.label} API key: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function deleteProviderSecret(provider: ModelProviderConfig) {
    try {
      await deleteProviderApiKey(provider.id);
      const nextConfig = patchProviderConfig(config, provider.id, {
        apiKey: undefined,
        apiKeyStored: false
      });
      setProviderSecretInputs((current) => ({ ...current, [provider.id]: "" }));
      setConfig(nextConfig);
      await saveSetting(APP_CONFIG_SETTING_KEY, serializeAppConfig(nextConfig));
      await refreshSecurityEvents();
      setStatus(`${provider.label} API key removed from OS keychain`);
    } catch (error) {
      setStatus(`Could not delete ${provider.label} API key: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function updateAudio(patch: Partial<AudioSettings>) {
    setConfig((current) => ({ ...current, audio: { ...current.audio, ...patch } }));
  }

  function updateApplicationTarget(applicationId: string) {
    if (applicationId === "all-system-audio") {
      updateAudio({
        applicationTargetId: "all-system-audio",
        applicationTargetLabel: "All system audio"
      });
      return;
    }

    const application = audioApplications.find((item) => item.id === applicationId);
    updateAudio({
      applicationTargetId: applicationId,
      applicationTargetLabel: application ? audioApplicationLabel(application) : applicationId
    });
  }

  function audioDeviceOptions(
    source: "microphone" | "system",
    currentId: string,
    defaultLabel: string
  ): AudioDevice[] {
    const allowedKinds: AudioDevice["kind"][] =
      source === "microphone" ? ["microphone", "virtual"] : ["system", "virtual"];
    const options = audioDevices.filter((device) => allowedKinds.includes(device.kind));
    const currentOption =
      currentId && !options.some((device) => device.id === currentId)
        ? [
            {
              id: currentId,
              label: defaultLabel,
              kind: source,
              selected: true,
              level: 0
            } satisfies AudioDevice
          ]
        : [];

    return [...currentOption, ...options].filter(
      (device, index, devices) => devices.findIndex((candidate) => candidate.id === device.id) === index
    );
  }

  function updateStt(patch: Partial<SttSettings>) {
    setConfig((current) => ({ ...current, stt: { ...current.stt, ...patch } }));
  }

  function updateSpeakerCalibration(patch: Partial<SpeakerCalibrationSettings>) {
    setConfig((current) => ({
      ...current,
      stt: {
        ...current.stt,
        speakerCalibration: {
          ...current.stt.speakerCalibration,
          ...patch
        }
      }
    }));
  }

  async function updateSelectedSttMode(selectedMode: SttSettings["selectedMode"]) {
    updateStt({ selectedMode, apiKey: undefined, apiKeyStored: false });
    updateAudio({ sttMode: selectedMode });
    if (!isCloudSttMode(selectedMode)) {
      setSttSecretInput("");
      return;
    }

    const secret = await getProviderApiKey(sttSecretProviderId(selectedMode));
    setSttSecretInput(secret ?? "");
    updateStt({ apiKey: secret, apiKeyStored: Boolean(secret) });
  }

  async function saveSttSecret() {
    if (!isCloudSttMode(config.stt.selectedMode)) {
      setStatus("Choose a cloud STT provider before saving a key.");
      return;
    }

    const secret = sttSecretInput.trim();
    if (!secret) {
      setStatus("Paste a cloud STT API key before saving.");
      return;
    }

    try {
      await saveProviderApiKey(sttSecretProviderId(config.stt.selectedMode), secret);
      const nextConfig = {
        ...config,
        stt: {
          ...config.stt,
          apiKey: secret,
          apiKeyStored: true
        }
      };
      setConfig(nextConfig);
      await saveSetting(APP_CONFIG_SETTING_KEY, serializeAppConfig(nextConfig));
      await refreshSecurityEvents();
      setStatus(`${config.stt.selectedMode} STT key stored in OS keychain`);
    } catch (error) {
      setStatus(`Could not store STT key: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function deleteSttSecret() {
    if (isCloudSttMode(config.stt.selectedMode)) {
      await deleteProviderApiKey(sttSecretProviderId(config.stt.selectedMode));
    }
    const nextConfig = {
      ...config,
      stt: {
        ...config.stt,
        apiKey: undefined,
        apiKeyStored: false
      }
    };
    setSttSecretInput("");
    setConfig(nextConfig);
    await saveSetting(APP_CONFIG_SETTING_KEY, serializeAppConfig(nextConfig));
    await refreshSecurityEvents();
    setStatus("Cloud STT key removed from OS keychain");
  }

  function updateAutoTrigger(patch: Partial<AutoTriggerSettings>) {
    setConfig((current) => ({ ...current, autoTrigger: { ...current.autoTrigger, ...patch } }));
  }

  function updateAutoAnswer(patch: Partial<AutoAnswerSettings>) {
    setConfig((current) => ({ ...current, autoAnswer: { ...current.autoAnswer, ...patch } }));
  }

  function updateContextWindow(patch: Partial<ContextWindowSettings>) {
    setConfig((current) => ({ ...current, contextWindow: { ...current.contextWindow, ...patch } }));
  }

  function updateOcr(patch: Partial<OcrSettings>) {
    setConfig((current) => ({ ...current, ocr: { ...current.ocr, ...patch } }));
  }

  async function captureOcrContext() {
    if (
      isCloudOcrBlocked({
        settings: config.ocr,
        localOnlyMode: config.security.localOnlyMode,
        blockCloudWhenLocalOnly: config.security.blockCloudWhenLocalOnly
      })
    ) {
      setStatus("Cloud OCR is blocked by local-only mode.");
      return;
    }

    setCapturingOcr(true);
    setStatus("Capturing screen OCR...");
    try {
      const result = await runScreenOcr(config.ocr);
      setOcrReviewText(result.text);
      updateOcr({
        includeInPrompt: result.text.trim().length > 0,
        lastText: result.text,
        lastCapturedAtMs: result.capturedAtMs
      });
      setStatus(`Screen OCR captured ${result.text.length} characters`);
    } catch (error) {
      setStatus(`Screen OCR failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCapturingOcr(false);
    }
  }

  async function addKnowledgeDocument() {
    const text = knowledgeText.trim();
    if (!text) {
      setStatus("Paste knowledge text before adding it to the knowledge base.");
      return;
    }

    const title = knowledgeTitle.trim() || `Knowledge ${knowledgeBase.documents.length + 1}`;
    const id = createKnowledgeDocumentId(title);
    const nextKnowledgeBase = await saveKnowledgeDocumentNative({
      id,
      title,
      sourceType: knowledgeSourceType.trim() || "note",
      text,
      createdAtMs: Date.now()
    });

    setKnowledgeBase(nextKnowledgeBase);
    setKnowledgeText("");
    setKnowledgeTitle("");
    setStatus(`Added ${title} to the knowledge base`);
  }

  async function importKnowledgeFiles(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) {
      return;
    }

    let nextKnowledgeBase = knowledgeBase;
    let importedCount = 0;
    for (const file of selectedFiles) {
      const text = (await file.text()).trim();
      if (!text) {
        continue;
      }

      const title = file.name.replace(/\.[^.]+$/, "") || `Knowledge ${nextKnowledgeBase.documents.length + 1}`;
      nextKnowledgeBase = await saveKnowledgeDocumentNative({
        id: createKnowledgeDocumentId(`${file.name}-${file.lastModified}`),
        title,
        sourceType: knowledgeSourceType.trim() || "file",
        text,
        createdAtMs: Date.now()
      });
      importedCount += 1;
    }

    if (importedCount === 0) {
      setStatus("Selected knowledge files were empty.");
      return;
    }

    setKnowledgeBase(nextKnowledgeBase);
    setStatus(`Imported ${importedCount} knowledge file${importedCount === 1 ? "" : "s"}`);
  }

  async function deleteKnowledgeDocument(documentId: string, title: string) {
    const nextKnowledgeBase = await deleteKnowledgeDocumentNative(documentId);
    setKnowledgeBase(nextKnowledgeBase);
    setStatus(`Deleted ${title} from the knowledge base`);
  }

  async function clearStoredKnowledgeBase() {
    const nextKnowledgeBase = await clearKnowledgeBaseNative();
    setKnowledgeBase(nextKnowledgeBase);
    setStatus("Cleared knowledge base");
  }

  async function importPromptContextFiles(
    files: FileList | null,
    field: "resumeContext" | "jobDescriptionContext",
    label: string
  ) {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) {
      return;
    }

    const importedBlocks: string[] = [];
    for (const file of selectedFiles) {
      const text = (await file.text()).trim();
      if (!text) {
        continue;
      }

      importedBlocks.push(`Imported from ${file.name}:\n${text}`);
    }

    if (importedBlocks.length === 0) {
      setStatus(`Selected ${label.toLowerCase()} files were empty.`);
      return;
    }

    setConfig((current) => ({
      ...current,
      [field]: appendPromptContext(current[field], importedBlocks.join("\n\n"))
    }));
    setStatus(
      `Imported ${importedBlocks.length} ${label.toLowerCase()} file${
        importedBlocks.length === 1 ? "" : "s"
      }; save settings to keep it`
    );
  }

  const knowledgeResults = knowledgeQuery.trim()
    ? searchKnowledgeBase(knowledgeBase, knowledgeQuery, 4)
    : knowledgeBase.chunks.slice(-4).reverse();

  function updateTts(patch: Partial<TtsSettings>) {
    setConfig((current) => ({ ...current, tts: { ...current.tts, ...patch } }));
  }

  function updateOverlay(patch: Partial<OverlaySettings>) {
    setConfig((current) => ({ ...current, overlay: { ...current.overlay, ...patch } }));
  }

  function updateShortcuts(patch: Partial<ShortcutSettings>) {
    setConfig((current) => {
      const nextShortcuts = { ...current.shortcuts, ...patch };
      return {
        ...current,
        shortcuts: nextShortcuts,
        overlay: patch.overlayToggle ? { ...current.overlay, hotkey: patch.overlayToggle } : current.overlay
      };
    });
  }

  function updateOverlayBounds(patch: Partial<OverlaySettings["bounds"]>) {
    setConfig((current) => ({
      ...current,
      overlay: {
        ...current.overlay,
        bounds: {
          ...current.overlay.bounds,
          ...patch
        }
      }
    }));
  }

  async function readOverlayBounds() {
    try {
      const bounds = await getOverlayWindowBounds();
      updateOverlayBounds(bounds);
      setStatus(`Overlay position read from ${bounds.monitorName ?? "current display"}`);
    } catch (error) {
      setStatus(`Could not read overlay position: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function applyOverlayBounds() {
    try {
      const bounds = await setOverlayWindowBounds(config.overlay.bounds, config.security.captureExclusionEnabled);
      updateOverlayBounds(bounds);
      setStatus(`Overlay position applied on ${bounds.monitorName ?? "current display"}`);
    } catch (error) {
      setStatus(`Could not apply overlay position: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function previewTts() {
    const queue = enqueueTtsResponse(
      [],
      "Caveman text to speech preview is ready.",
      { ...config.tts, enabled: true },
      false
    );
    const played = queue[0] ? playTtsItem(queue[0]) : false;
    setStatus(played ? "TTS preview playing" : "TTS playback is not available in this environment");
  }

  function stopTtsPreview() {
    stopTtsPlayback();
    setStatus("TTS playback stopped");
  }

  function updateSecurity(patch: Partial<SecuritySettings>) {
    setConfig((current) => ({ ...current, security: { ...current.security, ...patch } }));
  }

  async function checkForUpdates() {
    if (isCloudBlocked(config)) {
      setStatus("Signed update checks are blocked by local-only mode.");
      return;
    }

    setCheckingUpdate(true);
    setStatus("Checking signed update endpoint...");
    setUpdateProgress("");

    try {
      const update = await checkForSignedUpdate();
      setStatus(update.available ? `Signed update ${update.version} is available` : "No signed update is available");
    } catch (error) {
      setStatus(`Update check failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function installSignedUpdate() {
    if (isCloudBlocked(config)) {
      setStatus("Signed update checks are blocked by local-only mode.");
      return;
    }

    setInstallingUpdate(true);
    setStatus("Installing signed update...");

    try {
      const update = await downloadInstallAndRelaunchSignedUpdate((progress) => {
        setUpdateProgress(
          progress.totalBytes
            ? `${progress.downloadedBytes} / ${progress.totalBytes} bytes`
            : `${progress.downloadedBytes} bytes`
        );
      });
      setStatus(update.available ? `Installed signed update ${update.version}; relaunching` : "No signed update is available");
    } catch (error) {
      setStatus(`Update install failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setInstallingUpdate(false);
    }
  }

  function updatePlugins(patch: Partial<PluginSettings>) {
    setConfig((current) => ({ ...current, plugins: { ...current.plugins, ...patch } }));
  }

  async function loadLocalPlugins() {
    if (!config.plugins.enabled) {
      setStatus("Enable local plugins before loading manifests.");
      return;
    }

    const directory = config.plugins.directory.trim();
    if (!directory) {
      setStatus("Set a plugin directory before loading manifests.");
      return;
    }

    try {
      const files = await loadPluginManifests(directory);
      const catalog = buildPluginCatalog(files, config.plugins);
      setPluginCatalog(catalog);
      await saveSetting(PLUGIN_CATALOG_SETTING_KEY, serializePluginCatalog(catalog));
      setStatus(
        `Loaded ${catalog.loaded.length} plugin${catalog.loaded.length === 1 ? "" : "s"} from ${directory}${
          catalog.errors.length > 0 ? ` with ${catalog.errors.length} warning${catalog.errors.length === 1 ? "" : "s"}` : ""
        }`
      );
    } catch (error) {
      setStatus(`Could not load plugins: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return (
    <main className="settings-grid">
      <section className="panel readiness-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Preflight</p>
            <h1>Real-Use Readiness</h1>
          </div>
          <span className={`status-pill ${readinessStatusClass(readiness.overallStatus)}`}>
            {readinessStatusLabel(readiness.overallStatus)}
          </span>
          <Button icon={<RefreshCw size={16} />} onClick={refreshRuntimeBudget} disabled={refreshingRuntimeBudget}>
            {refreshingRuntimeBudget ? "Refreshing Runtime" : "Refresh Runtime Budget"}
          </Button>
          <Button icon={<Save size={16} />} onClick={savePreflightReport}>
            Save Preflight Report
          </Button>
          <Button icon={<Copy size={16} />} onClick={copyPreflightReport}>
            Copy Preflight Report
          </Button>
        </div>

        <div className="metric-strip readiness-summary">
          <div>
            <span>Ready</span>
            <strong>{readiness.readyCount}</strong>
          </div>
          <div>
            <span>Warnings</span>
            <strong>{readiness.warningCount}</strong>
          </div>
          <div>
            <span>Blocked</span>
            <strong>{readiness.blockedCount}</strong>
          </div>
          <div>
            <span>Checks</span>
            <strong>{readiness.items.length}</strong>
          </div>
        </div>

        <div className="readiness-list">
          {readiness.items.map((item) => (
            <article className="readiness-item" key={item.id}>
              <div className="provider-editor-header">
                <strong>{item.label}</strong>
                <span className={`status-pill ${readinessStatusClass(item.status)}`}>
                  {readinessStatusLabel(item.status)}
                </span>
              </div>
              <p>{item.detail}</p>
              {item.action ? <small>{item.action}</small> : null}
            </article>
          ))}
        </div>

        {preflightReport ? (
          <label className="settings-field">
            <span>Latest preflight report</span>
            <textarea aria-label="Latest preflight report" readOnly rows={8} value={preflightReport} />
          </label>
        ) : null}
      </section>

      <section className="panel provider-config-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Models</p>
            <h1>Provider Router</h1>
          </div>
          <Button variant="primary" icon={<Save size={16} />} onClick={saveConfig}>
            Save
          </Button>
        </div>

        <label className="settings-field">
          <span>Primary provider</span>
          <select
            value={config.selectedProviderId}
            onChange={(event) => {
              const selectedProviderId = event.currentTarget.value as ProviderId;
              setConfig((current) => ({
                ...current,
                selectedProviderId
              }));
            }}
          >
            {config.providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>

        <div className="provider-editor-list">
          {config.providers.map((provider) => (
            <article className="provider-editor" key={provider.id}>
              <div className="provider-editor-header">
                <label className="toggle-row">
                  <span>
                    <strong>{provider.label}</strong>
                    <em>{provider.kind}</em>
                  </span>
                  <input
                    type="checkbox"
                    checked={provider.enabled}
                    onChange={(event) => updateProvider(provider.id, { enabled: event.currentTarget.checked })}
                  />
                </label>
                <div className="button-row settings-actions">
                  <Button
                    icon={<RefreshCw size={16} />}
                    onClick={() => refreshProviderModels(provider)}
                    disabled={loadingProviderModelsId === provider.id}
                  >
                    {loadingProviderModelsId === provider.id ? "Loading Models" : "Refresh Models"}
                  </Button>
                  <Button
                    icon={<Wifi size={16} />}
                    onClick={() => testProvider(provider)}
                    disabled={testingProviderId === provider.id}
                  >
                    {testingProviderId === provider.id ? "Testing" : "Test"}
                  </Button>
                </div>
              </div>

              <label className="settings-field">
                <span>Endpoint</span>
                <input
                  value={provider.endpoint}
                  onChange={(event) => updateProvider(provider.id, { endpoint: event.currentTarget.value })}
                />
              </label>
              <label className="settings-field">
                <span>Model</span>
                <input
                  value={provider.model}
                  onChange={(event) => updateProvider(provider.id, { model: event.currentTarget.value })}
                />
              </label>
              {(providerModelOptions[provider.id]?.length ?? 0) > 0 ? (
                <label className="settings-field">
                  <span>Available models</span>
                  <select
                    aria-label={`${provider.label} available models`}
                    value={provider.model}
                    onChange={(event) => updateProvider(provider.id, { model: event.currentTarget.value })}
                  >
                    {providerModelOptions[provider.id]?.some((model) => model.id === provider.model) ? null : (
                      <option value={provider.model}>{provider.model}</option>
                    )}
                    {providerModelOptions[provider.id]?.map((model) => (
                      <option key={model.id} value={model.id}>
                        {formatModelOption(model)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {provider.kind === "cloud" ? (
                <>
                  <label className="settings-field">
                    <span>API key</span>
                    <input
                      type="password"
                      value={providerSecretInputs[provider.id] ?? provider.apiKey ?? ""}
                      placeholder="Paste API key, then save it to the OS keychain"
                      onChange={(event) => updateProviderSecretInput(provider.id, event.currentTarget.value)}
                    />
                  </label>
                  <div className="button-row settings-actions">
                    <Button
                      variant="primary"
                      icon={<Save size={16} />}
                      onClick={() => saveProviderSecret(provider)}
                    >
                      Save Key
                    </Button>
                    <Button
                      variant="secondary"
                      icon={<Trash2 size={16} />}
                      onClick={() => deleteProviderSecret(provider)}
                    >
                      Delete Key
                    </Button>
                  </div>
                </>
              ) : null}
            </article>
          ))}
        </div>

        <div className="runtime-status">
          <span>{status}</span>
          <strong>Cloud provider API keys are stored in the OS keychain, not local app settings.</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Profiles</p>
            <h2>Interview Profiles</h2>
          </div>
          <Save size={18} />
        </div>
        <div className="settings-two-column">
          <label className="settings-field">
            <span>Profile name</span>
            <input
              value={profileName}
              placeholder="Coding Interview, Backend, DevOps Cloud"
              onChange={(event) => setProfileName(event.currentTarget.value)}
            />
          </label>
          <label className="settings-field">
            <span>Profile interview type</span>
            <select
              value={profileInterviewType}
              onChange={(event) => setProfileInterviewType(event.currentTarget.value as AppProfile["interviewType"])}
            >
              <option value="dsa">DSA</option>
              <option value="system_design">System Design</option>
              <option value="frontend">Frontend</option>
              <option value="backend">Backend</option>
              <option value="devops_cloud">DevOps / Cloud</option>
              <option value="behavioral">Behavioral</option>
              <option value="hr">HR</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>
          <Button variant="primary" icon={<Save size={16} />} onClick={saveCurrentProfile}>
            Save Profile
          </Button>
        </div>
        {config.profiles.length > 0 ? (
          <div className="profile-grid">
            {config.profiles.map((profile) => (
              <article className="profile-tile" key={profile.id}>
                <strong>{profile.name}</strong>
                <span>{profile.interviewType.replace(/_/g, " ")}</span>
                <span>
                  {profile.providerId} / {profile.sttMode}
                </span>
                <div className="button-row settings-actions">
                  <Button icon={<Save size={16} />} onClick={() => applyProfile(profile)}>
                    Apply Profile
                  </Button>
                  <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => deleteProfile(profile)}>
                    Delete Profile
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-copy">Saved interview profiles appear here after you capture the current settings.</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Secrets</p>
            <h2>API Key Vault</h2>
          </div>
          <KeyRound size={18} />
        </div>
        <div className="vault-list">
          {config.providers.map((provider) => (
            <div className="vault-row" key={provider.id}>
              <span>{provider.label}</span>
              <strong>{provider.apiKeyStored ? "Stored in OS keychain" : "No key configured"}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel prompt-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Stealth</p>
            <h2>Overlay Hotkeys</h2>
          </div>
          <Keyboard size={18} />
        </div>
        <div className="settings-two-column">
          <label className="settings-field">
            <span>Overlay hotkey</span>
            <input
              value={config.shortcuts.overlayToggle}
              placeholder="Ctrl+Shift+H"
              onChange={(event) => updateShortcuts({ overlayToggle: event.currentTarget.value })}
            />
          </label>
          <label className="settings-field">
            <span>Capture hotkey</span>
            <input
              value={config.shortcuts.captureToggle}
              placeholder="Ctrl+Shift+S"
              onChange={(event) => updateShortcuts({ captureToggle: event.currentTarget.value })}
            />
          </label>
          <label className="settings-field">
            <span>Generate answer hotkey</span>
            <input
              value={config.shortcuts.generateAnswer}
              placeholder="Ctrl+Shift+G"
              onChange={(event) => updateShortcuts({ generateAnswer: event.currentTarget.value })}
            />
          </label>
          <label className="settings-field">
            <span>Type latest answer hotkey</span>
            <input
              value={config.shortcuts.typeLatestAnswer}
              placeholder="Ctrl+Shift+T"
              onChange={(event) => updateShortcuts({ typeLatestAnswer: event.currentTarget.value })}
            />
          </label>
          <label className="settings-field">
            <span>Overlay opacity</span>
            <input
              type="number"
              min="0.1"
              max="1"
              step="0.01"
              value={config.overlay.opacity}
              onChange={(event) => updateOverlay({ opacity: Number(event.currentTarget.value) })}
            />
          </label>
          <label className="settings-field">
            <span>Overlay font size</span>
            <input
              type="number"
              min="12"
              max="28"
              value={config.overlay.fontSize}
              onChange={(event) => updateOverlay({ fontSize: Number(event.currentTarget.value) })}
            />
          </label>
          <label className="settings-field">
            <span>Overlay X</span>
            <input
              type="number"
              value={config.overlay.bounds.x}
              onChange={(event) => updateOverlayBounds({ x: Number(event.currentTarget.value) })}
            />
          </label>
          <label className="settings-field">
            <span>Overlay Y</span>
            <input
              type="number"
              value={config.overlay.bounds.y}
              onChange={(event) => updateOverlayBounds({ y: Number(event.currentTarget.value) })}
            />
          </label>
          <label className="settings-field">
            <span>Overlay width</span>
            <input
              type="number"
              min="320"
              value={config.overlay.bounds.width}
              onChange={(event) => updateOverlayBounds({ width: Number(event.currentTarget.value) })}
            />
          </label>
          <label className="settings-field">
            <span>Overlay height</span>
            <input
              type="number"
              min="180"
              value={config.overlay.bounds.height}
              onChange={(event) => updateOverlayBounds({ height: Number(event.currentTarget.value) })}
            />
          </label>
          <div className="button-row settings-actions">
            <Button variant="secondary" icon={<Keyboard size={16} />} onClick={readOverlayBounds}>
              Read Overlay Position
            </Button>
            <Button variant="primary" icon={<Save size={16} />} onClick={applyOverlayBounds}>
              Apply Overlay Position
            </Button>
          </div>
          <label className="toggle-row">
            <span>Lock overlay position</span>
            <input
              type="checkbox"
              checked={config.overlay.locked}
              onChange={(event) => updateOverlay({ locked: event.currentTarget.checked })}
            />
          </label>
          <label className="toggle-row">
            <span>Auto-hide when screen sharing</span>
            <input
              type="checkbox"
              checked={config.overlay.autoHideOnScreenShare}
              onChange={(event) => updateOverlay({ autoHideOnScreenShare: event.currentTarget.checked })}
            />
          </label>
        </div>
      </section>

      <section className="panel prompt-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Context</p>
            <h2>Prompt Budget</h2>
          </div>
        </div>
        <div className="settings-two-column">
          <label className="settings-field">
            <span>Prompt token budget</span>
            <input
              aria-label="Prompt token budget"
              type="number"
              min="500"
              max="128000"
              step="100"
              value={config.contextWindow.maxPromptTokens}
              onChange={(event) => updateContextWindow({ maxPromptTokens: Number(event.currentTarget.value) })}
            />
          </label>
          <label className="settings-field">
            <span>Reserved answer tokens</span>
            <input
              aria-label="Reserved answer tokens"
              type="number"
              min="64"
              max="4096"
              step="64"
              value={config.contextWindow.reservedResponseTokens}
              onChange={(event) => updateContextWindow({ reservedResponseTokens: Number(event.currentTarget.value) })}
            />
          </label>
          <label className="settings-field">
            <span>Transcript turns in prompt</span>
            <input
              aria-label="Transcript turns in prompt"
              type="number"
              min="1"
              max="200"
              step="1"
              value={config.contextWindow.maxHistoryTurns}
              onChange={(event) => updateContextWindow({ maxHistoryTurns: Number(event.currentTarget.value) })}
            />
          </label>
          <label className="settings-field">
            <span>Supplemental context tokens</span>
            <input
              aria-label="Supplemental context tokens"
              type="number"
              min="0"
              max="32000"
              step="50"
              value={config.contextWindow.maxStaticContextTokens}
              onChange={(event) => updateContextWindow({ maxStaticContextTokens: Number(event.currentTarget.value) })}
            />
          </label>
        </div>
      </section>

      <section className="panel prompt-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Context</p>
            <h2>Resume And Job Description</h2>
          </div>
        </div>
        <div className="context-grid">
          <label className="settings-field">
            <span>Resume context</span>
            <textarea
              value={config.resumeContext}
              onChange={(event) => setConfig((current) => ({ ...current, resumeContext: event.currentTarget.value }))}
              placeholder="Paste the skills, projects, and work history you want Caveman to use..."
            />
          </label>
          <label className="settings-field">
            <span>Resume file</span>
            <input
              type="file"
              multiple
              accept=".txt,.md,.markdown,.json,.csv"
              onChange={(event) => {
                void importPromptContextFiles(event.currentTarget.files, "resumeContext", "Resume");
                event.currentTarget.value = "";
              }}
            />
          </label>
          <label className="settings-field">
            <span>Job description context</span>
            <textarea
              value={config.jobDescriptionContext}
              onChange={(event) =>
                setConfig((current) => ({ ...current, jobDescriptionContext: event.currentTarget.value }))
              }
              placeholder="Paste the target role or interview context..."
            />
          </label>
          <label className="settings-field">
            <span>Job description file</span>
            <input
              type="file"
              multiple
              accept=".txt,.md,.markdown,.json,.csv"
              onChange={(event) => {
                void importPromptContextFiles(event.currentTarget.files, "jobDescriptionContext", "Job description");
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      </section>

      <section className="panel prompt-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">RAG</p>
            <h2>Knowledge Base</h2>
          </div>
          <BookOpen size={18} />
        </div>
        <div className="settings-two-column">
          <label className="settings-field">
            <span>Knowledge title</span>
            <input
              value={knowledgeTitle}
              placeholder="Project, company, framework, or story name"
              onChange={(event) => setKnowledgeTitle(event.currentTarget.value)}
            />
          </label>
          <label className="settings-field">
            <span>Knowledge source</span>
            <select value={knowledgeSourceType} onChange={(event) => setKnowledgeSourceType(event.currentTarget.value)}>
              <option value="project">Project</option>
              <option value="resume">Resume</option>
              <option value="job">Job</option>
              <option value="note">Note</option>
              <option value="code">Code</option>
            </select>
          </label>
          <label className="settings-field">
            <span>Knowledge text</span>
            <textarea
              value={knowledgeText}
              placeholder="Paste project notes, implementation details, metrics, interview stories, or codebase facts."
              onChange={(event) => setKnowledgeText(event.currentTarget.value)}
            />
          </label>
          <label className="settings-field">
            <span>Knowledge files</span>
            <input
              type="file"
              multiple
              accept=".txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.cs,.yml,.yaml"
              onChange={(event) => {
                void importKnowledgeFiles(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <div className="settings-field">
            <span>Indexed content</span>
            <strong>
              {knowledgeBase.documents.length} document{knowledgeBase.documents.length === 1 ? "" : "s"} /{" "}
              {knowledgeBase.chunks.length} chunk{knowledgeBase.chunks.length === 1 ? "" : "s"}
            </strong>
          </div>
          <Button variant="primary" icon={<FilePlus2 size={16} />} onClick={addKnowledgeDocument}>
            Add Knowledge Document
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 size={16} />}
            onClick={clearStoredKnowledgeBase}
            disabled={knowledgeBase.documents.length === 0}
          >
            Clear Knowledge Base
          </Button>
          <label className="settings-field">
            <span>Search knowledge</span>
            <input
              value={knowledgeQuery}
              placeholder="Search the context that will be injected into answers"
              onChange={(event) => setKnowledgeQuery(event.currentTarget.value)}
            />
          </label>
        </div>
        {knowledgeBase.documents.length > 0 ? (
          <div className="provider-editor-list knowledge-document-list">
            {knowledgeBase.documents.map((document) => (
              <article className="prompt-row knowledge-document-row" key={document.id}>
                <div>
                  <strong>{document.title}</strong>
                  <p>
                    {document.sourceType} / {document.characterCount} character
                    {document.characterCount === 1 ? "" : "s"}
                  </p>
                </div>
                <Button
                  variant="danger"
                  icon={<Trash2 size={16} />}
                  aria-label={`Delete knowledge document ${document.title}`}
                  onClick={() => {
                    void deleteKnowledgeDocument(document.id, document.title);
                  }}
                >
                  Delete
                </Button>
              </article>
            ))}
          </div>
        ) : null}
        {knowledgeResults.length > 0 ? (
          <div className="provider-editor-list">
            {knowledgeResults.map((chunk) => (
              <article className="prompt-row" key={chunk.id}>
                <strong>{chunk.sourceLabel}</strong>
                <p>{chunk.text}</p>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel prompt-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Live Pipeline</p>
            <h2>Audio And STT</h2>
          </div>
          <Mic size={18} />
        </div>
        <div className="settings-two-column">
          <label className="settings-field">
            <span>Capture mode</span>
            <select
              value={config.audio.captureMode}
              onChange={(event) =>
                updateAudio({
                  captureMode: event.currentTarget.value as AudioSettings["captureMode"],
                  dualStreamEnabled: event.currentTarget.value === "dual"
                })
              }
            >
              <option value="manual">Manual transcript</option>
              <option value="microphone">Microphone only</option>
              <option value="system">System audio only</option>
              <option value="dual">System + microphone</option>
            </select>
          </label>
          <label className="settings-field">
            <span>STT provider</span>
            <select
              value={config.stt.selectedMode}
              onChange={(event) =>
                void updateSelectedSttMode(event.currentTarget.value as SttSettings["selectedMode"])
              }
            >
              <option value="manual">Manual</option>
              <option value="local_whisper">Local Whisper</option>
              <option value="deepgram">Deepgram</option>
              <option value="assemblyai">AssemblyAI</option>
              <option value="google">Google STT</option>
            </select>
          </label>
          <label className="settings-field">
            <span>Cloud STT API key</span>
            <input
              type="password"
              value={sttSecretInput}
              placeholder="Paste Deepgram, AssemblyAI, or Google key"
              onChange={(event) => {
                setSttSecretInput(event.currentTarget.value);
                updateStt({ apiKey: event.currentTarget.value });
              }}
            />
          </label>
          <div className="button-row settings-actions">
            <Button variant="primary" icon={<Save size={16} />} onClick={saveSttSecret}>
              Save STT Key
            </Button>
            <Button variant="secondary" icon={<Trash2 size={16} />} onClick={deleteSttSecret}>
              Delete STT Key
            </Button>
          </div>
          <label className="settings-field">
            <span>Microphone device</span>
            <select
              value={config.audio.microphoneDeviceId}
              onChange={(event) => updateAudio({ microphoneDeviceId: event.currentTarget.value })}
            >
              {audioDeviceOptions("microphone", config.audio.microphoneDeviceId, "Default microphone").map((device) => (
                <option key={device.id} value={device.id}>
                  {device.label}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-field">
            <span>System audio device</span>
            <select
              value={config.audio.systemDeviceId}
              onChange={(event) => updateAudio({ systemDeviceId: event.currentTarget.value })}
            >
              {audioDeviceOptions("system", config.audio.systemDeviceId, "Default system output").map((device) => (
                <option key={device.id} value={device.id}>
                  {device.label}
                </option>
              ))}
            </select>
          </label>
          <div className="button-row settings-actions">
            <Button icon={<Play size={16} />} onClick={runAudioRehearsal} disabled={testingAudioRehearsal}>
              {testingAudioRehearsal ? "Testing Audio" : "Run Audio Rehearsal"}
            </Button>
          </div>
          {audioRehearsalResult ? (
            <div className="settings-field audio-rehearsal-result">
              <span>Audio rehearsal</span>
              <strong>{audioRehearsalResult.message}</strong>
              <div className="audio-rehearsal-metrics">
                <span>Mic peak {formatPeakPercent(audioRehearsalResult.microphonePeak)}</span>
                <span>System peak {formatPeakPercent(audioRehearsalResult.systemPeak)}</span>
                <span>{audioRehearsalResult.durationMs} ms</span>
              </div>
              {audioRehearsalResult.warnings.length > 0 ? (
                <small>{audioRehearsalResult.warnings.join(" ")}</small>
              ) : null}
            </div>
          ) : null}
          <label className="settings-field">
            <span>Gain dB</span>
            <input
              type="number"
              min="-24"
              max="12"
              value={config.audio.gainDb}
              onChange={(event) => updateAudio({ gainDb: Number(event.currentTarget.value) })}
            />
          </label>
          <label className="settings-field">
            <span>Noise gate dB</span>
            <input
              type="number"
              min="-80"
              max="0"
              value={config.audio.noiseGateDb}
              onChange={(event) => updateAudio({ noiseGateDb: Number(event.currentTarget.value) })}
            />
          </label>
          <label className="settings-field">
            <span>Whisper binary path</span>
            <input
              value={config.stt.localWhisperBinaryPath}
              placeholder="C:\\tools\\whisper.cpp\\main.exe"
              onChange={(event) => updateStt({ localWhisperBinaryPath: event.currentTarget.value })}
            />
          </label>
          <label className="settings-field">
            <span>Whisper model path</span>
            <input
              value={config.stt.localWhisperModelPath}
              placeholder="C:\\models\\ggml-base.en.bin"
              onChange={(event) => updateStt({ localWhisperModelPath: event.currentTarget.value })}
            />
          </label>
          <div className="button-row settings-actions">
            <Button icon={<RefreshCw size={16} />} onClick={autoDetectWhisperSetup} disabled={detectingWhisper}>
              {detectingWhisper ? "Detecting Whisper" : "Auto Detect Whisper"}
            </Button>
            <Button
              icon={<DownloadCloud size={16} />}
              onClick={downloadBaseWhisperModel}
              disabled={downloadingWhisper}
            >
              {downloadingWhisper ? "Downloading Model" : "Download Base.en Model"}
            </Button>
          </div>
          <label className="settings-field">
            <span>Sample audio file</span>
            <input
              value={sttSampleAudioPath}
              placeholder="C:\\audio\\sample.wav"
              onChange={(event) => setSttSampleAudioPath(event.currentTarget.value)}
            />
          </label>
          <label className="settings-field">
            <span>Cloud STT endpoint</span>
            <input
              value={config.stt.cloudEndpoint}
              placeholder="Optional provider endpoint override"
              onChange={(event) => updateStt({ cloudEndpoint: event.currentTarget.value })}
            />
          </label>
          <label className="settings-field">
            <span>STT language</span>
            <select
              value={normalizeSttLanguage(config.stt.language)}
              onChange={(event) => updateStt({ language: event.currentTarget.value })}
            >
              {sttLanguageOptions(config.stt.language).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-field">
            <span>Application source</span>
            <select
              value={config.audio.applicationTargetId}
              onChange={(event) => updateApplicationTarget(event.currentTarget.value)}
            >
              <option value="all-system-audio">All system audio</option>
              {applicationTargetOptions(config.audio, audioApplications).map((application) => (
                <option key={application.id} value={application.id}>
                  {application.label}
                </option>
              ))}
            </select>
          </label>
          <label className="toggle-row">
            <span>Diarization labels</span>
            <input
              type="checkbox"
              checked={config.stt.diarizationEnabled}
              onChange={(event) => updateStt({ diarizationEnabled: event.currentTarget.checked })}
            />
          </label>
          <label className="settings-field">
            <span>System audio default speaker</span>
            <select
              value={config.stt.speakerCalibration.systemAudioSpeaker}
              onChange={(event) => updateSpeakerCalibration({ systemAudioSpeaker: event.currentTarget.value as Speaker })}
            >
              {SPEAKER_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-field">
            <span>Microphone default speaker</span>
            <select
              value={config.stt.speakerCalibration.microphoneSpeaker}
              onChange={(event) => updateSpeakerCalibration({ microphoneSpeaker: event.currentTarget.value as Speaker })}
            >
              {SPEAKER_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-field">
            <span>Provider speaker 0</span>
            <select
              value={config.stt.speakerCalibration.providerSpeaker0}
              onChange={(event) => updateSpeakerCalibration({ providerSpeaker0: event.currentTarget.value as Speaker })}
            >
              {SPEAKER_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-field">
            <span>Provider speaker 1</span>
            <select
              value={config.stt.speakerCalibration.providerSpeaker1}
              onChange={(event) => updateSpeakerCalibration({ providerSpeaker1: event.currentTarget.value as Speaker })}
            >
              {SPEAKER_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="toggle-row">
            <span>Prefer provider diarization labels</span>
            <input
              type="checkbox"
              checked={config.stt.speakerCalibration.preferProviderDiarization}
              onChange={(event) =>
                updateSpeakerCalibration({ preferProviderDiarization: event.currentTarget.checked })
              }
            />
          </label>
          <Button icon={<Wifi size={16} />} onClick={testLocalWhisper} disabled={testingStt}>
            {testingStt ? "Testing STT" : "Test Local Whisper"}
          </Button>
          <Button icon={<Wifi size={16} />} onClick={testCloudStt} disabled={testingStt}>
            {testingStt ? "Testing STT" : "Test Cloud STT"}
          </Button>
        </div>
      </section>

      <section className="panel prompt-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Automation</p>
            <h2>Automatic Answering</h2>
          </div>
          <Bot size={18} />
        </div>
        <div className="settings-two-column">
          <label className="settings-field">
            <span>Trigger mode</span>
            <select
              value={config.autoTrigger.mode}
              onChange={(event) =>
                updateAutoTrigger({ mode: event.currentTarget.value as AutoTriggerSettings["mode"] })
              }
            >
              <option value="manual">Manual only</option>
              <option value="suggest_on_question">Suggest on interviewer question</option>
              <option value="continuous_coach">Continuous coach</option>
            </select>
          </label>
          <label className="settings-field">
            <span>Silence timeout ms</span>
            <input
              type="number"
              min="500"
              max="10000"
              value={config.autoTrigger.silenceTimeoutMs}
              onChange={(event) => updateAutoTrigger({ silenceTimeoutMs: Number(event.currentTarget.value) })}
            />
          </label>
          <label className="settings-field">
            <span>Duplicate window ms</span>
            <input
              type="number"
              min="1000"
              max="300000"
              value={config.autoTrigger.duplicateWindowMs}
              onChange={(event) => updateAutoTrigger({ duplicateWindowMs: Number(event.currentTarget.value) })}
            />
          </label>
          <label className="toggle-row">
            <span>Only interviewer speech can trigger</span>
            <input
              type="checkbox"
              checked={config.autoTrigger.requireInterviewerSpeaker}
              onChange={(event) => updateAutoTrigger({ requireInterviewerSpeaker: event.currentTarget.checked })}
            />
          </label>
          <label className="toggle-row">
            <span>Enable auto-answer typing</span>
            <input
              type="checkbox"
              checked={config.autoAnswer.enabled}
              onChange={(event) => updateAutoAnswer({ enabled: event.currentTarget.checked })}
            />
          </label>
          <label className="toggle-row">
            <span>Type generated answers into active window</span>
            <input
              type="checkbox"
              checked={config.autoAnswer.typeIntoActiveWindow}
              onChange={(event) => updateAutoAnswer({ typeIntoActiveWindow: event.currentTarget.checked })}
            />
          </label>
          <label className="settings-field">
            <span>Auto-answer typing delay</span>
            <input
              aria-label="Auto-answer typing delay"
              type="number"
              min="0"
              max="10000"
              step="250"
              value={config.autoAnswer.delayMs}
              onChange={(event) => updateAutoAnswer({ delayMs: Number(event.currentTarget.value) })}
            />
          </label>
        </div>
      </section>

      <section className="panel prompt-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Screen Context</p>
            <h2>Screen OCR</h2>
          </div>
          <ScanText size={18} />
        </div>
        <div className="settings-two-column">
          <label className="toggle-row">
            <span>Enable OCR context</span>
            <input
              type="checkbox"
              checked={config.ocr.enabled}
              onChange={(event) => updateOcr({ enabled: event.currentTarget.checked })}
            />
          </label>
          <label className="settings-field">
            <span>OCR provider</span>
            <select
              value={config.ocr.provider}
              onChange={(event) => updateOcr({ provider: event.currentTarget.value as OcrSettings["provider"] })}
            >
              <option value="disabled">Disabled</option>
              <option value="local_tesseract">Local Tesseract</option>
              <option value="windows_ocr">Windows OCR</option>
              <option value="cloud">Cloud OCR</option>
            </select>
          </label>
          <label className="toggle-row">
            <span>Review before prompt injection</span>
            <input
              type="checkbox"
              checked={config.ocr.reviewBeforeSend}
              onChange={(event) => updateOcr({ reviewBeforeSend: event.currentTarget.checked })}
            />
          </label>
          <label className="toggle-row">
            <span>Include reviewed OCR in prompt</span>
            <input
              type="checkbox"
              checked={config.ocr.includeInPrompt}
              onChange={(event) => updateOcr({ includeInPrompt: event.currentTarget.checked })}
            />
          </label>
          <Button icon={<ScanText size={16} />} onClick={captureOcrContext} disabled={capturingOcr}>
            {capturingOcr ? "Capturing OCR" : "Capture Screen OCR"}
          </Button>
          <label className="settings-field">
            <span>Reviewed OCR text</span>
            <textarea
              value={ocrReviewText}
              onChange={(event) => {
                setOcrReviewText(event.currentTarget.value);
                updateOcr({
                  includeInPrompt: event.currentTarget.value.trim().length > 0,
                  lastText: event.currentTarget.value,
                  lastCapturedAtMs: Date.now()
                });
              }}
              placeholder="Captured screen text appears here for review before prompt injection."
            />
          </label>
        </div>
      </section>

      <section className="panel prompt-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Playback</p>
            <h2>Text To Speech</h2>
          </div>
          <Volume2 size={18} />
        </div>
        <div className="settings-two-column">
          <label className="toggle-row">
            <span>Enable TTS</span>
            <input
              type="checkbox"
              checked={config.tts.enabled}
              onChange={(event) => updateTts({ enabled: event.currentTarget.checked })}
            />
          </label>
          <label className="toggle-row">
            <span>Auto-play answers</span>
            <input
              type="checkbox"
              checked={config.tts.autoPlay}
              onChange={(event) => updateTts({ autoPlay: event.currentTarget.checked })}
            />
          </label>
          <label className="toggle-row">
            <span>Mute in stealth mode</span>
            <input
              type="checkbox"
              checked={config.tts.muteInStealth}
              onChange={(event) => updateTts({ muteInStealth: event.currentTarget.checked })}
            />
          </label>
          <label className="settings-field">
            <span>Voice</span>
            <input value={config.tts.voice} onChange={(event) => updateTts({ voice: event.currentTarget.value })} />
          </label>
          <label className="settings-field">
            <span>Language</span>
            <input
              value={config.tts.language}
              onChange={(event) => updateTts({ language: event.currentTarget.value })}
            />
          </label>
          <label className="settings-field">
            <span>Rate</span>
            <input
              type="number"
              min="0.5"
              max="2"
              step="0.1"
              value={config.tts.rate}
              onChange={(event) => updateTts({ rate: Number(event.currentTarget.value) })}
            />
          </label>
          <label className="settings-field">
            <span>Volume</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.1"
              value={config.tts.volume}
              onChange={(event) => updateTts({ volume: Number(event.currentTarget.value) })}
            />
          </label>
        </div>
        <div className="button-row settings-actions">
          <Button icon={<Play size={16} />} onClick={previewTts}>
            Preview Voice
          </Button>
          <Button variant="secondary" icon={<Square size={16} />} onClick={stopTtsPreview}>
            Stop Voice
          </Button>
        </div>
      </section>

      <section className="panel prompt-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Hardening</p>
            <h2>Security And Updates</h2>
          </div>
          <ShieldCheck size={18} />
        </div>
        <div className="settings-two-column">
          <label className="toggle-row">
            <span>Local-only mode</span>
            <input
              type="checkbox"
              checked={config.security.localOnlyMode}
              onChange={(event) => updateSecurity({ localOnlyMode: event.currentTarget.checked })}
            />
          </label>
          <label className="toggle-row">
            <span>Block cloud calls while local-only</span>
            <input
              type="checkbox"
              checked={config.security.blockCloudWhenLocalOnly}
              onChange={(event) => updateSecurity({ blockCloudWhenLocalOnly: event.currentTarget.checked })}
            />
          </label>
          <label className="toggle-row">
            <span>Windows capture exclusion</span>
            <input
              type="checkbox"
              checked={config.security.captureExclusionEnabled}
              onChange={(event) => updateSecurity({ captureExclusionEnabled: event.currentTarget.checked })}
            />
          </label>
          <label className="toggle-row">
            <span>Require signed updates</span>
            <input
              type="checkbox"
              checked={config.security.signedUpdatesRequired}
              onChange={(event) => updateSecurity({ signedUpdatesRequired: event.currentTarget.checked })}
            />
          </label>
          <Button icon={<RefreshCw size={16} />} onClick={checkForUpdates} disabled={checkingUpdate || installingUpdate}>
            {checkingUpdate ? "Checking Updates" : "Check Signed Updates"}
          </Button>
          <Button
            variant="primary"
            icon={<DownloadCloud size={16} />}
            onClick={installSignedUpdate}
            disabled={checkingUpdate || installingUpdate}
          >
            {installingUpdate ? "Installing Update" : "Install Signed Update"}
          </Button>
        </div>
        {updateProgress ? <p className="page-status">Update download: {updateProgress}</p> : null}
        <div className="security-activity">
          <div className="provider-editor-header">
            <strong>Security Activity</strong>
            <Button icon={<RefreshCw size={16} />} onClick={refreshSecurityEvents}>
              Refresh Activity
            </Button>
          </div>
          {securityEvents.length > 0 ? (
            <div className="provider-editor-list">
              {securityEvents.map((event) => (
                <article className="prompt-row" key={event.id}>
                  <strong>{event.action}</strong>
                  <p>
                    {event.category}
                    {event.target ? ` / ${event.target}` : ""} / {event.createdAt}
                  </p>
                  {event.details ? <small>{event.details}</small> : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-copy">No sensitive activity recorded yet.</p>
          )}
        </div>
      </section>

      <section className="panel prompt-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Extensions</p>
            <h2>Plugin System</h2>
          </div>
          <Puzzle size={18} />
        </div>
        <div className="settings-two-column">
          <label className="toggle-row">
            <span>Enable local plugins</span>
            <input
              type="checkbox"
              checked={config.plugins.enabled}
              onChange={(event) => updatePlugins({ enabled: event.currentTarget.checked })}
            />
          </label>
          <label className="settings-field">
            <span>Plugin directory</span>
            <input
              value={config.plugins.directory}
              placeholder="C:\\Users\\you\\caveman-plugins"
              onChange={(event) => updatePlugins({ directory: event.currentTarget.value })}
            />
          </label>
          <label className="toggle-row">
            <span>Prompt template contributions</span>
            <input
              type="checkbox"
              checked={config.plugins.allowPromptTemplates}
              onChange={(event) => updatePlugins({ allowPromptTemplates: event.currentTarget.checked })}
            />
          </label>
          <label className="toggle-row">
            <span>Practice question packs</span>
            <input
              type="checkbox"
              checked={config.plugins.allowPracticePacks}
              onChange={(event) => updatePlugins({ allowPracticePacks: event.currentTarget.checked })}
            />
          </label>
          <Button variant="primary" icon={<Puzzle size={16} />} onClick={loadLocalPlugins}>
            Load Plugins
          </Button>
          <div className="settings-field">
            <span>Loaded contributions</span>
            <strong>
              {pluginCatalog.loaded.length} plugin{pluginCatalog.loaded.length === 1 ? "" : "s"} /{" "}
              {pluginCatalog.promptTemplates.length} prompt template
              {pluginCatalog.promptTemplates.length === 1 ? "" : "s"} / {pluginCatalog.practicePacks.length} practice pack
              {pluginCatalog.practicePacks.length === 1 ? "" : "s"} / {pluginCatalog.exportTemplates.length} export template
              {pluginCatalog.exportTemplates.length === 1 ? "" : "s"}
            </strong>
          </div>
        </div>
        {pluginCatalog.loaded.length > 0 ? (
          <div className="provider-editor-list">
            {pluginCatalog.loaded.map((plugin) => (
              <article className="prompt-row" key={plugin.path}>
                <strong>
                  {plugin.manifest.name} {plugin.manifest.version}
                </strong>
                <p>{plugin.path}</p>
              </article>
            ))}
          </div>
        ) : null}
        {pluginCatalog.errors.length > 0 ? (
          <div className="runtime-status">
            <span>Plugin loader warnings</span>
            <strong>{pluginCatalog.errors.join(" ")}</strong>
          </div>
        ) : null}
      </section>

      <section className="panel prompt-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Prompts</p>
            <h2>System Templates</h2>
          </div>
        </div>
        {promptTemplates.map((template) => (
          <article className="prompt-row" key={template.id}>
            <strong>{template.name}</strong>
            <p>{template.systemPrompt}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

function isCloudSttMode(mode: SttSettings["selectedMode"]): mode is "deepgram" | "assemblyai" | "google" {
  return mode === "deepgram" || mode === "assemblyai" || mode === "google";
}

function readinessStatusLabel(status: ReadinessStatus): string {
  if (status === "blocked") {
    return "Blocked";
  }

  if (status === "warning") {
    return "Needs setup";
  }

  return "Ready";
}

function readinessStatusClass(status: ReadinessStatus): string {
  if (status === "blocked") {
    return "status-danger";
  }

  if (status === "warning") {
    return "status-warning";
  }

  return "status-live";
}

function sttSecretProviderId(mode: "deepgram" | "assemblyai" | "google"): string {
  return `stt-${mode}`;
}

function normalizeSttLanguage(language: string): string {
  return language.trim() || "auto";
}

function sttLanguageOptions(language: string): Array<{ value: string; label: string }> {
  const current = normalizeSttLanguage(language);
  if (STT_LANGUAGE_OPTIONS.some((option) => option.value === current)) {
    return STT_LANGUAGE_OPTIONS;
  }

  return [...STT_LANGUAGE_OPTIONS, { value: current, label: current }];
}

function audioApplicationLabel(application: AudioApplication): string {
  return application.windowTitle?.trim() || application.name;
}

function applicationTargetOptions(
  audio: AudioSettings,
  applications: AudioApplication[]
): Array<{ id: string; label: string }> {
  const liveOptions = applications.map((application) => ({
    id: application.id,
    label: audioApplicationLabel(application)
  }));
  if (
    audio.applicationTargetId !== "all-system-audio" &&
    audio.applicationTargetId.trim() &&
    !liveOptions.some((option) => option.id === audio.applicationTargetId)
  ) {
    return [
      {
        id: audio.applicationTargetId,
        label: audio.applicationTargetLabel || audio.applicationTargetId
      },
      ...liveOptions
    ];
  }

  return liveOptions;
}

function isCloudBlocked(config: AppConfig): boolean {
  return config.security.localOnlyMode && config.security.blockCloudWhenLocalOnly;
}

function isCloudProviderBlocked(provider: ModelProviderConfig, config: AppConfig): boolean {
  return provider.kind === "cloud" && isCloudBlocked(config);
}

function formatModelOption(model: ModelInfo): string {
  const context = model.contextLength > 0 ? ` (${model.contextLength.toLocaleString()} ctx)` : "";
  return `${model.name || model.id}${context}`;
}

function formatPeakPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function parentDirectory(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "";
  }

  const separatorIndex = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  return separatorIndex > 0 ? trimmed.slice(0, separatorIndex) : "";
}

function appendPromptContext(existing: string, imported: string): string {
  return [existing.trim(), imported.trim()].filter(Boolean).join("\n\n");
}

function cloneOverlaySettings(overlay: OverlaySettings): OverlaySettings {
  return {
    ...overlay,
    bounds: { ...overlay.bounds }
  };
}

function createProfileId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || globalThis.crypto?.randomUUID?.() || `profile-${Date.now()}`;
}

function createKnowledgeDocumentId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  if (slug) {
    return slug;
  }

  return globalThis.crypto?.randomUUID?.() ?? `knowledge-${Date.now()}`;
}
