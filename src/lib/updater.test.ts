import { describe, expect, it, vi } from "vitest";
import { checkForSignedUpdate, downloadInstallAndRelaunchSignedUpdate, type UpdaterRuntime } from "./updater";

describe("updater", () => {
  it("reports when no signed update is available", async () => {
    const runtime: UpdaterRuntime = {
      check: vi.fn().mockResolvedValue(null),
      relaunch: vi.fn()
    };

    await expect(checkForSignedUpdate(async () => runtime)).resolves.toEqual({ available: false });
  });

  it("downloads, installs, and relaunches a signed update", async () => {
    const downloadAndInstall = vi.fn(async (callback?: (event: { event: "Progress"; data: { chunkLength: number } }) => void) => {
      callback?.({ event: "Progress", data: { chunkLength: 512 } });
    });
    const relaunch = vi.fn();
    const runtime: UpdaterRuntime = {
      check: vi.fn().mockResolvedValue({
        version: "0.2.0",
        date: "2026-05-20T00:00:00Z",
        body: "Release notes",
        downloadAndInstall
      }),
      relaunch
    };
    const progress = vi.fn();

    await expect(downloadInstallAndRelaunchSignedUpdate(progress, async () => runtime)).resolves.toMatchObject({
      available: true,
      version: "0.2.0"
    });
    expect(downloadAndInstall).toHaveBeenCalled();
    expect(progress).toHaveBeenCalledWith({ downloadedBytes: 512, totalBytes: undefined });
    expect(relaunch).toHaveBeenCalled();
  });
});
