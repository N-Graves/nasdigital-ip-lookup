/**
 * The DOM half: two same-origin fetches, then render.
 *
 * This is the only one of these four tools that talks to the network at all, and
 * the reason is that the information it shows is exactly the information it
 * cannot compute locally - what your connection looks like from the outside.
 * Both endpoints are same-origin by construction: the paths are string literals
 * starting with a slash, and the smoke script asserts that rather than trusting
 * it.
 *
 * The ISP section is one code path, not two. It is hidden entirely - never shown
 * blank - when the endpoint 404s OR returns nothing usable, which covers both
 * "the site has not installed the function yet" and "request.cf did not
 * populate". So the tool is correct on day one and gains the extra rows by
 * itself if and when the function lands.
 */

import { h, mount } from "@nasdigitaluk/withnate-tool-core";
import {
  ispFields,
  parseTraceBody,
  readIspInfo,
  readTrace,
  traceFields,
  type Field,
} from "./trace.js";

const TRACE_PATH = "/cdn-cgi/trace";
const ISP_PATH = "/api/ip-info";
const TIMEOUT_MS = 6000;

const getText = async (path: string): Promise<string | null> => {
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

const rowNode = (f: Field): HTMLElement =>
  h(
    "div",
    { class: "ipl-row" },
    h("dt", { class: "ipl-label" }, f.label),
    h("dd", { class: "ipl-value" }, f.value, f.note ? h("span", { class: "ipl-hint" }, f.note) : null),
  );

mount("[data-ipl]", ({ root }) => {
  const out = root.querySelector<HTMLElement>("[data-ipl-out]");
  const ispSection = root.querySelector<HTMLElement>("[data-ipl-isp]");
  const ispOut = root.querySelector<HTMLElement>("[data-ipl-isp-out]");
  const note = root.querySelector<HTMLElement>("[data-ipl-note]");
  if (!out) return;

  // The demo page points these at committed fixtures so the whole render path
  // runs locally. On the real site the attributes are absent and the defaults
  // are the Cloudflare and site endpoints.
  const tracePath = root.dataset["iplTraceSrc"] ?? TRACE_PATH;
  const ispPath = root.dataset["iplIspSrc"] ?? ISP_PATH;

  ispSection?.setAttribute("hidden", "");

  void (async () => {
    const body = await getText(tracePath);
    const fields = body === null ? null : parseTraceBody(body);

    if (!fields) {
      out.replaceChildren();
      if (note) {
        note.textContent =
          "This page is not being served through Cloudflare, so there is nothing to report here. On nasdigital.co.uk it fills in by itself.";
        note.className = "ipl-note ipl-note-quiet";
      }
      return;
    }

    out.replaceChildren(...traceFields(readTrace(fields)).map(rowNode));
    if (note) note.textContent = "";

    // Best effort, and its absence is invisible rather than blank.
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
