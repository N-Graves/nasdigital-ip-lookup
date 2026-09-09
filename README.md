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
