import type { Message } from "~/types/chat";
import type { Settings } from "~/types/settings";
import { BEDROCK_REGION } from "~/types/settings";

interface ConverseRequest {
  modelId: string;
  messages: { role: string; content: { text: string }[] }[];
  system?: { text: string }[];
  inferenceConfig?: { maxTokens: number };
}

interface ConverseResponse {
  output: {
    message: {
      role: string;
      content: { text: string }[];
    };
  };
}

export async function sendMessage(
  settings: Settings,
  messages: Message[],
): Promise<string> {
  const { apiKey, modelId, systemPrompt, maxTokens } = settings;

  const endpoint = `https://bedrock-runtime.${BEDROCK_REGION}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;

  const body: ConverseRequest = {
    modelId,
    messages: messages.map((m) => ({
      role: m.role,
      content: [{ text: m.content }],
    })),
    inferenceConfig: { maxTokens },
  };

  if (systemPrompt.trim()) {
    body.system = [{ text: systemPrompt }];
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Bedrock API error (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as ConverseResponse;
  const text = data.output.message.content
    .map((c) => c.text)
    .join("");

  return text;
}
