#!/usr/bin/env node
import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { evaluateSecretReadiness, parseGhSecretList } from "./commercial-readiness.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_WORKFLOW_NAME = "Release Signed Desktop Builds";
const DEFAULT_REF = "main";
const DEFAULT_RELEASE_NOTES = "Caveman signed desktop update.";

export function validateReleaseTag(tag) {
  const normalizedTag = typeof tag === "string" ? tag.trim() : "";
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(normalizedTag)) {
    throw new Error("Release tag must look like v1.2.3 or v1.2.3-beta.1.");
  }
  return normalizedTag;
}

export function buildWorkflowDispatchArgs({
  workflowName = DEFAULT_WORKFLOW_NAME,
  tag,
  releaseNotes = DEFAULT_RELEASE_NOTES,
  ref = DEFAULT_REF
}) {
  return [
    "workflow",
    "run",
    workflowName,
    "--ref",
    ref,
    "-f",
    `tag=${validateReleaseTag(tag)}`,
    "-f",
    `release_notes=${releaseNotes}`
  ];
}

export async function runSignedReleaseDispatch({
  tag,
  releaseNotes = DEFAULT_RELEASE_NOTES,
  ref = DEFAULT_REF,
  apply = false,
  secretNames,
  commandRunner = runCommand
} = {}) {
  const resolvedSecretNames = secretNames ?? (await listGitHubSecretNames(commandRunner));
  const secretReadiness = evaluateSecretReadiness(resolvedSecretNames);
  if (secretReadiness.status !== "ready") {
    throw new Error(`Missing commercial release secrets: ${secretReadiness.missingSecrets.join(", ")}`);
  }

  const args = buildWorkflowDispatchArgs({ tag, releaseNotes, ref });
  if (apply) {
    await commandRunner("gh", args);
  }

  return {
    status: apply ? "dispatched" : "ready",
    dispatched: Boolean(apply),
    args
  };
}

async function listGitHubSecretNames(commandRunner) {
  const { stdout } = await commandRunner("gh", ["secret", "list"]);
  return parseGhSecretList(stdout);
}

async function runCommand(command, args) {
  return await execFileAsync(command, args, { maxBuffer: 1024 * 1024 * 10 });
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };

    switch (arg) {
      case "--tag":
        options.tag = next();
        break;
      case "--release-notes":
      case "--notes":
        options.releaseNotes = next();
        break;
      case "--ref":
        options.ref = next();
        break;
      case "--apply":
        options.apply = true;
        break;
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function usage() {
  return `Usage: node scripts/dispatch-signed-release.mjs --tag v0.1.1 [options]

Checks required commercial signing secrets, validates the release tag, and
prepares the Release Signed Desktop Builds workflow dispatch.

Options:
  --tag <tag>                  Version tag to publish, for example v0.1.1.
  --release-notes <notes>      Release notes for GitHub and latest.json.
  --notes <notes>              Alias for --release-notes.
  --ref <branch-or-sha>        Workflow ref to run from. Defaults to main.
  --apply                      Actually run gh workflow run. Omit for dry run.
`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.tag) {
    throw new Error("Missing --tag.");
  }

  const result = await runSignedReleaseDispatch(options);
  console.log(result.dispatched ? "DISPATCHED" : "DRY RUN");
  console.log(`- Command: gh ${result.args.join(" ")}`);
  if (!result.dispatched) {
    console.log("- No workflow was started. Re-run with --apply to publish the signed release.");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
