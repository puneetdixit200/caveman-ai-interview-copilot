import { cp, mkdir, readFile, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_PRODUCT_NAME = "Caveman";
export const HDIUTIL_RESOURCE_BUSY_RETRY_MARKER =
  "macOS DMG creation retries hdiutil failures before failing package smoke.";
export const DEFAULT_HDIUTIL_CREATE_ATTEMPTS = 3;
export const DEFAULT_HDIUTIL_CREATE_RETRY_DELAY_MS = 2000;

export function macosArchSuffix(arch = process.arch) {
  if (arch === "arm64") return "aarch64";
  if (arch === "x64") return "x64";
  return arch.replace(/[^a-zA-Z0-9_-]/g, "");
}

export function dmgFileName({ productName = DEFAULT_PRODUCT_NAME, version, arch = process.arch }) {
  if (!version) {
    throw new Error("A version is required to name the macOS DMG");
  }

  return `${productName}_${version}_${macosArchSuffix(arch)}.dmg`;
}

export function resolveMacosDmgPaths({
  projectRoot = process.cwd(),
  productName = DEFAULT_PRODUCT_NAME,
  version,
  arch = process.arch
} = {}) {
  const bundleRoot = path.join(projectRoot, "src-tauri", "target", "release", "bundle");
  const dmgDir = path.join(bundleRoot, "dmg");
  const stagingDir = path.join(dmgDir, `${productName}.dmg-staging`);

  return {
    appPath: path.join(bundleRoot, "macos", `${productName}.app`),
    dmgDir,
    dmgPath: path.join(dmgDir, dmgFileName({ productName, version, arch })),
    stagingDir
  };
}

export function buildHdiutilCreateArgs({ volumeName = DEFAULT_PRODUCT_NAME, sourceFolder, outputPath }) {
  if (!sourceFolder || !outputPath) {
    throw new Error("sourceFolder and outputPath are required to create a macOS DMG");
  }

  return ["create", "-volname", volumeName, "-srcfolder", sourceFolder, "-ov", "-format", "UDZO", outputPath];
}

export async function runHdiutilCreateWithRetry({
  productName = DEFAULT_PRODUCT_NAME,
  paths,
  spawn = spawnSync,
  attempts = DEFAULT_HDIUTIL_CREATE_ATTEMPTS,
  retryDelayMs = DEFAULT_HDIUTIL_CREATE_RETRY_DELAY_MS,
  wait = delay,
  remove = rm,
  writeOutput = writeSpawnOutput,
  logger = console
}) {
  if (!paths?.stagingDir || !paths?.dmgPath) {
    throw new Error("paths.stagingDir and paths.dmgPath are required to create a macOS DMG");
  }

  let lastResult;
  const totalAttempts = Math.max(1, attempts);
  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    await remove(paths.dmgPath, { force: true });
    const result = spawn("hdiutil", buildHdiutilCreateArgs({
      volumeName: productName,
      sourceFolder: paths.stagingDir,
      outputPath: paths.dmgPath
    }), {
      stdio: "pipe"
    });
    writeOutput(result);

    if (result.status === 0 && !result.error) {
      return;
    }

    lastResult = result;
    if (attempt < totalAttempts) {
      logger.warn(
        `${HDIUTIL_RESOURCE_BUSY_RETRY_MARKER} Attempt ${attempt}/${totalAttempts} failed: ${hdiutilFailureDetail(result)}`
      );
      await wait(retryDelayMs);
    }
  }

  throw new Error(
    `hdiutil failed while creating ${paths.dmgPath} after ${totalAttempts} attempt(s): ${hdiutilFailureDetail(lastResult)}`
  );
}

export async function createMacosDmg({
  projectRoot = process.cwd(),
  productName = DEFAULT_PRODUCT_NAME,
  arch = process.arch,
  spawn = spawnSync,
  attempts = DEFAULT_HDIUTIL_CREATE_ATTEMPTS,
  retryDelayMs = DEFAULT_HDIUTIL_CREATE_RETRY_DELAY_MS,
  wait = delay
} = {}) {
  if (process.platform !== "darwin") {
    throw new Error("macOS DMG packaging must run on macOS");
  }

  const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
  const paths = resolveMacosDmgPaths({
    projectRoot,
    productName,
    version: packageJson.version,
    arch
  });

  await rm(paths.stagingDir, { recursive: true, force: true });
  await mkdir(paths.stagingDir, { recursive: true });
  await mkdir(paths.dmgDir, { recursive: true });
  await cp(paths.appPath, path.join(paths.stagingDir, `${productName}.app`), { recursive: true });
  await symlink("/Applications", path.join(paths.stagingDir, "Applications"));

  try {
    await runHdiutilCreateWithRetry({
      productName,
      paths,
      spawn,
      attempts,
      retryDelayMs,
      wait
    });
  } finally {
    await rm(paths.stagingDir, { recursive: true, force: true });
  }

  return paths.dmgPath;
}

function writeSpawnOutput(result) {
  if (result?.stdout?.length) {
    process.stdout.write(result.stdout);
  }
  if (result?.stderr?.length) {
    process.stderr.write(result.stderr);
  }
}

function hdiutilFailureDetail(result) {
  if (!result) {
    return "hdiutil did not return a result";
  }
  if (result.error) {
    return result.error.message;
  }
  const stderr = result.stderr?.toString?.().trim();
  if (stderr) {
    return stderr;
  }
  return `exit code ${result.status ?? "unknown"}`;
}

function delay(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  createMacosDmg()
    .then((dmgPath) => {
      console.log(`Created ${dmgPath}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
