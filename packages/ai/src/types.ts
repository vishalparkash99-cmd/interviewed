export type AIProviderConfig = {
  provider: string;
  apiKey: string;
  model: string;
  baseURL?: string;
};

export type AICompletionRequest = {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
};

export type AICompletionResponse = {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

export type AIEmbeddingRequest = {
  model: string;
  input: string | string[];
};

export type AIEmbeddingResponse = {
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
};
