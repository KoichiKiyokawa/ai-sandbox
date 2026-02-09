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

export async function sendMessageStream(
  settings: Settings,
  messages: Message[],
  onChunk: (text: string) => void,
): Promise<void> {
  const { apiKey, modelId, systemPrompt, maxTokens } = settings;

  const endpoint = `https://bedrock-runtime.${BEDROCK_REGION}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse-stream`;

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

  if (!res.body) {
    throw new Error("Response body is null");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let processedLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const decoded = decoder.decode(value, { stream: true });
      buffer += decoded;

      // Extract JSON objects from AWS EventStream format
      // Look for contentBlockDelta events with text
      const regex = /"delta":\{"text":"([^"]*(?:\\.[^"]*)*)"\}/g;
      regex.lastIndex = processedLength;
      let match;

      while ((match = regex.exec(buffer)) !== null) {
        const text = match[1]
          .replace(/\\n/g, "\n")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
        onChunk(text);
        processedLength = regex.lastIndex;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
