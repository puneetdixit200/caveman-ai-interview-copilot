import type { AppConfig } from "./appConfig";
import type { ModelProviderConfig } from "../types/settings";

export function selectRunnableProviders(config: AppConfig): ModelProviderConfig[] {
  return config.providers
    .filter((provider) => provider.enabled)
    .filter((provider) => {
      if (!config.security.localOnlyMode || !config.security.blockCloudWhenLocalOnly) {
        return true;
      }

      return provider.kind === "local";
    })
    .sort((left, right) => {
      if (left.id === config.selectedProviderId) {
        return -1;
      }

      if (right.id === config.selectedProviderId) {
        return 1;
      }

      return 0;
    });
}
