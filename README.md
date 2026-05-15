# linkedincli

Full LinkedIn platform management from your terminal. 46 commands for profiles, posts, messaging, connections, search, feed, engagement, and more — powered by cookie session auth.

Works as a **CLI** and an **MCP server** (for Claude Code, Cursor, Windsurf, and other AI agents).

## Install

```bash
# Install globally
npm install -g @bcharleson/linkedincli

# This installs the `linkedin` command:
linkedin --help

# Or run without installing
npx @bcharleson/linkedincli --help
```

> **Note:** The npm package is `@bcharleson/linkedincli` but the CLI command is just **`linkedin`**.

## Quick Start

### 1. Get Your Cookies

Open LinkedIn in your browser → DevTools (`F12`) → Application → Cookies → `linkedin.com`

Copy these two values:
- **`li_at`** — your session token (long string starting with `AQED...`)
- **`JSESSIONID`** — your session ID (starts with `ajax:`)

### 2. Login

```bash
linkedin login
# Paste your li_at and JSESSIONID when prompted
```

Or non-interactively:

```bash
linkedin login --li-at "AQEDxxxxxxx" --jsessionid "ajax:1234567890"
```

### 3. Use It

```bash
# View your profile
linkedin profile me --pretty

# Create a post
linkedin posts create --text "Hello LinkedIn! Posted from my terminal."

# Search for people
linkedin search people --keywords "software engineer" --network F --pretty

# Check your messages
linkedin messaging conversations --pretty

# React to a post
linkedin engage react 7123456789 --type LIKE
```

## All Commands

### Profile (9 commands)

```bash
linkedin profile me                           # Your own profile
linkedin profile view <public-id>             # View any profile
linkedin profile contact-info <public-id>     # Email, phone, websites
linkedin profile skills <public-id>           # List skills
linkedin profile network <public-id>          # Connections, followers, distance
linkedin profile badges <public-id>           # Premium, influencer, etc.
linkedin profile privacy <public-id>          # Privacy settings
linkedin profile posts <urn-id>               # Recent posts by a user
linkedin profile disconnect <public-id>       # Remove a connection
```

### Posts (6 commands)

```bash
linkedin posts create --text "My post"                     # Text post
linkedin posts create --text "With image" --image ./pic.jpg  # Image post
linkedin posts create --text "Inner circle" --visibility connections
linkedin posts edit <share-urn> --text "Updated text"      # Edit a post
linkedin posts delete <share-urn>                          # Delete a post
linkedin posts list                                        # Your own posts + reposts
linkedin posts comments                                    # Your comments on others' posts
linkedin posts reactions                                   # Your reactions on others' posts
```

`posts list`, `posts comments`, and `posts reactions` auto-resolve your profile from `/me` — no profile ID needed. To inspect a single post's engagement, take the numeric activity ID from a `posts list` item (the digits after `urn:li:activity:`) and pass it to `engage comments-list <activity-id>` and `engage reactions <activity-id>`.

### Feed (3 commands)

```bash
linkedin feed view                            # Your feed (chronological)
linkedin feed view --count 50                 # More items
linkedin feed user <profile-id>               # Someone's activity
linkedin feed company <company-name>          # Company updates
```

### Engagement (5 commands)

```bash
linkedin engage react <post-urn> --type LIKE          # Like
linkedin engage react <post-urn> --type PRAISE        # Celebrate
linkedin engage react <post-urn> --type EMPATHY       # Love
linkedin engage react <post-urn> --type INTEREST      # Insightful
linkedin engage react <post-urn> --type ENTERTAINMENT # Funny
linkedin engage react <post-urn> --type APPRECIATION  # Support

linkedin engage comment <post-urn> --text "Great post!"
linkedin engage comments-list <post-urn>
linkedin engage reactions <post-urn>
linkedin engage share <share-urn> --text "Worth reading"
```

### Connections (7 commands)

```bash
linkedin connections send <profile-urn>                     # Send request
linkedin connections send <profile-urn> -m "Let's connect!" # With message
linkedin connections received                               # Pending received
linkedin connections sent                                   # Pending sent
linkedin connections accept <id> --secret <secret>          # Accept
linkedin connections reject <id> --secret <secret>          # Reject
linkedin connections withdraw <id>                          # Withdraw sent
linkedin connections remove <public-id>                     # Unfriend
```

### Messaging (6 commands)

```bash
linkedin messaging conversations                        # All conversations
linkedin messaging conversation-with <profile-urn>      # With specific person
linkedin messaging messages <conversation-id>           # Read messages
linkedin messaging send <conversation-id> -t "Hello!"   # Reply
linkedin messaging send-new -r <urn1>,<urn2> -t "Hi!"   # New conversation
linkedin messaging mark-read <conversation-id>          # Mark as read
```

### Search (4 commands)

```bash
linkedin search people --keywords "CTO" --network F         # 1st connections
linkedin search people --keywords "engineer" --company 1035 # At a company
linkedin search people --title "VP Sales" --geo 103644278   # By region
linkedin search companies --keywords "AI startups"
linkedin search jobs --keywords "engineer" --remote --experience 4
linkedin search posts --keywords "AI trends"
```

### Companies (3 commands)

```bash
linkedin companies view <company-name>                  # Company info
linkedin companies follow <following-state-urn>         # Follow
linkedin companies unfollow <entity-urn>                # Unfollow
```

### Jobs (2 commands)

```bash
linkedin jobs view <job-id>                  # Job details
linkedin jobs skills <job-id>                # Skill match insights
```

### Analytics (1 command)

```bash
linkedin analytics profile-views             # Who viewed your profile
```

## Global Options

Every command supports these flags:

| Flag | Description |
|------|-------------|
| `--li-at <cookie>` | Override li_at cookie |
| `--jsessionid <cookie>` | Override JSESSIONID cookie |
| `--output pretty` | Pretty-printed JSON |
| `--pretty` | Shorthand for `--output pretty` |
| `--quiet` | No output, exit codes only |
| `--fields <list>` | Comma-separated fields to include |

## Environment Variables

```bash
export LINKEDIN_LI_AT="your_li_at_cookie"
export LINKEDIN_JSESSIONID="your_jsessionid_cookie"
```

Auth resolution order: `--li-at`/`--jsessionid` flags → env vars → `~/.linkedin-cli/config.json`

## MCP Server (AI Agents)

All 46 commands are available as MCP tools for Claude Code, Cursor, Windsurf, and other AI agents.

### Claude Code / Cursor / Windsurf

Add to your MCP config:

```json
{
  "mcpServers": {
    "linkedin": {
      "command": "linkedin",
      "args": ["mcp"],
      "env": {
        "LINKEDIN_LI_AT": "your_li_at_cookie",
        "LINKEDIN_JSESSIONID": "your_jsessionid_cookie"
      }
    }
  }
}
```

Or if using `npx`:

```json
{
  "mcpServers": {
    "linkedin": {
      "command": "npx",
      "args": ["-y", "@bcharleson/linkedincli", "mcp"]
    }
  }
}
```

Then your AI agent can manage your entire LinkedIn presence — create posts, respond to messages, manage connections, search for people, and more.

## Cookie Expiration

LinkedIn `li_at` cookies expire periodically (usually every few weeks). When your session expires:

```bash
linkedin status    # Check if session is valid
linkedin login     # Re-authenticate with new cookies
```

## Disclaimer

This tool uses LinkedIn's internal Voyager API via cookie session authentication. It is not affiliated with or endorsed by LinkedIn. Use responsibly and in compliance with LinkedIn's terms of service. The authors are not responsible for any account restrictions that may result from automated usage.

## License

MIT
