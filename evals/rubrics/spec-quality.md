# SPEC Quality Rubric

Evaluate whether the agent's SPEC.md accurately restates the task as a buildable specification.

## Dimensions (1-5 each)

### 1. Completeness
Does the spec cover ALL aspects of the original task? No missing requirements?
- 5: Every task requirement is addressed with explicit acceptance criteria
- 3: Most requirements covered, minor gaps
- 1: Major requirements missing or misunderstood

### 2. Correctness
Does the spec accurately reflect what was asked? No hallucinated requirements?
- 5: Perfectly reflects the task, no additions or distortions
- 3: Mostly correct with minor misinterpretations
- 1: Fundamentally misunderstands the task

### 3. Testability
Are the acceptance criteria concrete and checkable? Could a developer verify each one mechanically?
- 5: Every AC has a clear pass/fail test with expected values
- 3: Most ACs are testable, some are vague
- 1: ACs are abstract or unmeasurable

### 4. Clarity
Is the spec well-organized and unambiguous?
- 5: Crystal clear structure, no ambiguity
- 3: Generally clear with minor confusion points
- 1: Confusing, contradictory, or poorly organized

### 5. Scope Discipline
Does the spec stay within boundaries? No scope creep or unnecessary additions?
- 5: Tight scope, exactly what was asked
- 3: Minor scope additions that don't hurt
- 1: Significant scope creep or irrelevant sections
