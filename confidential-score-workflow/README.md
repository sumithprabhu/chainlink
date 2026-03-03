# Confidential Score Workflow (CRE Project)

Project root for the **Confidential HTTP Score Workflow** used by the on-chain commitment engine.

## Workflow

- **Folder:** `confidential-score`
- **Simulate:** From this directory run:
  ```bash
  cre workflow simulate confidential-score --target staging-settings
  ```
- See `confidential-score/README.md` for architecture, demo steps, and security notes.

## Project layout

- `project.yaml` — CRE project settings (targets, RPCs)
- `.env` — `CRE_ETH_PRIVATE_KEY`, `CRE_TARGET`, `API_KEY`, `AES_KEY` (for simulate)
- `confidential-score/` — Single workflow (HTTP trigger, Confidential HTTP, encrypted output)
