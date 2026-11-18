#%%
import os
import sys
import json
import numpy as np

# ---------------------------------------------------------------------------
# Smart device selection:
#   1. Prefer NVIDIA CUDA GPU (RTX 3050, 3060, 4090, etc.)
#   2. Fallback to CPU only when no GPU is detected
# ---------------------------------------------------------------------------
import torch

def _select_device() -> torch.device:
    """Select the best available compute device.

    Priority:
        1. NVIDIA CUDA GPU (RTX series, etc.)
        2. AMD ROCm GPU (if torch is compiled with ROCm)
        3. CPU (only when no GPU backend is available)

    Returns:
        torch.device: The selected device.
    """
    if torch.cuda.is_available():
        device = torch.device("cuda:0")
        gpu_name = torch.cuda.get_device_name(0)
        print(f"[Device] Using NVIDIA GPU: {gpu_name}")
        return device

    # Check for AMD ROCm (torch.version.hip is set when ROCm is used)
    if getattr(torch.version, "hip", None) is not None:
        device = torch.device("cuda:0")  # ROCm uses the cuda namespace
        gpu_name = torch.cuda.get_device_name(0)
        print(f"[Device] Using AMD ROCm GPU: {gpu_name}")
        return device

    print("[Device] WARNING: No NVIDIA RTX / AMD GPU detected. Falling back to CPU.")
    return torch.device("cpu")


DEVICE = _select_device()

# ---------------------------------------------------------------------------
# Path setup - use the local harl package bundled with this repository
# ---------------------------------------------------------------------------
REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

# ---------------------------------------------------------------------------
# Imports from the local harl package and environment
# ---------------------------------------------------------------------------
import harl
from harl.algorithms.actors.happo import HAPPO
from harl.envs.sustaindc.harlsustaindc_env import HARLSustainDCEnv as SustainDCEnv

# ---------------------------------------------------------------------------
# Checkpoint configuration
# ---------------------------------------------------------------------------
CHECKPOINT_PATH = os.path.join(
    REPO_ROOT,
    'results', 'sustaindc', 'ca', 'happo', 'happo',
    'seed-00001-2026-08-15-01-48-24'
)
CONFIG_PATH = os.path.join(CHECKPOINT_PATH, 'config.json')

if not os.path.isfile(CONFIG_PATH):
    raise FileNotFoundError(
        f"config.json not found at: {CONFIG_PATH}\n"
        "Please set CHECKPOINT_PATH to the directory of your trained model."
    )

#%%
# Read the config file
with open(CONFIG_PATH, 'r') as f:
    config = json.load(f)

env_args  = config.get('env_args',  config)
algo_args = config.get('algo_args', {})

# ---------------------------------------------------------------------------
# Create the environment
# HARLSustainDCEnv API:
#   reset() -> (obs_list, s_obs_list, avail_actions_list)
#   step(flat_actions_array) -> (obs, s_obs, rewards, dones, info, avail_actions)
#   obs is a list indexed by agent position (not a dict)
# ---------------------------------------------------------------------------
env = SustainDCEnv(env_args)

#%%
# ---------------------------------------------------------------------------
# Load trained HAPPO actors - one per agent
# ---------------------------------------------------------------------------
agents     = list(env.agents)   # list of agent names in order
num_agents = env.n_agents

model_args    = algo_args.get('model', {})
algo_only     = algo_args.get('algo',  {})
combined_args = {**model_args, **algo_only}

obs_space = env.observation_space   # list of spaces, one per agent
act_space = env.action_space        # list of spaces, one per agent

actors = []
for agent_id in range(num_agents):
    model_file = os.path.join(
        CHECKPOINT_PATH, 'models',
        f'actor_agent{agent_id}.pt'
    )
    if not os.path.isfile(model_file):
        raise FileNotFoundError(
            f"Actor checkpoint not found: {model_file}\n"
            "Ensure your trained model checkpoints are inside "
            f"{CHECKPOINT_PATH}/models/"
        )

    actor = HAPPO(
        combined_args,
        obs_space[agent_id],
        act_space[agent_id],
        device=DEVICE,
    )
    checkpoint = torch.load(model_file, map_location=DEVICE)
    # HAPPO.actor is the inner StochasticPolicy nn.Module
    state_dict = checkpoint.get('model_state_dict', checkpoint)
    actor.actor.load_state_dict(state_dict)
    actor.prep_rollout()  # calls actor.actor.eval()
    actors.append(actor)
    print(f"[Loaded] {agents[agent_id]} (agent{agent_id}) from {model_file}")

#%%
# ---------------------------------------------------------------------------
# Evaluation loop
# ---------------------------------------------------------------------------
obs_list, _s_obs, _avail = env.reset()
done        = False
total_reward = 0.0
step        = 0

# RNN states and masks (zeros - MLP policy ignores RNN states)
# Shape per agent: (1, 1, hidden_size)
rnn_hidden = combined_args.get("hidden_size", 64)
rnn_states = [np.zeros((1, 1, rnn_hidden), dtype=np.float32) for _ in range(num_agents)]
masks      = [np.ones((1, 1), dtype=np.float32)              for _ in range(num_agents)]

print("\n[Eval] Starting evaluation episode...")

while not done:
    action_list = []
    for agent_id in range(num_agents):
        actor = actors[agent_id]

        obs_np      = np.array(obs_list[agent_id], dtype=np.float32)
        obs_tensor  = torch.tensor(obs_np).unsqueeze(0).to(DEVICE)
        rnn_tensor  = torch.tensor(rnn_states[agent_id]).to(DEVICE)
        mask_tensor = torch.tensor(masks[agent_id]).to(DEVICE)

        with torch.no_grad():
            action, _log_prob, new_rnn = actor.get_actions(
                obs_tensor, rnn_tensor, mask_tensor, deterministic=True
            )

        rnn_states[agent_id] = new_rnn.cpu().numpy()
        action_list.append(action.squeeze(0).cpu().numpy())

    # step() expects a flat numpy array of all agent actions
    flat_actions = np.array(action_list).flatten()
    obs_list, _s_obs, rewards, dones, info, _avail = env.step(flat_actions)

    # rewards is [[r0], [r1], [r2]] - one entry per agent
    step_reward   = sum(r[0] for r in rewards) / num_agents
    total_reward += step_reward
    step         += 1

    # dones is a list of booleans
    done = any(dones)

print(f"\n[Eval] Episode finished in {step} steps.")
print(f"[Eval] Total reward: {total_reward:.4f}")
