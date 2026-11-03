# Security Policy

This project is in **early testing** and should not be treated as a hardened memory service.

## Reporting

Please do not open a public issue containing:

- real chat logs, QQ numbers, group numbers or nicknames
- `memory/`, journal, queue or backup files
- tokens, cookies, private keys, certificates or local paths
- screenshots with personal data

Report a minimal reproduction with secrets removed. If GitHub private reporting is available, use it; otherwise open an issue with only the abstract failure.

## Scope

The plugin runs locally inside DSH. It does not provide:

- a hosted service
- arbitrary shell, file or browser access
- a stable security boundary for untrusted plugins

The main risks are prompt injection through long materials/web content, accidental writes to the active workspace, and installation of a testing build. Back up the workspace before testing.
