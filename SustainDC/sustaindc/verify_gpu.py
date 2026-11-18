import torch
print("=== PyTorch GPU Verification ===")
print(f"Torch version: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"GPU Name: {torch.cuda.get_device_name(0)}")
    print(f"CUDA version: {torch.version.cuda}")
    x = torch.ones(3, 3).cuda()
    print(f"Tensor on GPU: {x.device}")
    print("GPU compute: OK")
else:
    print("WARNING: CUDA not available - check driver installation")
