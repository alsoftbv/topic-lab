const BUILTIN_NAMES = ["now", "timestamp", "uuid", "random", "rand"];

export function isBuiltinVariable(name: string): boolean {
  return BUILTIN_NAMES.includes(name);
}

export function getBuiltinNames(): string[] {
  return [...BUILTIN_NAMES];
}

export function parseVariableExpression(expression: string): { name: string; modifiers: string[] } {
  const parts = expression.split(":");
  const name = parts[0];
  const modifiers: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    // Everything from `fmt:` onward is a single modifier — the format pattern
    // itself may contain colons (e.g. `fmt:HH:mm:ss`).
    if (parts[i] === "fmt") {
      modifiers.push(parts.slice(i).join(":"));
      break;
    }
    modifiers.push(parts[i]);
  }
  return { name, modifiers };
}
