export interface SignedUpdateInfo {
  available: boolean;
  version?: string;
  date?: string;
  body?: string;
}

export interface UpdateDownloadProgress {
  downloadedBytes: number;
  totalBytes?: number;
}

interface UpdateLike {
  version: string;
  date?: string;
  body?: string;
  downloadAndInstall: (callback?: (event: DownloadEventLike) => void) => Promise<void>;
}

type DownloadEventLike =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished"; data?: unknown };

export interface UpdaterRuntime {
  check: (options?: { timeout?: number }) => Promise<UpdateLike | null>;
  relaunch: () => Promise<void>;
}

export async function checkForSignedUpdate(
  runtimeLoader: () => Promise<UpdaterRuntime> = loadUpdaterRuntime
): Promise<SignedUpdateInfo> {
  const runtime = await runtimeLoader();
  const update = await runtime.check({ timeout: 30_000 });

  if (!update) {
    return { available: false };
  }

  return {
    available: true,
    version: update.version,
    date: update.date,
    body: update.body
  };
}

export async function downloadInstallAndRelaunchSignedUpdate(
  onProgress?: (progress: UpdateDownloadProgress) => void,
  runtimeLoader: () => Promise<UpdaterRuntime> = loadUpdaterRuntime
): Promise<SignedUpdateInfo> {
  const runtime = await runtimeLoader();
  const update = await runtime.check({ timeout: 30_000 });

  if (!update) {
    return { available: false };
  }

  let downloadedBytes = 0;
  let totalBytes: number | undefined;
  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      totalBytes = event.data.contentLength;
      downloadedBytes = 0;
      onProgress?.({ downloadedBytes, totalBytes });
      return;
    }

    if (event.event === "Progress") {
      downloadedBytes += event.data.chunkLength;
      onProgress?.({ downloadedBytes, totalBytes });
    }
  });
  await runtime.relaunch();

  return {
    available: true,
    version: update.version,
    date: update.date,
    body: update.body
  };
}

async function loadUpdaterRuntime(): Promise<UpdaterRuntime> {
  const [{ check }, { relaunch }] = await Promise.all([
    import("@tauri-apps/plugin-updater"),
    import("@tauri-apps/plugin-process")
  ]);

  return { check, relaunch };
}
