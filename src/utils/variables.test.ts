import { describe, it, expect } from "vitest";
import { extractVariableNames } from "./variables";

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
