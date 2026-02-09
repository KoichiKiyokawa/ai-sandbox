import { useCallback, useRef } from "react";

export function useAutoResizeTextarea(maxHeight = 200) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [maxHeight]);

  const reset = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
  }, []);

  return { textareaRef, resize, reset };
}
