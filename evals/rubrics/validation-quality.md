# VALIDATION Quality Rubric

Evaluate whether the agent's VALIDATION.md provides convincing evidence of correctness.

## Dimensions (1-5 each)

### 1. Coverage
Does the validation address every acceptance criterion from the spec?
- 5: Every AC is explicitly tested with pass/fail verdict
- 3: Most ACs are tested, some are implicit
- 1: Major ACs missing from validation

### 2. Evidence Quality
Does each test show actual command output or results? Not just "it works"?
- 5: Real command output, exit codes, and file listings as proof
- 3: Some evidence is provided but not comprehensive
- 1: Claims without evidence (e.g., "this works" with no proof)

### 3. Independence
Are validation tests independent? Could they be re-run and get the same result?
- 5: Tests use fresh state, no dependencies on previous test artifacts
- 3: Mostly independent, some shared state
- 1: Tests depend on each other or on build artifacts

### 4. Failure Handling
Does the validation check both positive AND negative cases?
- 5: Tests both success and failure scenarios (e.g., valid AND invalid input)
- 3: Tests success cases, limited failure testing
- 1: Only happy path tested

### 5. Honesty
Does the validation honestly report failures? No forced passes?
- 5: All results are genuine, failures are reported honestly
- 3: Mostly honest, minor glossing over edge cases
- 1: Everything "passes" despite obvious issues
