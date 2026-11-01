# a22 Social publishing (LinkedIn, X, Meta): scope note

**Status: deferred. Nothing is implemented.** It needs developer apps that only
the account owner can create, and each platform reviews them, so it should not
block anything else.

## What already fits
- **The record.** A post to a social network is a `publications` row with
  `destination_id` set to `linkedin`, `x` or `meta`. The outbox already carries
  those publications. The feed and fan-out listeners skip them on purpose (they
  check `destination_id !== "passport"`).
- **Delivery.** One versioned listener per network (`linkedin_post_v1`, ...) on
  the a15 pattern. Each gets its own `event_deliveries` state, backoff, dead
  letter, replay, and status through `publication_delivery_status`.
- **Credentials.** `company_destinations.secret_ref` is meant to point into a
  credential store. No such store exists yet (see the note in 0068). Tokens
  must never live in a table column.

## What has to happen first (user / business)
1. Create the apps and submit them for review: LinkedIn Marketing Developer
   Platform (Community Management API, `w_organization_social`), an X developer
   project (a paid tier is needed to post), and a Meta app (Pages API,
   `pages_manage_posts`; Instagram Graph API needs a Business account).
2. Choose where tokens are stored (Supabase Vault or an external KMS).
3. Approve the cost: X API tier, plus whatever review each platform demands.

## Build (once 1–3 are done), smallest first
1. OAuth connect and disconnect per company per network. Tokens go to the
   store, and `company_destinations` keeps only the reference and status.
2. LinkedIn organisation post, text and link only: listener, idempotency key
   = publication id + publish_seq, the external post id saved on the
   publication.
3. Unpublish deletes the post where the API allows it. Where it doesn't, the
   portal says so.
4. X, then Meta. Images and video come last, because each network has its own
   upload flow.

## Risks
- Disclosure. Posting a material release to social media before or apart from
  the regulatory filing is a compliance question for each company. The
  default should be off, with a per-release opt-in.
- Rate limits and token expiry. Both surface as dead letters in Delivery ops,
  not as silent failures.
