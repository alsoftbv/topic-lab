const OFFSET_PATTERN = /^([+-])(\d+)([smhdwMy])$/;

type TimeFormat = 'iso' | 'unix' | 'unixms' | 'date' | 'time' | 'datetime';

interface ParsedModifiers {
    offset?: { amount: number; unit: string };
    timezone?: 'utc' | 'local';
    format?: TimeFormat;
    customFormat?: string;
}

function parseOffset(modifier: string): { amount: number; unit: string } | null {
    const match = modifier.match(OFFSET_PATTERN);
    if (!match) return null;

    const [, sign, amount, unit] = match;
    return {
        amount: parseInt(amount) * (sign === '-' ? -1 : 1),
        unit,
    };
}

function applyOffset(date: Date, offset: { amount: number; unit: string }): Date {
    const result = new Date(date);
    const { amount, unit } = offset;

    switch (unit) {
        case 's':
            result.setSeconds(result.getSeconds() + amount);
            break;
        case 'm':
            result.setMinutes(result.getMinutes() + amount);
            break;
        case 'h':
            result.setHours(result.getHours() + amount);
            break;
        case 'd':
            result.setDate(result.getDate() + amount);
            break;
        case 'w':
            result.setDate(result.getDate() + amount * 7);
            break;
        case 'M':
            result.setMonth(result.getMonth() + amount);
            break;
        case 'y':
            result.setFullYear(result.getFullYear() + amount);
            break;
    }

    return result;
}

function parseModifiers(modifiers: string[]): ParsedModifiers {
    const result: ParsedModifiers = {};

    for (const mod of modifiers) {
        const lowerMod = mod.toLowerCase();

        if (lowerMod === 'utc') {
            result.timezone = 'utc';
            continue;
        }
        if (lowerMod === 'local') {
            result.timezone = 'local';
            continue;
        }

        if (['iso', 'unix', 'unixms', 'date', 'time', 'datetime'].includes(lowerMod)) {
            result.format = lowerMod as TimeFormat;
            continue;
        }

        if (mod.startsWith('fmt:')) {
            result.customFormat = mod.slice(4);
            continue;
        }

        const offset = parseOffset(mod);
        if (offset) {
            result.offset = offset;
            continue;
        }
    }

    return result;
}

function formatDate(date: Date, format: TimeFormat, useUtc: boolean): string {
    switch (format) {
        case 'unix':
            return Math.floor(date.getTime() / 1000).toString();
        case 'unixms':
            return date.getTime().toString();
        case 'date':
            return useUtc ? date.toISOString().split('T')[0] : date.toLocaleDateString('en-CA');
        case 'time':
            return useUtc
                ? date.toISOString().split('T')[1].split('.')[0]
                : date.toLocaleTimeString('en-GB', { hour12: false });
        case 'datetime':
            return useUtc
                ? date.toISOString().replace('T', ' ').split('.')[0]
                : `${date.toLocaleDateString('en-CA')} ${date.toLocaleTimeString('en-GB', { hour12: false })}`;
        case 'iso':
        default:
            return useUtc ? date.toISOString() : date.toISOString().replace('Z', '');
    }
}

function formatCustom(date: Date, pattern: string, useUtc: boolean): string {
    const pad = (n: number, width = 2) => n.toString().padStart(width, '0');

    const year = useUtc ? date.getUTCFullYear() : date.getFullYear();
    const month = useUtc ? date.getUTCMonth() + 1 : date.getMonth() + 1;
    const day = useUtc ? date.getUTCDate() : date.getDate();
    const hours = useUtc ? date.getUTCHours() : date.getHours();
    const minutes = useUtc ? date.getUTCMinutes() : date.getMinutes();
    const seconds = useUtc ? date.getUTCSeconds() : date.getSeconds();
    const ms = useUtc ? date.getUTCMilliseconds() : date.getMilliseconds();

    return pattern
        .replace('YYYY', year.toString())
        .replace('YY', (year % 100).toString().padStart(2, '0'))
        .replace('MM', pad(month))
        .replace('M', month.toString())
        .replace('DD', pad(day))
        .replace('D', day.toString())
        .replace('HH', pad(hours))
        .replace('H', hours.toString())
        .replace('mm', pad(minutes))
        .replace('ss', pad(seconds))
        .replace('SSS', pad(ms, 3));
}

function handleNow(modifiers: string[]): string {
    const parsed = parseModifiers(modifiers);
    let date = new Date();

    if (parsed.offset) {
        date = applyOffset(date, parsed.offset);
    }

    const useUtc = parsed.timezone === 'utc';

    if (parsed.customFormat) {
        return formatCustom(date, parsed.customFormat, useUtc);
    }

    return formatDate(date, parsed.format || 'iso', useUtc);
}

function handleUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

function handleRandom(modifiers: string[]): string {
    let min = 0;
    let max = 100;

    for (const mod of modifiers) {
        const rangeMatch = mod.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
            min = parseInt(rangeMatch[1]);
            max = parseInt(rangeMatch[2]);
            break;
        }
    }

    return Math.floor(Math.random() * (max - min + 1) + min).toString();
}

const BUILTIN_HANDLERS: Record<string, (modifiers: string[]) => string> = {
    now: handleNow,
    timestamp: handleNow,
    uuid: handleUuid,
    random: handleRandom,
    rand: handleRandom,
};

export function isBuiltinVariable(name: string): boolean {
    return name in BUILTIN_HANDLERS;
}

export function getBuiltinNames(): string[] {
    return Object.keys(BUILTIN_HANDLERS);
}

export function resolveBuiltin(name: string, modifiers: string[] = []): string | null {
    const handler = BUILTIN_HANDLERS[name.toLowerCase()];
    if (!handler) return null;
    return handler(modifiers);
}

export function parseVariableExpression(expression: string): { name: string; modifiers: string[] } {
    const parts = expression.split(':');
    return {
        name: parts[0],
        modifiers: parts.slice(1),
    };
}
