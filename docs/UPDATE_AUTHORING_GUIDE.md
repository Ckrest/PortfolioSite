# Update Authoring Guide

This guide is the editorial standard for reviewing and improving public
portfolio updates. It explains what an update should communicate and how to
decide whether it is ready to publish. The schema and block registry remain
authoritative for file structure and validation; this guide governs the
writing and evidence inside that structure.

The core rule is:

> An update documents one thing that happened. A capability interprets what a
> body of work demonstrates.

An update should be useful without requiring the reader to know the repository,
package names, or earlier work. It may be brief, but it must be understandable,
specific, and supported.

## Definition of presentable

A presentable update lets an outside reader determine:

1. **What changed?** Name the behavior, result, release, decision, or milestone.
2. **Why does it matter?** Explain the practical problem or value.
3. **What supports the claim?** Show an interface, behavior, artifact,
   measurement, test, diagram, or concrete example.
4. **What did I contribute?** Make ownership and important decisions clear.
5. **Where does it fit?** Add a larger-project, version, or related-work
   connection only when it genuinely helps the reader.

If the reader cannot answer the first two questions from the title and summary,
the update is not ready for its editorial pass to end. If the page makes a
substantial claim without visible support, the narrative is incomplete.

## Authoring workflow

### 1. Establish the scope

Choose one coherent event: a release, improvement, experiment, migration,
repair, or meaningful milestone. Do not combine unrelated work merely because
it occurred in the same report or week.

Before writing, state the update to yourself in one sentence:

> I changed **X**, which previously caused **Y**, so that **Z is now possible**.

This sentence is a diagnostic tool, not a required public template. If it needs
several unrelated clauses, split the work or identify the larger result that
actually connects it.

### 2. Write the title

The title appears on cards, the timeline, relationship lists, and the detail
page. It must stand alone in all of those contexts.

- Name a concrete change or result, usually with a strong verb.
- Use sentence case.
- Omit dates and the word "update" when the interface already provides them.
- Prefer plain language over package names or implementation terminology.
- Do not add manual line breaks or tune the wording for one viewport.
- Aim for 4–10 words and preferably no more than 65 characters. This is a
  review prompt, not a hard limit.

Weak titles describe a category: `Portfolio site update` or `Database work`.
Stronger titles identify the work: `Separated private drafts from public
publishing` or `Preserved review state across a schema migration`.

### 3. Write the summary

The summary is the page lead and the explanation shown in cards. It should add
the information the title cannot carry.

- State what changed and why it matters in one compact paragraph.
- Include enough context for a reader unfamiliar with the underlying system.
- Describe user-visible behavior or practical value before implementation.
- Do not repeat the title in longer form.
- Avoid throat-clearing such as "This project is about" or "In this update."
- Aim for one sentence of roughly 20–35 words when that remains natural.

The summary is not a miniature technical specification. Move background,
tradeoffs, and mechanism into the narrative.

### 4. Choose prominence and discovery

Prominence changes presentation, not the required quality of the writing.

| Prominence | Editorial role | Typical depth |
| --- | --- | --- |
| Low | A small, recent piece of work or a supporting change | Summary, a short explanation, useful evidence, and an optional larger-work connection |
| Medium | A meaningful project, release, or improvement | Context, contribution, decisions, result, and evidence |
| High | Work selected to carry the portfolio's main story | A complete, approachable case study with strong evidence and optional technical depth |

Suggested narrative ranges are approximately 100–300 words for low, 300–700
for medium, and 700–1,500 for high. Do not pad a simple story or shorten a
complex one to satisfy a number.

Use `discovery: unlisted` when a valid public page should remain directly
shareable but should not appear in the homepage, related-work catalog, or
sitemap. Unlisted is not privacy protection. Private, unsafe, misleading, or
unfinished material belongs in private authoring state and should not be
published.

### 5. Build the narrative

Every narrative needs the three essentials: change, significance, and
evidence. Medium and high updates will often benefit from the following
sequence:

1. **Context:** What existed before, and who encountered the problem?
2. **Contribution:** What did I own, decide, design, implement, or verify?
3. **Change:** What meaningful pieces of work produced the result?
4. **Decisions:** Which constraints, alternatives, or tradeoffs mattered?
5. **Result:** What now works, changed, or became safer?
6. **Evidence:** What can the reader inspect that supports those statements?
7. **Technical detail:** What deeper explanation is useful after the result is
   understood?

These are questions to answer, not mandatory headings. Use only the sections
that improve the story. Empty template sections make small updates look padded
and large updates feel mechanical.

The renderer supplies the page H1. Narrative headings begin at H2, use
descriptive wording, and follow the real document hierarchy. Do not choose a
heading level for its visual size.

### 6. Explain technical and invisible work

Start with behavior, then reveal mechanism.

Instead of beginning with:

> Added a digest-based publication service with allowlisted serialization.

Begin with the consequence:

> A review now becomes invalid when the draft or its assets change, preventing
> approved content from being silently replaced before publication.

The next paragraph can explain digests, validation, and serialization. This
progressive order keeps the page useful to a general reader without removing
the technical material that demonstrates depth.

Expand acronyms on first use. Prefer a small system-context or workflow diagram
to a component inventory. Include code, terminal output, and schemas only when
the reader can tell what they prove.

### 7. Select and explain evidence

Evidence should substantiate the page's important claims rather than decorate
it. Useful forms include:

- a before-and-after comparison;
- an annotated interface or short workflow recording;
- a three-to-five-step pipeline or system-context diagram;
- a real input and its resulting output;
- an example failure that is now prevented;
- a test, measurement, or observed behavior; and
- a focused code or terminal excerpt when implementation is the point.

Every visual needs a reason to exist. Use its caption to tell the reader what
to notice and why it matters. Alt text communicates the image's meaningful
information to someone who cannot see it; it should not merely repeat the
caption or filename.

Raw capture date, represented version, and evidence notes are authoring metadata.
Portfolio Editor keeps them in its private draft and does not publish them. When
a limitation materially changes what a viewer should conclude, write a short,
viewer-facing `evidenceQualifier`; do not publish intake boilerplate or an
artifact-audit trail. A qualifier complements a useful caption instead of
repeating it.

Do not expose private data, absolute local paths, tokens, internal notes,
irrelevant debug output, or evidence that has not been reviewed. More artifacts
do not automatically create a stronger case.

### 8. State ownership without overselling

Use a specific, calm first-person voice. Name your decisions and contribution,
especially when agents, libraries, upstream projects, or collaborators were
also involved.

Prefer:

> I designed the publication boundary, implemented the migration, and verified
> the generated public output.

Avoid passive wording that hides ownership and unsupported promotion such as
"revolutionary," "enterprise-grade," or "expert." Difficulty, judgment, and
results are persuasive when described concretely; adjectives are not a
substitute for evidence.

### 9. Add relationships and tags

Relationships provide navigation; they do not replace an explanation in the
narrative.

- `part_of` points from a smaller update to the larger body of work it belongs
  to. The site derives the larger project's list of project updates.
- `supersedes` points from a newer version to an older version. The public site
  presents this as earlier and later versions, not as a "superseded" status.
- `related_to` connects work that is useful context but is neither structural
  nor a version sequence.
- A target may be an active Workspace candidate that is not accepted yet. Its
  authored slug stays in source, while the public link and inverse relationship
  remain absent until both updates are in the accepted pool.
- Capability backlinks are never authored on an update. A capability owns its
  evidence list, and the build derives "Capabilities demonstrated."

Use a small set of consistent, public-facing tags that help someone browse the
work. Prefer recognizable topics over internal package labels. Do not attach a
technology merely because it appears incidentally in the implementation.

### 10. Keep named work and version history navigable

When the narrative relies on another portfolio update, give the reader a path
to it. Use relationship metadata for the graph and a `reference-card` block at
the point where seeing the other update materially helps the explanation. The
card complements the semantic relationship; it does not replace it. Do not add
a card for a tool that is merely mentioned in passing.

A dated update must not silently absorb several later versions. When a page
describes a meaningful earlier or later milestone:

- create or link the separate update when that milestone is independently
  useful and supported;
- use `supersedes` only from the newer version to the earlier version;
- explain a before-state directly when it was only context and never warranted
  its own portfolio update; and
- keep later screenshots, READMEs, and reconstructed examples from being
  mistaken for release-day evidence by adding a concise public qualifier when
  that distinction materially affects the claim.

Do not embed a live README in a historical milestone unless the README is an
immutable copy from the represented version. A maintained README can change
the meaning of an old page without changing the update itself.

### 11. Separate the story from editorial state

Public prose explains the work. It must not explain how the portfolio entry was
edited, which artifacts were rejected, what was moved to a backup, why a page
was retained, or what still needs review. Put those facts in private notes or
explicit approval assertions.

Evidence limitations that a reader needs in order to interpret a displayed
artifact belong in an editable `evidenceQualifier`. Raw provenance belongs in
private Editor/Work Report metadata. Human-only confirmation needs belong in an
`artifact`, `infrastructure`, or `owner-review` approval assertion. None belong as a
closing paragraph about “this page” or “this update.”

## Source format and generated boundary

Portfolio updates are authored in Portfolio Editor's revisioned Workspace. The
exact local approval build materializes the public snapshot as
`updates/<slug>/settings.yaml` plus only the assets that file references. Do not
edit a Workspace-managed update in this repository as a round-trip authoring
workflow. Independent Site changes are a separate input: the next approval
bundle snapshots them exactly together with the selected Workspace candidate
for a future Systems-owned publication handoff.

The materialized public source has this shape:

```yaml
kind: update
slug: example-update
title: Added a concrete result
summary: Explain what changed and why it matters to someone outside the project.
date: 'YYYY-MM-DD'
prominence: medium
discovery: listed
tags:
  - Public topic
content:
  blocks:
    - id: blk_example
      type: text
      body: Explain the work and its evidence.
```

`kind`, `slug`, `title`, `summary`, an ISO date, and an icon are required.
Relationships, public links, tags, previews, and narrative blocks are optional
when they add value. Media paths are relative to the update directory. A supplied
preview should include `previewAlt`; when it does not, review reports an advisory
and the renderer uses the update title. Every image or gallery item still needs
meaningful alternative text because those blocks have no safe contextual fallback.

`updates/_update-schema.yaml` is authoritative for metadata fields, enum values,
form help, and advisory warnings. `updates/_block-registry.json` is
authoritative for block types, fields, nesting, completeness, and fill methods.
Give authored blocks stable unique IDs.

Code, Mermaid, terminal, and graph blocks may set `sourceMode` to `inline` or
`attached`. Inline mode renders the block's authored content; attached mode
renders `src`. Omitted mode means `inline`; attached content must declare
`sourceMode: attached` explicitly. Do not rely on two competing sources.

The build rejects unknown fields, malformed blocks, duplicate IDs, unsafe or
missing assets, privacy-pattern matches, invalid relationship structure, and
graph cycles. Portfolio Editor separately requires every authored optional
target to exist as an active Workspace candidate before review. It derives
manifests, payloads, detail pages, preview dimensions,
backlinks, version pointers, sitemap entries, generated registry modules, and
`dist/`. Those outputs must never be hand-authored.

## Editorial review checklist

Review the card, detail page, and connections together.

### Identity and history

- [ ] The update documents one coherent dated milestone rather than silently
      combining several releases or the maintained current state.
- [ ] Any meaningful earlier or later portfolio version has its own record and
      the newer record points to the earlier one with `supersedes`.
- [ ] A prior state that does not warrant its own update is explained as
      context without implying that a missing portfolio page exists.
- [ ] Dates, counts, measurements, version claims, and completion claims agree
      with retained reports, repositories, and artifacts; historical values
      are labeled as historical rather than evergreen.

### Meaning

- [ ] The title names a concrete change and works without surrounding context.
- [ ] The summary explains what changed and why it matters.
- [ ] The narrative begins with behavior or value before deep implementation.
- [ ] My contribution and important decisions are unambiguous.
- [ ] Claims are specific enough to be supported or challenged.

### Evidence

- [ ] At least one useful example, result, or artifact supports substantial
      claims.
- [ ] Every visual has meaningful alt text and, when needed, an interpretive
      caption.
- [ ] Evidence whose date, represented version, or limitations materially affect
      the claim includes a concise public qualifier; raw provenance stays private.
- [ ] Technical excerpts are focused and explained.
- [ ] Public assets and prose contain no private or irrelevant material.
- [ ] A maintained README is not used as the content of an older milestone.
- [ ] Missing evidence or owner decisions are recorded as private approval
      assertions rather than described in public prose.

### Structure

- [ ] The prominence matches the update's role in the portfolio.
- [ ] The narrative has no empty, repetitive, or layout-driven sections.
- [ ] Relationships use the correct semantic type and point forward.
- [ ] Tags are consistent and useful for public browsing.
- [ ] Links and related records resolve.
- [ ] Every named portfolio item that is important to the explanation has the
      correct graph relationship and a nearby `reference-card`; incidental
      mentions do not create noisy connections.
- [ ] Public prose contains no review notes, backup commentary, artifact
      selection notes, report IDs, or explanations of edits made to the page.
- [ ] Tags describe useful public topics rather than internal package names,
      workflow states, or one-time implementation labels.

### Presentation

- [ ] The title and summary read well on both a card and the detail page.
- [ ] The page remains understandable when scanned by headings and captions.
- [ ] Long titles and paragraphs wrap naturally on narrow and wide layouts.
- [ ] The strongest information appears before optional technical depth.

### Exact local approval

- [ ] The approval view contains the exact current Workspace candidate and the
      current Portfolio Site worktree snapshot.
- [ ] Every artifact, infrastructure, or owner-review assertion is explicit;
      acceptance covers the exact final prose, relationships, asset bytes, Site
      source, and built output.

## Working targets, not gates

| Element | Suggested target |
| --- | --- |
| Title | 4–10 words; preferably at most 65 characters |
| Card summary | One sentence; roughly 20–35 words |
| Opening narrative overview | Roughly 40–80 words |
| Section heading | 2–7 descriptive words |
| Low-prominence narrative | Roughly 100–300 words |
| Medium-prominence narrative | Roughly 300–700 words |
| High-prominence narrative | Roughly 700–1,500 words |

These values are advisory. Clarity, evidence, and the actual rendered layout
decide whether an exception works. Publication validation must never rewrite
content or reject it solely for missing a subjective writing target.

## Related contracts and research basis

- The repository `README.md` defines public terminology, generated boundaries,
  semantic presentation, and responsive requirements.
- `CAPABILITY_AUTHORING_GUIDE.md` explains how capability claims synthesize
  evidence from updates.
- `updates/_update-schema.yaml` and `updates/_block-registry.json` are
  authoritative for the update format.

The guidance is informed by [Nielsen Norman Group portfolio and hiring
research](https://media.nngroup.com/media/reports/free/UserExperienceCareers_2nd_Edition.pdf),
[CIPD work-sample guidance](https://www.cipd.org/uk/knowledge/factsheets/selection-factsheet/),
the [OECD skills-first hiring
review](https://www.oecd.org/en/publications/a-skills-first-labour-market_2e1b85f0-en/full-report/promoting-skills-first-hiring-and-talent-management_81392a48.html),
[W3C accessible-writing guidance](https://www.w3.org/WAI/tips/writing/), the
[C4 model's audience-appropriate diagram levels](https://c4model.com/diagrams),
and [Google](https://developers.google.com/search/docs/appearance/title-link)
and [NHS](https://service-manual.nhs.uk/content/formatting) guidance favoring
concise, descriptive titles. The numeric targets above are local editorial
conventions derived from those principles, not universal limits.
