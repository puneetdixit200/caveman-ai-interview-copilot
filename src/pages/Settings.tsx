import { KeyRound, Save } from "lucide-react";
import { Button } from "../components/common/Button";
import { modelProviders, profiles } from "../lib/demoData";
import { promptTemplates } from "../lib/promptTemplates";

export function Settings() {
  return (
    <main className="settings-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Models</p>
            <h1>Provider Router</h1>
          </div>
          <Button variant="primary" icon={<Save size={16} />}>
            Save
          </Button>
        </div>
        <div className="provider-list">
          {modelProviders.map((provider) => (
            <article className="provider-row" key={provider.id}>
              <div>
                <strong>{provider.label}</strong>
                <span>{provider.endpoint}</span>
              </div>
              <code>{provider.model}</code>
              <span className={`status-pill ${provider.enabled ? "status-live" : "status-muted"}`}>
                {provider.enabled ? "Enabled" : "Off"}
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Secrets</p>
            <h2>API Key Vault</h2>
          </div>
          <Button icon={<KeyRound size={16} />}>Add Key</Button>
        </div>
        <div className="vault-list">
          {modelProviders.map((provider) => (
            <div className="vault-row" key={provider.id}>
              <span>{provider.label}</span>
              <strong>{provider.apiKeyStored ? "Stored in OS keychain" : "No key required"}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Profiles</p>
            <h2>Interview Modes</h2>
          </div>
        </div>
        <div className="profile-grid">
          {profiles.map((profile) => (
            <article className="profile-tile" key={profile.id}>
              <strong>{profile.name}</strong>
              <span>{profile.interviewType}</span>
              <span>{profile.providerId}</span>
            </article>
          ))}
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

