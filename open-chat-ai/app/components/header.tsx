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
    <header className="sticky top-0 z-10 flex shrink-0 flex-col border-b bg-background px-4 pt-[env(safe-area-inset-top)]">
      <div className="flex h-12 w-full items-center justify-between">
        <h1 className="text-base font-semibold">Open Chat AI</h1>
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
      </div>
    </header>
  );
}
