# SustainDC Project — Master Context File
> **Purpose**: This file persists project state, decisions, and learning goals across chat sessions and agents.
> Last updated: 2026-09-13

---

## 🎯 Project Goal

Build a **comparison study between centralized and decentralized multi-agent RL** for datacenter optimization using the SustainDC benchmark.

**Primary focus agent**: `agent_dc` — the **HVAC/Cooling agent**
**Algorithms compared**:
- Decentralized execution: **HAPPO** (Heterogeneous-Agent Proximal Policy Optimization)
- Centralized baseline: **MAPPO** (Multi-Agent PPO with shared critic)

---

## 👤 User Profile

- **Level**: Learning Generative AI and Agentic AI (needs teaching-style explanations)
- **Presentation deadline**: Thursday, 17th September 2026
- **Goal for panel**: Show meaningful research progress beyond cloning a repo
- **Laptop GPU**: NVIDIA GeForce RTX 3050 6GB Laptop

---

## 🗂️ Repository Location

`
D:\New_folder\Desktop\MP\SustainDC\sustaindc\
`

---

## 🐍 Environment

- **Conda env name**: `sustaindc_env`
- **Python version**: 3.10
- **Python executable**: `C:\Users\NESS\.anaconda-desktop\micromamba\envs\cuda\envs\sustaindc_env\python.exe`
- **PyTorch**: 2.0.0+cu118 (CUDA 11.8 — RTX 3050 compatible)

### Run commands (always activate first)
`powershell
conda activate sustaindc_env

# Evaluate trained model
python evaluate_harl.py

# Train a new model
python train_sustaindc.py --algo happo --exp_name my_run

# Compare with MAPPO
python train_sustaindc.py --algo mappo --exp_name mappo_baseline

# TensorBoard
tensorboard --logdir results/sustaindc/
`

---

## 🏗️ Project Architecture (Summary)

Raw Data (CSV/EPW) -> Environment Managers -> 3 Sub-Envs
  -> SustainDC(gym.Env) -> PettingZoo Wrapper -> HARL Wrapper
    -> HAPPO Training -> Checkpoints -> evaluate_harl.py

### Three Agents
| Agent | Controls | File |
|---|---|---|
| `agent_ls` | Load Shifting (defer compute jobs) | `envs/carbon_ls.py` |
| `agent_dc` | HVAC Cooling setpoint (FOCUS) | `envs/datacenter.py` + `dc_gym.py` |
| `agent_bat` | Battery charge/discharge | `envs/bat_env_fwd_view.py` |

---

## 📍 Current Status (as of 2026-09-13)

| Component | Status |
|---|---|
| Conda env set up | DONE |
| All packages installed | DONE (matplotlib, dash, plotly added) |
| GPU verified working | DONE - RTX 3050, cuda:0, CUDA 11.8 |
| evaluate_harl.py runs | DONE - 2880 steps, Total reward -219.1613 |
| MAPPO comparison run | NOT STARTED |
| agent_dc isolation study | NOT STARTED |
| Visualization dashboard | NOT STARTED |
| Presentation slides | NOT STARTED |

---

## 📚 Key Files Modified

| File | What Changed |
|---|---|
| `requirements.txt` | Added cu118 PyTorch index URL |
| `evaluate_harl.py` | Full rewrite: GPU detection, correct HARL API, proper eval loop |
| `.vscode/settings.json` | Points editor to sustaindc_env Python interpreter |

---

## 🧠 Learning Agenda (GenAI + Agentic AI Topics)

1. **Reinforcement Learning basics** -> agents, environments, rewards, policies
2. **Policy gradient methods** -> PPO, how it differs from Q-learning
3. **Multi-agent RL** -> cooperative vs competitive, centralized vs decentralized
4. **CTDE paradigm** -> Centralized Training, Decentralized Execution (key insight in HAPPO/MAPPO)
5. **Neural network policies** -> how observations become actions
6. **Agentic AI** -> autonomous decision-making loops (same as LLM agents!)
7. **Generative AI connection** -> diffusion/LLM models as world models in RL

---

## 🗣️ Presentation Narrative (Thursday 17th)

**Title**: Centralized vs Decentralized Control in Multi-Agent RL for Sustainable Datacenters

**Key claim**: We are conducting a comparative study producing original empirical results.
Specifically isolating cooling agent behavior under HAPPO vs MAPPO.

**Talking points**:
1. Why datacenters matter (1-2% global electricity, 40% from cooling)
2. Why RL instead of rule-based controllers
3. What CTDE means and why it matters
4. Live demo of the evaluation loop
5. Research plan: isolate agent_dc, run ablations, plot results

---

## Known Issues and Gotchas

1. conda run -n env python -c multiline does NOT work on Windows
2. PettingZoo UserWarning about deprecated observation_spaces dict is harmless
3. evaluate_harl.py had wrong API calls - fixed (see decisions.md)
4. matplotlib, dash, plotly were missing from requirements.txt - installed manually
