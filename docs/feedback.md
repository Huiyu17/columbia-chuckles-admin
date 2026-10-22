# Admin panel feedback log

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
