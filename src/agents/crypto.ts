import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateAgentId(): string {
  return `agt_${randomBytes(16).toString("hex")}`;
}

export function generateAgentHash(): string {
  return `agth_${randomBytes(32).toString("hex")}`;
}

export function generateAgentSecret(byteLength: number): string {
  return `atlas_${randomBytes(byteLength).toString("base64url")}`;
}

export function hashAgentSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function verifyAgentSecret(secret: string, expectedHash: string): boolean {
  const actualHash = hashAgentSecret(secret);
  const actual = Buffer.from(actualHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
