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

### Local SMS testing

Add the Telnyx values and Messaging Profile ID to the ignored `.env` file,
then enable messaging:

```text
TELNYX_MESSAGING_ENABLED=true
TELNYX_API_KEY=<Telnyx API key>
TELNYX_FROM_NUMBER=+18335551234
TELNYX_PUBLIC_KEY=<Telnyx webhook public key>
TELNYX_MESSAGING_PROFILE_ID=<Telnyx Messaging Profile ID>
```

Start the frontend, API, and API tunnel together:

```sh
npm run dev:all
```

The command starts a free ngrok tunnel before starting the frontend and API. It
automatically sets both the Messaging Profile webhook and the local
`APP_BASE_URL` to the generated URL, so tracking and Stripe return links work on
other devices. Vite's `/api/**` development proxy forwards API and Telnyx
webhook requests to the local API on port `4000`. Free ngrok URLs change between
runs, which is why the webhook is updated automatically.
