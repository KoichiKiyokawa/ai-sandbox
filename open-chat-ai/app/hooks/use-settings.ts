import { useState, useCallback } from "react";
import { loadJSON, saveJSON } from "~/lib/storage";
import { DEFAULT_SETTINGS, type Settings } from "~/types/settings";

const STORAGE_KEY = "open-chat-ai-settings";

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(() =>
    loadJSON(STORAGE_KEY, DEFAULT_SETTINGS),
  );

  const setSettings = useCallback((next: Settings) => {
    setSettingsState(next);
    saveJSON(STORAGE_KEY, next);
  }, []);

  const isConfigured = settings.apiKey.trim().length > 0;

  return { settings, setSettings, isConfigured };
}
