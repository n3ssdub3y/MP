# SustainDC — Major Technical Decisions Log

> Every significant decision made during scaffolding, debugging, and architecture is recorded here.
> Format: What was decided, Why it was needed, What file(s) changed.

---

## D-001 — Use Python 3.10 instead of system Python 3.13
**Date**: 2026-08-25
**Status**: RESOLVED

### What
Created a new conda environment (`sustaindc_env`) with Python 3.10.

### Why
The system had Python 3.13, which is too new for the project's ML stack:
- `tensorflow==2.12.0` has no Python 3.13 wheel
- `cchardet` requires a C compiler to build from source on 3.13 (fails without Visual C++ Build Tools)
- `torch==2.0.0` cu118 wheel only available for Python <=3.11

### What changed
- New conda env: `C:\Users\NESS\.anaconda-desktop\micromamba\envs\cuda\envs\sustaindc_env`

---

## D-002 — Switch PyTorch to CUDA 11.8 wheel (cu118)
**Date**: 2026-08-25
**Status**: RESOLVED

### What
Modified `requirements.txt` to add:
`
--extra-index-url https://download.pytorch.org/whl/cu118
torch==2.0.0+cu118
`

### Why
The original `requirements.txt` had no index URL, causing pip to download the CPU-only wheel.
The user has an NVIDIA RTX 3050 6GB GPU and must use it for all RL training (explicit requirement).
CUDA 11.8 is the newest CUDA version compatible with `torch==2.0.0`.

### What changed
- `requirements.txt`: added `--extra-index-url` line

---

## D-003 — Install cchardet via conda-forge instead of pip
**Date**: 2026-08-25
**Status**: RESOLVED

### What
Ran `conda install -c conda-forge cchardet` before running `pip install -r requirements.txt`.

### Why
`cchardet` must be compiled from C source. Without Microsoft Visual C++ Build Tools, pip fails.
conda-forge provides a prebuilt binary that bypasses the compiler requirement entirely.

### What changed
- No file changed. The fix is in the install order.

---

## D-004 — Fix evaluate_harl.py: Remove all hardcoded Linux paths
**Date**: 2026-08-25
**Status**: RESOLVED

### What
Rewrote `evaluate_harl.py` from scratch. Replaced all absolute paths like:
`/lustre/guillant/HARL/harl` with dynamic `REPO_ROOT = os.path.dirname(os.path.abspath(__file__))`.

### Why
The original file was written for the authors' Linux HPC cluster. Every path was absolute and broke on Windows.
Using `__file__` makes the script portable — it works from any location the repo is cloned to.

### What changed
- `evaluate_harl.py`: full rewrite of path setup block (lines 44-49)

**Flow impact**: Affects Phase 1 (path resolution) in flow.md

---

## D-005 — Implement _select_device() for GPU-first hardware detection
**Date**: 2026-08-25
**Status**: RESOLVED

### What
Added a `_select_device()` function at the top of `evaluate_harl.py`:
Priority: NVIDIA CUDA -> AMD ROCm -> CPU (fallback only)

### Why
User requirement: GPU must always be used when available. CPU is only a fallback.
The function works on any RTX or AMD GPU — not hardcoded to RTX 3050.

### What changed
- `evaluate_harl.py`: lines 14-42

**Flow impact**: Affects Phase 2 (device assignment) in flow.md

---

## D-006 — Fix import: SustainDCEnv -> HARLSustainDCEnv
**Date**: 2026-08-25
**Status**: RESOLVED

### What
Changed import from:
`from envs.sustaindc.sustaindc_env import SustainDCEnv`
to:
`from harl.envs.sustaindc.harlsustaindc_env import HARLSustainDCEnv as SustainDCEnv`

### Why
`envs/sustaindc/` does not exist in this repo. The correct multi-agent wrapper is
`harl/envs/sustaindc/harlsustaindc_env.py`.
The `HARLSustainDCEnv` class wraps the base `SustainDC` environment through:
PettingZoo parallel env -> SuperSuit padding -> HARL-compatible API

### What changed
- `evaluate_harl.py`: line 56

**Flow impact**: Affects Phase 3 (env instantiation) in flow.md

---

## D-007 — Fix HAPPO checkpoint loading: actor.actor.load_state_dict()
**Date**: 2026-09-13
**Status**: RESOLVED

### What
Changed:
`actor.load_state_dict(state_dict)`
to:
`actor.actor.load_state_dict(state_dict)`

### Why
The `HAPPO` class is NOT an `nn.Module` — it is a wrapper that CONTAINS an `nn.Module` called `self.actor` (a `StochasticPolicy`).
The `.pt` checkpoint files saved during training store the `StochasticPolicy` weights, not the HAPPO wrapper weights.
Calling `load_state_dict` on the HAPPO wrapper fails because it has no such method.

Also changed `actor.eval()` to `actor.prep_rollout()` because `prep_rollout()` is HAPPO's
proper API for switching to inference mode (it calls `self.actor.eval()` internally).

### What changed
- `evaluate_harl.py`: lines 116-128

**Flow impact**: Affects Phase 4 (checkpoint loading) in flow.md

---

## D-008 — Fix env.reset() and env.step() API calls
**Date**: 2026-09-13
**Status**: RESOLVED

### What
Original (wrong):
`python
obs_dict, _info = env.reset()                           # expected 2 values
action, *_ = actor.get_actions(obs_tensor, ...)         # wrong signature
obs_dict, reward_dict, term, trunc, info = env.step()   # expected 5 values
`

Fixed:
`python
obs_list, _s_obs, _avail = env.reset()                  # returns 3 values
action, log_p, new_rnn = actor.get_actions(obs, rnn, mask, deterministic=True)  # requires rnn+mask
obs_list, _s_obs, rewards, dones, info, _avail = env.step(flat_actions)  # returns 6 values
`

### Why
`HARLSustainDCEnv` does NOT follow the standard Gymnasium API.
- `reset()` returns: `(obs_list, shared_obs_list, available_actions_list)`
- `step()` takes: a flat numpy array of all agent actions concatenated
- `step()` returns: `(obs, s_obs, rewards, dones, info, avail_actions)`
- `obs` is a list indexed by agent position, not a dict keyed by agent name
- `get_actions()` requires `(obs, rnn_states, masks, deterministic)` — rnn_states and masks
  are needed even for MLP policies (they are just ignored internally, but must be passed)

### What changed
- `evaluate_harl.py`: lines 130-185 (entire evaluation loop rewrite)

**Flow impact**: Affects Phase 5 (inference loop) in flow.md

---

## D-009 — Install missing visualization dependencies
**Date**: 2026-09-13
**Status**: RESOLVED

### What
Installed: `matplotlib`, `dash`, `dash-bootstrap-components`, `plotly`

### Why
`sustaindc_env.py` imports `matplotlib` at module level.
`harl/envs/sustaindc/dashboard_v2.py` imports `dash` and `plotly` at module level.
These are imported transitively when the environment is instantiated, so they must exist even
if we never use the dashboard.

These packages were not in `requirements.txt` — an oversight in the original repo.

### What changed
- No source file changed. Packages installed via pip.

---

## D-010 — Focus comparison study on agent_dc (HVAC cooling agent)
**Date**: 2026-09-13
**Status**: DECIDED (implementation pending)

### What
The research comparison will isolate `agent_dc` (cooling agent) rather than studying all 3 agents equally.

### Why
- Panel presentation is short: one focused agent tells a cleaner story
- Cooling is 30-40% of datacenter energy — highest impact
- HAPPO's decentralized execution is most interesting here because cooling is physics-constrained:
  the agent must react to real thermal dynamics, not just simple lookup tables
- Comparing HAPPO vs MAPPO on this agent reveals whether sharing a critic across agents
  helps or hurts when the cooling dynamics are partially observable

### What changed
- Nothing yet. Implementation plan: run MAPPO, freeze agent_ls and agent_bat weights,
  then retrain only agent_dc under both algorithms.
