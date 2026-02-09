import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { MODELS, type Settings } from "~/types/settings";

interface ApiSettingsFormProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
}

export function ApiSettingsForm({ settings, onChange }: ApiSettingsFormProps) {
  const update = (partial: Partial<Settings>) => {
    onChange({ ...settings, ...partial });
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="apiKey">API Key</Label>
        <Input
          id="apiKey"
          type="password"
          placeholder="Enter your Bedrock API key"
          value={settings.apiKey}
          onChange={(e) => update({ apiKey: e.target.value })}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="model">Model</Label>
        <Select
          value={settings.modelId}
          onValueChange={(value) => update({ modelId: value })}
        >
          <SelectTrigger id="model">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODELS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="systemPrompt">System Prompt</Label>
        <Textarea
          id="systemPrompt"
          placeholder="Optional system prompt..."
          value={settings.systemPrompt}
          onChange={(e) => update({ systemPrompt: e.target.value })}
          rows={3}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="maxTokens">Max Tokens</Label>
        <Input
          id="maxTokens"
          type="number"
          min={1}
          max={65536}
          value={settings.maxTokens}
          onChange={(e) =>
            update({ maxTokens: parseInt(e.target.value, 10) || 4096 })
          }
        />
      </div>
    </div>
  );
}
