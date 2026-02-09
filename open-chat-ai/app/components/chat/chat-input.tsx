import { useState, useCallback, type KeyboardEvent, type FormEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useAutoResizeTextarea } from "~/hooks/use-auto-resize-textarea";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const { textareaRef, resize, reset } = useAutoResizeTextarea();

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      if (!value.trim() || disabled) return;
      onSend(value);
      setValue("");
      reset();
    },
    [value, disabled, onSend, reset],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !isComposing) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [isComposing, handleSubmit],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="flex shrink-0 items-end gap-2 border-t p-4"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <textarea
        ref={textareaRef}
        className="flex-1 resize-none rounded-xl border bg-background px-4 py-3 text-base leading-6 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        placeholder="Send a message..."
        rows={1}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          resize();
        }}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        disabled={disabled}
      />
      <Button
        type="submit"
        size="icon"
        disabled={disabled || !value.trim()}
        className="shrink-0 rounded-xl"
      >
        <Send className="h-5 w-5" />
      </Button>
    </form>
  );
}
