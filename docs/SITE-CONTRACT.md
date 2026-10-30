# The MineEx Site Contract — v1.0

A bespoke website becomes manageable from the MineEx portal by honouring four
obligations. Nothing else about it is constrained: framework, hosting, language,
animation, typography and layout are entirely the site's own.

> **Status.** Stage 0 of the website programme: content retrieval and manifest
> exchange. The portal-side editor is deliberately **not** built yet — the point
> of this stage is to prove a real bespoke site can get its content from MineEx
> and render it, before any editing UI is designed around assumptions.

---

## 0 · What is standardised, and what is not

| Standardised | Not standardised |
|---|---|
| The content payload's shape | How any of it is rendered |
| The field-type vocabulary a component declares | What the component does with those values |
| Authorization, draft preview, revalidation | Framework, host, build system, language |
| Version negotiation | Design, animation, layout, typography |

The one rule that makes a universal editor possible: **custom components,
standard field types.** A component may do anything; the fields it exposes for
editing must be expressed in the vocabulary below. If a component needs a field
type the vocabulary lacks, the vocabulary gains it — and every site gains it
too. A site-private field type would mean a site-private editor, which is the
outcome this whole design exists to avoid.

---

## 1 · Identity and authorization

Two credentials, both **hashed at rest**, both scoped to exactly one company,
both revocable.

### Site token — `mxs_…`
Long-lived. Belongs to the website's **server or build**, never to a browser.
Reads published content; uploads the component manifest.

```
Authorization: Bearer mxs_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

### Draft token — `mxd_…`
Short-lived (default 30 minutes), minted by the portal when someone opens a
preview, and carried to the site as `?mineex_draft=<token>`. The **site's
server** exchanges it for draft content. It is single-company, read-only, and
expires on its own.

### Rules

- The company is resolved **from the token**. A `company_id` in a request body or
  query string is ignored. There is no code path where a caller names the
  company whose content they receive.
- Tokens are stored as SHA-256 hashes. A leaked database row does not yield a
  usable credential.
- `revoked_at` and `expires_at` are checked on every request.
- **No CORS.** These endpoints are for servers and build steps. A token in
  browser JavaScript is a published credential; refusing CORS makes that mistake
  harder to make by accident.

---

## 2 · Component manifest

The site declares, in its own code, which of its sections are editable and what
fields each exposes. On deploy, CI uploads that declaration.

```
PUT /api/site-manifest
Authorization: Bearer <site token>
Content-Type: application/json
```

```jsonc
{
  "contract": "1.0",
  "site": { "key": "kingsmen-2026", "version": "2026.10.3" },
  "sections": [
    {
      "type": "hero",
      "label": "Homepage hero",
      "description": "The full-bleed opening. Image is cropped to 21:9.",
      "singleton": true,
      "fields": [
        { "key": "heading",   "type": "text",     "label": "Heading", "max": 70, "required": true },
        { "key": "sub",       "type": "text",     "label": "Sub-heading", "max": 160 },
        { "key": "backdrop",  "type": "image",    "label": "Background", "ratio": "21:9" },
        { "key": "ctaLabel",  "type": "text",     "label": "Button label", "max": 24 },
        { "key": "ctaHref",   "type": "link",     "label": "Button link" }
      ]
    },
    {
      "type": "geo-map",
      "label": "Animated geological map",
      "description": "The animation itself is not configurable.",
      "fields": [
        { "key": "heading", "type": "text", "label": "Heading", "max": 60 },
        { "key": "markers", "type": "list", "label": "Project markers", "max": 12,
          "of": [
            { "key": "name", "type": "text",   "label": "Name", "required": true },
            { "key": "lat",  "type": "number", "label": "Latitude",  "min": -90,  "max": 90 },
            { "key": "lng",  "type": "number", "label": "Longitude", "min": -180, "max": 180 },
            { "key": "note", "type": "richtext", "label": "Note" }
          ]
        }
      ]
    }
  ]
}
```

**Locked design parameters are simply absent.** There is no `editable: false` —
a field the manifest does not mention cannot be reached by the editor, which is
a stronger guarantee than a flag someone could flip.

### Field-type vocabulary

| Type | Editor control | Constraints |
|---|---|---|
| `text` | single line | `max`, `required` |
| `richtext` | formatted, restricted marks | `max`, `marks` |
| `number` | numeric | `min`, `max`, `step` |
| `date` | date picker | `min`, `max` |
| `boolean` | switch | — |
| `enum` | select / segmented | `options[]`, `required` |
| `image` | upload + crop | `ratio`, `minWidth` |
| `video` | upload or URL | `maxSeconds` |
| `link` | URL, `http(s)` only | `internal` |
| `list` | repeater | `of[]`, `min`, `max` |
| `reference` | pick canonical record | `to`: `project` \| `person` \| `post` \| `document` |

`reference` is how a bespoke component reuses canonical data without copying it:
a section referencing `project:las-coloradas` always renders today's project
record, not a snapshot taken when someone last edited the page.

**The manifest is generated from the site's source, never hand-written.** A
hand-maintained manifest drifts from the components it claims to describe; a
generated one cannot.

---

## 3 · Content retrieval

```
GET /api/site-content             Authorization: Bearer <site token>    → published
GET /api/site-content?draft=1     Authorization: Bearer <draft token>   → draft
```

```jsonc
{
  "contract": "1.0",
  "mode": "published",
  "generatedAt": "2026-10-15T09:12:44.001Z",
  "company": { "id": "…", "slug": "kingsmen", "name": "Kingsmen Resources Ltd.", "status": "published" },
  "version": { "content": "2026-10-14T18:02:11.000Z", "site": 7 },
  "content": {
    "profile":   { /* companies.profile — canonical + compiled, as stored */ },
    "posts":     [ /* published press releases and media, newest first */ ],
    "media":     [ /* public media assets */ ],
    "documents": [ /* public documents */ ]
  },
  "site": {
    "pages":    [ { "key": "home", "title": "Home", "path": "/", "sections": ["hero-1", "geo-1"] } ],
    "sections": { "hero-1": { "type": "hero", "values": { "heading": "…" } } }
  }
}
```

### The separation that matters

`content` is **canonical** — one company record, shared by the investor app, the
booth, MineIQ and every website. `site` is **website-specific** — headings,
imagery choices, section order, presentation settings belonging to this site
alone.

They live in different tables (`companies.profile` / `posts` versus
`company_blueprints.data`) and are written by different paths. **Updating
canonical company information cannot overwrite site-specific content, because
nothing in the canonical write path can reach `site`.** That is structural, not
a convention someone has to remember.

---

## 4 · Draft preview

1. The portal mints a draft token (30 min) and opens
   `https://site.example/?mineex_draft=<token>`.
2. The **site's server** detects the parameter and fetches
   `/api/site-content?draft=1` with that token.
3. It renders unpublished content, and **must not cache that response** or serve
   it to anyone without the parameter.

A draft token is read-only, single-company, and expires without intervention. A
leaked one exposes unpublished marketing copy for half an hour — not an account.

---

## 5 · Publishing and revalidation

*(Stage 3 — specified here so sites can be built against it now.)*

On publish, MineEx calls the site's revalidate hook:

```
POST <company_destinations.config.revalidate_url>
X-MineEx-Signature: sha256=<hmac of the body, keyed with the site secret>
{ "contract": "1.0", "companyId": "…", "event": "content.published", "version": { … } }
```

Verify the signature before acting. Respond `2xx` once revalidation is queued;
any other status is recorded against `company_destinations.last_error` and
retried by the dispatcher.

**Content is fetched, never built in.** An ordinary edit triggers revalidation,
not a deploy. A deploy happens only when the site's own code changes.

---

## 6 · Version compatibility

Every payload and manifest carries `contract`. The rule is **major-compatible,
minor-additive**:

- A site declaring `1.0` is served a `1.x` payload. New optional fields may
  appear; existing ones do not change meaning or disappear.
- A breaking change is `2.0`, served only to sites declaring `2`.
- A site may request a version with `?contract=1.0`; unsupported versions get
  `409` and a list of what is available, never a silently different shape.

Sites should ignore unknown fields rather than validate strictly against a fixed
shape, so that additive changes do not require a redeploy.

---

## 7 · Errors and rollback

| Status | Meaning | What the site should do |
|---|---|---|
| `200` | Content follows | Render |
| `304` | Not modified (`If-None-Match`) | Serve the cached build |
| `401` | Missing, malformed, revoked or expired token | Stop. Do not retry with the same credential |
| `403` | Token valid, entitlement absent or company unpublished | Serve the last good build; alert |
| `409` | Contract version unsupported | Pin a supported version |
| `429` | Rate limited | Back off; `Retry-After` is set |
| `503` | Site contract not provisioned on this deployment | Serve the last good build |

**Serve the last good build on any failure.** A content API outage must never
take a public company's investor site down. Keep the last successful payload on
disk and fall back to it; a slightly stale site is vastly better than a 500.

Rollback is a MineEx-side operation: restoring a previous content version and
re-triggering revalidation. The site does not need to know a rollback happened —
it just gets different content on the next revalidate.
