export function minifyJson(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;

  let result = "";
  let inString = false;
  let escaped = false;

  for (const char of trimmed) {
    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && inString) {
      result += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }
    if (!inString && (char === " " || char === "\n" || char === "\r" || char === "\t")) {
      continue;
    }
    result += char;
  }

  return result === trimmed ? null : result;
}

export function validateJson(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return null;
  try {
    JSON.parse(trimmed);
    return null;
  } catch (e) {
    return (e as SyntaxError).message;
  }
}
