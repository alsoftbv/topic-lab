import type { Connection } from "@/types";

export function generateClientId(): string {
  return `mqtt-topic-lab-${Math.random().toString(36).slice(2, 8)}`;
}

function sameBroker(a: Connection, b: Connection): boolean {
  return (
    a.broker_url.trim().toLowerCase() === b.broker_url.trim().toLowerCase() && a.port === b.port
  );
}

export function findClientIdClash(
  connection: Connection,
  others: Connection[]
): Connection | undefined {
  return others.find(
    (other) =>
      other.id !== connection.id &&
      other.client_id === connection.client_id &&
      sameBroker(other, connection)
  );
}
