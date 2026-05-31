# PLAN Quality Rubric

Evaluate whether the agent's PLAN.md provides an actionable build roadmap.

## Dimensions (1-5 each)

### 1. Actionability
Could a developer follow this plan step-by-step without guessing?
- 5: Each step is explicit with exact file paths and commands
- 3: Most steps are actionable, some need clarification
- 1: Vague or abstract steps that require interpretation

### 2. Traceability
Does each step reference which acceptance criterion it satisfies?
- 5: Every step maps to a specific AC
- 3: Most steps are traceable to requirements
- 1: No connection between steps and ACs

### 3. Ordering
Are steps in the correct build order? No circular dependencies?
- 5: Perfect ordering, each step builds on the previous
- 3: Generally correct with minor ordering issues
- 1: Steps are out of order or have circular dependencies

### 4. File Specificity
Does the plan name exact files to create/modify?
- 5: Every file is named with its purpose and expected content
- 3: Most files are specified
- 1: No specific file references

### 5. Validation Plan
Does the plan describe HOW each AC will be verified?
- 5: Every AC has a concrete validation approach
- 3: Most ACs have validation plans
- 1: No validation methodology described
