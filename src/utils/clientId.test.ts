import { describe, it, expect } from "vitest";
import type { Connection } from "@/types";
import { findClientIdClash, generateClientId } from "./clientId";

function conn(overrides: Partial<Connection>): Connection {
  return {
    id: "a",
    name: "A",
    broker_url: "broker.local",
    port: 1883,
    client_id: "client-1",
    use_tls: false,
    auto_connect: false,
    variables: {},
    variable_history: {},
    buttons: [],
    groups: [],
    subscriptions: [],
    ...overrides,
  } as Connection;
}

describe("generateClientId", () => {
  it("uses the app prefix and a six character suffix", () => {
    expect(generateClientId()).toMatch(/^mqtt-topic-lab-[a-z0-9]{6}$/);
  });

  it("generates different ids", () => {
    const ids = new Set(Array.from({ length: 50 }, generateClientId));
    expect(ids.size).toBe(50);
  });
});

describe("findClientIdClash", () => {
  const target = conn({ id: "a", name: "A" });

  it("finds another connection with the same broker, port and client id", () => {
    const other = conn({ id: "b", name: "B" });
    expect(findClientIdClash(target, [other])).toBe(other);
  });

  it("ignores case and surrounding spaces in the broker address", () => {
    const other = conn({ id: "b", broker_url: "  BROKER.local " });
    expect(findClientIdClash(target, [other])).toBe(other);
  });

  it("does not clash with itself", () => {
    expect(findClientIdClash(target, [target])).toBeUndefined();
  });

  it("does not clash on a different client id, broker or port", () => {
    expect(findClientIdClash(target, [conn({ id: "b", client_id: "client-2" })])).toBeUndefined();
    expect(findClientIdClash(target, [conn({ id: "b", broker_url: "other" })])).toBeUndefined();
    expect(findClientIdClash(target, [conn({ id: "b", port: 8883 })])).toBeUndefined();
  });
});
