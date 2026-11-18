"""
generate_plots.py  --  SustainDC results visualiser & updater
"""
import os, sys, json, glob, shutil
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.gridspec import GridSpec

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
PLOT_DIR  = os.path.join(REPO_ROOT, 'results', 'plots')
os.makedirs(PLOT_DIR, exist_ok=True)

ARTIFACT_DIR = r'C:\Users\NESS\.gemini\antigravity-ide\brain\d167f848-18a8-428d-a866-10228ab8c970'

plt.rcParams.update({
    'figure.facecolor': '#0b0f19',
    'axes.facecolor': '#111827',
    'axes.edgecolor': '#374151',
    'axes.labelcolor': '#9ca3af',
    'xtick.color': '#9ca3af',
    'ytick.color': '#9ca3af',
    'text.color': '#f9fafb',
    'grid.color': '#1f2937',
    'grid.alpha': 0.8,
    'font.family': 'DejaVu Sans',
    'font.size': 10.5,
    'axes.titlesize': 13,
    'axes.titleweight': 'bold',
    'figure.dpi': 160,
})

def parse_progress(filepath):
    steps, rewards = [], []
    if not os.path.exists(filepath):
        return np.array([]), np.array([])
    with open(filepath) as f:
        for line in f:
            line = line.strip()
            if not line or 'Saving' in line:
                continue
            try:
                parts = line.split(',')
                steps.append(int(parts[0]))
                rewards.append(float(parts[1]))
            except:
                continue
    return np.array(steps), np.array(rewards)

def smooth(arr, window=3):
    if len(arr) < window:
        return arr
    return np.convolve(arr, np.ones(window)/window, mode='valid')

def get_runs_data():
    """
    Scans results directory and categorizes all unique training & test runs.
    Eliminates glob duplicates and identifies each run explicitly.
    """
    pattern = os.path.join(REPO_ROOT, 'results', 'sustaindc', '**', 'progress.txt')
    unique_files = sorted(list(set(glob.glob(pattern, recursive=True))))
    
    runs = []
    for fp in unique_files:
        steps, rewards = parse_progress(fp)
        if len(steps) == 0:
            continue
            
        norm_p = fp.replace('\\', '/')
        if 'ca/happo/our_happo_run' in norm_p:
            if len(steps) > 10:
                runs.append({
                    'id': 'our_happo',
                    'algo': 'HAPPO',
                    'name': 'HAPPO — Overnight Run (625k Steps, GPU)',
                    'path': fp,
                    'steps': steps,
                    'rewards': rewards,
                    'color': '#a855f7',       # Electric Violet
                    'style': '-',
                    'lw': 2.8,
                    'alpha': 1.0,
                    'marker': None,
                    'category': 'primary'
                })
            else:
                runs.append({
                    'id': 'aborted_happo',
                    'algo': 'HAPPO',
                    'name': 'HAPPO — Aborted Launch (10k Steps)',
                    'path': fp,
                    'steps': steps,
                    'rewards': rewards,
                    'color': '#ec4899',       # Pink / Rose
                    'style': 'none',
                    'lw': 0,
                    'alpha': 0.85,
                    'marker': 'X',
                    'category': 'diagnostic'
                })
        elif 'ca/happo/happo' in norm_p:
            runs.append({
                'id': 'baseline_happo',
                'algo': 'HAPPO',
                'name': 'HAPPO — Initial Baseline (215k Steps)',
                'path': fp,
                'steps': steps,
                'rewards': rewards,
                'color': '#06b6d4',           # Sky Cyan
                'style': '-',
                'lw': 2.2,
                'alpha': 0.95,
                'marker': None,
                'category': 'benchmark'
            })
        elif 'ca/happo/installtest' in norm_p:
            runs.append({
                'id': 'install_test',
                'algo': 'HAPPO',
                'name': 'HAPPO — Sanity / Install Check (200k Steps, Unoptimized)',
                'path': fp,
                'steps': steps,
                'rewards': rewards,
                'color': '#f59e0b',           # Amber
                'style': '--',
                'lw': 1.6,
                'alpha': 0.7,
                'marker': None,
                'category': 'diagnostic'
            })
        elif 'ca/mappo/our_mappo_run' in norm_p:
            runs.append({
                'id': 'mappo',
                'algo': 'MAPPO',
                'name': 'MAPPO — Multi-Agent PPO Baseline (307k Steps)',
                'path': fp,
                'steps': steps,
                'rewards': rewards,
                'color': '#10b981',           # Emerald Green
                'style': '-',
                'lw': 2.4,
                'alpha': 1.0,
                'marker': 'o',
                'category': 'comparison'
            })
    return runs

# ── Plot 1: Training curve ─────────────────────────────────────────────────
def plot_training_curves():
    runs = get_runs_data()
    if not runs:
        print('[Skip] No progress runs found.')
        return

    # 1. Main Unified Plot (All runs clearly identified with distinct colors & labels)
    fig, ax = plt.subplots(figsize=(14, 7), facecolor='#0b0f19')
    ax.set_facecolor('#111827')
    ax.set_title('SustainDC Multi-Agent Training Curves — Cooling & Energy Optimization\n(California Grid, 3-Agent Decentralized Control)', 
                 fontsize=14, fontweight='bold', color='#f9fafb', pad=16)
    ax.set_xlabel('Environment Interaction Steps', fontsize=12, color='#9ca3af', labelpad=10)
    ax.set_ylabel('Average Episode Reward', fontsize=12, color='#9ca3af', labelpad=10)
    ax.grid(True, linestyle='--', color='#1f2937', alpha=0.8)
    ax.axhline(0, color='#6b7280', linestyle=':', linewidth=0.9, alpha=0.7)
    ax.tick_params(colors='#9ca3af', labelsize=10)
    for spine in ax.spines.values():
        spine.set_color('#374151')

    for r in runs:
        steps, rews = r['steps'], r['rewards']
        if r['id'] == 'aborted_happo':
            ax.scatter(steps, rews, color=r['color'], marker='X', s=85, alpha=r['alpha'], zorder=5, label=r['name'])
        elif r['id'] == 'mappo':
            # MAPPO has 5 evaluation points, plot raw line through markers for exact accuracy
            ax.plot(steps, rews, color=r['color'], linewidth=r['lw'], marker='o', markersize=6.5, label=r['name'])
        else:
            # Smoothed curves
            sm_r = smooth(rews, 3 if len(rews) >= 3 else 2)
            sm_s = steps[-len(sm_r):]
            if r['id'] == 'our_happo':
                ax.plot(steps, rews, color='#8b5cf6', alpha=0.18, linewidth=1.1, label='_nolegend_')
            ax.plot(sm_s, sm_r, color=r['color'], linewidth=r['lw'], linestyle=r['style'],
                    alpha=r['alpha'], label=r['name'])

    ax.set_ylim(-920, 720)
    ax.set_xlim(-15000, 650000)

    # Clean Callout Badges
    ax.annotate('MAPPO Peak: +561.6\n(Step 184k)', xy=(184320, 561.6), xytext=(184320, 650),
                arrowprops=dict(arrowstyle='->', color='#10b981', lw=1.5),
                color='#10b981', fontweight='bold', fontsize=9, ha='center',
                bbox=dict(boxstyle='round,pad=0.35', facecolor='#111827', edgecolor='#10b981', alpha=0.9))

    ax.annotate('Baseline Final: +385.6\n(Step 215k)', xy=(215040, 385.6), xytext=(260000, 330),
                arrowprops=dict(arrowstyle='->', color='#06b6d4', lw=1.5),
                color='#06b6d4', fontweight='bold', fontsize=9, ha='center',
                bbox=dict(boxstyle='round,pad=0.35', facecolor='#111827', edgecolor='#06b6d4', alpha=0.9))

    ax.annotate('HAPPO Peak: +475.7\n(Smoothed: +423.4, Step 573k)', xy=(583680, 423.4), xytext=(480000, 560),
                arrowprops=dict(arrowstyle='->', color='#a855f7', lw=1.5),
                color='#a855f7', fontweight='bold', fontsize=9, ha='center',
                bbox=dict(boxstyle='round,pad=0.35', facecolor='#111827', edgecolor='#a855f7', alpha=0.9))

    leg = ax.legend(loc='lower right', framealpha=0.92, facecolor='#0b0f19', edgecolor='#374151', fontsize=9.5)
    for t in leg.get_texts():
        t.set_color('#f3f4f6')

    plt.tight_layout()
    out1 = os.path.join(PLOT_DIR, 'training_curve.png')
    fig.savefig(out1, bbox_inches='tight')
    plt.close()
    print(f'[Saved] {out1}')

    # 2. Publication-grade Clean Comparison (The 3 completed benchmark runs)
    fig, ax = plt.subplots(figsize=(13, 6.5), facecolor='#0b0f19')
    ax.set_facecolor('#111827')
    ax.set_title('Primary MARL Training Curves — HAPPO vs MAPPO Convergence\n(Completed Experimental Benchmark Runs)', 
                 fontsize=13.5, fontweight='bold', color='#f9fafb', pad=15)
    ax.set_xlabel('Environment Interaction Steps', fontsize=11.5, color='#9ca3af', labelpad=9)
    ax.set_ylabel('Average Episode Reward', fontsize=11.5, color='#9ca3af', labelpad=9)
    ax.grid(True, linestyle='--', color='#1f2937', alpha=0.8)
    ax.axhline(0, color='#6b7280', linestyle=':', linewidth=0.9, alpha=0.7)
    ax.tick_params(colors='#9ca3af', labelsize=10)
    for spine in ax.spines.values():
        spine.set_color('#374151')

    for r in runs:
        if r['category'] in ['primary', 'benchmark', 'comparison']:
            steps, rews = r['steps'], r['rewards']
            if r['id'] == 'mappo':
                ax.plot(steps, rews, color=r['color'], linewidth=2.4, marker='o', markersize=6.5, label=r['name'])
            else:
                sm_r = smooth(rews, 3)
                sm_s = steps[-len(sm_r):]
                if r['id'] == 'our_happo':
                    ax.plot(steps, rews, color='#8b5cf6', alpha=0.18, linewidth=1.1, label='_nolegend_')
                ax.plot(sm_s, sm_r, color=r['color'], linewidth=r['lw'], linestyle=r['style'],
                        alpha=r['alpha'], label=r['name'])

    ax.set_ylim(-900, 720)
    ax.set_xlim(-15000, 650000)

    ax.annotate('MAPPO Peak: +561.6\n(Step 184k)', xy=(184320, 561.6), xytext=(184320, 650),
                arrowprops=dict(arrowstyle='->', color='#10b981', lw=1.5),
                color='#10b981', fontweight='bold', fontsize=9, ha='center',
                bbox=dict(boxstyle='round,pad=0.35', facecolor='#111827', edgecolor='#10b981', alpha=0.9))

    ax.annotate('Baseline Final: +385.6\n(Step 215k)', xy=(215040, 385.6), xytext=(260000, 330),
                arrowprops=dict(arrowstyle='->', color='#06b6d4', lw=1.5),
                color='#06b6d4', fontweight='bold', fontsize=9, ha='center',
                bbox=dict(boxstyle='round,pad=0.35', facecolor='#111827', edgecolor='#06b6d4', alpha=0.9))

    ax.annotate('HAPPO Peak: +475.7\n(Smoothed: +423.4, Step 573k)', xy=(583680, 423.4), xytext=(480000, 560),
                arrowprops=dict(arrowstyle='->', color='#a855f7', lw=1.5),
                color='#a855f7', fontweight='bold', fontsize=9, ha='center',
                bbox=dict(boxstyle='round,pad=0.35', facecolor='#111827', edgecolor='#a855f7', alpha=0.9))

    leg = ax.legend(loc='lower right', framealpha=0.92, facecolor='#0b0f19', edgecolor='#374151', fontsize=9.5)
    for t in leg.get_texts():
        t.set_color('#f3f4f6')

    plt.tight_layout()
    out2 = os.path.join(PLOT_DIR, 'training_curve_comparison.png')
    fig.savefig(out2, bbox_inches='tight')
    plt.close()
    print(f'[Saved] {out2}')

    # 3. Two-Panel Diagnostic Figure
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 7), facecolor='#0b0f19', gridspec_kw={'width_ratios': [1.2, 0.8]})
    for ax in (ax1, ax2):
        ax.set_facecolor('#111827')
        ax.grid(True, linestyle='--', color='#1f2937', alpha=0.8)
        ax.axhline(0, color='#6b7280', linestyle=':', linewidth=0.9, alpha=0.7)
        ax.tick_params(colors='#9ca3af', labelsize=10)
        for spine in ax.spines.values():
            spine.set_color('#374151')

    ax1.set_title('(A) Primary Experimental Convergence\n(Completed Training Runs)', 
                  fontsize=12, fontweight='bold', color='#f9fafb', pad=12)
    ax1.set_xlabel('Environment Interaction Steps', fontsize=11, color='#9ca3af', labelpad=8)
    ax1.set_ylabel('Average Episode Reward', fontsize=11, color='#9ca3af', labelpad=8)

    ax2.set_title('(B) Complete Run Inventory & Diagnostics\n(Explaining all 5 folder runs)', 
                  fontsize=12, fontweight='bold', color='#f9fafb', pad=12)
    ax2.set_xlabel('Environment Interaction Steps', fontsize=11, color='#9ca3af', labelpad=8)
    ax2.set_ylabel('Average Episode Reward', fontsize=11, color='#9ca3af', labelpad=8)

    for r in runs:
        steps, rews = r['steps'], r['rewards']
        if r['category'] in ['primary', 'benchmark', 'comparison']:
            if r['id'] == 'mappo':
                ax1.plot(steps, rews, color=r['color'], linewidth=2.2, marker='o', markersize=6, label=r['name'])
            else:
                sm_r = smooth(rews, 3)
                sm_s = steps[-len(sm_r):]
                if r['id'] == 'our_happo':
                    ax1.plot(steps, rews, color='#8b5cf6', alpha=0.15, linewidth=1.0)
                ax1.plot(sm_s, sm_r, color=r['color'], linewidth=r['lw'], label=r['name'])

        if r['id'] == 'aborted_happo':
            ax2.scatter(steps, rews, color=r['color'], marker='X', s=75, zorder=5, label='5. HAPPO Aborted (10k)')
        elif r['id'] == 'mappo':
            ax2.plot(steps, rews, color=r['color'], linewidth=1.8, marker='o', markersize=4.5, label='3. MAPPO Baseline (307k)')
        else:
            sm_r = smooth(rews, 3 if len(rews)>=3 else 2)
            sm_s = steps[-len(sm_r):]
            lbl = ('1. HAPPO Overnight (625k)' if r['id'] == 'our_happo' else 
                   '2. HAPPO Baseline (215k)' if r['id'] == 'baseline_happo' else 
                   '4. HAPPO Install Check (200k)')
            ax2.plot(sm_s, sm_r, color=r['color'], linewidth=r['lw']*0.8, linestyle=r['style'], label=lbl)

    ax1.set_ylim(-900, 720)
    ax2.set_ylim(-900, 720)
    ax1.annotate('MAPPO Peak: +561.6', xy=(184320, 561.6), xytext=(184320, 650),
                 arrowprops=dict(arrowstyle='->', color='#10b981', lw=1.5),
                 color='#10b981', fontweight='bold', fontsize=8.5, ha='center',
                 bbox=dict(boxstyle='round,pad=0.3', facecolor='#111827', edgecolor='#10b981', alpha=0.9))
    ax1.annotate('HAPPO Peak: +475.7', xy=(583680, 423.4), xytext=(480000, 560),
                 arrowprops=dict(arrowstyle='->', color='#a855f7', lw=1.5),
                 color='#a855f7', fontweight='bold', fontsize=8.5, ha='center',
                 bbox=dict(boxstyle='round,pad=0.3', facecolor='#111827', edgecolor='#a855f7', alpha=0.9))

    leg1 = ax1.legend(loc='lower right', framealpha=0.92, facecolor='#0b0f19', edgecolor='#374151', fontsize=9)
    for t in leg1.get_texts(): t.set_color('#f3f4f6')
    leg2 = ax2.legend(loc='lower right', framealpha=0.92, facecolor='#0b0f19', edgecolor='#374151', fontsize=8.5)
    for t in leg2.get_texts(): t.set_color('#f3f4f6')

    fig.suptitle('SustainDC Multi-Agent Training Curves — Centralized vs Decentralized Cooling Control', 
                 fontsize=14, fontweight='bold', color='#ffffff', y=0.98)
    plt.tight_layout()
    out3 = os.path.join(PLOT_DIR, 'training_curve_2panel.png')
    fig.savefig(out3, bbox_inches='tight')
    plt.close()
    print(f'[Saved] {out3}')

# ── Plot 2: Eval behavior ─────────────────────────────────────────────────
def plot_eval_behavior():
    p = os.path.join(PLOT_DIR, 'eval_metrics.json')
    if not os.path.exists(p):
        print('[Skip] eval_metrics.json missing — run evaluate_instrumented.py first.')
        return

    with open(p) as f:
        d = json.load(f)

    N = min(288, len(d['steps']))
    hours = np.array(d['steps'][:N]) * 5 / 60

    arrays = [
        ('Load Shift Action  (agent_ls)  — 1=Defer, 0=Accept', 'actions_ls', '#f59e0b'),
        ('Cooling Action (agent_dc)  — setpoint delta  [FOCUS: Decentralized Isolation]', 'actions_dc', '#38bdf8'),
        ('Battery Action (agent_bat)  — +charge / -discharge',  'actions_bat','#10b981'),
        ('Step Reward (mean across all agents)',                  'step_rewards','#8b5cf6'),
    ]

    fig = plt.figure(figsize=(14, 10), facecolor='#0b0f19')
    fig.suptitle('HAPPO Agent Behaviour — 1-Day Window\n(California Grid, June, 3 Agents)',
                 fontsize=14, fontweight='bold', color='#f9fafb', y=0.99)
    gs = GridSpec(4, 1, figure=fig, hspace=0.5)

    for idx, (title, key, color) in enumerate(arrays):
        arr = np.array(d[key][:N])
        ax  = fig.add_subplot(gs[idx])
        ax.set_facecolor('#111827')
        ax.set_title(title, fontsize=10.5, loc='left', pad=4, color='#e5e7eb', fontweight='semibold')
        ax.fill_between(hours, arr, alpha=0.25, color=color)
        ax.plot(hours, arr, color=color, linewidth=1.3)
        ax.grid(True, linestyle='--', color='#1f2937', alpha=0.6)
        ax.tick_params(colors='#9ca3af', labelsize=9.5)
        for spine in ax.spines.values():
            spine.set_color('#374151')
        if idx < 3:
            ax.tick_params(labelbottom=False)
        else:
            ax.set_xlabel('Hour of Day (0–24)', color='#9ca3af', fontsize=10.5)

    plt.tight_layout()
    out = os.path.join(PLOT_DIR, 'eval_behavior.png')
    fig.savefig(out, bbox_inches='tight')
    print(f'[Saved] {out}')
    plt.close()

# ── Plot 3: Comparison bar ─────────────────────────────────────────────────
def plot_comparison():
    runs = get_runs_data()
    if not runs:
        print('[Skip] No progress runs found.')
        return

    models_data = []
    for r in runs:
        if r['category'] in ['primary', 'benchmark', 'comparison']:
            rews = r['rewards']
            models_data.append({
                'label': ('HAPPO\n(Overnight 625k)' if r['id'] == 'our_happo' else
                          'HAPPO\n(Benchmark 215k)' if r['id'] == 'baseline_happo' else
                          'MAPPO\n(Baseline 300k)'),
                'peak': np.max(rews),
                'final': rews[-1],
                'color': r['color']
            })

    if not models_data:
        print('[Skip] No completed runs for comparison chart.')
        return

    fig, ax = plt.subplots(figsize=(10, 6.2), facecolor='#0b0f19')
    ax.set_facecolor('#111827')
    ax.set_title('Performance Comparison — Peak vs Final Episode Reward\n(agent_dc Cooling Isolation & Multi-Agent Coordination)', 
                 fontsize=13, fontweight='bold', color='#f9fafb', pad=15)
    ax.set_ylabel('Average Episode Reward', fontsize=11, color='#9ca3af', labelpad=10)
    ax.grid(True, linestyle='--', color='#1f2937', alpha=0.8, axis='y')
    ax.axhline(0, color='#6b7280', linestyle=':', linewidth=0.9, alpha=0.7)
    ax.tick_params(colors='#9ca3af', labelsize=10)
    for spine in ax.spines.values():
        spine.set_color('#374151')

    x = np.arange(len(models_data))
    width = 0.35

    peak_rewards  = [m['peak'] for m in models_data]
    final_rewards = [m['final'] for m in models_data]
    labels        = [m['label'] for m in models_data]
    colors        = [m['color'] for m in models_data]

    rects1 = ax.bar(x - width/2, peak_rewards, width, label='Peak Episode Reward (Best Policy)', 
                    color=colors, alpha=0.95, edgecolor='#ffffff', linewidth=0.5)
    rects2 = ax.bar(x + width/2, final_rewards, width, label='Final Episode Reward (Converged Policy)', 
                    color=colors, alpha=0.45, edgecolor='#94a3b8', linewidth=0.5, hatch='//')

    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=11, fontweight='bold', color='#e5e7eb')
    ax.set_ylim(-160, 720)

    for rect in rects1:
        h = rect.get_height()
        ax.annotate(f'+{h:.1f}', xy=(rect.get_x() + rect.get_width()/2, h),
                    xytext=(0, 4), textcoords='offset points', ha='center', va='bottom',
                    color='#f3f4f6', fontweight='bold', fontsize=10)

    for rect in rects2:
        h = rect.get_height()
        y_off = 4 if h >= 0 else -16
        sign = '+' if h >= 0 else ''
        ax.annotate(f'{sign}{h:.1f}', xy=(rect.get_x() + rect.get_width()/2, h),
                    xytext=(0, y_off), textcoords='offset points', ha='center', va='bottom',
                    color='#f3f4f6', fontweight='bold', fontsize=10)

    leg = ax.legend(loc='upper left', framealpha=0.92, facecolor='#0b0f19', edgecolor='#374151', fontsize=9.5)
    for t in leg.get_texts():
        t.set_color('#f3f4f6')

    plt.tight_layout()
    out = os.path.join(PLOT_DIR, 'comparison.png')
    fig.savefig(out, bbox_inches='tight')
    print(f'[Saved] {out}')
    plt.close()

def sync_artifacts():
    if os.path.exists(ARTIFACT_DIR):
        for fname in os.listdir(PLOT_DIR):
            if fname.endswith('.png'):
                src = os.path.join(PLOT_DIR, fname)
                dst = os.path.join(ARTIFACT_DIR, fname)
                try:
                    shutil.copy2(src, dst)
                    print(f'[Synced to Artifact] {dst}')
                except Exception as e:
                    print(f'[Sync Warning] {e}')

if __name__ == '__main__':
    print('=== SustainDC Plotter (Enhanced) ===')
    plot_training_curves()
    plot_eval_behavior()
    plot_comparison()
    sync_artifacts()
    
    # Also overwrite plot_results.py in repository so running it locally produces the same
    target_script = os.path.join(REPO_ROOT, 'plot_results.py')
    with open(__file__, 'r', encoding='utf-8') as src_f:
        code = src_f.read()
    # Adjust REPO_ROOT in code for local execution
    code_for_repo = code.replace("REPO_ROOT = r'D:\\New_folder\\Desktop\\MP\\SustainDC\\sustaindc'", 
                                 "REPO_ROOT = os.path.dirname(os.path.abspath(__file__))")
    with open(target_script, 'w', encoding='utf-8') as dst_f:
        dst_f.write(code_for_repo)
    print(f'[Updated] {target_script}')
    print(f'\nAll plots updated successfully -> {PLOT_DIR}')
