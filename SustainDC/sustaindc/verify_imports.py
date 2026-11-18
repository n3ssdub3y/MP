import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("=== Import Verification ===")

import torch
print(f"torch {torch.__version__}: OK")

import harl
print("harl: OK")

from harl.algorithms.actors.happo import HAPPO
print("HAPPO: OK")

import gymnasium
print(f"gymnasium {gymnasium.__version__}: OK")

import tensorflow as tf
print(f"tensorflow {tf.__version__}: OK")

import ray
print(f"ray {ray.__version__}: OK")

import numpy
print(f"numpy {numpy.__version__}: OK")

import pandas
print(f"pandas {pandas.__version__}: OK")

import supersuit
print("supersuit: OK")

import pettingzoo
print(f"pettingzoo {pettingzoo.__version__}: OK")

print("\n=== All critical imports PASSED ===")
