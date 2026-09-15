import type { AIProviderConfig, AICompletionRequest, AICompletionResponse, AIEmbeddingRequest, AIEmbeddingResponse } from "./types";

export type AIProvider = {
  name: string;
  complete: (req: AICompletionRequest) => Promise<AICompletionResponse>;
  embed: (req: AIEmbeddingRequest) => Promise<AIEmbeddingResponse>;
};

const mockProvider: AIProvider = {
  name: "mock",
  complete: async (req: AICompletionRequest): Promise<AICompletionResponse> => {
    return {
      content: `Mock response for model ${req.model}: ${req.messages.map((m) => m.content).join(" ")}`,
    };
  },
  embed: async (req: AIEmbeddingRequest): Promise<AIEmbeddingResponse> => {
    const inputs = Array.isArray(req.input) ? req.input : [req.input];
    return {
      data: inputs.map((_text, i) => ({
        object: "embedding",
        embedding: new Array(1536).fill(0).map(() => Math.random() - 0.5),
        index: i,
      })),
      model: req.model,
    };
  },
};

export function createMockProvider(): AIProvider {
  return mockProvider;
}

export function createAIProvider(config: AIProviderConfig): AIProvider {
  if (config.provider === "mock") {
    return createMockProvider();
  }
  if (config.provider === "openai") {
    return createOpenAIProvider(config);
  }
  if (config.provider === "openrouter") {
    return createOpenRouterProvider(config);
  }
  if (config.provider === "anthropic") {
    return createAnthropicProvider(config);
  }
  return createMockProvider();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function createOpenAIProvider(config: AIProviderConfig): AIProvider {
  return {
    name: "openai",
    complete: async (req: AICompletionRequest): Promise<AICompletionResponse> => {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        throw new Error(`OpenAI API error: ${res.status}`);
      }
      const data = (await res.json()) as any;
      return {
        content: data.choices?.[0]?.message?.content || "",
        usage: data.usage,
      };
    },
    embed: async (req: AIEmbeddingRequest): Promise<AIEmbeddingResponse> => {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        throw new Error(`OpenAI embedding error: ${res.status}`);
      }
      return (await res.json()) as AIEmbeddingResponse;
    },
  };
}

function createOpenRouterProvider(config: AIProviderConfig): AIProvider {
  const baseUrl = config.baseURL || "https://openrouter.ai/api/v1";
  const siteUrl = "https://interviewed.ai";
  const siteTitle = "Interviewed";

  return {
    name: "openrouter",
    complete: async (req: AICompletionRequest): Promise<AICompletionResponse> => {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
          "HTTP-Referer": siteUrl,
          "X-Title": siteTitle,
        },
        body: JSON.stringify({
          ...req,
          model: config.model,
        }),
      });
      if (!res.ok) {
        throw new Error(`OpenRouter API error: ${res.status}`);
      }
      const data = (await res.json()) as any;
      return {
        content: data.choices?.[0]?.message?.content || "",
        usage: data.usage,
      };
    },
    embed: async (req: AIEmbeddingRequest): Promise<AIEmbeddingResponse> => {
      const res = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
          "HTTP-Referer": siteUrl,
          "X-Title": siteTitle,
        },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        throw new Error(`OpenRouter embedding error: ${res.status}`);
      }
      return (await res.json()) as AIEmbeddingResponse;
    },
  };
}

function createAnthropicProvider(config: AIProviderConfig): AIProvider {
  return {
    name: "anthropic",
    complete: async (req: AICompletionRequest): Promise<AICompletionResponse> => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: config.model,
          messages: req.messages,
          max_tokens: req.maxTokens || 1024,
          temperature: req.temperature,
        }),
      });
      if (!res.ok) {
        throw new Error(`Anthropic API error: ${res.status}`);
      }
      const data = (await res.json()) as any;
      return {
        content: data.content?.[0]?.text || "",
      };
    },
    embed: async (req: AIEmbeddingRequest): Promise<AIEmbeddingResponse> => {
      const res = await fetch("https://api.anthropic.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        throw new Error(`Anthropic embedding error: ${res.status}`);
      }
      return (await res.json()) as AIEmbeddingResponse;
    },
  };
}