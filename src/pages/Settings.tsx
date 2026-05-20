import { Bot, KeyRound, Mic, Puzzle, Save, ScanText, ShieldCheck, Volume2, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/common/Button";
import {
  APP_CONFIG_SETTING_KEY,
  DEFAULT_APP_CONFIG,
  type AppConfig,
  parseAppConfig,
  serializeAppConfig
} from "../lib/appConfig";
import { createConfiguredProvider } from "../lib/providerClients";
import { getSetting, saveSetting, transcribeWithLocalWhisper } from "../lib/tauri";
import { promptTemplates } from "../lib/promptTemplates";
import type {
  AudioSettings,
  AutoTriggerSettings,
  ModelProviderConfig,
  OcrSettings,
  PluginSettings,
  ProviderId,
  SecuritySettings,
  SttSettings,
  TtsSettings
} from "../types/settings";

export function Settings() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [status, setStatus] = useState("Loading settings...");
  const [testingProviderId, setTestingProviderId] = useState<ProviderId | null>(null);
  const [sttSampleAudioPath, setSttSampleAudioPath] = useState("");
  const [testingStt, setTestingStt] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const stored = parseAppConfig(await getSetting(APP_CONFIG_SETTING_KEY));
      if (!cancelled) {
        setConfig(stored);
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

  function updateProvider(id: ProviderId, patch: Partial<ModelProviderConfig>) {
    setConfig((current) => ({
      ...current,
      providers: current.providers.map((provider) => (provider.id === id ? { ...provider, ...patch } : provider))
    }));
  }

  function updateAudio(patch: Partial<AudioSettings>) {
    setConfig((current) => ({ ...current, audio: { ...current.audio, ...patch } }));
  }

  function updateStt(patch: Partial<SttSettings>) {
    setConfig((current) => ({ ...current, stt: { ...current.stt, ...patch } }));
  }

  function updateAutoTrigger(patch: Partial<AutoTriggerSettings>) {
    setConfig((current) => ({ ...current, autoTrigger: { ...current.autoTrigger, ...patch } }));
  }

  function updateOcr(patch: Partial<OcrSettings>) {
    setConfig((current) => ({ ...current, ocr: { ...current.ocr, ...patch } }));
  }

  function updateTts(patch: Partial<TtsSettings>) {
    setConfig((current) => ({ ...current, tts: { ...current.tts, ...patch } }));
  }

  function updateSecurity(patch: Partial<SecuritySettings>) {
    setConfig((current) => ({ ...current, security: { ...current.security, ...patch } }));
  }

  function updatePlugins(patch: Partial<PluginSettings>) {
    setConfig((current) => ({ ...current, plugins: { ...current.plugins, ...patch } }));
  }

  return (
    <main className="settings-grid">
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
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                selectedProviderId: event.currentTarget.value as ProviderId
              }))
            }
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
                <Button
                  icon={<Wifi size={16} />}
                  onClick={() => testProvider(provider)}
                  disabled={testingProviderId === provider.id}
                >
                  {testingProviderId === provider.id ? "Testing" : "Test"}
                </Button>
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
              {provider.kind === "cloud" ? (
                <label className="settings-field">
                  <span>API key</span>
                  <input
                    type="password"
                    value={provider.apiKey ?? ""}
                    placeholder="Paste API key"
                    onChange={(event) =>
                      updateProvider(provider.id, {
                        apiKey: event.currentTarget.value,
                        apiKeyStored: event.currentTarget.value.trim().length > 0
                      })
                    }
                  />
                </label>
              ) : null}
            </article>
          ))}
        </div>

        <div className="runtime-status">
          <span>{status}</span>
          <strong>
            API keys are stored in local app settings in this build. OS keychain storage is the next security hardening
            step.
          </strong>
        </div>
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
              <strong>{provider.apiKeyStored ? "Configured locally" : "No key configured"}</strong>
            </div>
          ))}
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
            <span>Job description context</span>
            <textarea
              value={config.jobDescriptionContext}
              onChange={(event) =>
                setConfig((current) => ({ ...current, jobDescriptionContext: event.currentTarget.value }))
              }
              placeholder="Paste the target role or interview context..."
            />
          </label>
        </div>
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
              onChange={(event) => {
                const selectedMode = event.currentTarget.value as SttSettings["selectedMode"];
                updateStt({ selectedMode });
                updateAudio({ sttMode: selectedMode });
              }}
            >
              <option value="manual">Manual</option>
              <option value="local_whisper">Local Whisper</option>
              <option value="deepgram">Deepgram</option>
              <option value="assemblyai">AssemblyAI</option>
              <option value="google">Google STT</option>
            </select>
          </label>
          <label className="settings-field">
            <span>Microphone device id</span>
            <input
              value={config.audio.microphoneDeviceId}
              onChange={(event) => updateAudio({ microphoneDeviceId: event.currentTarget.value })}
            />
          </label>
          <label className="settings-field">
            <span>System audio device id</span>
            <input
              value={config.audio.systemDeviceId}
              onChange={(event) => updateAudio({ systemDeviceId: event.currentTarget.value })}
            />
          </label>
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
          <label className="settings-field">
            <span>Sample audio file</span>
            <input
              value={sttSampleAudioPath}
              placeholder="C:\\audio\\sample.wav"
              onChange={(event) => setSttSampleAudioPath(event.currentTarget.value)}
            />
          </label>
          <label className="settings-field">
            <span>Language</span>
            <input value={config.stt.language} onChange={(event) => updateStt({ language: event.currentTarget.value })} />
          </label>
          <label className="toggle-row">
            <span>Diarization labels</span>
            <input
              type="checkbox"
              checked={config.stt.diarizationEnabled}
              onChange={(event) => updateStt({ diarizationEnabled: event.currentTarget.checked })}
            />
          </label>
          <Button icon={<Wifi size={16} />} onClick={testLocalWhisper} disabled={testingStt}>
            {testingStt ? "Testing STT" : "Test Local Whisper"}
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
        </div>
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
