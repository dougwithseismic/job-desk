---
name: setup
description: Set up the job desk for a new candidate, or check that an existing setup still works. Installs packages, connects Gmail and Chrome and tests them, reads their CV, and records what they're looking for. Use for "set me up", "set up the job desk", "get this working", "check my setup", "is everything working", "update the job desk", "connect Gmail", "connect Chrome", or when data/desk.sqlite doesn't exist yet.
---

# Setup

- **First time** (no `data/desk.sqlite`): follow `SETUP.md` at the repo root with the candidate, step by step.
- **"Check my setup"**: run `node bin/doctor.mjs`. Then test Gmail (search one recent email) and Chrome (open and read one page). Report in three lines, and fix what's broken with the matching step of `SETUP.md`.
- **After `git pull`**: `node bin/doctor.mjs --fix` installs new packages and upgrades the desk.
