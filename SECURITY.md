# Security Policy

## Supported versions

Security fixes land on the default branch (`main`) of Orbis.

## Reporting a vulnerability

Please **do not** open a public issue for security reports.

Email Gabriel (Caezarr) via the contact on [github.com/Caezarr](https://github.com/Caezarr) with:

- a short description of the issue
- steps to reproduce
- impact / affected surfaces (tenant data, connector secrets, approvals, exports)

You should get an acknowledgement within a few days. Please give a reasonable window before any public disclosure.

## Scope notes

- Persistence today is local `data/state.json` (demo tenant) — treat exports and state dumps as sensitive.
- Never commit API keys, OIDC secrets, or connector credentials.
- Tool broker must keep write actions (e.g. `send_email`) blocked in test mode; activation is a server check.
