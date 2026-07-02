export const FONT_SIZE_KEY = "markdown-editor.font-size";
export const READING_WIDTH_KEY = "markdown-editor.reading-width";
export const THEME_KEY = "markdown-editor.theme";

export const FONT_SIZE_OPTIONS = ["smaller", "default", "larger"] as const;
export const READING_WIDTH_OPTIONS = ["narrow", "standard", "wide"] as const;
export const THEME_OPTIONS = ["gold", "midnight", "evergreen", "paper", "power-user"] as const;

export type FontSizePreference = (typeof FONT_SIZE_OPTIONS)[number];
export type ReadingWidthPreference = (typeof READING_WIDTH_OPTIONS)[number];
export type ThemePreference = (typeof THEME_OPTIONS)[number];

export interface EditorPreferences {
  fontSize: FontSizePreference;
  readingWidth: ReadingWidthPreference;
  theme: ThemePreference;
}

export type EditorPreferenceResult = { ok: true } | { ok: false; error: string };

export function loadPreference<T extends string>(key: string, options: readonly T[], fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return options.includes(saved as T) ? (saved as T) : fallback;
  } catch {
    return fallback;
  }
}

export function savePreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Settings are comfort state only. */
  }
}
