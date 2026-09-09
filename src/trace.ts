/**
 * Reading Cloudflare's /cdn-cgi/trace, which is a plain key=value list.
 *
 * The parsing is the tool. Almost everything that can go wrong here is a
 * malformed or unexpected body rather than a bug in the arithmetic, and the
 * realistic production failure is not a 404 - it is a 200 that is HTML, because
 * a proxy or an SPA rewrite served index.html for an unknown path. Without a
 * check for that, the page cheerfully displays "<!doctype html>" as somebody's
 * IP address.
 */

export type TraceFields = Record<string, string>;

export interface TraceFacts {
  ip: string | null;
  ipVersion: 4 | 6 | null;
  countryCode: string | null;
  colo: string | null;
  tls: string | null;
  httpVersion: string | null;
  warp: string | null;
  scheme: string | null;
}

export const parseTraceBody = (body: string): TraceFields | null => {
  if (typeof body !== "string") return null;
  const text = body.trim();
  if (text === "") return null;
  // A 200 carrying a page rather than a trace. Cheap to detect, and the
  // alternative is showing markup where an IP address should be.
  if (/^\s*</.test(text)) return null;

  const fields: TraceFields = {};
  for (const line of text.split(/\r?\n/)) {
    if (line === "") continue;
    const at = line.indexOf("=");
    // Split on the FIRST equals only - the user-agent line contains more.
    if (at <= 0) continue;
    fields[line.slice(0, at)] = line.slice(at + 1);
  }
  // A trace always carries these. Anything without them is something else.
  return fields["ip"] !== undefined || fields["colo"] !== undefined ? fields : null;
};

export const ipVersionOf = (ip: string): 4 | 6 | null => {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return 4;
  if (ip.includes(":")) return 6;
  return null;
};

/** Cloudflare colo codes are IATA airport codes. A partial table; unknown is null. */
const COLO: Record<string, string> = {
  LHR: "London", MAN: "Manchester", EDI: "Edinburgh", DUB: "Dublin",
  CDG: "Paris", AMS: "Amsterdam", FRA: "Frankfurt", MAD: "Madrid",
  MXP: "Milan", ARN: "Stockholm", CPH: "Copenhagen", OSL: "Oslo",
  WAW: "Warsaw", VIE: "Vienna", ZRH: "Zurich", BRU: "Brussels",
  LIS: "Lisbon", IAD: "Ashburn", EWR: "Newark", LAX: "Los Angeles",
  ORD: "Chicago", DFW: "Dallas", ATL: "Atlanta", SEA: "Seattle",
  SJC: "San Jose", YYZ: "Toronto", GRU: "São Paulo", NRT: "Tokyo",
  SIN: "Singapore", HKG: "Hong Kong", SYD: "Sydney", BOM: "Mumbai",
  JNB: "Johannesburg", DXB: "Dubai",
};

export const coloName = (code: string): string | null => COLO[code.toUpperCase()] ?? null;

const COUNTRY: Record<string, string> = {
  GB: "United Kingdom", IE: "Ireland", US: "United States", CA: "Canada",
  FR: "France", DE: "Germany", NL: "Netherlands", ES: "Spain", IT: "Italy",
  PT: "Portugal", BE: "Belgium", SE: "Sweden", NO: "Norway", DK: "Denmark",
  FI: "Finland", PL: "Poland", AT: "Austria", CH: "Switzerland",
  AU: "Australia", NZ: "New Zealand", JP: "Japan", SG: "Singapore",
  IN: "India", BR: "Brazil", ZA: "South Africa", AE: "United Arab Emirates",
};

/** Cloudflare genuinely returns XX when it will not say, and that is not a country. */
export const countryName = (iso2: string): string | null =>
  iso2.toUpperCase() === "XX" ? null : (COUNTRY[iso2.toUpperCase()] ?? null);

export interface TlsInfo {
  label: string;
  modern: boolean;
}

export const classifyTls = (raw: string): TlsInfo | null => {
  if (!raw || raw === "off") return null;
  // "TLSv1" is not "TLSv1.x" - a startsWith("TLSv1.") check misses it and a
  // careless else-branch then calls it unknown instead of obsolete.
  if (raw === "TLSv1" || raw === "TLSv1.0" || raw === "TLSv1.1") {
    return { label: `${raw} - obsolete`, modern: false };
  }
  if (raw === "TLSv1.2") return { label: "TLS 1.2", modern: true };
  if (raw === "TLSv1.3") return { label: "TLS 1.3", modern: true };
  return { label: raw, modern: false };
};

export const describeWarp = (raw: string | undefined): string | null => {
  if (raw === undefined) return null;
  if (raw === "on" || raw === "plus") return "on";
  if (raw === "off") return "off";
  return raw;
};

export const readTrace = (fields: TraceFields): TraceFacts => {
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
    scheme: fields["visit_scheme"] ?? null,
  };
};

export interface IspInfo {
  organisation: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  timezone: string | null;
}

const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/**
 * A narrowing parse rather than a cast, and it returns null unless at least one
 * field survives. The case this exists for is a whitespace-only value: `if
 * (info.org)` passes on "   " and renders a row with an invisible value, which
 * is exactly the half-working state the brief refuses.
 */
export const readIspInfo = (raw: unknown): IspInfo | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const info: IspInfo = {
    organisation: text(r["organisation"] ?? r["asOrganization"] ?? r["org"]),
    city: text(r["city"]),
    region: text(r["region"]),
    postcode: text(r["postcode"] ?? r["postalCode"]),
    timezone: text(r["timezone"]),
  };
  return Object.values(info).some((v) => v !== null) ? info : null;
};

export interface Field {
  label: string;
  value: string;
  note?: string;
}

export const traceFields = (facts: TraceFacts): Field[] => {
  const out: Field[] = [];
  if (facts.ip) {
    out.push({
      label: "Your IP address",
      value: facts.ip,
      ...(facts.ipVersion ? { note: `IPv${facts.ipVersion}` } : {}),
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
      note: "The data centre serving this page, not where you are.",
    });
  }
  const tls = facts.tls ? classifyTls(facts.tls) : null;
  if (tls) out.push({ label: "Encryption", value: tls.label });
  if (facts.httpVersion) out.push({ label: "Protocol", value: facts.httpVersion });
  if (facts.warp) out.push({ label: "Cloudflare WARP", value: facts.warp });
  return out;
};

export const ispFields = (info: IspInfo): Field[] => {
  const out: Field[] = [];
  if (info.organisation) out.push({ label: "Registered to", value: info.organisation });
  const place = [info.city, info.region].filter(Boolean).join(", ");
  if (place) out.push({ label: "Approximate area", value: place, note: "Estimated from the network, often wrong by miles." });
  if (info.postcode) out.push({ label: "Approximate postcode", value: info.postcode });
  if (info.timezone) out.push({ label: "Time zone", value: info.timezone });
  return out;
};
