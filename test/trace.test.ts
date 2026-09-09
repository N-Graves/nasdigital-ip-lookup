import { describe, expect, it } from "vitest";
import {
  classifyTls,
  coloName,
  countryName,
  ipVersionOf,
  ispFields,
  parseTraceBody,
  readIspInfo,
  readTrace,
  traceFields,
} from "../src/trace.js";

/** A real captured body from nasdigital.co.uk, kept verbatim. */
const REAL = `fl=989f103
h=nasdigital.co.uk
ip=185.190.197.100
ts=1788984749.000
visit_scheme=https
uag=curl/8.21.0
colo=LHR
sliver=050-tier1
http=http/1.1
loc=GB
tls=TLSv1.3
sni=plaintext
warp=off
gateway=off
rbi=off
kex=X25519
`;

describe("parseTraceBody", () => {
  it("reads a real body", () => {
    const fields = parseTraceBody(REAL);
    expect(fields?.["ip"]).toBe("185.190.197.100");
    expect(fields?.["colo"]).toBe("LHR");
    expect(fields?.["loc"]).toBe("GB");
  });

  // The realistic production failure. A proxy or SPA rewrite serves index.html
  // for the unknown path WITH A 200, and without this the page shows markup
  // where somebody's IP address should be.
  it.each([
    ["<!doctype html>\n<html><body>hi</body></html>"],
    ["  <html>"],
    ["<?xml version=\"1.0\"?>"],
  ])("refuses a 200 that is actually a page", (body) => {
    expect(parseTraceBody(body)).toBeNull();
  });

  it.each([["", "   ", "\n\n"]].flat())("refuses an empty body", (body) => {
    expect(parseTraceBody(body)).toBeNull();
  });

  it("refuses something that parses but is not a trace", () => {
    expect(parseTraceBody("foo=bar\nbaz=qux")).toBeNull();
  });

  // The user-agent line contains equals signs of its own.
  it("splits on the first equals only", () => {
    expect(parseTraceBody("ip=1.2.3.4\nuag=a=b=c")?.["uag"]).toBe("a=b=c");
  });

  it("handles CRLF identically to LF", () => {
    expect(parseTraceBody(REAL.replace(/\n/g, "\r\n"))).toEqual(parseTraceBody(REAL));
  });

  it("survives a body truncated mid-key", () => {
    const fields = parseTraceBody("ip=1.2.3.4\ncol");
    expect(fields?.["ip"]).toBe("1.2.3.4");
    expect(fields?.["colo"]).toBeUndefined();
  });
});

describe("readTrace", () => {
  it("reads the real body into facts", () => {
    const facts = readTrace(parseTraceBody(REAL)!);
    expect(facts).toMatchObject({
      ip: "185.190.197.100",
      ipVersion: 4,
      countryCode: "GB",
      colo: "LHR",
      tls: "TLSv1.3",
      warp: "off",
    });
  });

  // Cloudflare genuinely returns XX when it will not say, and that is not a
  // country - showing it as one would be inventing information.
  it("treats loc=XX as no country at all", () => {
    expect(readTrace({ ip: "1.2.3.4", loc: "XX" }).countryCode).toBeNull();
  });

  it("recognises IPv6", () => {
    expect(readTrace({ ip: "2a00:23c5:1234::1" }).ipVersion).toBe(6);
  });
});

describe("ipVersionOf", () => {
  it.each([
    ["185.190.197.100", 4],
    ["2a00:23c5::1", 6],
    ["::1", 6],
  ])("reads %s", (ip, v) => expect(ipVersionOf(ip)).toBe(v));

  it.each(["", "not-an-ip", "1.2.3"])("returns null for %s", (ip) => {
    expect(ipVersionOf(ip)).toBeNull();
  });
});

describe("classifyTls", () => {
  // "TLSv1" is not "TLSv1.x". A startsWith("TLSv1.") check misses it entirely
  // and a careless else-branch then calls it unknown rather than obsolete.
  it.each(["TLSv1", "TLSv1.0", "TLSv1.1"])("flags %s as obsolete", (raw) => {
    const t = classifyTls(raw);
    expect(t?.modern).toBe(false);
    expect(t?.label).toMatch(/obsolete/);
  });

  it.each([
    ["TLSv1.2", "TLS 1.2"],
    ["TLSv1.3", "TLS 1.3"],
  ])("accepts %s", (raw, label) => {
    expect(classifyTls(raw)).toEqual({ label, modern: true });
  });

  it("returns null when there is no TLS at all", () => {
    expect(classifyTls("off")).toBeNull();
    expect(classifyTls("")).toBeNull();
  });
});

describe("names", () => {
  it("maps known codes and returns null rather than a placeholder for the rest", () => {
    expect(coloName("LHR")).toBe("London");
    expect(coloName("lhr")).toBe("London");
    expect(coloName("ZZZ")).toBeNull();
    expect(countryName("GB")).toBe("United Kingdom");
    expect(countryName("XX")).toBeNull();
    expect(countryName("QQ")).toBeNull();
  });
});

describe("readIspInfo, the hide-never-blank rule", () => {
  // All four of these must produce nothing, and the whitespace one is the case
  // that ships broken: if (info.org) passes on "   " and renders an empty row.
  it.each([
    ["nothing at all", null],
    ["an empty object", {}],
    ["explicit nulls", { organisation: null, city: null }],
    ["empty strings", { organisation: "", city: "" }],
    ["whitespace only", { organisation: "   ", city: "\t" }],
    ["not an object", "Sky Broadband"],
  ])("returns null for %s", (_label, raw) => {
    expect(readIspInfo(raw)).toBeNull();
  });

  it("keeps a partial answer when one field is real", () => {
    const info = readIspInfo({ asOrganization: "Sky UK Limited", city: null });
    expect(info?.organisation).toBe("Sky UK Limited");
    expect(info?.city).toBeNull();
    expect(ispFields(info!)).toHaveLength(1);
  });

  it("trims what it keeps", () => {
    expect(readIspInfo({ organisation: "  BT  " })?.organisation).toBe("BT");
  });
});

describe("fields rendered for display", () => {
  it("never emits a row with an empty value", () => {
    for (const f of traceFields(readTrace(parseTraceBody(REAL)!))) {
      expect(f.value.trim().length).toBeGreaterThan(0);
    }
  });

  it("says plainly that the edge is not where you are", () => {
    const edge = traceFields(readTrace(parseTraceBody(REAL)!)).find(
      (f) => f.label === "Cloudflare edge",
    );
    expect(edge?.value).toContain("London");
    expect(edge?.note).toMatch(/not where you are/i);
  });

  it("emits nothing at all from an empty trace", () => {
    expect(traceFields(readTrace({}))).toEqual([]);
  });
});
