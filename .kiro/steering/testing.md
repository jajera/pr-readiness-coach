---
inclusion: fileMatch
fileMatchPattern: "tests/**"
---

# Testing Guidelines

## Framework

- Vitest for unit/integration tests
- fast-check for property-based tests

## Conventions

- Test files: `tests/unit/*.test.ts`, `tests/integration/*.test.ts`
- Property tests tagged: `Feature: pr-readiness-coach, Property N: title`
- Minimum 100 iterations for property tests (reduce for expensive generators)
- Mock Bedrock calls in unit tests, never call real endpoints
- Use fixtures in `fixtures/demo-app/` for integration tests

## Commands

- `npm test` — unit + property tests
- `npm run test:integration` — integration tests only
- `npm run build` — must pass before tests are valid
