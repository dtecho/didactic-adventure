import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { ollama } from 'ollama-ai-provider';

export class OllamaProvider extends BaseProvider {
  name = 'Ollama';
  staticModels: ModelInfo[] = [];
  config = {
    baseUrlKey: 'OLLAMA_API_BASE_URL',
    defaultBaseUrl: 'http://localhost:11434',
    enabled: true,
  };

  async getDynamicModels(apiKeys?: Record<string, string>, settings?: IProviderSetting): Promise<ModelInfo[]> {
    try {
      const { baseUrl } = this.getProviderBaseUrlAndKey({
        apiKeys,
        providerSettings: settings,
        serverEnv: {},
        defaultBaseUrlKey: 'OLLAMA_API_BASE_URL',
        defaultApiTokenKey: '',
      });

      const response = await fetch(`${baseUrl}/api/tags`);
      const data = (await response.json()) as { models: Array<{ name: string }> };

      return data.models.map((model) => ({
        name: model.name,
        label: model.name,
        provider: this.name,
        maxTokenAllowed: 4096,
      }));
    } catch (error) {
      console.error('Error fetching Ollama models:', error);
      throw error;
    }
  }

  getModelInstance(options: {
    model: string;
    serverEnv: Record<string, string | Record<string, string>>;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { apiKeys, providerSettings, serverEnv, model } = options;
    const { baseUrl } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings,
      serverEnv: serverEnv as Record<string, string>,
      defaultBaseUrlKey: 'OLLAMA_API_BASE_URL',
      defaultApiTokenKey: '',
    });

    const ollamaInstance = ollama(model, {
      numCtx: 4096,
    }) as LanguageModelV1 & { config: any };

    ollamaInstance.config.baseURL = `${baseUrl}/api`;

    return ollamaInstance;
  }
}

export default OllamaProvider;
