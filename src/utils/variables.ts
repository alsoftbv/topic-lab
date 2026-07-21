import { isBuiltinVariable } from "./builtins";

export function extractVariableNames(template: string): string[] {
  const regex = /\{([a-zA-Z_][a-zA-Z0-9_]*)(?::[^}]+)?\}/g;
  const names: string[] = [];
  let match;
  while ((match = regex.exec(template)) !== null) {
    const name = match[1];
    if (!isBuiltinVariable(name)) {
      names.push(name);
    }
  }
  return names;
}
