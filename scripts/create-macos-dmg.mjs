import { cp, mkdir, readFile, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_PRODUCT_NAME = "Caveman";

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

export async function createMacosDmg({
  projectRoot = process.cwd(),
  productName = DEFAULT_PRODUCT_NAME,
  arch = process.arch,
  spawn = spawnSync
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

  const result = spawn("hdiutil", buildHdiutilCreateArgs({
    volumeName: productName,
    sourceFolder: paths.stagingDir,
    outputPath: paths.dmgPath
  }), {
    stdio: "inherit"
  });

  await rm(paths.stagingDir, { recursive: true, force: true });

  if (result.status !== 0) {
    throw new Error(`hdiutil failed while creating ${paths.dmgPath}`);
  }

  return paths.dmgPath;
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
