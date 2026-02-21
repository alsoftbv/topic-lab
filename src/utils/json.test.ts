import { describe, it, expect } from "vitest";
import { minifyJson, validateJson } from "./json";

describe("minifyJson", () => {
  it("should remove whitespace from simple object", () => {
    expect(minifyJson('{ "key": "value" }')).toBe('{"key":"value"}');
  });

  it("should remove newlines and indentation", () => {
    const input = `{
  "some": {
    "payload": {"thing": "this"}
  }
}`;
    expect(minifyJson(input)).toBe('{"some":{"payload":{"thing":"this"}}}');
  });

  it("should handle arrays", () => {
    const input = `[
  1,
  2,
  3
]`;
    expect(minifyJson(input)).toBe("[1,2,3]");
  });

  it("should handle nested arrays and objects", () => {
    const input = '{ "a": [ 1, { "b": 2 } ] }';
    expect(minifyJson(input)).toBe('{"a":[1,{"b":2}]}');
  });

  it("should preserve spaces inside string values", () => {
    expect(minifyJson('{ "key": "hello world" }')).toBe('{"key":"hello world"}');
  });

  it("should preserve newlines inside string values", () => {
    expect(minifyJson('{ "key": "line1\\nline2" }')).toBe('{"key":"line1\\nline2"}');
  });

  it("should preserve tabs inside string values", () => {
    expect(minifyJson('{ "key": "col1\\tcol2" }')).toBe('{"key":"col1\\tcol2"}');
  });

  it("should handle escaped quotes in strings", () => {
    expect(minifyJson('{ "key": "say \\"hello\\"" }')).toBe('{"key":"say \\"hello\\""}');
  });

  it("should handle escaped backslashes", () => {
    expect(minifyJson('{ "path": "C:\\\\Users\\\\test" }')).toBe('{"path":"C:\\\\Users\\\\test"}');
  });

  it("should handle escaped backslash before quote", () => {
    expect(minifyJson('{ "a": "end\\\\" }')).toBe('{"a":"end\\\\"}');
  });

  it("should preserve variable placeholders in strings", () => {
    expect(minifyJson('{ "id": "{device_id}" }')).toBe('{"id":"{device_id}"}');
  });

  it("should preserve unquoted variable placeholders", () => {
    expect(minifyJson('{ "temp": {temperature} }')).toBe('{"temp":{temperature}}');
  });

  it("should handle mixed variables and values", () => {
    const input = '{ "id": "{uuid}", "temp": {temperature}, "name": "sensor" }';
    expect(minifyJson(input)).toBe('{"id":"{uuid}","temp":{temperature},"name":"sensor"}');
  });

  it("should return null for non-JSON text", () => {
    expect(minifyJson("hello world")).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(minifyJson("")).toBeNull();
  });

  it("should return null for whitespace only", () => {
    expect(minifyJson("   ")).toBeNull();
  });

  it("should return null when already minified (object)", () => {
    expect(minifyJson('{"key":"value"}')).toBeNull();
  });

  it("should return null when already minified (array)", () => {
    expect(minifyJson("[1,2,3]")).toBeNull();
  });

  it("should trim leading/trailing whitespace", () => {
    expect(minifyJson('  { "a": 1 }  ')).toBe('{"a":1}');
  });

  it("should handle carriage returns", () => {
    expect(minifyJson('{\r\n  "a": 1\r\n}')).toBe('{"a":1}');
  });

  it("should handle tabs as indentation", () => {
    expect(minifyJson('{\n\t"a": 1\n}')).toBe('{"a":1}');
  });

  it("should handle deeply nested objects", () => {
    const input = '{ "a": { "b": { "c": { "d": "value" } } } }';
    expect(minifyJson(input)).toBe('{"a":{"b":{"c":{"d":"value"}}}}');
  });

  it("should handle empty object", () => {
    expect(minifyJson("{  }")).toBe("{}");
  });

  it("should handle empty array", () => {
    expect(minifyJson("[  ]")).toBe("[]");
  });

  it("should handle booleans and null", () => {
    expect(minifyJson('{ "a": true, "b": false, "c": null }')).toBe(
      '{"a":true,"b":false,"c":null}'
    );
  });

  it("should handle numbers", () => {
    expect(minifyJson('{ "int": 42, "float": 3.14, "neg": -1 }')).toBe(
      '{"int":42,"float":3.14,"neg":-1}'
    );
  });

  it("should handle empty string value", () => {
    expect(minifyJson('{ "key": "" }')).toBe('{"key":""}');
  });

  it("should handle string with only spaces", () => {
    expect(minifyJson('{ "key": "   " }')).toBe('{"key":"   "}');
  });

  it("should handle multiple escape sequences in a row", () => {
    expect(minifyJson('{ "a": "\\n\\t\\r" }')).toBe('{"a":"\\n\\t\\r"}');
  });

  it("should handle unicode escapes in strings", () => {
    expect(minifyJson('{ "a": "\\u0041" }')).toBe('{"a":"\\u0041"}');
  });

  it("should handle array of objects", () => {
    const input = `[
  { "id": 1 },
  { "id": 2 }
]`;
    expect(minifyJson(input)).toBe('[{"id":1},{"id":2}]');
  });

  it("should handle colon and comma spacing variations", () => {
    expect(minifyJson('{  "a"  :  "b"  ,  "c"  :  "d"  }')).toBe('{"a":"b","c":"d"}');
  });

  it("should handle payload with builtin variables", () => {
    const input = '{ "ts": "{now:iso}", "id": "{uuid}" }';
    expect(minifyJson(input)).toBe('{"ts":"{now:iso}","id":"{uuid}"}');
  });
});

describe("validateJson", () => {
  it("should return null for valid JSON object", () => {
    expect(validateJson('{"key": "value"}')).toBeNull();
  });

  it("should return null for valid JSON array", () => {
    expect(validateJson("[1, 2, 3]")).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(validateJson("")).toBeNull();
  });

  it("should return null for plain text (not JSON-like)", () => {
    expect(validateJson("hello world")).toBeNull();
  });

  it("should return null for numeric payload", () => {
    expect(validateJson("42")).toBeNull();
  });

  it("should return error for invalid JSON starting with {", () => {
    expect(validateJson("{invalid}")).toBeTypeOf("string");
  });

  it("should return error for invalid JSON starting with [", () => {
    expect(validateJson("[invalid]")).toBeTypeOf("string");
  });

  it("should return error for trailing comma in object", () => {
    expect(validateJson('{"a": 1,}')).toBeTypeOf("string");
  });

  it("should return error for trailing comma in array", () => {
    expect(validateJson("[1, 2,]")).toBeTypeOf("string");
  });

  it("should return error for single quotes", () => {
    expect(validateJson("{'key': 'value'}")).toBeTypeOf("string");
  });

  it("should return error for unquoted keys", () => {
    expect(validateJson('{key: "value"}')).toBeTypeOf("string");
  });

  it("should return error for missing closing brace", () => {
    expect(validateJson('{"key": "value"')).toBeTypeOf("string");
  });

  it("should return error for missing closing bracket", () => {
    expect(validateJson("[1, 2")).toBeTypeOf("string");
  });

  it("should handle whitespace around valid JSON", () => {
    expect(validateJson('  {"key": "value"}  ')).toBeNull();
  });

  it("should handle multiline valid JSON", () => {
    const input = `{
  "key": "value",
  "nested": { "a": 1 }
}`;
    expect(validateJson(input)).toBeNull();
  });

  it("should return null for whitespace only", () => {
    expect(validateJson("   ")).toBeNull();
  });

  it("should return error for unquoted variable that produces invalid JSON", () => {
    expect(validateJson('{"key": some_unresolved_value}')).toBeTypeOf("string");
  });

  it("should return null when variable resolved to valid value", () => {
    expect(validateJson('{"key": 42}')).toBeNull();
  });

  it("should return null for nested valid JSON", () => {
    expect(validateJson('{"a": {"b": [1, 2, {"c": true}]}}')).toBeNull();
  });
});
