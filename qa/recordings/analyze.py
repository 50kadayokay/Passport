import subprocess, sys, numpy as np
W,H = 128, 384   # downscaled phone-screen region
def frames(path):
    cmd = ["ffmpeg","-v","error","-i",path,
           "-vf",f"crop=410:1200:400:1280,scale={W}:{H},format=gray","-f","rawvideo","-"]
    raw = subprocess.run(cmd, capture_output=True).stdout
    n = len(raw)//(W*H)
    return np.frombuffer(raw[:n*W*H],dtype=np.uint8).reshape(n,H,W).astype(np.int16)
for path,label in [("hero-flip.mov","HERO CARD FLIP"),("capital-status.mov","CAPITAL STATUS"),("press-release.mov","PRESS RELEASE")]:
    f = frames(path)
    d = np.abs(np.diff(f,axis=0)).mean(axis=(1,2))        # per-frame change
    moving = d > 0.30                                      # frames where the screen changed
    if not moving.any(): print(f"{label}: no movement detected"); continue
    s,e = np.argmax(moving), len(moving)-1-np.argmax(moving[::-1])
    seg = d[s:e+1]
    stalled = (seg <= 0.30).sum()                          # frames inside the animation with NO change
    # longest run of stalled frames = the visible hitch
    run=best=0
    for v in seg:
        run = run+1 if v<=0.30 else 0
        best = max(best,run)
    dur = (e-s+1)/60
    print(f"{label:16} animation spans {e-s+1:3d} frames = {dur:4.2f}s | stalled {stalled:3d} ({stalled/len(seg)*100:4.1f}%) | longest freeze {best:2d} frames = {best/60*1000:4.0f}ms | effective {(len(seg)-stalled)/dur:4.1f} fps")
