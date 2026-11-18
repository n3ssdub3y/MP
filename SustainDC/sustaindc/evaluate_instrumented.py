"""
evaluate_instrumented.py
------------------------
Same as evaluate_harl.py but records per-step metrics to a JSON file
so plot_results.py can visualize agent behavior over time.

Run: python evaluate_instrumented.py
"""

import os, sys, json
import numpy as np
import torch

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, REPO_ROOT)
PLOT_DIR = os.path.join(REPO_ROOT, 'results', 'plots')
os.makedirs(PLOT_DIR, exist_ok=True)

# ── Device selection ──────────────────────────────────────────────────────────
def _select_device():
    if torch.cuda.is_available():
        print(f"[Device] NVIDIA GPU: {torch.cuda.get_device_name(0)}")
        return torch.device("cuda:0")
    if getattr(torch.version, "hip", None) is not None:
        print(f"[Device] AMD ROCm GPU: {torch.cuda.get_device_name(0)}")
        return torch.device("cuda:0")
    print("[Device] WARNING: No GPU detected. Falling back to CPU.")
    return torch.device("cpu")

DEVICE = _select_device()

# ── Imports ───────────────────────────────────────────────────────────────────
from harl.algorithms.actors.happo import HAPPO
from harl.envs.sustaindc.harlsustaindc_env import HARLSustainDCEnv as SustainDCEnv

# ── Config ────────────────────────────────────────────────────────────────────
CHECKPOINT_PATH = os.path.join(
    REPO_ROOT, 'results', 'sustaindc', 'ca', 'happo', 'happo',
    'seed-00001-2026-08-15-01-48-24'
)
with open(os.path.join(CHECKPOINT_PATH, 'config.json')) as f:
    config = json.load(f)

env_args      = config['env_args']
algo_args     = config['algo_args']
model_args    = algo_args.get('model', {})
algo_only     = algo_args.get('algo', {})
combined_args = {**model_args, **algo_only}

# ── Environment ───────────────────────────────────────────────────────────────
env        = SustainDCEnv(env_args)
agents     = list(env.agents)
num_agents = env.n_agents

# ── Load actors ───────────────────────────────────────────────────────────────
actors = []
for i in range(num_agents):
    actor = HAPPO(combined_args, env.observation_space[i], env.action_space[i], device=DEVICE)
    ckpt  = torch.load(os.path.join(CHECKPOINT_PATH, 'models', f'actor_agent{i}.pt'), map_location=DEVICE)
    actor.actor.load_state_dict(ckpt.get('model_state_dict', ckpt))
    actor.prep_rollout()
    actors.append(actor)
    print(f"[Loaded] {agents[i]}")

# ── Eval loop with logging ────────────────────────────────────────────────────
obs_list, _, _ = env.reset()
done           = False
rnn_hidden     = combined_args.get("hidden_size", 64)
rnn_states     = [np.zeros((1, 1, rnn_hidden), dtype=np.float32) for _ in range(num_agents)]
masks          = [np.ones((1, 1),               dtype=np.float32) for _ in range(num_agents)]

# Metric logs
log = {
    'steps'       : [],
    'step_rewards': [],
    'actions_ls'  : [],
    'actions_dc'  : [],
    'actions_bat' : [],
}

step = 0
total_reward = 0.0
print("\n[Eval] Running instrumented evaluation episode...")

while not done:
    action_list = []
    for i in range(num_agents):
        obs_t  = torch.tensor(np.array(obs_list[i], dtype=np.float32)).unsqueeze(0).to(DEVICE)
        rnn_t  = torch.tensor(rnn_states[i]).to(DEVICE)
        mask_t = torch.tensor(masks[i]).to(DEVICE)

        with torch.no_grad():
            action, _, new_rnn = actors[i].get_actions(obs_t, rnn_t, mask_t, deterministic=True)
        rnn_states[i] = new_rnn.cpu().numpy()
        action_list.append(action.squeeze(0).cpu().numpy())

    flat = np.array(action_list).flatten()
    obs_list, _, rewards, dones, _, _ = env.step(flat)

    r = sum(x[0] for x in rewards) / num_agents
    total_reward += r
    step         += 1

    # Record
    log['steps'].append(step)
    log['step_rewards'].append(float(r))
    log['actions_ls'].append(float(action_list[0].flatten()[0]))
    log['actions_dc'].append(float(action_list[1].flatten()[0]))
    log['actions_bat'].append(float(action_list[2].flatten()[0]))

    done = any(dones)

print(f"[Eval] Finished: {step} steps | Total reward: {total_reward:.4f}")

# Save metrics
out = os.path.join(PLOT_DIR, 'eval_metrics.json')
with open(out, 'w') as f:
    json.dump(log, f, indent=2)
print(f"[Saved] Metrics -> {out}")
print("[Next]  Run: python plot_results.py")
