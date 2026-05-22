import type { AudioRehearsalResult } from "./audioRehearsal";
import type { LivePipelineSmokeResult } from "./livePipelineSmoke";
import type { RealUseReadiness, RuntimeBudgetStatus } from "./readiness";

export const PREFLIGHT_REPORT_SETTING_KEY = "preflight.latestReport";

export interface BuildPreflightReportInput {
  readiness: RealUseReadiness;
  runtimeBudget?: RuntimeBudgetStatus | null;
  audioRehearsal?: AudioRehearsalResult | null;
  livePipelineSmoke?: LivePipelineSmokeResult | null;
  generatedAt?: Date;
}

export function buildPreflightReport({
  readiness,
  runtimeBudget,
  audioRehearsal,
  livePipelineSmoke,
  generatedAt = new Date()
}: BuildPreflightReportInput): string {
  return [
    "# Caveman Preflight Report",
    "",
    `Generated: ${generatedAt.toISOString()}`,
    `Overall: ${readiness.overallStatus}`,
    `Ready: ${readiness.readyCount} | Warnings: ${readiness.warningCount} | Blocked: ${readiness.blockedCount}`,
    "",
    "## Runtime",
    formatRuntimeBudget(runtimeBudget),
    "",
    "## Audio Rehearsal",
    formatAudioRehearsal(audioRehearsal),
    "",
    "## Live Pipeline Smoke Check",
    ...formatLivePipelineSmoke(livePipelineSmoke),
    "",
    "## Readiness Items",
    ...readiness.items.flatMap(formatReadinessItem),
    "",
    "## Live-Call Checklist",
    "- [ ] Start native capture before joining the call.",
    "- [ ] Confirm live transcript updates while the real call audio is playing.",
    "- [ ] Show the overlay once, then verify capture exclusion and hide/show hotkeys.",
    "- [ ] Generate one answer and confirm provider latency is acceptable.",
    "- [ ] Confirm TTS and active-window typing are disabled or intentionally enabled.",
    "- [ ] Keep this report saved with the session notes for post-interview review."
  ].join("\n");
}

function formatRuntimeBudget(runtimeBudget?: RuntimeBudgetStatus | null): string {
  if (!runtimeBudget) {
    return "Runtime: not measured";
  }

  return `Runtime: startup ${Math.round(runtimeBudget.startupMs)}ms / memory ${formatOptionalMetric(
    runtimeBudget.workingSetMb,
    "MB"
  )} / idle CPU ${formatOptionalMetric(runtimeBudget.processCpuPercent, "%")}`;
}

function formatAudioRehearsal(audioRehearsal?: AudioRehearsalResult | null): string {
  if (!audioRehearsal) {
    return "Audio rehearsal: not run";
  }

  const warnings = audioRehearsal.warnings.length > 0 ? ` Warnings: ${audioRehearsal.warnings.join("; ")}` : "";
  return `Audio rehearsal: ${audioRehearsal.status} - ${audioRehearsal.message}${warnings}`;
}

function formatLivePipelineSmoke(livePipelineSmoke?: LivePipelineSmokeResult | null): string[] {
  if (!livePipelineSmoke) {
    return ["Live pipeline smoke check: not run"];
  }

  return [
    `Live pipeline smoke check: ${livePipelineSmoke.status} - ${livePipelineSmoke.message}`,
    `Transcript segments: ${livePipelineSmoke.transcriptSegments}`,
    livePipelineSmoke.firstAiChunk ? `First AI chunk: ${livePipelineSmoke.firstAiChunk}` : undefined,
    ...livePipelineSmoke.items.map(formatSmokeItem)
  ].filter((line): line is string => Boolean(line));
}

function formatReadinessItem(item: RealUseReadiness["items"][number]): string[] {
  return [
    `- [${item.status}] ${item.label}: ${item.detail}`,
    item.action ? `  Action: ${item.action}` : undefined
  ].filter((line): line is string => Boolean(line));
}

function formatSmokeItem(item: LivePipelineSmokeResult["items"][number]): string {
  const latency = typeof item.latencyMs === "number" ? ` (${Math.round(item.latencyMs)}ms)` : "";
  const action = item.action ? ` Action: ${item.action}` : "";
  return `- [${item.status}] ${item.label}: ${item.detail}${latency}${action}`;
}

function formatOptionalMetric(value: number | null | undefined, unit: string): string {
  return typeof value === "number" ? `${formatMetric(value)}${unit}` : `not available ${unit}`;
}

function formatMetric(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
