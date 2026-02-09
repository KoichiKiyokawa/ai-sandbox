import { useState, useEffect } from "react";
import { Header } from "~/components/header";
import { SettingsDialog } from "~/components/settings/settings-dialog";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { useSettings } from "~/hooks/use-settings";
import { useChat } from "~/hooks/use-chat";

export function ChatContainer() {
  const { settings, setSettings, isConfigured } = useSettings();
  const { messages, isLoading, error, send, clearMessages } = useChat(settings);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!isConfigured) {
      setSettingsOpen(true);
    }
  }, [isConfigured]);

  return (
    <div className="flex h-dvh flex-col">
      <Header
        onOpenSettings={() => setSettingsOpen(true)}
        onClearMessages={clearMessages}
        hasMessages={messages.length > 0}
      />

      <MessageList messages={messages} isLoading={isLoading} />

      {error && (
        <div className="shrink-0 border-t border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <ChatInput onSend={send} disabled={isLoading || !isConfigured} />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSave={setSettings}
      />
    </div>
  );
}
