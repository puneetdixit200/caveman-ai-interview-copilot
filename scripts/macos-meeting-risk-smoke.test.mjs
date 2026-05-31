import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  MACOS_MEETING_RISK_ACTIVE_WAIT_MS,
  MACOS_MEETING_RISK_FAKE_MEETING_DURATION_MS,
  MACOS_PACKAGED_MEETING_RISK_SCENARIOS,
  MACOS_PACKAGED_REMOTE_SUPPORT_RISK_SCENARIOS,
  MACOS_MEETING_RISK_SMOKE_MARKER,
  FAKE_MEETING_APP_SWIFT,
  cavemanActivationArgs,
  runMacosMeetingRiskSmoke,
  summarizeMacosMeetingRiskSmoke
} from "./macos-meeting-risk-smoke.mjs";

const WINDOW = {
  ownerName: "Caveman",
  windowName: "Caveman",
  windowNumber: 10,
  sharingState: 0,
  isOnscreen: 1,
  width: 1280,
  height: 820
};

test("summarizes simulated meeting risk hide and restore states", () => {
  assert.ok(MACOS_MEETING_RISK_SMOKE_MARKER.includes("Google Meet"));
  assert.ok(MACOS_MEETING_RISK_SMOKE_MARKER.includes("Teams"));
  assert.ok(MACOS_MEETING_RISK_SMOKE_MARKER.includes("Zoom"));
  assert.ok(MACOS_MEETING_RISK_SMOKE_MARKER.includes("Webex"));
  assert.ok(MACOS_MEETING_RISK_SMOKE_MARKER.includes("huddle"));
  assert.ok(MACOS_MEETING_RISK_SMOKE_MARKER.includes("remote desktop"));

  assert.equal(
    summarizeMacosMeetingRiskSmoke({
      platform: "darwin",
      initialWindow: WINDOW,
      scenarioResults: [
        { label: "Google Meet browser window", hiddenDuringRisk: true, restoredAfterRisk: true },
        { label: "Microsoft Teams browser window", hiddenDuringRisk: true, restoredAfterRisk: true },
        { label: "Microsoft Teams native process", hiddenDuringRisk: true, restoredAfterRisk: true },
        { label: "Zoom meeting window", hiddenDuringRisk: true, restoredAfterRisk: true },
        { label: "Webex meeting window", hiddenDuringRisk: true, restoredAfterRisk: true },
        { label: "Browser presenting indicator", hiddenDuringRisk: true, restoredAfterRisk: true },
        { label: "Screen recording indicator", hiddenDuringRisk: true, restoredAfterRisk: true },
        { label: "Slack huddle window", hiddenDuringRisk: true, restoredAfterRisk: true },
        { label: "Discord voice window", hiddenDuringRisk: true, restoredAfterRisk: true },
        { label: "WhatsApp video call window", hiddenDuringRisk: true, restoredAfterRisk: true },
        { label: "Remote desktop window", hiddenDuringRisk: true, restoredAfterRisk: true },
        { label: "Remote support control window", hiddenDuringRisk: true, restoredAfterRisk: true },
        { label: "Screen recorder window", hiddenDuringRisk: true, restoredAfterRisk: true },
        { label: "Window sharing indicator", hiddenDuringRisk: true, restoredAfterRisk: true },
        { label: "Screen shared indicator", hiddenDuringRisk: true, restoredAfterRisk: true },
        { label: "Meeting recording indicator", hiddenDuringRisk: true, restoredAfterRisk: true },
        { label: "Recording in progress indicator", hiddenDuringRisk: true, restoredAfterRisk: true }
      ],
      restoredWindow: WINDOW
    }).status,
    "ready"
  );

  assert.equal(
    summarizeMacosMeetingRiskSmoke({
      platform: "darwin",
      initialWindow: WINDOW,
      scenarioResults: [{ label: "Google Meet browser window", hiddenDuringRisk: true, restoredAfterRisk: false }],
      restoredWindow: WINDOW
    }).status,
    "blocked"
  );

  assert.equal(
    summarizeMacosMeetingRiskSmoke({
      platform: "darwin",
      initialWindow: WINDOW,
      scenarioResults: [{ label: "Google Meet browser window", hiddenDuringRisk: true }],
      restoredWindow: WINDOW,
      requireRestore: true,
      requireScenarioRestore: false
    }).status,
    "ready"
  );

  assert.equal(
    summarizeMacosMeetingRiskSmoke({
      platform: "darwin",
      initialWindow: WINDOW,
      scenarioResults: [
        { label: "Google Meet browser window", hiddenDuringRisk: true, restoredAfterRisk: true },
        { label: "Microsoft Teams browser window", hiddenDuringRisk: false }
      ],
      restoredWindow: WINDOW
    }).status,
    "blocked"
  );

  assert.equal(
    summarizeMacosMeetingRiskSmoke({
      platform: "darwin",
      initialWindow: WINDOW,
      scenarioResults: [
        { label: "Google Meet browser window", hiddenDuringRisk: true },
        { label: "Microsoft Teams browser window", hiddenDuringRisk: true },
        { label: "Microsoft Teams native process", hiddenDuringRisk: true },
        { label: "Zoom meeting window", hiddenDuringRisk: true },
        { label: "Webex meeting window", hiddenDuringRisk: true },
        { label: "Browser presenting indicator", hiddenDuringRisk: true },
        { label: "Screen recording indicator", hiddenDuringRisk: true },
        { label: "Slack huddle window", hiddenDuringRisk: true },
        { label: "Discord voice window", hiddenDuringRisk: true },
        { label: "WhatsApp video call window", hiddenDuringRisk: true },
        { label: "Remote desktop window", hiddenDuringRisk: true },
        { label: "Remote support control window", hiddenDuringRisk: true },
        { label: "Screen recorder window", hiddenDuringRisk: true },
        { label: "Window sharing indicator", hiddenDuringRisk: true },
        { label: "Screen shared indicator", hiddenDuringRisk: true },
        { label: "Meeting recording indicator", hiddenDuringRisk: true },
        { label: "Recording in progress indicator", hiddenDuringRisk: true }
      ],
      restoredWindow: null,
      requireRestore: false
    }).status,
    "ready"
  );

  assert.equal(
    summarizeMacosMeetingRiskSmoke({
      platform: "linux",
      initialWindow: null,
      scenarioResults: [],
      restoredWindow: null
    }).status,
    "skipped"
  );
});

test("can launch a specific packaged Caveman app bundle for meeting-risk smoke", () => {
  assert.deepEqual(cavemanActivationArgs({ appPath: "/Volumes/Caveman/Caveman.app" }), [
    "/Volumes/Caveman/Caveman.app"
  ]);
  assert.deepEqual(cavemanActivationArgs({ bundleId: "com.example.caveman" }), [
    "-b",
    "com.example.caveman"
  ]);
});

test("keeps simulated meeting windows alive long enough for macOS title scans", () => {
  assert.ok(MACOS_MEETING_RISK_ACTIVE_WAIT_MS >= 15_000);
  assert.ok(MACOS_MEETING_RISK_FAKE_MEETING_DURATION_MS > MACOS_MEETING_RISK_ACTIVE_WAIT_MS);
  assert.deepEqual(
    MACOS_PACKAGED_MEETING_RISK_SCENARIOS.map((scenario) => scenario.windowTitle),
    [
      "Google Meet - Candidate Screen",
      "teams.microsoft.com - Interview",
      "Microsoft Teams - Interview",
      "Zoom Meeting - Candidate",
      "Webex Meeting - Candidate",
      "You are presenting",
      "Screen recording - Loom",
      "Slack Huddle - Candidate",
      "Discord Voice - Candidate",
      "web.whatsapp.com - Video call",
      "Remote Desktop - Session",
      "Screen Recorder - Active",
      "You're sharing a window",
      "Your screen is being shared",
      "Meeting is being recorded",
      "Recording in progress"
    ]
  );
  assert.deepEqual(MACOS_PACKAGED_REMOTE_SUPPORT_RISK_SCENARIOS.map((scenario) => scenario.windowTitle), [
    "TeamViewer Remote Control"
  ]);
});

test("fake macOS meeting app exits promptly when simulated risk is cleared", () => {
  assert.match(FAKE_MEETING_APP_SWIFT, /DispatchSource\.makeSignalSource\(signal: terminationSignal/);
  assert.match(FAKE_MEETING_APP_SWIFT, /NSApp\.terminate\(nil\)/);
  assert.match(FAKE_MEETING_APP_SWIFT, /SIGTERM/);
});

test("stops simulated meeting apps before checking Caveman restoration", async () => {
  const visibleWindowRows = JSON.stringify([WINDOW]);
  const queryOutputs = [visibleWindowRows, "[]", visibleWindowRows];
  const killSignals = [];

  const commandRunner = async (command) => {
    if (command === "swift") {
      return { stdout: queryOutputs.shift() ?? visibleWindowRows };
    }
    return { stdout: "" };
  };

  const processSpawner = () => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = (signal) => {
      killSignals.push(signal);
      child.signalCode = signal;
      child.emit("exit");
      return true;
    };
    setTimeout(() => {
      child.exitCode = 0;
      child.emit("exit");
    }, 0);
    return child;
  };

  const result = await runMacosMeetingRiskSmoke({
    platform: "darwin",
    commandRunner,
    processSpawner,
    scenarios: [
      {
        id: "teams-native",
        label: "Microsoft Teams native process",
        executableName: "MSTeams",
        windowTitle: "Microsoft Teams - Interview"
      }
    ]
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(killSignals, ["SIGTERM"]);
  assert.match(result.messages.join("\n"), /restored after risk cleared/);
});

test("counts cleanup restore as macOS scenario restore before continuing", async () => {
  const visibleWindowRows = JSON.stringify([WINDOW]);
  const queryOutputs = [visibleWindowRows, "[]", "[]", visibleWindowRows, visibleWindowRows];

  const commandRunner = async (command) => {
    if (command === "swift") {
      return { stdout: queryOutputs.shift() ?? visibleWindowRows };
    }
    return { stdout: "" };
  };

  const processSpawner = () => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = (signal) => {
      child.signalCode = signal;
      child.emit("exit");
      return true;
    };
    return child;
  };

  const result = await runMacosMeetingRiskSmoke({
    platform: "darwin",
    commandRunner,
    processSpawner,
    restoreWaitMs: 1,
    scenarios: [
      {
        id: "teams-native",
        label: "Microsoft Teams native process",
        executableName: "MSTeams",
        windowTitle: "Microsoft Teams - Interview"
      }
    ]
  });

  assert.equal(result.status, "ready");
  assert.match(result.messages.join("\n"), /restored after risk cleared/);
});

test("blocks macOS meeting-risk smoke when Caveman hides but does not restore after risk clears", async () => {
  const visibleWindowRows = JSON.stringify([WINDOW]);
  const queryOutputs = [visibleWindowRows, "[]"];

  const commandRunner = async (command) => {
    if (command === "swift") {
      return { stdout: queryOutputs.shift() ?? "[]" };
    }
    return { stdout: "" };
  };

  const processSpawner = () => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = (signal) => {
      child.signalCode = signal;
      child.emit("exit");
      return true;
    };
    return child;
  };

  const result = await runMacosMeetingRiskSmoke({
    platform: "darwin",
    commandRunner,
    processSpawner,
    restoreWaitMs: 1,
    scenarios: [
      {
        id: "teams-native",
        label: "Microsoft Teams native process",
        executableName: "MSTeams",
        windowTitle: "Microsoft Teams - Interview"
      }
    ]
  });

  assert.equal(result.status, "blocked");
  assert.match(result.messages.join("\n"), /did not restore after risk cleared/);
});

test("reports last macOS Caveman rows when final batch restore fails", async () => {
  const visibleWindowRows = JSON.stringify([WINDOW]);
  const tinyVisibleWindowRows = JSON.stringify([
    {
      ...WINDOW,
      windowNumber: 11,
      sharingState: 1,
      width: 640,
      height: 410
    }
  ]);
  const queryOutputs = [visibleWindowRows, "[]", tinyVisibleWindowRows];

  const commandRunner = async (command) => {
    if (command === "swift") {
      return { stdout: queryOutputs.shift() ?? tinyVisibleWindowRows };
    }
    return { stdout: "" };
  };

  const processSpawner = () => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = (signal) => {
      child.signalCode = signal;
      child.emit("exit");
      return true;
    };
    return child;
  };

  const result = await runMacosMeetingRiskSmoke({
    platform: "darwin",
    commandRunner,
    processSpawner,
    requireRestore: true,
    requireScenarioRestore: false,
    restoreWaitMs: 1,
    scenarios: [
      {
        id: "teams-native",
        label: "Microsoft Teams native process",
        executableName: "MSTeams",
        windowTitle: "Microsoft Teams - Interview"
      }
    ]
  });

  assert.equal(result.status, "blocked");
  assert.match(result.messages.join("\n"), /Last observed Caveman windows:/);
  assert.match(result.messages.join("\n"), /640x410/);
  assert.match(result.messages.join("\n"), /sharingState=1/);
});

test("blocks macOS meeting-risk smoke when any visible Caveman window remains during risk", async () => {
  const visibleWindowRows = JSON.stringify([WINDOW]);
  const tinyVisibleWindowRows = JSON.stringify([
    {
      ...WINDOW,
      windowNumber: 11,
      width: 640,
      height: 410
    }
  ]);
  const queryOutputs = [visibleWindowRows, tinyVisibleWindowRows];

  const commandRunner = async (command) => {
    if (command === "swift") {
      return { stdout: queryOutputs.shift() ?? tinyVisibleWindowRows };
    }
    return { stdout: "" };
  };

  const processSpawner = () => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = (signal) => {
      child.signalCode = signal;
      child.emit("exit");
      return true;
    };
    return child;
  };

  const result = await runMacosMeetingRiskSmoke({
    platform: "darwin",
    commandRunner,
    processSpawner,
    activeRiskWaitMs: 1,
    scenarios: [
      {
        id: "teams-native",
        label: "Microsoft Teams native process",
        executableName: "MSTeams",
        windowTitle: "Microsoft Teams - Interview"
      }
    ]
  });

  assert.equal(result.status, "blocked");
  assert.match(result.messages.join("\n"), /stayed visible/);
});

test("terminates simulated meeting apps promptly when restoration is not required", async () => {
  const visibleWindowRows = JSON.stringify([WINDOW]);
  const queryOutputs = [visibleWindowRows, "[]", visibleWindowRows];
  const killSignals = [];

  const commandRunner = async (command) => {
    if (command === "swift") {
      return { stdout: queryOutputs.shift() ?? visibleWindowRows };
    }
    return { stdout: "" };
  };

  const processSpawner = () => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = (signal) => {
      killSignals.push(signal);
      child.signalCode = signal;
      child.emit("exit");
      return true;
    };
    setTimeout(() => {
      child.exitCode = 0;
      child.emit("exit");
    }, 0);
    return child;
  };

  const result = await runMacosMeetingRiskSmoke({
    platform: "darwin",
    commandRunner,
    processSpawner,
    requireRestore: false,
    restoreWaitMs: 0,
    scenarios: [
      {
        id: "teams-native",
        label: "Microsoft Teams native process",
        executableName: "MSTeams",
        windowTitle: "Microsoft Teams - Interview"
      }
    ]
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(killSignals, ["SIGTERM"]);
});

test("requires final restore without bouncing visible between macOS risk-batch scenarios", async () => {
  const visibleWindowRows = JSON.stringify([WINDOW]);
  const queryOutputs = [visibleWindowRows, "[]", visibleWindowRows];
  const killSignals = [];

  const commandRunner = async (command) => {
    if (command === "swift") {
      return { stdout: queryOutputs.shift() ?? visibleWindowRows };
    }
    return { stdout: "" };
  };

  const processSpawner = () => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = (signal) => {
      killSignals.push(signal);
      child.signalCode = signal;
      child.emit("exit");
      return true;
    };
    return child;
  };

  const result = await runMacosMeetingRiskSmoke({
    platform: "darwin",
    commandRunner,
    processSpawner,
    requireRestore: true,
    requireScenarioRestore: false,
    scenarios: [
      {
        id: "teams-native",
        label: "Microsoft Teams native process",
        executableName: "MSTeams",
        windowTitle: "Microsoft Teams - Interview"
      }
    ]
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(killSignals, ["SIGTERM"]);
  assert.match(result.messages.join("\n"), /was hidden while the simulated meeting window was visible/);
  assert.match(result.messages.join("\n"), /restored protected onscreen window/);
});

test("clears lingering macOS risk scenario processes before final restore", async () => {
  const visibleWindowRows = JSON.stringify([WINDOW]);
  const queryOutputs = [visibleWindowRows, "[]", visibleWindowRows];
  const commands = [];

  const commandRunner = async (command, args = []) => {
    commands.push([command, args]);
    if (command === "swift") {
      return { stdout: queryOutputs.shift() ?? visibleWindowRows };
    }
    return { stdout: "" };
  };

  const processSpawner = () => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = (signal) => {
      child.signalCode = signal;
      child.emit("exit");
      return true;
    };
    return child;
  };

  const result = await runMacosMeetingRiskSmoke({
    platform: "darwin",
    commandRunner,
    processSpawner,
    requireRestore: true,
    requireScenarioRestore: false,
    scenarios: [
      {
        id: "teams-native",
        label: "Microsoft Teams native process",
        executableName: "MSTeams",
        windowTitle: "Microsoft Teams - Interview"
      }
    ]
  });

  const termIndex = commands.findIndex(
    ([command, args]) => command === "pkill" && args[0] === "-TERM" && args[1] === "-f"
  );
  const killIndex = commands.findIndex(
    ([command, args]) => command === "pkill" && args[0] === "-KILL" && args[1] === "-f"
  );
  const finalSwiftIndex = commands.map(([command]) => command).lastIndexOf("swift");

  assert.equal(result.status, "ready");
  assert.notEqual(termIndex, -1, "scenario cleanup must terminate lingering temp-dir processes");
  assert.notEqual(killIndex, -1, "scenario cleanup must force-kill lingering temp-dir processes");
  assert.ok(termIndex < killIndex, "TERM cleanup should run before KILL cleanup");
  assert.ok(killIndex < finalSwiftIndex, "scenario cleanup must finish before the final restore query");
});

test("blocks the macOS meeting smoke when any visible Caveman window remains during risk", async () => {
  const visibleWindowRows = JSON.stringify([WINDOW]);
  const tinyVisibleWindowRows = JSON.stringify([
    {
      ...WINDOW,
      width: 320,
      height: 200
    }
  ]);
  const queryOutputs = [visibleWindowRows, tinyVisibleWindowRows];

  const commandRunner = async (command) => {
    if (command === "swift") {
      return { stdout: queryOutputs.shift() ?? tinyVisibleWindowRows };
    }
    return { stdout: "" };
  };

  const processSpawner = () => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = (signal) => {
      child.signalCode = signal;
      child.emit("exit");
      return true;
    };
    return child;
  };

  const result = await runMacosMeetingRiskSmoke({
    platform: "darwin",
    commandRunner,
    processSpawner,
    requireRestore: false,
    activeRiskWaitMs: 1,
    scenarios: [
      {
        id: "google-meet-browser",
        label: "Google Meet browser window",
        executableName: "Google Chrome",
        windowTitle: "Google Meet - Candidate Screen"
      }
    ]
  });

  assert.equal(result.status, "blocked");
  assert.match(result.messages.join("\n"), /stayed visible/);
});
