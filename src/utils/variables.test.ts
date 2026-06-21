import { describe, it, expect } from "vitest";
import { extractVariableNames, getMissingVariables } from "./variables";

describe("extractVariableNames", () => {
  it("should extract variable names from template", () => {
    const names = extractVariableNames("devices/{device_id}/sensors/{sensor_type}/value");
    expect(names).toEqual(["device_id", "sensor_type"]);
  });

  it("should return empty array for no variables", () => {
    const names = extractVariableNames("devices/static/topic");
    expect(names).toEqual([]);
  });

  it("should include duplicate variable names", () => {
    const names = extractVariableNames("{id}/request/{id}/response");
    expect(names).toEqual(["id", "id"]);
  });

  it("should handle empty template", () => {
    const names = extractVariableNames("");
    expect(names).toEqual([]);
  });

  it("should exclude builtin variables", () => {
    const names = extractVariableNames("logs/{now}/{device_id}/{uuid}");
    expect(names).toEqual(["device_id"]);
  });
});

describe("getMissingVariables", () => {
  it("should return missing variables", () => {
    const missing = getMissingVariables("devices/{device_id}/{sensor}/CMD", {
      device_id: "abc123",
    });
    expect(missing).toEqual(["sensor"]);
  });

  it("should return empty array when all variables are present", () => {
    const missing = getMissingVariables("devices/{device_id}/CMD", {
      device_id: "abc123",
    });
    expect(missing).toEqual([]);
  });

  it("should return all variables when none are present", () => {
    const missing = getMissingVariables("devices/{device_id}/{sensor}/CMD", {});
    expect(missing).toEqual(["device_id", "sensor"]);
  });

  it("should return empty array for template with no variables", () => {
    const missing = getMissingVariables("devices/static/topic", {});
    expect(missing).toEqual([]);
  });
});
