import { describe, expect, it } from "vitest";
import { formatListenUrl, resolveBridgeHost } from "../src/network.js";

describe("resolveBridgeHost", () => {
  it("defaults to the IPv6 unspecified address", () => {
    expect(resolveBridgeHost(undefined)).toBe("::");
  });

  it("keeps explicit hosts unchanged", () => {
    expect(resolveBridgeHost("0.0.0.0")).toBe("0.0.0.0");
    expect(resolveBridgeHost("::1")).toBe("::1");
  });
});

describe("formatListenUrl", () => {
  it("formats IPv4 hosts without brackets", () => {
    expect(formatListenUrl("0.0.0.0", 8765)).toBe("http://0.0.0.0:8765");
  });

  it("wraps IPv6 hosts in brackets", () => {
    expect(formatListenUrl("::", 8765)).toBe("http://[::]:8765");
    expect(formatListenUrl("fd7a:115c:a1e0::9b01:d896", 8765)).toBe("http://[fd7a:115c:a1e0::9b01:d896]:8765");
  });
});
