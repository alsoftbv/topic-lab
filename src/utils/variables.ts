export function substituteVariables(template: string, variables: Record<string, string>): string {
    let result = template;
    let prevResult = '';
    let iterations = 0;
    const maxIterations = 10;

    while (result !== prevResult && iterations < maxIterations) {
        prevResult = result;
        result = result.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match, varName) => {
            return variables[varName] ?? match;
        });
        iterations++;
    }

    return result;
}

export function extractVariableNames(template: string): string[] {
    const regex = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
    const names: string[] = [];
    let match;
    while ((match = regex.exec(template)) !== null) {
        names.push(match[1]);
    }
    return names;
}

export function getMissingVariables(template: string, variables: Record<string, string>): string[] {
    const needed = extractVariableNames(template);
    return needed.filter((name) => !(name in variables));
}
