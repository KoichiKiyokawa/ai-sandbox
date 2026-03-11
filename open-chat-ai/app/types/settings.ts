export interface Settings {
  apiKey: string;
  modelId: string;
  systemPrompt: string;
  maxTokens: number;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  modelId: "us.anthropic.claude-sonnet-4-6-v1",
  systemPrompt: "",
  maxTokens: 4096,
};

// Fixed region for inference profile
export const BEDROCK_REGION = "us-east-1";

export const MODELS = [
  { value: "us.anthropic.claude-opus-4-6-v1", label: "Claude Opus 4.6" },
  { value: "us.anthropic.claude-sonnet-4-6-v1", label: "Claude Sonnet 4.6" },
  { value: "us.anthropic.claude-sonnet-4-5-20250929-v1:0", label: "Claude Sonnet 4.5 (Deprecated)" },
  { value: "us.anthropic.claude-haiku-4-5-20251001-v1:0", label: "Claude Haiku 4.5" },
] as const;
