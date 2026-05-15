---
name: linkedincli
description: Use this skill when the user wants to manage LinkedIn from the terminal or from an AI agent — read or write posts, browse the feed, view a profile's activity (their posts, comments, or reactions), search people/companies/jobs, manage connections, send messages, or view engagement (comments and reactions) on a specific post. Triggers on mentions of LinkedIn alongside any of: post, comment, reaction, like, share, feed, connection, message, profile, search, company, or job. Available via the `linkedin` CLI and the `linkedincli` MCP server (46 commands total).
---

# linkedincli

linkedincli is a CLI and MCP server that wraps LinkedIn's Voyager API via cookie session auth. Every command outputs JSON to stdout.

## Auth

Cookies (`li_at` + `JSESSIONID`) must already be configured — via `linkedin login`, env vars (`LINKEDIN_LI_AT`, `LINKEDIN_JSESSIONID`), or `~/.linkedin-cli/config.json`. If a command returns an auth error, tell the user to run `linkedin login`. Do not prompt for cookies yourself.

## Listing and inspecting posts

To view a user's own posts and the engagement on them, use this workflow:

1. `linkedin posts list` — lists the current user's posts and reposts. Auto-resolves their profile via `/me`, so no profile ID is needed. Each item includes the share URN, post body, and media.
2. `linkedin engage comments-list <post-urn>` — comments on a specific post.
3. `linkedin engage reactions <post-urn>` — reactions on a specific post.

There is no single "view post" command that bundles content + comments + reactions; do the three calls.

For someone else's posts, use `linkedin profile posts <urn-id>` (numeric URN) or `linkedin feed user <profile-id>` (URL slug).

## Listing your own activity on other people's posts

`posts list` only covers your own posts. To see your activity elsewhere:

- `linkedin posts comments` — comments you made on other people's posts.
- `linkedin posts reactions` — reactions/likes you gave on other people's posts.

Both auto-resolve the current user.

## Creating and engaging

- `linkedin posts create --text "..."` — new post. Add `--image <path>` for an image, `--visibility connections` to restrict.
- `linkedin posts edit <share-urn> --text "..."` / `linkedin posts delete <share-urn>`.
- `linkedin engage react <post-urn> --type LIKE|PRAISE|EMPATHY|INTEREST|ENTERTAINMENT|APPRECIATION`.
- `linkedin engage comment <post-urn> --text "..."` / `linkedin engage share <share-urn> --text "..."`.

## Other groups

- **Profile** (9): `me`, `view`, `contact-info`, `skills`, `network`, `badges`, `privacy`, `posts`, `disconnect`.
- **Feed** (3): `view`, `user <profile-id>`, `company <company-name>`.
- **Connections** (7): `send`, `received`, `sent`, `accept`, `reject`, `withdraw`, `remove`.
- **Messaging** (6): `conversations`, `conversation-with`, `messages`, `send`, `send-new`, `mark-read`.
- **Search** (4): `people`, `companies`, `jobs`, `posts` — all support keyword/filter flags.
- **Companies** (3): `view`, `follow`, `unfollow`. **Jobs** (2): `view`, `skills`. **Analytics** (1): `profile-views`.

## Conventions

- All CLI flags are kebab-case, JSON output fields are snake_case.
- Add `--pretty` for indented JSON, `--fields a,b,c` to subset, `--quiet` to suppress output.
- Path-style identifiers: `<post-urn>` looks like `urn:li:activity:7123...` or `urn:li:share:7123...`; `<share-urn>` is `urn:li:share:...`; profile IDs come in two flavors — the URL slug (e.g. `johndoe`) and the numeric/encoded URN ID.
- Rate-limited: the client enforces a minimum 2s gap between requests and retries 429s. Don't loop tight.

## When invoked as MCP tools

Tool names match command names with `_` separators (e.g. `posts_list`, `engage_comments-list`, `posts_comments`). Same inputs, same JSON output.
