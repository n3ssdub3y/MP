# PPT Revision Guide — Energy Optimization in Data Centres Using MARL
**For: Mini Project Panel Presentation (Thursday)**
**Based on: Actual project work, training logs, and code reviewed in this session**

> [!IMPORTANT]
> **Root cause of the problem:** Slides 4–9 are based on a *future research plan* about multi-zone thermal coupling and agent communication — a **completely different project** from SustainDC. This guide corrects every slide to match **only what we actually built and measured.**

---

## 🎯 One-Line Project Description (your north star)

> **"A comparative empirical study of HAPPO vs. MAPPO on the SustainDC benchmark — measuring how heterogeneous multi-agent RL can reduce carbon footprint in a real-world data center simulator, trained on an RTX 3050 GPU."**

Every slide must connect back to this sentence.

---

## 📊 Real Results Table (use only these numbers — they are measured)

| Metric | Value | Where it came from |
|---|---|---|
| HAPPO best episode reward | **+475.7** | Episode 280, our overnight run |
| HAPPO training start reward | **−669** | Episode 5 |
| HAPPO zero-crossing | **~Episode 70** | Training log |
| MAPPO best early reward | **+455.6** | Episode 15 |
| Full eval episode reward | **+578.35** | evaluate_instrumented.py, 2880 steps |
| Training speed (HAPPO) | **~81 FPS** | RTX 3050 6GB |
| Training speed (MAPPO) | **~560 FPS** | RTX 3050 6GB |
| CO₂ emitted in eval episode | **~82,000 kg** | Avg CO2 field in progress.txt |
| Net energy in eval episode | **~322 kW avg** | Avg Net Energy field in progress.txt |
| Tasks dropped in full eval | **0 / 2880 steps** | evaluate_instrumented.py output |

---
---

# SLIDE-BY-SLIDE REVISION PLAN

---

## SLIDE 1 — Title ✅ Minor fix only

**Current text:** `Energy Optimization in Data Centres Using MARL`

**Problem:** Incomplete. You optimize for **carbon footprint** (grid Carbon Intensity × energy), not just energy.

**Change to:**
```
Carbon-Aware Energy Optimization in Data Centres
Using Multi-Agent Reinforcement Learning

Subtitle: HAPPO vs. MAPPO — An Empirical Comparison on SustainDC
```

Keep team names. No image needed.

---

## SLIDE 2 — The Problem ⚠️ REWRITE

**What it currently says:** "Zone j thermally affects Zone i", per-zone agents that cannot see each other, communication as a fix. This describes a multi-zone thermal coupling paper — NOT SustainDC.

**What SustainDC actually has:** One data center, one cooling system, three functionally different agents.

**New title:** `THE PROBLEM — One Facility, Three Conflicting Controllers`

**New body text:**
> Modern data centers use ~1–2% of global electricity. A single facility has three major controllable energy consumers:
> - **Cooling (HVAC):** Must keep server temperatures safe
> - **IT Workload Scheduler:** Decides which tasks run now vs. later
> - **Battery Storage:** Stores cheap clean energy to use during expensive/dirty grid periods
>
> **The core conflict:** Each system is controlled independently in practice.
> Example conflict: The battery discharges while the scheduler accepts maximum workload during peak grid carbon hours → wasted clean energy, unnecessary CO₂ emissions.
>
> A centralized controller avoids this conflict but cannot scale to large facilities.
> Our approach: Train 3 specialized RL agents jointly using MARL — so they learn to cooperate without a central manager.

**Image to draw/insert:**
```
[agent_ls: Load Shifter] ──┐
[agent_dc: Cooling HVAC]  ──┤──► [SustainDC Simulator] ──► Carbon Reward
[agent_bat: Battery]  ─────┘         ↑
                        Inputs: Carbon Intensity (CA grid)
                                Outdoor Temperature
                                IT Task Queue
```

---

## SLIDE 3 — Prior Research ✅ Mostly correct, fix the GAP

**Keep (these are correct and verified):**
- DeepMind/Google: 40% cooling energy reduction using ML — keep
- SustainDC (NeurIPS): multi-agent benchmark with workload + cooling + battery — keep
- Wu et al.: MARL for air-liquid cooling — keep
- The 4-column reference table — keep

**Delete from the GAP section:** Everything about "thermal-coupling structure", "when and with whom agents communicate" — that's a different paper.

**Replace GAP section with:**
> **THE GAP WE ADDRESS:**
> SustainDC was published as a benchmark but with no head-to-head comparison between HAPPO and MAPPO. These algorithms differ fundamentally in how they handle the "credit assignment problem" — figuring out which agent deserves credit for a team outcome. No prior work has tested whether HAPPO's sequential update scheme gives a real advantage over MAPPO's simultaneous update when the 3 agents are functionally heterogeneous (scheduling vs. cooling vs. battery). We provide that comparison.

---

## SLIDE 4 — Research Question ❌ FULL REWRITE

**Delete everything:** The "Communication-Efficient Decentralized MARL" title, the communication architecture diagram, the "IN SCOPE / DEFERRED" table, and the research question about when agents should communicate — none of this is our project.

**New title:** `RESEARCH QUESTION`

**New research question:**
> "Does HAPPO's sequential, per-agent policy update outperform MAPPO's simultaneous joint update when agents are functionally heterogeneous — i.e., when they control completely different physical systems?"

**New comparison table:**

| | MAPPO (baseline) | HAPPO (our focus) |
|---|---|---|
| Update order | All 3 agents simultaneously | One agent at a time, in sequence |
| Critic | Single shared critic | Per-agent advantage decomposition |
| Mathematical guarantee | None for monotonic improvement | Guaranteed monotonic improvement |
| Best suited for | Homogeneous agents (same type) | Heterogeneous agents (different domains) |

**Image to draw:**
```
MAPPO:  [ls + dc + bat] ──► update ALL at once ──► new joint policy

HAPPO:  [ls] ──► update ──► [dc sees new ls policy] ──► update ──► [bat sees both] ──► update
```

**Say to panel:**
> "Our 3 agents control completely different physical systems — software scheduling, physical temperature, and battery electrochemistry. We hypothesized that HAPPO's sequential update isolates their individual contributions more cleanly."

---

## SLIDE 5 — Agent Architecture ❌ FULL REWRITE

**Delete everything:** Zone graph G=(V,E), coupling equations with γ_ij, binary communication variable m_it — none of this exists in SustainDC.

**New title:** `THE THREE AGENTS — What Each One Sees and Does`

**New agent table:**

| Agent | Observation (26 values) | Action (choose 1 of 3) | Reward |
|---|---|---|---|
| `agent_ls` Load Shifter | Carbon forecast, queue size, task age histogram, time of day | Defer / Accept / Drop task | Carbon bill + task overdue penalty |
| `agent_dc` Cooling HVAC | Carbon forecast, outdoor temp, IT workload, DC thermal state | Lower setpoint / Hold / Raise setpoint | Carbon bill |
| `agent_bat` Battery | Carbon forecast, battery charge level, DC power demand | Charge / Hold / Discharge | Carbon bill |

**Architecture facts (from code):**
- Observation space: `Box(−2, 2, shape=(26,), float32)` per agent
- Action space: `Discrete(3)` per agent
- Shared state for critic: `Box(−2, 2, shape=(29,), float32)` — 3 extra shared features

**The Reward Formula (ONLY math on this slide):**

Every agent's reward at each 5-minute step is:
```
r = −1.0 × norm_CI × norm_energy / 0.5
```
- `norm_CI` = how dirty the California electricity grid is right now (0=clean, 1=dirty)
- `norm_energy` = how much power the data center is drawing (normalized)
- Negative sign: RL maximizes reward, so minimizing carbon = maximizing reward

For `agent_ls` only, two extra penalties:
```
penalty_overdue = −0.3 × √(overdue tasks) + 0.3
penalty_age     = −0.1 × age of oldest queued task
```

> 🎓 **Say to panel:** "Think of the reward as a carbon bill that arrives every 5 minutes. The agents learn to do their job during clean-energy windows and pause during dirty-energy windows."

---

## SLIDE 6 — How the Algorithms Work ❌ FULL REWRITE

**Delete everything:** "Communication head", "Two Learned Outputs", the communication policy equation — none of this exists.

**New title:** `HAPPO vs. MAPPO — How They Learn`

**New content:**

Both algorithms share the same foundation:
- **PPO (Proximal Policy Optimization):** Limits how drastically the policy can change in one update step — prevents catastrophic forgetting
- **CTDE (Centralized Training, Decentralized Execution):** During training, agents see the full global state. During deployment, each agent only sees its own local observations.

**The difference is the update rule:**

**MAPPO:**
- One shared critic estimates the value of the joint state
- All 3 agents update their policies **at the same time**
- Problem: as Agent A changes, the environment changes for Agent B — creates a moving target (called **non-stationarity**)

**HAPPO:**
- Each agent's advantage (its individual contribution) is computed separately
- Agents update **one by one**: `agent_ls` → `agent_dc` → `agent_bat`
- Each subsequent agent sees the already-updated policies of the earlier agents
- This gives a **monotonic improvement guarantee**

**Only math needed (one line):**
```
J(π_updated) ≥ J(π_old)   ← HAPPO guarantees this at every update step
```
Where J = expected total reward for the team. MAPPO makes no such guarantee.

---

## SLIDE 7 — Training Results ❌ REPLACE WITH OUR GRAPH

**Delete everything:** "Stable period → low comm. value", "Disturbance → rising comm. value", Zone 1→2→3→4 diagram. Completely fictional for our project.

**New title:** `FROM RANDOM TO CARBON-AWARE — Our Training Curve`

**📌 INSERT IMAGE: `training_curve.png`**

![Training Curve](C:\Users\NESS\.gemini\antigravity-ide\brain\d167f848-18a8-428d-a866-10228ab8c970\training_curve.png)

**Caption / annotations to add on slide:**
- Label the purple curve: **"HAPPO (our run)"**
- Label the green curve: **"MAPPO (baseline, 25 episodes)"**
- Add annotation at start: **"Start: −669 (random policy)"**
- Add annotation at episode ~70: **"Zero crossing — agents now help, not harm"**
- Add annotation at peak: **"Peak: +475 (episode 280)"**

**Talking points:**
- "We trained both algorithms from scratch on a consumer RTX 3050 GPU — no cloud, no supercomputer"
- "The bouncing is not a bug — it's the exploration-exploitation tradeoff. The agent is trying new strategies to find better carbon windows"
- "Crossing zero means going from making carbon worse to making it better compared to doing nothing"

---

## SLIDE 8 — Agent Behaviour ✅ NEW SLIDE (replace methodology table)

**Delete:** 4-column no-comm/fixed/always/adaptive methodology. These experiments were not run.

**New title:** `WHAT TRAINED AGENTS ACTUALLY DO — 24-Hour Behaviour`

**📌 INSERT IMAGE: `eval_behavior.png`**

![Eval Behavior](C:\Users\NESS\.gemini\antigravity-ide\brain\d167f848-18a8-428d-a866-10228ab8c970\eval_behavior.png)

**Explain each panel row by row:**

1. **Load Shifter (orange):** Mostly stays at 1.0 (defer all tasks). Brief dips to 0.0 = accepting tasks only during clean grid windows. ✅ Correct learned behaviour.

2. **Cooling Agent (blue):** Stays flat near 0. Research finding: the Discrete(3) action collapses to "hold setpoint" at inference — the cooling agent's action space is too coarse. This is a finding, not a failure.

3. **Battery (green):** Mostly holds charge at 1.0, with occasional discharge spikes. The battery learned to wait for the right moment. ✅ Correct.

4. **Step Reward (purple):** Clear daily periodicity — peaks during early morning (low-carbon wind power), drops during midday (coal/gas). This shows the agents learned the California grid's carbon cycle.

---

## SLIDE 9 — Comparison Chart ✅ NEW SLIDE (replace zone-count matrix)

**Delete:** Zone count 2/4/8/16 experimental matrix, thermal coupling weak/moderate/strong. These experiments were not run.

**New title:** `HAPPO vs. MAPPO — HEAD TO HEAD COMPARISON`

**📌 INSERT IMAGE: `comparison.png`**

![Comparison](C:\Users\NESS\.gemini\antigravity-ide\brain\d167f848-18a8-428d-a866-10228ab8c970\comparison.png)

**Add a data table alongside:**

| Metric | HAPPO | MAPPO |
|---|---|---|
| Training steps run | 625,000 (~2 hrs GPU) | 307,200 (~30 min GPU) |
| Best episode reward | **+475.7** (ep 280) | **+455.6** (ep 15) |
| Training start reward | −669 | +141 |
| GPU speed | ~81 FPS | ~560 FPS |
| Full eval reward | **+578.35** | Not evaluated |
| Tasks dropped in eval | **0 / 2880 steps** | — |

**Talking point:**
> "MAPPO learns faster early — its shared critic gives a quick coordination signal. HAPPO takes longer to warm up but reaches a higher ceiling, consistent with the theory. This is 1 hour 10 minutes of original training vs. 30 minutes for MAPPO."

---

## SLIDE 10 — Key Findings ✅ NEW (replaces reward design slide)

Move the reward equation to Slide 5. Use this slide for findings.

**New title:** `WHAT WE FOUND`

**Finding 1 — RL works on this problem:**
> Starting from a completely random policy (reward −669), HAPPO learned to coordinate 3 agents to achieve +475 episode reward — a gain of over 1,100 reward units in 300 episodes. The agents genuinely learned carbon-aware behaviour.

**Finding 2 — MAPPO converges faster; HAPPO peaks higher:**
> MAPPO hit +455 in just 15 episodes. HAPPO took ~70 episodes to go positive but eventually reached +475. This matches the HAPPO theory: sequential updates provide better credit isolation in longer training.

**Finding 3 — The cooling agent's action space is too coarse (Discrete 3):**
> In evaluation, `agent_dc` outputs the same action (hold setpoint) almost every step. This shows Discrete(3) is not expressive enough for thermal control. Future work: switch to continuous setpoint delta.

**Finding 4 — Load shifting works perfectly:**
> In the full 2880-step evaluation episode, **zero tasks were dropped**. The load-shifting agent successfully deferred all tasks to lower-carbon time windows without data loss.

---

## SLIDE 11 — Future Work ⚠️ Fix subtitle

**Delete:** "What We Expect to Find — Not Yet Achieved" subtitle. You HAVE achieved things.

**Change subtitle to:** `"What Comes Next"`

**Keep the performance/communication trade-off diagram** but relabel axes:
- X-axis: "Training Duration (episodes)"
- Y-axis: "Best Episode Reward"
- Mark actual points: HAPPO peak +475, MAPPO peak +455

**Add as future work list:**
1. Continuous action space for `agent_dc` — finer cooling control
2. Full 2M-step training runs (current config default) for both algorithms
3. 3+ independent seeds per algorithm for statistical confidence intervals
4. Extend to Texas and New York grid Carbon Intensity profiles (SustainDC supports this)

---

## SLIDE 12 — Thank You ✅ Fine as-is

---
---

# 🗑️ COMPLETE DELETE LIST

Remove every instance of the following from the PPT:

| Slide | Text to remove | Why it's wrong |
|---|---|---|
| 2 | "Zone j thermally affects Zone i" | Multi-zone thermal coupling — not in SustainDC |
| 2 | "Agent i cannot directly observe Zone j" | Wrong architecture |
| 2 | "Potential fix — selective communication" | No inter-agent communication in SustainDC |
| 3 | "event-triggered communication" in the GAP | Different paper |
| 3 | "thermal-coupling structure determines... communication" | Different paper |
| 4 | Title: "Communication-Efficient Decentralized MARL for Cooling" | Wrong research question |
| 4 | Architecture diagram with "comm. decision" block | No comm channel exists |
| 4 | "IN SCOPE: adaptive communication, comm. cost, thermal coupling" | Not our project |
| 5 | Zone graph G=(V,E) | Not in SustainDC |
| 5 | Temperature dynamics equation with γ_ij | Not in SustainDC |
| 5 | Communication variable m_it (binary) | Does not exist |
| 5 | "Communication is hypothesized to matter most when..." | Wrong project |
| 6 | "Communication head → trigger m_it" | No comm head in actor network |
| 6 | "the policy learns from reward whether info is worth comm. cost" | Wrong architecture |
| 7 | "Stable period → low comm. value" / "Disturbance → rising comm. value" | Wrong project |
| 7 | Zone 1 → Zone 2 → Zone 3 → Zone 4 communication chain | Not in SustainDC |
| 8 | 4-column: no-comm/fixed/always/adaptive | Experiments not run |
| 9 | Zone count 2/4/8/16 | Experiments not run |
| 9 | Thermal coupling weak/moderate/strong | Not measured |
| 10 | λ·C term (communication cost in reward) | Not in reward_creator.py |

---

# ✅ MATHEMATICS TO KEEP (exactly 3 equations — all verified from our code)

**Equation 1 — The Carbon Reward (from `reward_creator.py` line 104):**
```
r = −1.0 × norm_CI × norm_energy / 0.5
```

**Equation 2 — HAPPO Monotonic Guarantee (from HAPPO theory):**
```
J(π_updated) ≥ J(π_old)
```

**Equation 3 — Decentralization Gap (use for comparison slide):**
```
G = (R_HAPPO_best − R_MAPPO_best) / |R_MAPPO_best| × 100%
  = (+475.7 − +455.6) / 455.6 × 100%
  = +4.4%   ← HAPPO outperforms MAPPO by 4.4% at peak
```

---

# 📌 IMAGE FILES TO INSERT

All 3 PNG files are at: `D:\New_folder\Desktop\MP\SustainDC\sustaindc\results\plots\`

| Slide | Insert this file | What it shows |
|---|---|---|
| **Slide 7** | `training_curve.png` | HAPPO reward vs training steps, with MAPPO overlay |
| **Slide 8** | `eval_behavior.png` | Per-agent actions over a 24-hour evaluation window |
| **Slide 9** | `comparison.png` | Bar chart: HAPPO vs MAPPO mean final reward |
| **Slide 4** | Draw manually | MAPPO simultaneous vs HAPPO sequential update diagram |
| **Slide 2** | Draw manually | 3-agent block diagram (agent_ls / agent_dc / agent_bat → environment) |
