import { KeyRound, Save, Wifi } from "lucide-react";
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
import { getSetting, saveSetting } from "../lib/tauri";
import { promptTemplates } from "../lib/promptTemplates";
import type { ModelProviderConfig, ProviderId } from "../types/settings";

export function Settings() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [status, setStatus] = useState("Loading settings...");
  const [testingProviderId, setTestingProviderId] = useState<ProviderId | null>(null);

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

  function updateProvider(id: ProviderId, patch: Partial<ModelProviderConfig>) {
    setConfig((current) => ({
      ...current,
      providers: current.providers.map((provider) => (provider.id === id ? { ...provider, ...patch } : provider))
    }));
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
