## Why

<!-- What problem does this solve? Link the issue if there is one. -->

Closes #

## What

<!-- One or two sentences on the change. -->

## How to test

```bash
pnpm lint
pnpm test
pnpm build   # when you touch routing or API routes
```

<!-- Manual steps for /start, inbox or auth flows if relevant. -->

## Checklist

- [ ] Focused PR, small logical commits
- [ ] `pnpm lint` and `pnpm test` pass locally
- [ ] No secrets, tokens or customer data (inbox content, `data/` dumps) committed
- [ ] Privacy-impacting changes (retention, third-party scripts, model calls) are disclosed
- [ ] Docs / README updated if user-facing
