# The Grass Patch

Created by Ivan Yu.

## Telnyx messaging

Order-ready SMS messages and the inbound HELP response are disabled by default.
Configure these environment variables on the backend Lambda:

```text
TELNYX_MESSAGING_ENABLED=false
TELNYX_API_KEY=<Telnyx API key>
TELNYX_FROM_NUMBER=+18335551234
TELNYX_PUBLIC_KEY=<Telnyx webhook public key>
```

Keep `TELNYX_MESSAGING_ENABLED=false` until the toll-free number is verified.
After verification, set the Messaging Profile webhook URL to:

```text
https://<production-api-host>/api/webhooks/telnyx
```

Then set `TELNYX_MESSAGING_ENABLED=true`. Telnyx secrets belong only on the
backend and must never use a `VITE_` prefix.
