import { Activity, Dumbbell, History, Settings as SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Practice } from "./pages/Practice";
import { Sessions } from "./pages/Sessions";
import { Settings } from "./pages/Settings";

type AppTab = "dashboard" | "sessions" | "practice" | "settings";

const tabs: Array<{ id: AppTab; label: string; icon: ReactNode }> = [
  { id: "dashboard", label: "Dashboard", icon: <Activity size={17} /> },
  { id: "sessions", label: "Sessions", icon: <History size={17} /> },
  { id: "practice", label: "Practice", icon: <Dumbbell size={17} /> },
  { id: "settings", label: "Settings", icon: <SettingsIcon size={17} /> }
];

export function App() {
  const [tab, setTab] = useState<AppTab>("dashboard");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">C</div>
          <div>
            <strong>Caveman</strong>
            <span>Interview Copilot</span>
          </div>
        </div>

        <nav aria-label="Primary navigation">
          {tabs.map((item) => (
            <button className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)}>
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-status">
          <span className="status-dot" />
          <div>
            <strong>Offline ready</strong>
            <span>Local STT + local LLM path</span>
          </div>
        </div>
      </aside>

      <div className="workspace">
        {tab === "dashboard" ? <Dashboard /> : null}
        {tab === "sessions" ? <Sessions /> : null}
        {tab === "practice" ? <Practice /> : null}
        {tab === "settings" ? <Settings /> : null}
      </div>
    </div>
  );
}
