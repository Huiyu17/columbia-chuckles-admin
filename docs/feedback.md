# Admin panel feedback log

## Feedback 7: understandable workflows and name-based relationship selection

The feedback group could not tell what prompt chains, steps and mix were for.
Typing a related record's UUID also required finding it elsewhere before editing.

- The three pages now use Caption workflows, Workflow instructions and Workflow
  selection as their navigation/page names. Introductions retain the original
  prompt-chain terminology and explain the purpose of each page. A linked,
  three-part guide shows how workflows, instructions and selection fit together.
- Selection settings explain enabled/disabled behavior, zero weights, relative
  probability and why changing a lone workflow's positive weight has no effect.
- Known relationship fields use searchable dropdowns with actual record names:
  workflows, providers, models, images, owners, previews, requests and steps.
  Existing forms no longer require typing these UUIDs. Values still submit full
  IDs, preserve current selections during search/errors and support nullable choices.
- Choices use the existing authorized read APIs, load additional pages on demand,
  and show image previews / links to selected records. Normal-user access stays
  blocked. No schema, RLS, stored data or mutation RPC changes are needed.
- Regression tests cover selection by name, pagination, error/retry, required and
  nullable selections, stale search replies, form reset and successful-save sync.

## Feedback 6: distinguish generation results from caption availability

- Generation requests and LLM responses now label the generation result separately
  from the caption's current publishing state: Published, Not published, In author's
  Trash, Removed by admin, Permanently deleted, or Status unavailable.
- Failed/running attempts without a draft show Not created / Not created yet.
- Status is read from the linked generation plus both live and hidden captions.
  Permanent deletion requires a withdrawal marker and complete successful reads
  confirming that no caption remains; missing records or query failures are not
  treated as proof of deletion. No database migration is needed.
- A short explanation clarifies whether restoration is possible and why original
  AI history remains. Existing captions link to their admin details; permanently
  deleted captions have no broken details link.
- Refresh statuses re-reads current data after actions in the main app. It does
  not alter any records or rerun AI generation.

## Feedback 5: subtle record IDs with full-key copying

- Every Week 7 resource card retains its readable heading and adds a muted ID
  showing the first eight characters of its actual primary key.
- Copy ID copies the complete key, briefly confirms success, and gives visible
  guidance on permission denial or unsupported clipboard access.
- Complete IDs remain in expanded details. Editing, deleting, searching and
  relationship links continue using complete keys; short IDs are display only.
- Browser checks cover full-key copying, feedback, unavailable/denied clipboard,
  retry, two records sharing a short prefix, and editing with the full key.

## Feedback 4: readable Week 7 resource summaries

- Resource cards show actual names or short scene/prompt/response/alt-text previews
  instead of UUID headings. Steps show one-based display numbers and chain/model
  context; mix cards show chain names, weights and enabled status.
- Related names use existing read-only admin RPCs and profile reads, deduplicated
  within the visible page. Missing relationships have explicit fallback labels.
- Response cards include model, latency and reported token usage; timestamps use
  New York time with the timezone abbreviation. Full original content and IDs stay
  in expanded details, and editing behavior is preserved.
- Removed duplicate resource navigation above the search form; the sidebar remains
  the navigation for all resource sections.
- `node scripts/resource-summary-test.mjs` checks all resource types, missing data,
  truncation, rendered output and read-only relationship lookups. No schema, RLS,
  authentication, CRUD or existing API behavior changes are required.

## Feedback 3: saved resource values must stay in sync

The record details refreshed after saving, but the open editor could reset to
previous values (for example, details showed `enabled: true` while the select
still showed False).

- Resource forms now keep submitted edit values while saved data refreshes.
- Refreshed records reset the field subtree, updating text, booleans and null
  checkboxes without closing the editor or losing the success message.
- Failed saves preserve the input; create forms clear only after success.
- `node scripts/resource-editor-test.mjs` runs six real React/Chromium regression
  checks with mocked server calls, without touching production data. It requires
  Playwright and Chromium (or the available Codex runtime browser dependencies).

## Feedback 1: dashboard information density

> "Dashboard 信息密度略高 … 推荐把内容视觉上分成三个区块：Overview → Humor insights →
> Community insights. 这样不会减少功能，但浏览逻辑更清晰。"

The dashboard had 11 statistics modules arranged by layout rather than by meaning, so
readers could not tell what question each part answered and had to scroll through
everything.

### Changes (no statistics removed)

- **Three sections, each answering one question.**
  - **01 Overview:** How busy is the platform, and when? Includes headline numbers,
    daily activity and the voting-time heatmap.
  - **02 Humor insights:** What kind of caption makes Columbia laugh? Includes laugh
    rate by style, length and photo source, plus the hall of fame and most divisive
    captions.
  - **03 Community insights:** Who is creating, and how do they use the AI? Includes
    top creators, what happens to AI drafts and the most captioned photo.
- **Sticky section navigation** at the top. It highlights the section currently in
  view (scroll-spy) and jumps to a section on click. This keeps the one-page overview
  while making it fast to navigate.
- **Key takeaways first.** Each section opens with three answer cards before the
  charts, for example "Funniest style: Relatable, 96%" and "Best caption length".
  A winner is only declared once a group has at least 3 votes.
- **Plainer wording.** For example, "Draft → stage funnel" became "What happens to AI
  drafts", with a one-line explanation of the draft/publish flow. Model and legacy
  details moved into a collapsible "Details". The Wilson-score jargon was replaced by
  "rewards both a high laugh rate and enough votes".
- **Consistent charts.** The three laugh-rate breakdowns sit side by side with one
  shared legend and reading tip.
- **Mobile.** Takeaway cards become a horizontally swipeable row, and the section nav
  shows short labels only.

## Feedback 2: recover deleted captions

> Add a recover feature: users and admins should be able to restore captions a
> user deleted, with a Trash section in My humor and a restore action in the
> admin panel's Withdrawn tab.

- **Withdrawn tab:** each card has **↺ Restore** next to View/Delete. The help
  text explains the difference: Restore brings the caption back, Delete removes
  it for good.
- **Caption detail:** an "In the author's Trash" panel with a Restore button.
  The status badge now reads "In author's Trash".
- After a restore, a one-time confirmation is shown. The caption returns to
  Explore with its original votes, and to the author's My captions.
- The main site has the matching **My humor → Trash** view. Its database side is
  `supabase/010_trash_and_restore.sql`, tested by `scripts/trash-db-test.sql`
  (28 checks).

### Follow-up: reversible admin deletes (migration 011)

- Live captions now have **Remove** instead of Delete. Remove hides the caption
  from everyone and keeps its votes.
- A new **Removed** tab lists admin-removed captions with **↺ Restore** and
  **Delete** (permanent). The author-deleted tab is renamed **Author's Trash**.
- Permanent deletion is only possible once a caption is hidden, which makes it a
  deliberate second step.
- Authors see admin removals in their Trash as "Removed by a moderator" and
  cannot restore them. The database enforces this.
- `supabase/011_admin_soft_remove.sql` is tested by `scripts/removal-db-test.sql`
  (42 checks). The Trash (28) and admin (41) suites still pass with 011 applied.

## Follow-up: one prompt-chain workspace and visible execution

- One Prompt chains sidebar item replaces three separate workflow pages.
- The overview table shows actual workflow names, models, step counts and selection state.
- Opening a workflow shows ordered Step 1, Step 2 cards with full instructions and model names.
- Overview, Steps, Selection settings and Test run tabs preserve the selected workflow.
- Test run previews the production prompt or calls the configured Google model, displaying progress, response, latency and usage. It publishes nothing and saves no user history.
- The current production engine supports one Google step. Multi-step configurations remain readable but are explicitly rejected for execution.
- Named searchable relationship dropdowns submit complete IDs and preserve saved values when option loading fails.
