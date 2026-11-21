// The guards shared by every service reply: a record, a string that can be
// drawn. Each one returns a usable shape rather than throwing, so a broken
// reply degrades the way it always did.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The HTML escaper the terminal has always used. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
