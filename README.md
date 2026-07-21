# ticket.run

An exploratory frontend for matching engineers to open tickets worth shipping.

This pivot lives on `pivot/engineer-ticket-match`; the shipped Cofounder Match product remains untouched on `main`.

![ticket.run engineer-ticket matching prototype](output/playwright/ticket-run-desktop.png)

## Product thesis

Issue directories optimize discovery. `ticket.run` optimizes for a credible merge.

The product ranks reviewed tickets against an engineer's public proof, available time, repo health, maintainer responsiveness, and expected patch surface. One match can then become a focused execution run with a verified bounty and clear preflight notes.

## Prototype interactions

- Search and filter the opportunity index by repository, label, or stack
- Switch between matches and inspect fit evidence
- Review expected scope, likely files, merge risk, and repo health
- Claim a ticket and initialize a focused execution run
- Responsive desktop and mobile layouts

## Quick start

```bash
npm install
npm run dev
```

## Verification

```bash
npm test
npm run typecheck
npm run build
```

The existing protocol implementation remains in the branch and its 37 regression tests continue to pass. The ticket data and claim flow are curated frontend fixtures for product exploration; no GitHub account is modified.

## Current wedge

Start with active open-source repositories that have reviewed, well-scoped tickets. Match one engineer to one ticket using:

- verified language and codebase proof;
- issue clarity and acceptance criteria;
- expected effort against current availability;
- contributor merge rate and maintainer response time;
- bounty or career-proof value.

The first validation target is not signups. It is engineers who attempt a recommended ticket and maintainers who request more qualified matches.
