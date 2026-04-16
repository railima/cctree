# cctree

**Hierarchical session management for [Claude Code](https://claude.ai/code) with bidirectional context flow.**

> [Leia em Português](README.pt-BR.md)

## The Problem

When working on a multi-week project with Claude Code, you end up creating dozens of sessions: one for architecture decisions, another for implementing a feature, another to debug a bug, another to write tests. Every time you start a new session, you lose all the context from previous ones and have to re-explain the project, paste docs, and repeat yourself.

But losing context between sessions is only half the problem. The other half is **needing to go back**. You're deep in an implementation session and hit a bug that's related to an architecture decision you made three sessions ago. The only way to get useful help is to switch back to that architecture session, because that's where Claude has the full context of *why* things were designed that way. So you leave your implementation session, scroll through `/resume` trying to find the right one, ask your question there, then switch back and manually relay the answer. This constant session-hopping breaks your flow and wastes time.

`--fork-session` helps with the first problem, but it's one-directional: the child gets the parent's history, but what the child learns never flows back. And it doesn't help with the second problem at all: you still can't query a sibling session's knowledge from where you are.

**cctree fixes both.** It creates a session tree where knowledge flows in both directions: parent to child (context injection) and child to parent (commit back). Each new session starts with the accumulated wisdom of every session before it. And when you need details from a specific sibling session, the `get_sibling_context` tool lets you read its committed summary without leaving your current session.

## How It Works

```
                    ┌─────────────────────┐
                    │   Auth Service v2    │  <- parent (context accumulator)
                    │                     │
                    │  context.md grows    │
                    │  with each commit    │
                    └──────────┬──────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
   ┌────────▼────────┐ ┌──────▼───────┐ ┌────────▼────────┐
   │  Architecture   │ │   Database   │ │  API Endpoints  │
   │  Research       │ │   Schema     │ │  Implementation │
   │                 │ │              │ │                 │
   │ commit back ────┤ │ commit back ─┤ │ commit back ────┤
   └─────────────────┘ └──────────────┘ └─────────────────┘
```

1. You create a **tree** (the parent) with initial context docs
2. You create **branches** (child sessions) for specific tasks
3. Each child session opens Claude Code with all accumulated context injected
4. When a child session finishes, Claude **commits** a structured summary back to the parent
5. The next child session automatically inherits everything

The parent is not a Claude session. It's a managed document on disk that grows as children commit back. No context window is wasted on a "hub" session.

## Quick Start

### Install

```bash
npm install -g @railima/cctree
```

### Register the MCP server (one time)

```bash
cctree mcp-install
```

This registers `cctree` as an MCP server so Claude Code sessions have access to the `commit_to_parent`, `get_tree_status`, and `get_sibling_context` tools.

### Create your first tree

```bash
cctree init "Auth Service v2" --context docs/auth-spec.md docs/api-design.md
```

This creates a tree called "Auth Service v2" and copies your spec files as initial context.

### Start working

```bash
# Session 1: research and architecture decisions
cctree branch "Architecture Research"
```

Claude Code opens with your spec files already in context. Work normally. When you're done:

```
You: commit what we decided to the parent

Claude: [uses commit_to_parent tool]
Committed summary for "Architecture Research" to tree "Auth Service v2".
Accumulated context: 4.2 KB (1 sessions committed).
```

```bash
# Session 2: inherits everything from session 1
cctree branch "Database Schema"
```

This session already knows every architecture decision from session 1. When done, commit again. Session 3 will know everything from sessions 1 and 2, and so on.

## Use Cases

### Software Release Planning

You're shipping a new feature that spans backend, frontend, and infrastructure. Each area needs its own deep-dive session, but they all need to share context.

```bash
cctree init "Payment Integration" --context docs/payment-spec.md
cctree branch "Provider Research"         # compare Stripe vs Adyen vs PayPal
# ... commit back ...
cctree branch "Database Schema Design"    # design tables knowing the provider choice
# ... commit back ...
cctree branch "API Implementation"        # implement knowing schema + provider
# ... commit back ...
cctree branch "Frontend Integration"      # build UI knowing the full API
```

### Cross-Session Knowledge Queries

You're implementing API endpoints and hit a problem that relates to an architecture decision from an earlier session. Without cctree, you'd have to leave your current session, find the architecture session via `/resume`, ask your question there, then switch back and relay the answer manually.

With cctree, the architecture session's summary is already in your context. And if you need more detail:

```
You: I'm getting a circular dependency between the auth middleware and
     the user service. What did we decide about the dependency graph
     in the architecture session?

Claude: [uses get_sibling_context with name "Architecture Decisions"]
        In the architecture session, we decided to use an event-driven
        pattern to break circular dependencies: the auth middleware
        publishes a "user.authenticated" event and the user service
        subscribes to it, rather than direct imports.
```

No session switching. No copy-pasting. The knowledge from every committed session is queryable from wherever you are.

### Bug Investigation

A complex production bug that requires multiple investigation angles:

```bash
cctree init "Memory Leak Investigation" --context logs/error-dump.txt metrics/grafana-export.json
cctree branch "Log Analysis"
# ... commit back findings ...
cctree branch "Heap Dump Analysis"       # knows what logs already revealed
# ... commit back ...
cctree branch "Fix Implementation"       # knows root cause from both analyses
```

### Technical Spec to Implementation

Turn a spec into working code across multiple sessions:

```bash
cctree init "Notification System" --context specs/notifications-rfc.md
cctree branch "Architecture Decisions"    # decide message broker, patterns
# ... commit back ...
cctree branch "Core Service Scaffold"     # implement base knowing architecture
# ... commit back ...
cctree branch "Email Channel"             # implement knowing core service API
# ... commit back ...
cctree branch "Push Channel"              # implement knowing core + email patterns
```

### Research and Documentation

Accumulate knowledge across multiple research sessions:

```bash
cctree init "Cloud Migration Assessment"
cctree branch "Current Infrastructure Audit"
# ... commit back ...
cctree branch "AWS vs GCP Cost Analysis"    # knows current infra details
# ... commit back ...
cctree branch "Migration Plan Draft"        # knows infra + cost analysis
# ... commit back ...
cctree branch "Risk Assessment"             # full picture from all prior research
```

## CLI Reference

### `cctree init <name> [--context <files...>]`

Create a new session tree.

```bash
cctree init "My Project" --context spec.md plan.md architecture.md
cctree init "Quick Investigation"    # no initial context files
```

- Copies context files to `~/.cctree/trees/<slug>/initial-context/`
- Sets this tree as the active tree
- Generates the initial `context.md`

### `cctree branch <name> [--no-open]`

Create a child session and open Claude Code.

```bash
cctree branch "API Design"
cctree branch "Prototype" --no-open    # create entry without opening Claude
```

- Rebuilds `context.md` with all committed siblings
- Injects context via `--append-system-prompt-file`
- Opens Claude Code with `--name "TreeName > ChildName"`
- Writes active session state for MCP tools

### `cctree resume <name>`

Resume an existing child session.

```bash
cctree resume "API Design"
cctree resume api-design        # also accepts slugs
```

### `cctree list [--all]`

Show the session tree.

```bash
cctree list           # show active tree only
cctree list --all     # show all trees
```

Output:
```
Auth Service v2 (active)
├── [committed] Architecture Research (Apr 16)
├── [committed] Database Schema (Apr 17)
├── [active]    API Implementation
└── [abandoned] Old Approach
```

### `cctree status`

Show details about the active tree.

```bash
cctree status
```

Output:
```
Tree: Auth Service v2
Slug: auth-service-v2
Created: 4/16/2026
Working dir: /home/user/projects/auth-service
Sessions: 4 total (2 committed, 1 active)
Context files: 2
Context size: 8.3 KB
```

### `cctree context [--raw]`

Print the accumulated context document.

```bash
cctree context          # print to terminal
cctree context --raw    # raw markdown (useful for piping)
```

### `cctree use <name>`

Switch the active tree.

```bash
cctree use "Payment Integration"
cctree use payment-integration
```

### `cctree mcp-install [--scope <scope>]`

Register the cctree MCP server with Claude Code.

```bash
cctree mcp-install                  # default: user scope
cctree mcp-install --scope local    # current project only
```

## MCP Tools (Inside Claude Code)

These tools are available to Claude inside sessions launched via `cctree branch`:

### `commit_to_parent`

Commits a structured summary back to the parent tree.

**When to use:** At the end of a session when the user says "commit", "save to parent", "sync back", or similar.

**Summary format:**
```markdown
## Decisions
- Chose PostgreSQL over MongoDB for ACID compliance
- REST API with versioned endpoints (/v1/...)

## Artifacts Created
- Migration file: db/migrate/001_create_users.rb
- API controller: app/controllers/users_controller.rb

## Open Questions
- Should we use JWT or session-based auth?

## Next Steps
- Implement authentication middleware
- Add rate limiting
```

### `get_tree_status`

Shows the tree structure with all children and their statuses. Useful for understanding what work has been done and what's pending.

### `get_sibling_context`

Reads a specific sibling session's committed summary. Useful when you need details from a specific prior session beyond what's in the accumulated context.

```
You: what did we decide about the database in the schema session?
Claude: [uses get_sibling_context with name "Database Schema"]
```

## Multiple Trees

You can maintain multiple trees simultaneously for different projects or releases:

```bash
cctree init "Auth Service v2" --context docs/auth-spec.md
cctree init "Payment Integration" --context docs/payment-spec.md
cctree init "Q3 Performance Sprint" --context docs/perf-targets.md

cctree list --all
# Auth Service v2
#     (no sessions yet)
#
# Payment Integration
#     (no sessions yet)
#
# Q3 Performance Sprint (active)
#     (no sessions yet)

cctree use "Auth Service v2"     # switch context
cctree branch "Token Refresh"    # work on auth
# ...
cctree use "Payment Integration" # switch to another release
cctree branch "Webhook Handler"  # work on payments
```

Each tree is fully independent. Switching trees is instant since all state is file-based.

## Integration Ideas

### Creating trees from JIRA/Linear/CSV

Since `cctree init` and `cctree branch` are CLI commands, you can script them. For example, to create a tree from a CSV of JIRA tickets:

```bash
# tickets.csv:
# key,summary
# AUTH-101,Token refresh flow
# AUTH-102,Session management
# AUTH-103,SSO integration

cctree init "Auth Service v2" --context docs/auth-spec.md

while IFS=, read -r key summary; do
  cctree branch "$key: $summary" --no-open
done < <(tail -n +2 tickets.csv)

cctree list
# Auth Service v2 (active)
# ├── [active] AUTH-101: Token refresh flow
# ├── [active] AUTH-102: Session management
# └── [active] AUTH-103: SSO integration
```

Or use Claude Code itself to read your JIRA board and create the tree:

```
You: Read the tickets from docs/jira-export.csv and create a cctree
     branch for each one, grouped by epic.

Claude: [reads CSV, runs cctree init + cctree branch --no-open for each ticket]
```

### Feeding context from external sources

Initial context files can be anything: specs, API docs, database schemas, log dumps, architecture diagrams (as text). You can also generate them dynamically:

```bash
# Pull current schema as context
pg_dump --schema-only mydb > /tmp/schema.sql

# Pull recent error logs
kubectl logs deploy/api --since=24h > /tmp/recent-errors.log

cctree init "Prod Bug Fix" --context /tmp/schema.sql /tmp/recent-errors.log
```

### CI/CD Integration

After a tree is complete, export the accumulated context as a release document:

```bash
cctree context --raw > docs/releases/auth-v2-decisions.md
git add docs/releases/auth-v2-decisions.md
git commit -m "Add Auth v2 release decisions"
```

## How Context Flows

When you run `cctree branch "Database Schema"`, here is what happens:

1. cctree reads the tree's `context.md` (which contains initial context + all committed summaries)
2. Writes it to a temporary file
3. Opens Claude with `claude --name "Auth Service v2 > Database Schema" --append-system-prompt-file <temp-file>`
4. Writes `~/.cctree/active-session.json` so MCP tools know which tree/child is active

When Claude uses `commit_to_parent`:

1. Saves the summary to `~/.cctree/trees/<slug>/children/database-schema.md`
2. Updates `tree.json` to mark the child as "committed"
3. Rebuilds `context.md` by concatenating initial context + all committed children (chronologically)

The rebuilt `context.md` looks like:

```markdown
# Context: Auth Service v2

## Initial Context

### auth-spec.md
[original spec content]

### api-design.md
[original API design content]

## Session: Architecture Research (Apr 16, 2026)

### Decisions
- Chose microservices over monolith
- Event-driven communication via Redis Streams

### Artifacts Created
- docs/architecture-diagram.md

## Session: Database Schema (Apr 17, 2026)

### Decisions
- PostgreSQL with UUID primary keys
- Separate auth and user profile tables

### Artifacts Created
- db/migrate/001_create_auth_tables.rb
```

## Data Storage

All data is stored locally in `~/.cctree/`:

```
~/.cctree/
├── active-tree                    # slug of the current tree
├── active-session.json            # current tree + child (for MCP server)
└── trees/
    └── auth-service-v2/
        ├── tree.json              # tree config + children metadata
        ├── context.md             # auto-generated accumulated context
        ├── .inject-context.md     # temp file for Claude injection
        ├── initial-context/
        │   ├── auth-spec.md
        │   └── api-design.md
        └── children/
            ├── architecture-research.md
            └── database-schema.md
```

No data is sent to external services. Everything is local files.

## Requirements

- Node.js >= 20
- [Claude Code CLI](https://claude.ai/code) installed and authenticated

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

```bash
git clone https://github.com/railima/cctree.git
cd cctree
npm install
npm test          # 44 tests
npm run build     # produces dist/
npm run lint      # type-check
```

## License

[MIT](LICENSE)
