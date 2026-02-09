import { MessageSquare } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <MessageSquare className="h-12 w-12 text-muted-foreground" />
      <div>
        <h2 className="text-lg font-semibold">Start a conversation</h2>
        <p className="text-sm text-muted-foreground">
          Send a message to begin chatting with AI.
        </p>
      </div>
    </div>
  );
}
