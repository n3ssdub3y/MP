# SustainDC — Complete Data Flow

> This document traces every step from raw data files on disk to a reward signal returned to the RL agent.
> Modified sections are marked with [CHANGED] tags referencing the decisions.md entry.

---

## Phase 0 — Script Entry & Path Setup [CHANGED: D-004, D-005]

File: `evaluate_harl.py` or `train_sustaindc.py`

`
python evaluate_harl.py
  |
  +-> _select_device()                     [CHANGED D-005]
  |     torch.cuda.is_available()? -> cuda:0 (RTX 3050)
  |     else AMD ROCm check
  |     else CPU fallback
  |     returns: torch.device("cuda:0")
  |
  +-> REPO_ROOT = os.path.dirname(__file__)  [CHANGED D-004]
        sys.path.insert(0, REPO_ROOT)
`

---

## Phase 1 — Config Loading

File: `evaluate_harl.py` lines 58-82 / `train_sustaindc.py` `get_defaults_yaml_args()`

`
CHECKPOINT_PATH/config.json
  |
  +-> json.load(f)
  |     config = { "env_args": {...}, "algo_args": {...} }
  |
  +-> env_args  = config["env_args"]     # location, agents, days_per_episode, etc.
  +-> algo_args = config["algo_args"]    # lr, clip_param, hidden_size, etc.
`

---

## Phase 2 — Environment Instantiation [CHANGED: D-006, D-009]

### Layer 1: SustainDC (core gym.Env)
File: `sustaindc_env.py`

`
SustainDC(env_config)
  |
  +-> EnvConfig(env_config)                   # merge defaults + user config
  |
  +-> obtain_paths(location)                  # resolves data/ directory paths
  |     location = "ca" -> data/carbon/CA, data/weather/CA
  |
  +-> make_ls_env(...)                        # Load Shifting sub-env
  |     File: envs/carbon_ls.py
  |     Inputs: CI_Manager, Workload_Manager, Time_Manager
  |     Obs: [ci_t, ci_future_1h, workload, queue_size, time_of_day, ...]
  |     Act: Discrete(n) - fraction of load to defer
  |
  +-> make_dc_pyeplus_env(...)               # HVAC/Cooling sub-env [FOCUS]
  |     File: envs/datacenter.py + dc_gym.py
  |     Inputs: Weather_Manager, Time_Manager
  |     Obs: [it_load, cooling_load, pue, ambient_temp, setpoint, ...]
  |     Act: Continuous - delta cooling setpoint (degrees C)
  |
  +-> make_bat_fwd_env(...)                  # Battery sub-env
        File: envs/bat_env_fwd_view.py
        Inputs: CI_Manager, Time_Manager
        Obs: [SOC, ci_t, ci_future_1h, price, bat_power, ...]
        Act: Continuous - MW charge(+) or discharge(-)
`

### Layer 2: PettingZoo Parallel Env
File: `harl/envs/sustaindc/sustaindc_ptzoo.py`

`
SustainDCPettingZooEnv(env_config)
  |
  +-> self.env = SustainDC(env_config)        # wraps the core env
  |
  +-> self.possible_agents = ["agent_ls", "agent_dc", "agent_bat"]
  |
  +-> self.observation_spaces = {agent: space, ...}   # dict form
  +-> self.action_spaces      = {agent: space, ...}
  +-> self.share_observation_space = {agent: Box(29,), ...}
`

### Layer 3: SuperSuit + HARL Wrapper [CHANGED: D-006]
File: `harl/envs/sustaindc/harlsustaindc_env.py`

`
HARLSustainDCEnv(env_args)
  |
  +-> SustainDCPettingZooEnv(env_args)
  |
  +-> ss.pad_action_space_v0(self.env)        # pad all action spaces to same shape
  +-> ss.pad_observations_v0(self.env)        # pad all obs spaces to same shape
  |
  +-> self.observation_space = list of spaces # unwrapped to list form
  +-> self.action_space      = list of spaces
  +-> self.agents            = list of agent names in order
`

---

## Phase 3 — Data Ingestion (per reset/step)

### reset() call chain
`
HARLSustainDCEnv.reset()          [returns: obs_list, s_obs_list, avail_actions]
  |
  +-> self.env.reset(seed=N)      (PettingZoo env)
  |     |
  |     +-> SustainDCPettingZooEnv.reset()
  |           |
  |           +-> SustainDC.reset()
  |                 |
  |                 +-> Time_Manager.reset()       # set start hour/day/month
  |                 +-> Weather_Manager.reset()    # load EPW file row for start time
  |                 |     File: data/weather/USA_NY_New.York-Kennedy.epw
  |                 +-> CI_Manager.reset()         # load CSV row for start time
  |                 |     File: data/carbon/NYIS_NG_&_avgCI.csv
  |                 +-> Workload_Manager.reset()   # load workload trace start
  |                 |     File: data/workload/Alibaba_CPU_Data_Hourly_1.csv
  |                 +-> ls_env.reset()
  |                 +-> dc_env.reset()             # <-- agent_dc HVAC env
  |                 +-> bat_env.reset()
  |                 returns: {agent: obs_array, ...}
  |
  +-> self.unwrap(obs)            # dict -> list (indexed by agent order)
  +-> self._create_shared_observation(obs)   # concatenate for critic
  +-> self.get_avail_actions()   # for discrete agents
  returns: (obs_list, s_obs_list, avail_actions_list)
`

### Raw data files and their shapes
| File | Format | Shape | What it provides |
|---|---|---|---|
| `USA_NY_New.York-Kennedy.epw` | CSV-like | 8760 rows x 35 cols | Hourly weather: temp, humidity, solar, wind |
| `NYIS_NG_&_avgCI.csv` | CSV | 8760 rows x 3 cols | Hourly grid carbon intensity (gCO2/kWh) |
| `Alibaba_CPU_Data_Hourly_1.csv` | CSV | ~8760 rows | Server workload arrival rate (0-1) |
| `dc_config.json` | JSON | N/A | Datacenter hardware spec (capacity, chillers) |

---

## Phase 4 — Checkpoint Loading [CHANGED: D-007]

File: `evaluate_harl.py` lines 93-128

`
for agent_id in [0, 1, 2]:
  |
  +-> HAPPO(combined_args, obs_space[i], act_space[i], device=DEVICE)
  |     |
  |     +-> OnPolicyBase.__init__()
  |           +-> self.actor = StochasticPolicy(args, obs_space, act_space, device)
  |                 (this is the actual nn.Module with learned weights)
  |           +-> self.actor_optimizer = Adam(self.actor.parameters())
  |
  +-> checkpoint = torch.load("models/actor_agent{i}.pt", map_location=DEVICE)
  |     # checkpoint IS the StochasticPolicy state_dict directly
  |
  +-> actor.actor.load_state_dict(checkpoint)   [CHANGED D-007]
  |     # loads into the INNER nn.Module, not the HAPPO wrapper
  |
  +-> actor.prep_rollout()                      [CHANGED D-007]
        # calls self.actor.eval() -> disables dropout/batchnorm for inference
`

---

## Phase 5 — Inference Loop (Evaluation) [CHANGED: D-008]

File: `evaluate_harl.py` lines 130-185

`
while not done:
  |
  for agent_id in [0, 1, 2]:
    |
    +-> obs_np = obs_list[agent_id]            # numpy array from env
    |
    +-> obs_tensor  = torch.tensor(obs_np).unsqueeze(0).to(DEVICE)   # (1, obs_dim)
    +-> rnn_tensor  = torch.zeros(1, 1, hidden_size).to(DEVICE)      # (1, 1, 64)
    +-> mask_tensor = torch.ones(1, 1).to(DEVICE)                    # (1, 1)
    |
    +-> actor.get_actions(obs_tensor, rnn_tensor, mask_tensor, deterministic=True)
    |     |
    |     +-> self.actor(obs, rnn_states, masks, avail_actions, deterministic)
    |           |
    |           +-> StochasticPolicy.forward()
    |                 +-> obs_encoder(obs_tensor) -> latent features
    |                 +-> action_head(features)   -> action distribution (logits)
    |                 +-> dist.mode() if deterministic else dist.sample()
    |                 returns: (action_tensor, log_prob, new_rnn_states)
    |
    +-> action_list.append(action.cpu().numpy())
  |
  +-> flat_actions = np.array(action_list).flatten()  [CHANGED D-008]
  |     # HARLSustainDCEnv.step() requires a flat 1D array, not a dict
  |
  +-> env.step(flat_actions)
        |
        +-> self.wrap(flat_actions)     # flat array -> dict {agent: action}
        +-> PettingZooEnv.step(dict)
              +-> SustainDC.step(dict)
                    +-> ls_env.step(actions["agent_ls"])
                    +-> dc_env.step(actions["agent_dc"])    # <-- cooling step [FOCUS]
                    +-> bat_env.step(actions["agent_bat"])
                    +-> reward_creator(...)     # compute composite reward
                    returns: (obs, rewards, dones, truncateds, infos)
        returns: (obs_list, s_obs_list, rewards, dones, info, avail_actions)
`

---

## Phase 6 — Reward Computation

File: `utils/reward_creator.py`, called inside `SustainDC.step()`

`
Composite reward = alpha * individual_reward + (1-alpha)/2 * collab_reward_1
                                              + (1-alpha)/2 * collab_reward_2

agent_ls reward: penalize high carbon load + penalize large job queue
agent_dc reward: penalize high PUE (Power Usage Effectiveness) [FOCUS]
agent_bat reward: penalize battery cycling cost + penalize high CI discharge
`

**PUE** (Power Usage Effectiveness) = Total facility power / IT power
- Perfect PUE = 1.0 (all power goes to compute, zero cooling overhead)
- Typical DC PUE = 1.5-2.0
- agent_dc tries to minimize PUE by optimizing cooling setpoints

---

## Phase 7 — Training (not evaluation)

File: `harl/runners/on_policy_ha_runner.py`

`
runner.run()
  |
  for episode in range(max_episodes):
    |
    +-> collect rollout (Phase 5, but with stochastic actions)
    |
    +-> compute GAE advantages
    |     Generalized Advantage Estimation: A_t = sum_k (gamma*lambda)^k * delta_t+k
    |     delta_t = r_t + gamma * V(s_{t+1}) - V(s_t)
    |
    +-> HAPPO.update(sample)                # per agent, sequential
    |     +-> compute importance ratio:  pi_new(a|o) / pi_old(a|o)
    |     +-> clip ratio to [1-eps, 1+eps]
    |     +-> policy loss = -min(ratio * A, clipped_ratio * A)
    |     +-> backprop -> Adam optimizer step
    |
    +-> save checkpoint every N episodes
          -> results/{env}/{location}/{algo}/{exp_name}/seed-XXXXX/models/
`

---

## Summary: What YOU Changed

| Phase | Change | Decision |
|---|---|---|
| Phase 0 | _select_device() GPU-first detection | D-005 |
| Phase 0 | Dynamic REPO_ROOT path | D-004 |
| Phase 2 | Correct env import (HARLSustainDCEnv) | D-006 |
| Phase 4 | actor.actor.load_state_dict() + prep_rollout() | D-007 |
| Phase 5 | Correct reset()/step() API, flat actions, rnn args | D-008 |

All other phases were unchanged — they worked correctly once the above fixes were applied.
