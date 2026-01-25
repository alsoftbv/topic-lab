import { resolveBuiltin, parseVariableExpression, isBuiltinVariable } from './builtins';

export function substituteVariables(template: string, variables: Record<string, string>): string {
    let result = template;
    let prevResult = '';
    let iterations = 0;
    const maxIterations = 10;

    const pattern = /\{([a-zA-Z_][a-zA-Z0-9_]*(?::[^}]+)?)\}/g;

    while (result !== prevResult && iterations < maxIterations) {
        prevResult = result;
        result = result.replace(pattern, (match, expression) => {
            const { name, modifiers } = parseVariableExpression(expression);

            if (isBuiltinVariable(name)) {
                const resolved = resolveBuiltin(name, modifiers);
                if (resolved !== null) return resolved;
            }

            if (modifiers.length === 0 && name in variables) {
                return variables[name];
            }

            return match;
        });
        iterations++;
    }

    return result;
}

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

export function getMissingVariables(template: string, variables: Record<string, string>): string[] {
    const needed = extractVariableNames(template);
    return needed.filter((name) => !(name in variables));
}

export { getBuiltinNames } from './builtins';
