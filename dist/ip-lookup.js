/*! nasdigital-ip-lookup v0.1.0 - MIT
 * https://github.com/N-Graves/nasdigital-ip-lookup#readme
 *  * Runs entirely in the browser. It reads two same-origin endpoints on the site
 * it is installed on, and stores nothing.
 */
"use strict";
(() => {
  // node_modules/@nasdigitaluk/withnate-tool-core/dist/sniff.js
  var HEADER_BYTES = 64 * 1024;

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/units.js
  var MM_PER_INCH = 25.4;
  var CM_PER_INCH = MM_PER_INCH / 10;

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/exif.js
  var MAX_BLOCK_BYTES = 4 * 1024 * 1024;
  var TEXT = new TextDecoder("utf-8", { fatal: false });

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/mount.js
  var getWn = () => globalThis.WN ?? null;
  var mount = (selector, init) => {
    const run = () => {
      const root = document.querySelector(selector);
      if (!root)
        return;
      const wn = getWn();
      const reduced = wn?.reduced ?? (typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)").matches : true);
      init({ root, wn, reduced });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/dom.js
  var h = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v === null || v === void 0)
        continue;
      if (k === "class")
        node.className = String(v);
      else if (v === true)
        node.setAttribute(k, "");
      else
        node.setAttribute(k, String(v));
    }
    for (const c of children) {
      if (c === null || c === void 0)
        continue;
      node.append(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  };

  // src/trace.ts
  var parseTraceBody = (body) => {
    if (typeof body !== "string") return null;
    const text2 = body.trim();
    if (text2 === "") return null;
    if (/^\s*</.test(text2)) return null;
    const fields = {};
    for (const line of text2.split(/\r?\n/)) {
      if (line === "") continue;
      const at = line.indexOf("=");
      if (at <= 0) continue;
      fields[line.slice(0, at)] = line.slice(at + 1);
    }
    return fields["ip"] !== void 0 || fields["colo"] !== void 0 ? fields : null;
  };
  var ipVersionOf = (ip) => {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return 4;
    if (ip.includes(":")) return 6;
    return null;
  };
  var COLO = {
    LHR: "London",
    MAN: "Manchester",
    EDI: "Edinburgh",
    DUB: "Dublin",
    CDG: "Paris",
    AMS: "Amsterdam",
    FRA: "Frankfurt",
    MAD: "Madrid",
    MXP: "Milan",
    ARN: "Stockholm",
    CPH: "Copenhagen",
    OSL: "Oslo",
    WAW: "Warsaw",
    VIE: "Vienna",
    ZRH: "Zurich",
    BRU: "Brussels",
    LIS: "Lisbon",
    IAD: "Ashburn",
    EWR: "Newark",
    LAX: "Los Angeles",
    ORD: "Chicago",
    DFW: "Dallas",
    ATL: "Atlanta",
    SEA: "Seattle",
    SJC: "San Jose",
    YYZ: "Toronto",
    GRU: "S\xE3o Paulo",
    NRT: "Tokyo",
    SIN: "Singapore",
    HKG: "Hong Kong",
    SYD: "Sydney",
    BOM: "Mumbai",
    JNB: "Johannesburg",
    DXB: "Dubai"
  };
  var coloName = (code) => COLO[code.toUpperCase()] ?? null;
  var COUNTRY = {
    GB: "United Kingdom",
    IE: "Ireland",
    US: "United States",
    CA: "Canada",
    FR: "France",
    DE: "Germany",
    NL: "Netherlands",
    ES: "Spain",
    IT: "Italy",
    PT: "Portugal",
    BE: "Belgium",
    SE: "Sweden",
    NO: "Norway",
    DK: "Denmark",
    FI: "Finland",
    PL: "Poland",
    AT: "Austria",
    CH: "Switzerland",
    AU: "Australia",
    NZ: "New Zealand",
    JP: "Japan",
    SG: "Singapore",
    IN: "India",
    BR: "Brazil",
    ZA: "South Africa",
    AE: "United Arab Emirates"
  };
  var countryName = (iso2) => iso2.toUpperCase() === "XX" ? null : COUNTRY[iso2.toUpperCase()] ?? null;
  var classifyTls = (raw) => {
    if (!raw || raw === "off") return null;
    if (raw === "TLSv1" || raw === "TLSv1.0" || raw === "TLSv1.1") {
      return { label: `${raw} - obsolete`, modern: false };
    }
    if (raw === "TLSv1.2") return { label: "TLS 1.2", modern: true };
    if (raw === "TLSv1.3") return { label: "TLS 1.3", modern: true };
    return { label: raw, modern: false };
  };
  var describeWarp = (raw) => {
    if (raw === void 0) return null;
    if (raw === "on" || raw === "plus") return "on";
    if (raw === "off") return "off";
    return raw;
  };
  var readTrace = (fields) => {
    const ip = fields["ip"] ?? null;
    const country = fields["loc"] ?? null;
    return {
      ip,
      ipVersion: ip ? ipVersionOf(ip) : null,
      countryCode: country && country.toUpperCase() !== "XX" ? country.toUpperCase() : null,
      colo: fields["colo"] ?? null,
      tls: fields["tls"] ?? null,
      httpVersion: fields["http"] ?? null,
      warp: describeWarp(fields["warp"]),
      scheme: fields["visit_scheme"] ?? null
    };
  };
  var text = (v) => typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  var readIspInfo = (raw) => {
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw;
    const info = {
      organisation: text(r["organisation"] ?? r["asOrganization"] ?? r["org"]),
      city: text(r["city"]),
      region: text(r["region"]),
      postcode: text(r["postcode"] ?? r["postalCode"]),
      timezone: text(r["timezone"])
    };
    return Object.values(info).some((v) => v !== null) ? info : null;
  };
  var traceFields = (facts) => {
    const out = [];
    if (facts.ip) {
      out.push({
        label: "Your IP address",
        value: facts.ip,
        ...facts.ipVersion ? { note: `IPv${facts.ipVersion}` } : {}
      });
    }
    if (facts.countryCode) {
      const name = countryName(facts.countryCode);
      out.push({ label: "Country", value: name ?? facts.countryCode });
    }
    if (facts.colo) {
      const city = coloName(facts.colo);
      out.push({
        label: "Cloudflare edge",
        value: city ? `${city} (${facts.colo})` : facts.colo,
        note: "The data centre serving this page, not where you are."
      });
    }
    const tls = facts.tls ? classifyTls(facts.tls) : null;
    if (tls) out.push({ label: "Encryption", value: tls.label });
    if (facts.httpVersion) out.push({ label: "Protocol", value: facts.httpVersion });
    if (facts.warp) out.push({ label: "Cloudflare WARP", value: facts.warp });
    return out;
  };
  var ispFields = (info) => {
    const out = [];
    if (info.organisation) out.push({ label: "Registered to", value: info.organisation });
    const place = [info.city, info.region].filter(Boolean).join(", ");
    if (place) out.push({ label: "Approximate area", value: place, note: "Estimated from the network, often wrong by miles." });
    if (info.postcode) out.push({ label: "Approximate postcode", value: info.postcode });
    if (info.timezone) out.push({ label: "Time zone", value: info.timezone });
    return out;
  };

  // src/index.ts
  var TRACE_PATH = "/cdn-cgi/trace";
  var ISP_PATH = "/api/ip-info";
  var TIMEOUT_MS = 6e3;
  var getText = async (path) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(path, { credentials: "omit", signal: controller.signal });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  var rowNode = (f) => h(
    "div",
    { class: "ipl-row" },
    h("dt", { class: "ipl-label" }, f.label),
    h("dd", { class: "ipl-value" }, f.value, f.note ? h("span", { class: "ipl-hint" }, f.note) : null)
  );
  mount("[data-ipl]", ({ root }) => {
    const out = root.querySelector("[data-ipl-out]");
    const ispSection = root.querySelector("[data-ipl-isp]");
    const ispOut = root.querySelector("[data-ipl-isp-out]");
    const note = root.querySelector("[data-ipl-note]");
    if (!out) return;
    const tracePath = root.dataset["iplTraceSrc"] ?? TRACE_PATH;
    const ispPath = root.dataset["iplIspSrc"] ?? ISP_PATH;
    ispSection?.setAttribute("hidden", "");
    void (async () => {
      const body = await getText(tracePath);
      const fields = body === null ? null : parseTraceBody(body);
      if (!fields) {
        out.replaceChildren();
        if (note) {
          note.textContent = "This page is not being served through Cloudflare, so there is nothing to report here. On nasdigital.co.uk it fills in by itself.";
          note.className = "ipl-note ipl-note-quiet";
        }
        return;
      }
      out.replaceChildren(...traceFields(readTrace(fields)).map(rowNode));
      if (note) note.textContent = "";
      const ispBody = await getText(ispPath);
      if (ispBody === null || !ispSection || !ispOut) return;
      let info = null;
      try {
        info = readIspInfo(JSON.parse(ispBody));
      } catch {
        info = null;
      }
      if (!info) return;
      const rows = ispFields(info);
      if (rows.length === 0) return;
      ispOut.replaceChildren(...rows.map(rowNode));
      ispSection.removeAttribute("hidden");
    })();
  });
})();
