# nasdigital-ip-lookup

Your public IP address, the country it is registered in, the Cloudflare data centre serving the page,
and which TLS and HTTP version your connection negotiated. No third-party lookup service, and nothing
written down.

Built for [nasdigital.co.uk](https://nasdigital.co.uk) as a drop-in artefact: one IIFE, one
stylesheet, and a demo page.

## The one that makes it different: nobody else is involved

Almost every "what's my IP" page sends your address to a third-party geolocation API — which means
handing it to a company you did not choose, so they can tell you what it is. Cloudflare already sits
in front of this site and already knows all of it, because it handled the request. This asks the
edge that served the page and nothing else.

This is also the one tool in the set that genuinely makes a network request, and the only reason is
that what it shows is precisely what a browser cannot work out on its own.

## What the smoke script asserts instead of banning `fetch`

The sibling tools ban `fetch(` outright. Here that would be wrong, so the blanket ban is replaced
with checks that are **stronger** for this tool rather than weaker:

- **No absolute URL in any string in the bundle.** Every request target is same-origin by
  construction. This is the real guard against anyone later repointing it at `ipapi.co`.
- `credentials: "omit"` is present, and `include` / `same-origin` never are.
- **Exactly one place in the bundle can make a request.**
- `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `EventSource` and `new Image()` all still banned
  outright, as is all storage.

⚠️ Worth recording: that "exactly one place" check shipped **broken** first time and passed
vacuously, reporting `0`. A patch script wrote a literal backspace character where `\b` should have
been, so the regex could never match anything. Caught by reading the number it printed rather than
the tick beside it.

## The failure that actually happens is a 200, not a 404

A proxy or an SPA rewrite serving `index.html` for an unknown path — **with a 200** — is the
realistic production failure, not a clean 404. Without a check for it the page cheerfully displays
`<!doctype html>` where somebody's IP address should be. Anything that starts with `<` is refused,
and so is a body that parses but carries none of the keys a trace always has.

Other things the parser has to survive, each with a test: `loc=XX`, which Cloudflare genuinely
returns and which is **not a country**; a value containing its own `=` (the user-agent line does);
CRLF; a body truncated mid-key; and `TLSv1`, which is *not* `TLSv1.x` — a `startsWith("TLSv1.")`
check misses it entirely and a careless else-branch then calls it unknown rather than obsolete.

## The ISP half is one code path, not two

The "registered to" section is **hidden entirely — never blank** when `/api/ip-info` 404s *or*
returns nothing usable. That single mechanism covers both "the site has not installed the function
yet" and "`request.cf` did not populate", so the tool is correct on day one and gains the extra rows
by itself if and when the function lands.

`readIspInfo` is a narrowing parse rather than a cast, and returns null unless at least one field
survives. The case it exists for is a whitespace-only value: `if (info.org)` passes on `"   "` and
renders a row with an invisible value, which is exactly the half-working state to avoid.

## ⚠️ This is the one tool that cannot be fully verified off the deployed site

`/cdn-cgi/trace` is a Cloudflare edge endpoint and does not exist on `localhost`. So the demo page
points at **committed fixtures** via `data-ipl-trace-src` and `data-ipl-isp-src`, which run the whole
render path locally — better local coverage of its I/O than any of the sibling tools manage. On the
real site those attributes are absent and the defaults apply.

What no test can tell you is whether the origin it is installed on is actually Cloudflare-fronted.
That is a deploy-time fact. The failure is made loud and specific rather than a spinner: *"This page
is not being served through Cloudflare, so there is nothing to report here."*

## What the site needs to add for the ISP half

Nothing in this repository. The client works without it and hides the section. To light it up, the
site needs `functions/api/ip-info.js`:

```js
export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
  }
  const cf = context.request.cf;           // guarded - see below
  const body = {
    organisation: cf?.asOrganization ?? null,
    city: cf?.city ?? null,
    region: cf?.region ?? null,
    postcode: cf?.postalCode ?? null,
    timezone: cf?.timezone ?? null,
  };
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
```

Three things about that are not arbitrary:

- **Export `onRequest` and check the method inside it.** `functions/api/enquiry.js` in the site repo
  carries a comment explaining that exporting both `onRequest` and `onRequestPost` leaves precedence
  to the router and *"fails silently in production"*.
- **`request.cf` is guarded because nothing in that repo has ever read it**, so there is no evidence
  it populates. Return `null` per field rather than omitting it.
- **It cannot be tested before production.** `functions/_middleware.js` 404s every host ending
  `.pages.dev`, so preview deployments serve nothing. Ship it, then check
  `https://nasdigital.co.uk/api/ip-info` from the plain URL. A negative result is invisible to
  visitors, because the client hides the section.

Never log or store an address. There is no reason to and the page says there isn't.

## Integration

| Attribute | On | Purpose |
|---|---|---|
| `data-ipl` | the root `<section>` | Mount point |
| `data-ipl-out` | a `<dl>` | Connection rows |
| `data-ipl-isp` | a wrapper | The registered-to panel. Ships `hidden` |
| `data-ipl-isp-out` | a `<dl>` | Its rows |
| `data-ipl-note` | a `<p>` | Explains an empty result |
| `data-ipl-trace-src` / `-isp-src` | the root | **Demo only.** Omit on the real site |

Don't put `data-reveal` on anything the tool writes into: `fx.js` snapshots those once at load, so an
element injected afterwards stays at `opacity: 0` forever.

## Testing

```bash
npm run lint    # tsc --noEmit
npm test        # 38 tests
npm run smoke   # 23 assertions against the built bundle
npm run demo    # serves demo/ on http://127.0.0.1:4183
```

Driven in a real browser against the fixtures, all three paths: populated (six connection rows plus
four ISP rows), the ISP endpoint 404ing (**zero** ISP rows, section absent, connection rows intact),
and a trace returning a 200 that is HTML (**nothing** rendered, no markup shown, a specific note).

## Built on

[`@nasdigitaluk/withnate-tool-core`](https://github.com/N-Graves/withnate-tool-core) for `mount` and `h`.

## Licence

MIT. See [LICENSE](LICENSE).
