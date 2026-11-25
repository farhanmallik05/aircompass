# ADR 0003 — Single-Zone Mass-Balance Home Model with 3-Set Sensitivity

- **Status:** Accepted (25 Nov 2026)
- **Context:** Multi-zone CFD or multi-room airflow models require architectural inputs most urban households cannot supply (ductwork, inter-room leakage, floor plans), while flat "% reduction" labels mislead families about real indoor concentrations.
- **Decision:** Model the main living/sleeping zone using the exact analytical solution over hourly steps for `dC/dt = P·a·Cout + S - (a + k + q)·C`, paired with three coherent parameter sets (*Conservative*, *Base*, *Optimistic*) in `src/lib/engine/sensitivity.ts` so every quantified impact displays a `[min, max]` uncertainty range and caps displayed purifier reduction at 80%.
- **Consequences:** Fast (< 1 ms per household evaluation), analytically exact over each hour, explicit about structural assumptions and cooking source uncertainty (`±50%`), and documented transparently in `docs/METHODOLOGY.md`.
