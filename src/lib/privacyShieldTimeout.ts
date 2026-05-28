export const PRIVACY_SHIELD_NATIVE_CALL_TIMEOUT_MS = 2500;
export const PRIVACY_SHIELD_NATIVE_CALL_TIMEOUT_MARKER =
  "Native privacy shield WebView command timeout failed closed before overlay visibility could drift.";

export function privacyShieldTimeoutMessage(
  operationLabel: string,
  timeoutMs = PRIVACY_SHIELD_NATIVE_CALL_TIMEOUT_MS
): string {
  return `${PRIVACY_SHIELD_NATIVE_CALL_TIMEOUT_MARKER} ${operationLabel} exceeded ${timeoutMs}ms.`;
}

export async function withPrivacyShieldTimeout<T>(
  operation: Promise<T>,
  operationLabel: string,
  fallback: (message: string) => T,
  timeoutMs = PRIVACY_SHIELD_NATIVE_CALL_TIMEOUT_MS
): Promise<T> {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((resolve) => {
        timeoutId = globalThis.setTimeout(
          () => resolve(fallback(privacyShieldTimeoutMessage(operationLabel, timeoutMs))),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timeoutId !== undefined) {
      globalThis.clearTimeout(timeoutId);
    }
  }
}
