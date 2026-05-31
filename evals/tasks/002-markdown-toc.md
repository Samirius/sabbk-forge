# Eval Task 002: Markdown TOC Generator

**objective:** Produce a bash script `markdown-toc.sh` that reads a Markdown file and outputs a table of contents as a bullet list with anchor links.

**acceptance_criteria:**
1. Deliverable is a single file at `./build/markdown-toc.sh`.
2. Given a Markdown file with `## Heading`, it outputs `- [Heading](#heading)` with lowercase, hyphenated anchors.
3. It handles H2 (`##`) and H3 (`###`) levels, with H3 indented under H2.
4. It ignores code blocks (lines inside triple backticks) — no false positives from code containing `#`.
5. It reads from stdin if no file argument is given, or from the file argument if provided.
6. `./VALIDATION.md` shows each criterion with pass/fail and the evidence.

**boundaries:** write only inside `spike/workdir/pi-coding-spike/`.
