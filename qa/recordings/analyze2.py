import subprocess, numpy as np
W,H = 128, 384
def frames(path):
    cmd=["ffmpeg","-v","error","-i",path,"-vf",f"crop=410:1200:400:1280,scale={W}:{H},format=gray","-f","rawvideo","-"]
    raw=subprocess.run(cmd,capture_output=True).stdout
    n=len(raw)//(W*H)
    return np.frombuffer(raw[:n*W*H],dtype=np.uint8).reshape(n,H,W).astype(np.int16)
for path,label in [("hero-flip.mov","HERO FLIP"),("capital-status.mov","CAPITAL"),("press-release.mov","PRESS REL")]:
    f=frames(path); d=np.abs(np.diff(f,axis=0)).mean(axis=(1,2))
    exact = (d==0).sum()                       # pixel-identical consecutive frames: a true freeze
    print(f"\n{label}  {len(d)+1} frames")
    print(f"  pixel-IDENTICAL consecutive frames: {exact} of {len(d)} ({exact/len(d)*100:.0f}%)")
    print("  per-frame change: " + " ".join(f"{v:.2f}" for v in d[:60]))
    run=best=0
    for v in d:
        run = run+1 if v==0 else 0
        best=max(best,run)
    print(f"  longest run of IDENTICAL frames: {best} = {best/60*1000:.0f}ms")
