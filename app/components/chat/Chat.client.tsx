/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useChat } from 'ai/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { cssTransition, toast, ToastContainer } from 'react-toastify';
import { useShortcuts } from '~/lib/hooks';
import { description, useChatHistory } from '~/lib/persistence';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROMPT_COOKIE_KEY, PROVIDER_LIST } from '~/utils/constants';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { BaseChat } from './BaseChat';
import Cookies from 'js-cookie';
import { useSettings } from '~/lib/hooks/useSettings';
import type { ProviderInfo } from '~/types/model';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { getModelList } from '~/utils/constants';
import { ModelSelector } from './ModelSelector';

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

const logger = createScopedLogger('Chat');

export function Chat() {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory, importChat, exportChat } = useChatHistory();
  const title = useStore(description);

  useEffect(() => {
    workbenchStore.setReloadedMessages(initialMessages.map((m) => m.id));
  }, [initialMessages]);

  return (
    <>
      {ready && (
        <ChatImpl
          description={title}
          initialMessages={initialMessages}
          exportChat={exportChat}
          storeMessageHistory={storeMessageHistory}
          importChat={importChat}
        />
      )}
      <ToastContainer
        closeButton={({ closeToast }) => (
          <button
            className="Toastify__close-button"
            onClick={closeToast}
            title="Close notification"
            aria-label="Close notification"
          >
            <div className="i-ph:x text-lg" />
          </button>
        )}
        icon={({ type }) => {
          switch (type) {
            case 'success':
              return <div className="i-ph:check-bold text-bolt-elements-icon-success text-2xl" />;
            case 'error':
              return <div className="i-ph:warning-circle-bold text-bolt-elements-icon-error text-2xl" />;
            default:
              return undefined;
          }
        }}
        position="bottom-right"
        pauseOnFocusLoss
        transition={toastAnimation}
      />
    </>
  );
}

interface ChatProps {
  initialMessages: Message[];
  storeMessageHistory: (messages: Message[]) => Promise<void>;
  importChat: (description: string, messages: Message[]) => Promise<void>;
  exportChat: () => void;
  description?: string;
}

export const ChatImpl = memo(({ initialMessages, importChat, exportChat }: ChatProps) => {
  useShortcuts();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const baseChatRef = useRef<HTMLDivElement>(null);
  const [chatStarted] = useState(initialMessages.length > 0);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [imageDataList, setImageDataList] = useState<string[]>([]);
  const [isLoading] = useState(false);
  const files = useStore(workbenchStore.files);
  const actionAlert = useStore(workbenchStore.alert);
  const { activeProviders, promptId, contextOptimizationEnabled } = useSettings();
  const { showChat } = useStore(chatStore);

  const [model, setModel] = useState(() => {
    const savedModel = Cookies.get('selectedModel');
    return savedModel || DEFAULT_MODEL;
  });

  const [provider, setProvider] = useState(() => {
    const savedProvider = Cookies.get('selectedProvider');
    return (PROVIDER_LIST.find((p) => p.name === savedProvider) || DEFAULT_PROVIDER) as ProviderInfo;
  });

  const [modelList, setModelList] = useState<ModelInfo[]>([]);
  const [modelLoading, setModelLoading] = useState<string | undefined>(undefined);
  const [apiKeys] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchModels = async () => {
      if (!provider) {
        return;
      }

      setModelLoading(provider.name);

      try {
        const providerSettings = {
          [provider.name]: {
            enabled: true,
            baseUrl: provider.name === 'Ollama' ? 'http://localhost:11434' : undefined,
          },
        };

        const models = await getModelList({
          apiKeys,
          providerSettings,
        });

        if (models) {
          setModelList(models);

          const currentModelExists = models.some((m: ModelInfo) => m.name === model && m.provider === provider.name);

          if (!currentModelExists) {
            const firstModel = models.find((m: ModelInfo) => m.provider === provider.name);

            if (firstModel) {
              setModel(firstModel.name);
              Cookies.set('selectedModel', firstModel.name);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching models:', error);
        toast.error('Failed to fetch available models. Please check your provider settings.');
      } finally {
        setModelLoading(undefined);
      }
    };

    fetchModels();
  }, [provider, apiKeys, model]);

  useEffect(() => {
    if (provider) {
      Cookies.set('selectedProvider', provider.name);
    }
  }, [provider]);

  useEffect(() => {
    if (model) {
      Cookies.set('selectedModel', model);
    }
  }, [model]);

  const { messages, input, handleInputChange, stop, append } = useChat({
    api: '/api/chat',
    body: {
      apiKeys,
      files,
      promptId,
      contextOptimization: contextOptimizationEnabled,
    },
    sendExtraMessageFields: true,
    onError: (error) => {
      logger.error('Request failed\n\n', error);
      toast.error(
        'There was an error processing your request: ' + (error.message ? error.message : 'No details were returned'),
      );
    },
    onFinish: (message, response) => {
      const usage = response.usage;

      if (usage) {
        console.log('Token usage:', usage);
      }

      logger.debug('Finished streaming');
    },
    initialMessages,
    initialInput: Cookies.get(PROMPT_COOKIE_KEY) || '',
  });

  const handleSendMessage = useCallback(
    (event: React.UIEvent, messageInput?: string) => {
      if (messageInput) {
        append({
          role: 'user',
          content: messageInput,
        });
      }
    },
    [append],
  );

  return (
    <div className="flex flex-col h-full">
      <ModelSelector
        model={model}
        setModel={setModel}
        provider={provider}
        setProvider={setProvider}
        modelList={modelList}
        providerList={activeProviders}
        apiKeys={apiKeys}
        modelLoading={modelLoading}
      />

      <BaseChat
        ref={baseChatRef}
        textareaRef={textareaRef}
        showChat={showChat}
        chatStarted={chatStarted}
        isStreaming={isLoading}
        messages={messages}
        input={input}
        model={model}
        setModel={setModel}
        provider={provider}
        setProvider={setProvider}
        providerList={activeProviders}
        handleStop={stop}
        sendMessage={handleSendMessage}
        handleInputChange={handleInputChange}
        uploadedFiles={uploadedFiles}
        setUploadedFiles={setUploadedFiles}
        imageDataList={imageDataList}
        setImageDataList={setImageDataList}
        actionAlert={actionAlert}
        clearAlert={() => workbenchStore.clearAlert()}
        importChat={importChat}
        exportChat={exportChat}
      />
    </div>
  );
});
