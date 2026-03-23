import { describe, test, expect } from "bun:test";
import { TICK, CROSS, BULLET, ARROW } from "../src/symbols";

describe("symbols", () => {
  test("produce correct Unicode characters", () => {
    expect(TICK).toBe("✓");
    expect(CROSS).toBe("✗");
    expect(BULLET).toBe("·");
    expect(ARROW).toBe("→");
  });
});
