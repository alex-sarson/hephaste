import { describe, expect, it } from "vitest";
import {
  assertValidTransition,
  canTransition,
  InvalidInvoiceTransitionError,
} from "./stateMachine.js";

describe("canTransition", () => {
  it("allows the documented happy path", () => {
    expect(canTransition("DRAFT", "SENT")).toBe(true);
    expect(canTransition("SENT", "VIEWED")).toBe(true);
    expect(canTransition("VIEWED", "PAID")).toBe(true);
  });

  it("allows voiding from any non-terminal state", () => {
    expect(canTransition("DRAFT", "VOID")).toBe(true);
    expect(canTransition("SENT", "VOID")).toBe(true);
    expect(canTransition("VIEWED", "VOID")).toBe(true);
  });

  it("allows marking paid directly from sent (viewed webhook may never arrive)", () => {
    expect(canTransition("SENT", "PAID")).toBe(true);
  });

  it("rejects going backwards", () => {
    expect(canTransition("SENT", "DRAFT")).toBe(false);
    expect(canTransition("VIEWED", "SENT")).toBe(false);
  });

  it("rejects any transition out of a terminal state", () => {
    expect(canTransition("PAID", "VOID")).toBe(false);
    expect(canTransition("PAID", "SENT")).toBe(false);
    expect(canTransition("VOID", "DRAFT")).toBe(false);
  });
});

describe("assertValidTransition", () => {
  it("does not throw for a valid transition with an allowed trigger", () => {
    expect(() => assertValidTransition("DRAFT", "SENT", "MANUAL_USER")).not.toThrow();
    expect(() => assertValidTransition("SENT", "VIEWED", "EMAIL_WEBHOOK")).not.toThrow();
  });

  it("throws for a structurally invalid transition", () => {
    expect(() => assertValidTransition("PAID", "SENT", "MANUAL_USER")).toThrow(
      InvalidInvoiceTransitionError,
    );
  });

  it("throws when the trigger source isn't permitted for that transition", () => {
    // A webhook must never be able to mark an invoice paid.
    expect(() => assertValidTransition("SENT", "PAID", "EMAIL_WEBHOOK")).toThrow(
      InvalidInvoiceTransitionError,
    );
  });
});
