import { describe, it, expect } from "vitest";
import {
  isBuiltinVariable,
  getBuiltinNames,
  parseVariableExpression,
  templateHasBuiltin,
} from "./builtins";

describe("isBuiltinVariable", () => {
  it("should return true for now", () => {
    expect(isBuiltinVariable("now")).toBe(true);
  });

  it("should return true for timestamp", () => {
    expect(isBuiltinVariable("timestamp")).toBe(true);
  });

  it("should return true for uuid", () => {
    expect(isBuiltinVariable("uuid")).toBe(true);
  });

  it("should return true for random", () => {
    expect(isBuiltinVariable("random")).toBe(true);
  });

  it("should return true for rand", () => {
    expect(isBuiltinVariable("rand")).toBe(true);
  });

  it("should return false for non-builtins", () => {
    expect(isBuiltinVariable("device_id")).toBe(false);
    expect(isBuiltinVariable("custom")).toBe(false);
    expect(isBuiltinVariable("")).toBe(false);
  });
});

describe("getBuiltinNames", () => {
  it("should return all builtin names", () => {
    const names = getBuiltinNames();
    expect(names).toContain("now");
    expect(names).toContain("timestamp");
    expect(names).toContain("uuid");
    expect(names).toContain("random");
    expect(names).toContain("rand");
  });
});

describe("parseVariableExpression", () => {
  it("should parse simple variable name", () => {
    const result = parseVariableExpression("now");
    expect(result.name).toBe("now");
    expect(result.modifiers).toEqual([]);
  });

  it("should parse variable with one modifier", () => {
    const result = parseVariableExpression("now:utc");
    expect(result.name).toBe("now");
    expect(result.modifiers).toEqual(["utc"]);
  });

  it("should parse variable with multiple modifiers", () => {
    const result = parseVariableExpression("now:utc:-1h:unix");
    expect(result.name).toBe("now");
    expect(result.modifiers).toEqual(["utc", "-1h", "unix"]);
  });

  it("should handle random with range", () => {
    const result = parseVariableExpression("random:1-100");
    expect(result.name).toBe("random");
    expect(result.modifiers).toEqual(["1-100"]);
  });

  it("should keep a fmt pattern (with its colons) as one modifier", () => {
    const result = parseVariableExpression("now:utc:fmt:YYYY-MM-DD HH:mm:ss");
    expect(result.name).toBe("now");
    expect(result.modifiers).toEqual(["utc", "fmt:YYYY-MM-DD HH:mm:ss"]);
  });
});

describe("templateHasBuiltin", () => {
  it("detects built-in references", () => {
    expect(templateHasBuiltin("logs/{now:unix}")).toBe(true);
    expect(templateHasBuiltin("id={uuid}")).toBe(true);
    expect(templateHasBuiltin("x/{random:1-10}")).toBe(true);
    expect(templateHasBuiltin("a/{device_id}/b/{timestamp}")).toBe(true);
  });

  it("returns false for custom variables and plain text", () => {
    expect(templateHasBuiltin("devices/{device_id}/cmd")).toBe(false);
    expect(templateHasBuiltin("static/topic")).toBe(false);
    expect(templateHasBuiltin("")).toBe(false);
  });
});
