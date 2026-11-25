# ADR 0004 — `localStorage`-Only Household Profiles

- **Status:** Accepted (25 Nov 2026)
- **Context:** Household setup collects location, sensitive health conditions (asthma, cardiac, pregnancy), children/seniors, home setup, and commute habits. Storing PII or health-adjacent profiles on a server introduces retention, compliance, and breach risks without improving the core workflow.
- **Decision:** Persist household profiles exclusively in browser `localStorage` with a one-click `"Delete my data"` action. API routes remain stateless, store zero profiles, hash client IPs with SHA-256 for per-instance rate limiting only, and avoid third-party analytics or cookies.
- **Consequences:** Zero server-side PII footprint, instant client-side what-if recalculation on `/impact`, and clean compliance with minimal-privilege privacy principles.
