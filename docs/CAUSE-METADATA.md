# Cause metadata (`csd.cause/1`)

Each cause's `uri` points to one JSON file, pinned to IPFS. Front ends read it, the contract never does.

| Field | Type | Notes |
| --- | --- | --- |
| `schema` | `"csd.cause/1"` | Required |
| `slug` | string | Stable short id, used for photos |
| `name`, `legalName` | string | As the organisation writes them |
| `category` | string | Turtles, Marine, Wildlife, Environment, Animals, Children, Health, Food & poverty, Relief, Elderly, Women, Disability |
| `location` | `{town, state, country}` | `country` is ISO 3166 alpha-2 |
| `summary` | string | One or two plain sentences |
| `programmes`, `impact` | string[] | Impact lines carry their year |
| `beneficiaries` | string | Who it serves |
| `organisation` | object | `entityType`, `registration`, `registrationSource`, `founded`, `founders`, `leadership`, `taxExemption{statement,source}`, `accounts` |
| `contact` | object | Organisation contacts only: `address`, `phone`, `email`, `website`, `socials{instagram,facebook,youtube,tiktok}` |
| `live.note` | string | Where and when it streams or posts video |
| `donationsToday` | string | How it takes money outside CSD |
| `image` | object | `src`, `alt`, `credit`, `licence`, `sourceUrl`, `illustrative` (true when not the charity's own photo) |
| `background` | string | Optional history |
| `sources` | string[] | Every page the profile was built from |
| `profileCheckedOn` | date | `YYYY-MM-DD` |

Rules: no personal phone numbers, home addresses or bank account numbers of individuals. Anything about a private person stays off IPFS and off-chain.

## Evidence (`attest`) kinds used by front ends

`profile-check`, `document-check`, `site-visit`, `news`, `concern`, `note`, `open-question`. The `uri` is either an `https://` link or a short `data:application/json,` payload `{text, link}`.

## Help requests (`postNeed`)

`data:application/json,{"kind":"intro|visit|translate|…","title":"…","detail":"…"}`
