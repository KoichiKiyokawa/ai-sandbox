import { useEffect, useRef } from "react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { MessageBubble } from "./message-bubble";
import { LoadingIndicator } from "./loading-indicator";
import { EmptyState } from "./empty-state";
import type { Message } from "~/types/chat";

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  if (messages.length === 0 && !isLoading) {
    return <EmptyState />;
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-1 py-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isLoading && <LoadingIndicator />}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
