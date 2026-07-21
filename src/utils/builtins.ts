const DEFAULT_BUILTIN_NAMES = ["now", "timestamp", "uuid", "random", "rand"];

let builtinNames = DEFAULT_BUILTIN_NAMES;

export function setBuiltinNames(names: string[]) {
  if (names.length > 0) builtinNames = [...names];
}

export function getBuiltinNames(): string[] {
  return [...builtinNames];
}

export function isBuiltinVariable(name: string): boolean {
  return builtinNames.includes(name);
}

export function templateHasBuiltin(template: string): boolean {
  const re = /\{([a-zA-Z_][a-zA-Z0-9_]*)(?::[^}]+)?\}/g;
  let match;
  while ((match = re.exec(template)) !== null) {
    if (isBuiltinVariable(match[1])) return true;
  }
  return false;
}

export function parseVariableExpression(expression: string): { name: string; modifiers: string[] } {
  const parts = expression.split(":");
  const name = parts[0];
  const modifiers: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    if (parts[i] === "fmt") {
      modifiers.push(parts.slice(i).join(":"));
      break;
    }
    modifiers.push(parts[i]);
  }
  return { name, modifiers };
}
