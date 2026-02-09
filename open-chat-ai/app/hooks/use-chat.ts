import { useState, useCallback } from "react";
import { sendMessage } from "~/lib/bedrock-client";
import { loadJSON, saveJSON } from "~/lib/storage";
import type { Message } from "~/types/chat";
import type { Settings } from "~/types/settings";

const STORAGE_KEY = "open-chat-ai-messages";

export function useChat(settings: Settings) {
  const [messages, setMessages] = useState<Message[]>(() =>
    loadJSON(STORAGE_KEY, []),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persistMessages = useCallback((msgs: Message[]) => {
    setMessages(msgs);
    saveJSON(STORAGE_KEY, msgs);
  }, []);

  const send = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      setError(null);

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      };

      const updatedMessages = [...messages, userMessage];
      persistMessages(updatedMessages);
      setIsLoading(true);

      try {
        const reply = await sendMessage(settings, updatedMessages);
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: reply,
          timestamp: Date.now(),
        };
        persistMessages([...updatedMessages, assistantMessage]);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "An error occurred";
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, settings, isLoading, persistMessages],
  );

  const clearMessages = useCallback(() => {
    persistMessages([]);
    setError(null);
  }, [persistMessages]);

  return { messages, isLoading, error, send, clearMessages };
}
