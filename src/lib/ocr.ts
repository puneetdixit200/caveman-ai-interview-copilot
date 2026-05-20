import type { OcrSettings, ProviderKind } from "../types/settings";

export interface ScreenOcrResult {
  provider: OcrSettings["provider"];
  text: string;
  capturedAtMs: number;
}

export interface ScreenOcrDependencies {
  captureFrame?: () => Promise<string>;
  recognizeImage?: (imageDataUrl: string) => Promise<string>;
  now?: () => number;
}

export function normalizeOcrText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function canSendOcrContext(input: {
  settings: OcrSettings;
  reviewed: boolean;
  providerKind: ProviderKind;
  localOnlyMode: boolean;
}): boolean {
  if (!input.settings.enabled || !input.settings.includeInPrompt) {
    return false;
  }

  if (input.settings.reviewBeforeSend && !input.reviewed) {
    return false;
  }

  if (input.localOnlyMode && input.providerKind === "cloud") {
    return false;
  }

  return true;
}

export async function runScreenOcr(
  settings: OcrSettings,
  dependencies: ScreenOcrDependencies = {}
): Promise<ScreenOcrResult> {
  if (!settings.enabled) {
    throw new Error("Screen OCR is disabled.");
  }

  if (settings.provider === "disabled") {
    throw new Error("Choose an OCR provider before capturing the screen.");
  }

  if (settings.provider === "cloud") {
    throw new Error("Cloud OCR needs a configured provider before it can run.");
  }

  const captureFrame = dependencies.captureFrame ?? captureScreenFrame;
  const recognizeImage = dependencies.recognizeImage ?? recognizeWithTesseract;
  const imageDataUrl = await captureFrame();
  const text = normalizeOcrText(await recognizeImage(imageDataUrl));

  return {
    provider: settings.provider,
    text,
    capturedAtMs: dependencies.now?.() ?? Date.now()
  };
}

async function captureScreenFrame(): Promise<string> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screen capture is not available in this WebView.");
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.srcObject = stream;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not load captured screen frame."));
    });
    await video.play();

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not create OCR capture canvas.");
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }
}

async function recognizeWithTesseract(imageDataUrl: string): Promise<string> {
  const tesseract = await import("tesseract.js");
  const result = await tesseract.recognize(imageDataUrl, "eng");
  return result.data.text ?? "";
}
