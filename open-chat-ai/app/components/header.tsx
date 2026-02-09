import { Settings, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";

interface HeaderProps {
  onOpenSettings: () => void;
  onClearMessages: () => void;
  hasMessages: boolean;
}

export function Header({
  onOpenSettings,
  onClearMessages,
  hasMessages,
}: HeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
      <h1 className="text-lg font-semibold">Open Chat AI</h1>
      <div className="flex items-center gap-2">
        {hasMessages && (
          <Button variant="ghost" size="icon" onClick={onClearMessages}>
            <Trash2 className="h-5 w-5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={onOpenSettings}>
          <Settings className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
