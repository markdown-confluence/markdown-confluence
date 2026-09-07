---
connie-title: Obsidian Formatting
tags: [release-test, formatting]
---
# Obsidian Formatting

**Bold**, *italic*, ~~struck~~, ==highlighted==, and `inline code`.

> [!info] **Formatted** callout title
> The complete title and body must survive publishing.

| Feature | Expected |
| --- | --- |
| Unicode | 中文 café ✓ |
| Links | [Hierarchy](Hierarchy/README.md#Child) |

- [ ] An open task
- [x] A completed task

```toc
```

```dataview
THIS BLOCK MUST NOT BE PUBLISHED
```

## Local heading

[[#Local heading|Jump within this page]]

Inline comment anchor stays here.

## Equations

Inline energy $E=mc^2$ stays in this sentence.

$$
\begin{aligned}
a &= \frac{1}{2} \\
b &= \sqrt{x^2+y^2}
\end{aligned}
$$

| Equation | Meaning |
| --- | --- |
| $x_i^2$ | A squared component |
