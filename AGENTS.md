Look at `specs/tech` for technical constraints

Look at `specs/functional` for functional specification

Development flow is strictly: specification first, then unit tests, then code.

1. Update or add the relevant spec under `specs/functional` or `specs/tech`.
2. Write unit tests that encode the new behavior (they should fail against current code).
3. Implement the code to make the tests pass.

Never skip ahead. Don't write code before tests, and don't write tests before the spec exists.
