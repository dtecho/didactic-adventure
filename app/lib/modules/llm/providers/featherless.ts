import { BaseProvider, getOpenAILikeModel } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';

interface FeatherlessModelDetails {
  name: string;
  size: string;
  context_length: number;
}

export interface FeatherlessModel {
  id: string;
  details: FeatherlessModelDetails;
}

export interface FeatherlessApiResponse {
  models: FeatherlessModel[];
}

export default class FeatherlessProvider extends BaseProvider {
  name = 'Featherless';
  getApiKeyLink = 'https://featherless.ai';
  labelForGetApiKey = 'Get Featherless API Key';
  icon = 'i-ph:feather';

  config = {
    baseUrlKey: 'FEATHERLESS_API_BASE_URL',
    apiTokenKey: 'FEATHERLESS_API_KEY',
    baseUrl: 'https://api.featherless.ai/v1',
  };

  // Static models that are always available
  staticModels: ModelInfo[] = [
    {
      name: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
      label: 'LLaMA-3 8B Instruct',
      provider: this.name,
      maxTokenAllowed: 4096,
    },
    {
      name: 'mistralai/Mistral-7B',
      label: 'Mistral 7B',
      provider: this.name,
      maxTokenAllowed: 4096,
    },
  ];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv: Record<string, string> = {},
  ): Promise<ModelInfo[]> {
    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv,
      defaultBaseUrlKey: 'FEATHERLESS_API_BASE_URL',
      defaultApiTokenKey: 'FEATHERLESS_API_KEY',
    });

    if (!baseUrl || !apiKey) {
      console.error('No base URL or API key configured for Featherless');
      return [];
    }

    try {
      const url = `${baseUrl}/models`;
      console.log('Fetching models from Featherless at:', url);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to fetch Featherless models:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });

        return [];
      }

      const text = await response.text();
      console.log('Featherless API response:', text);

      let data: FeatherlessApiResponse;

      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.error('Failed to parse Featherless API response:', parseError);
        console.log('Raw response:', text);

        return [];
      }

      if (!data.models || !Array.isArray(data.models)) {
        console.error('Invalid response format from Featherless API:', data);

        return [];
      }

      const models = data.models.map((model: FeatherlessModel) => ({
        name: model.id,
        label: `${model.details.name} (${model.details.size})`,
        provider: this.name,
        maxTokenAllowed: model.details.context_length,
      }));

      console.log('Processed Featherless models:', models);

      return models;
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error fetching Featherless models:', {
          name: error.name,
          message: error.message,
          stack: error.stack,
        });
      } else {
        console.error('Unknown error fetching Featherless models:', error);
      }

      return [];
    }
  }

  getModelInstance: (options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }) => LanguageModelV1 = (options) => {
    const { apiKeys, providerSettings, serverEnv, model } = options;
    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings,
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: 'FEATHERLESS_API_BASE_URL',
      defaultApiTokenKey: 'FEATHERLESS_API_KEY',
    });

    if (!baseUrl || !apiKey) {
      throw new Error('No base URL or API key configured for Featherless');
    }

    return getOpenAILikeModel(baseUrl, apiKey, model);
  };
}
