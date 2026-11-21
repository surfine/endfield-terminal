import { en, type StringKey, type Table } from "./en.ts";
import { zh } from "./zh.ts";

export type { StringKey };
export type Language = "en" | "zh";
/** Resolves a key, with the values a parameterised entry needs. */
export type Translate = (key: StringKey, ...args: (string | number)[]) => string;

const tables: Record<Language, Table> = { en, zh };

export function translate(language: Language, key: StringKey, ...args: (string | number)[]): string {
  const entry = tables[language][key];
  return typeof entry === "function" ? (entry as (...values: (string | number)[]) => string)(...args) : entry;
}

/** The page's `lang` attribute for a language, as this window has always set it. */
export function htmlLang(language: Language): string {
  return language === "zh" ? "zh-Hans" : "en";
}
