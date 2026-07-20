import { describe, expect, it } from "vitest";
import { detectPlatform } from "@/lib/server/ingest";

describe("detectPlatform (SSRF allowlist)", () => {
  it("accepts the supported public video hosts", () => {
    expect(detectPlatform("https://www.youtube.com/watch?v=abc")).toBe("youtube");
    expect(detectPlatform("https://youtu.be/abc")).toBe("youtube");
    expect(detectPlatform("https://www.twitch.tv/videos/123")).toBe("twitch");
    expect(detectPlatform("https://kick.com/someone/videos/1")).toBe("kick");
  });

  it("rejects non-http(s) schemes (file://, etc.)", () => {
    expect(detectPlatform("file:///etc/passwd")).toBeNull();
    expect(detectPlatform("ftp://example.com/x")).toBeNull();
  });

  it("rejects internal / metadata / arbitrary hosts", () => {
    expect(detectPlatform("http://169.254.169.254/latest/meta-data/")).toBeNull();
    expect(detectPlatform("http://localhost:3000/api/media")).toBeNull();
    expect(detectPlatform("http://10.0.0.5/internal")).toBeNull();
    expect(detectPlatform("https://evil.com/video")).toBeNull();
  });

  it("is not fooled by a lookalike subdomain trick", () => {
    // twitch.tv must be the registrable host, not a path/prefix.
    expect(detectPlatform("https://twitch.tv.evil.com/x")).toBeNull();
    expect(detectPlatform("https://notyoutube.com/x")).toBeNull();
  });
});
