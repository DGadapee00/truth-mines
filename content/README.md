# Plain-language notes

One Markdown file per landmark, named by its set.mm label: `content/sqrt2irr.md`.

```markdown
---
label: sqrt2irr
reviewed: false
reviewer:
---
Two or three short paragraphs: what the statement says in plain words, and why it sits where it
does in the mine (what it rests on).
```

Claude may draft notes, always with `reviewed: false`. A person who has checked the mathematics
sets `reviewed: true` and their name in `reviewer`. The pipeline exports only reviewed notes, so
the app never shows an unreviewed one (CLAUDE.md rule 7).
