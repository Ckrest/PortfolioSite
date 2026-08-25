# Capability Authoring Guide

This guide is the editorial standard for public capabilities. A capability is
a durable, evidence-backed explanation of what a body of work demonstrates. It
is not a renamed project, a list of technologies, or an unsupported skills
claim.

The core distinction is:

> An update documents one thing that happened. A capability interprets what a
> body of work demonstrates.

Capabilities carry the portfolio's broader professional argument. Updates
remain concrete accounts of work; capability pages connect several accounts
into a useful, defensible claim.

## Definition of presentable

A presentable capability lets an outside reader determine:

1. **What can I do?** State a specific, reusable ability.
2. **Why is it valuable?** Connect the ability to a user, team, or
   organizational result.
3. **What work demonstrates it?** Select convincing updates.
4. **Why does that work count as evidence?** Explain the relevant contribution,
   decision, or result instead of making the reader infer the connection.
5. **How broad is the claim?** Show range across situations or state the
   evidence boundary honestly.

The format permits a shell with evidence and no narrative so authoring can be
staged. A shell is not the editorial target for a finished capability.

## What qualifies as a capability

A strong capability is:

- **Durable:** It remains meaningful beyond one release or current tool.
- **Useful:** A reader can understand the practical value it creates.
- **Specific:** It is narrower than a profession or generic trait.
- **Transferable:** The underlying judgment can apply in more than one context.
- **Demonstrated:** Concrete updates support the claim.
- **Owned:** The page makes your contribution and recurring decisions clear.

Strong capability titles combine an action with a useful object or constraint:

- Build privacy-safe publishing workflows
- Automate complex processes while preserving human review
- Design migrations that preserve user work
- Diagnose failures across application boundaries
- Turn manual desktop tasks into reliable tools

Avoid titles that are only:

- a technology: `Python` or `PostgreSQL`;
- an activity: `Software development`;
- a personality claim: `Problem solving`;
- a self-rating: `Expert systems engineer`; or
- one project result that belongs in an update.

## Authoring workflow

### 1. Start with evidence

Review the updates before naming the capability. Look for a repeated pattern in
what you did, the constraints you handled, the decisions you made, and the
value produced.

Ask:

- Which parts of the work required judgment rather than routine execution?
- Does the pattern appear in more than one situation?
- Would the ability still matter if the technologies changed?
- What practical problem can someone trust me to handle because of this work?

If the claim depends entirely on one update, it may be the result section of
that update rather than a durable capability. One unusually deep update can be
valid initial evidence, but the page should not imply a range it has not shown.

### 2. Write the title

The title should name the ability as a concise verb phrase.

- Begin with a useful action such as build, design, automate, diagnose,
  modernize, explain, or integrate.
- Name the object, value, or meaningful constraint.
- Prefer language a non-specialist can interpret.
- Avoid technologies unless the capability is genuinely technology-specific.
- Use sentence case and no manual line breaks.
- Aim for 3–8 words. Treat this as a prompt for clarity, not a hard limit.

The title should complete the thought "I can..." without literally adding
those words to the page.

### 3. Write the summary as the capability claim

The summary explains the capability's practical scope and value. It should
complement the title rather than repeat it or repeat interface language such as
"this work demonstrates."

A useful pattern is:

> I **perform an ability** across **relevant situations or constraints** so that
> **a practical result** becomes possible.

Keep the public voice calm and specific. One or two sentences are usually
enough. Avoid claims such as "expert," "world-class," or "enterprise-grade"
unless the page defines and substantiates them—which will rarely be useful.

### 4. Select representative evidence

The capability owns the `evidence` list. Add update slugs to the capability;
never add reverse capability fields to update settings. The build generates
update backlinks and the public "Capabilities demonstrated" section.

Usually select two to five strong updates. More may be appropriate when each
one proves a distinct part of the capability, but the goal is a persuasive
selection rather than a complete inventory.

Prefer evidence that collectively shows:

- **Depth:** A substantial problem, decision, or implementation.
- **Range:** The capability applied in different systems or circumstances.
- **Results:** Observable improvements, protections, or new behavior.
- **Ownership:** Your contribution can be identified.
- **Recency:** At least some evidence reflects current practice when relevant.

Do not add an update merely because it shares a tag or technology. Weak
evidence makes the capability less credible even when the list becomes longer.

### 5. Explain what the evidence proves

Selected-work cards give readers paths into the updates, but links alone do not
make the argument. Use narrative blocks to explain the pattern across the work
and, when useful, give each major example a one-sentence interpretation:

> **Reviewed portfolio publishing:** Demonstrates separating private authoring
> state from allowlisted public output.

> **Package-aware report migration:** Demonstrates evolving a durable data model
> while preserving existing records.

Do not duplicate each update's full story. State only the contribution,
decision, or result that makes it relevant to this capability, then let the
selected-work card lead to the canonical update page.

### 6. Build the narrative

A complete capability page will often answer the following questions:

1. **Capability claim:** What can I reliably do?
2. **Practical value:** Why does this matter to a user, team, or organization?
3. **Approach and judgment:** What principles or decisions recur across the
   work?
4. **Evidence interpretation:** What does each selected example establish?
5. **Range:** How do the examples show the ability transferring across
   contexts?
6. **Boundaries:** What has the evidence not established yet, when that
   distinction prevents overclaiming?

These are questions, not mandatory headings. Use the shortest narrative that
makes the claim and its support clear. The renderer supplies the page H1, so
authored narrative headings begin at H2 and follow the real hierarchy.

Capability blocks use a capability-owned copy of the update narrative
framework. Use text for the argument and add diagrams, comparisons, examples,
or other media only when they help establish the capability. Capability visuals
should synthesize a pattern; project-specific evidence usually belongs on the
corresponding update page.

### 7. Show range without inflating the claim

Range is stronger when the same underlying judgment appears under different
constraints. For example, a publishing pipeline, a desktop service, and a data
migration may jointly support cross-layer integration if the page explains the
shared diagnostic or design practice.

Several updates about one codebase can show depth, but they do not automatically
show transferability. Describe the narrower capability honestly or add other
evidence later. A capability can evolve as the body of work grows.

### 8. Review links, media, and tags

- Link to a repository or external page only when it supports the capability as
  a whole; project-specific links belong on updates.
- Use capability-relative media and meaningful alt text. Captions should tell
  the reader what to notice and how it supports the claim.
- Use an editable `evidenceQualifier` when time, version, or a limitation
  materially affects what a viewer should conclude. Raw provenance stays in
  private authoring records and does not belong in public capability settings.
- Use a small set of consistent public topics. Tags aid discovery; they are not
  a substitute for a clear capability title.
- Keep internal graph terms, draft notes, private source identities, absolute
  paths, and publication bookkeeping out of public settings.

## Evidence relationship model

The relationship is directional in authored data and bidirectional in the
public experience:

- A capability lists the updates that support it.
- The build derives a backlink on each supporting update.
- One capability can use several updates.
- One update can support several capabilities.
- A small update does not need to support any capability.
- An older update never needs editing merely because a new capability is
  recognized.

This keeps updates historically stable while allowing capability claims to
grow, narrow, or gain better evidence over time.

## Editorial review checklist

### Claim

- [ ] The title describes a durable ability, not a project or technology list.
- [ ] The summary explains the capability's practical scope and value.
- [ ] The claim is narrow enough to defend with the selected evidence.
- [ ] The page avoids self-ratings and unsupported promotional language.

### Evidence

- [ ] Each selected update materially supports the capability.
- [ ] The narrative explains why the important examples count as evidence.
- [ ] The selection shows depth, range, results, or ownership rather than mere
      topical similarity.
- [ ] Project details remain on update pages instead of being duplicated here.
- [ ] Any limitation needed to prevent overclaiming is stated clearly.

### Structure and presentation

- [ ] The strongest explanation appears before optional technical material.
- [ ] Headings describe the content and follow semantic order.
- [ ] Visuals synthesize or substantiate the capability and include useful alt
      text and captions.
- [ ] Selected-work links resolve and the corresponding update backlinks build.
- [ ] The title and summary work on both the homepage card and detail page.
- [ ] Long content wraps and scans well on narrow and wide layouts.

## Source workflow and generated boundary

Capability records are authored in `capabilities/<slug>/settings.yaml`. A
capability requires `kind: capability`, `slug`, `title`, `summary`, and one or
more update slugs in `evidence`. It may use capability-relative public links,
media, tags, and `content.blocks` declared in
`capabilities/_capability-schema.yaml`.

A minimal source looks like:

```yaml
kind: capability
slug: build-a-useful-capability
title: Build a useful capability
summary: Explain the ability's practical scope and value.
evidence:
  - supporting-update-slug
tags:
  - Public topic
content:
  blocks:
    - id: blk_example
      type: text
      body: Explain the recurring judgment and what the evidence proves.
```

Media paths are relative to the capability directory. A supplied preview should
include `previewAlt`; when it does not, review reports an advisory and the
renderer uses the capability title. Every image or gallery item still needs
meaningful alternative text because those blocks have no safe contextual
fallback. Give authored blocks stable unique IDs. The independent
`capabilities/_asset-contract.json` graph resolves all deployable capability
dependencies, and generated `portfolio-capability@4` payloads carry the exact
asset manifest consumed by `dist/`.

`capabilities/_block-registry.json` is authoritative for capability blocks. It
is independent from the update registry; changes to either contract must be
made explicitly and never propagate to the other.

Generated `capability.json`, `detail.html`, manifest entries, dimensions,
resolved evidence cards, backlinks, generated registry modules, sitemap state,
and `dist/` files are build output. Do not author them. The build rejects
unknown fields, malformed blocks, duplicate IDs, unsafe or missing assets,
privacy-pattern matches, and broken evidence targets.

## Related contracts and research basis

- `UPDATE_AUTHORING_GUIDE.md` defines the concrete work records capabilities
  use as evidence.
- The repository `README.md` defines public terminology, generated boundaries,
  semantic presentation, and responsive requirements.
- `capabilities/_capability-schema.yaml` and
  `capabilities/_block-registry.json` are authoritative for the capability
  format.

The guidance is informed by [Nielsen Norman Group portfolio and hiring
research](https://media.nngroup.com/media/reports/free/UserExperienceCareers_2nd_Edition.pdf),
[CIPD work-sample guidance](https://www.cipd.org/uk/knowledge/factsheets/selection-factsheet/),
the [OECD skills-first hiring
review](https://www.oecd.org/en/publications/a-skills-first-labour-market_2e1b85f0-en/full-report/promoting-skills-first-hiring-and-talent-management_81392a48.html),
and [W3C accessible-writing guidance](https://www.w3.org/WAI/tips/writing/).
Together they favor demonstrated reasoning, contribution, results, and concrete
work samples over unsupported labels. The local recommendation of two to five
evidence updates is an editorial target, not a publication rule.
