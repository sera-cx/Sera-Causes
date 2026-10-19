# Governance

## Roles

**Maintainers** are members of the `sera-cx` GitHub organization listed in
`.github/CODEOWNERS`. They review and merge all pull requests, triage issues,
cut releases, and are the only people who may change the settlement layer.

**Contributors** are anyone who opens an issue or pull request.

## Decision making

- Routine changes (frontend, docs, tests, tooling): one maintainer approval.
- Settlement-layer changes (`packages/sera-settlement/`): proposed in an issue,
  implemented by a maintainer on an in-repo branch, approved by another
  maintainer.
- License or governance changes: Sera leadership decision, announced in an
  issue before merge.

## Enforcement in GitHub

The `main` branch is protected:

- Pull requests are required. No direct pushes.
- At least one approving review from a code owner is required.
- Approvals are dismissed when new commits are pushed.
- The most recent push must be approved.
- Force pushes and branch deletion are blocked.

The `settlement-guard` workflow fails any fork PR that touches protected paths.
