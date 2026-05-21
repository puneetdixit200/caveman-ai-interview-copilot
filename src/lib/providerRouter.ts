import type { ChatStreamParams, HealthCheckResult, ModelInfo } from "../types/ai";
import type { ProviderKind } from "../types/settings";

export interface AIProvider {
  id: string;
  label: string;
  kind: ProviderKind;
  healthCheck(): Promise<HealthCheckResult>;
  listModels?(): Promise<ModelInfo[]>;
  chatStream(params: ChatStreamParams): AsyncGenerator<string>;
}

export class ProviderRouter {
  constructor(private readonly providers: AIProvider[]) {}

  async *chatStream(params: ChatStreamParams): AsyncGenerator<string> {
    const failures: Error[] = [];

    for (const provider of this.providers) {
      try {
        const health = await provider.healthCheck();
        if (!health.ok) {
          failures.push(new Error(`${provider.label}: ${health.error ?? "health check failed"}`));
          continue;
        }

        for await (const chunk of provider.chatStream(params)) {
          yield chunk;
        }

        return;
      } catch (error) {
        failures.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    throw new AggregateError(failures, "No configured AI provider completed the stream");
  }
}
