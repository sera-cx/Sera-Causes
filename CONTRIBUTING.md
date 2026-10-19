# Contributing to Sera Causes

Thanks for helping build open crypto giving on Sera Protocol.

## Ground rules

- Every pull request requires approval from a Sera maintainer (see
  `.github/CODEOWNERS`). There are no exceptions, including for maintainers.
- PRs from forks must not modify `packages/sera-settlement/`. CI enforces this.
  Open an issue to propose settlement-layer changes instead.
- Keep PRs focused. One change per PR makes review faster.
- By contributing, you agree your contribution is licensed under the
  [Sera Causes License 1.0](LICENSE).

## Workflow

1. Fork the repository and create a branch from `main`.
2. Make your change. Add or update tests where the project has them.
3. Run the project's checks locally (see each package's README).
4. Open a PR against `main` using the PR template. Describe what changed and
   why, and link any related issue.
5. A maintainer reviews. Address feedback by pushing new commits to the same
   branch. Approvals are dismissed when new commits are pushed, so expect a
   re-review.

## What makes a good PR

- Frontend improvements, accessibility, localisation, docs, and tests are
  always welcome.
- New chain or asset support belongs in the settlement layer. File an issue.
- Do not commit secrets, API keys, private RPC URLs, or `.env` files.

## Commit messages

Use short imperative subjects ("Add donation receipt page"). Reference issues
with `Fixes #123` where relevant.

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
