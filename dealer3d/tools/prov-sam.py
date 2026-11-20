"""Reads a real deal off a film with SAM 3D Body: one body mesh and 70 joints per frame, in the film camera's own frame.

Part of the test 3d-prov-en-giv-tva-stolar (2026-11-20). Python because SAM 3D Body is; it runs in the Python environment
of Jakob's local checkout (C:/Users/jakem/dev/sam-3d-body/.venv), which it only reads: the model is loaded from there, and
nothing is written there. Only the body model is loaded (no person detector, no lens estimator): the person's box and the
film's lens are given, so every frame is read under the same camera (the table's lens, src/table-lens.ts TABLE_LENS).

  <sam-3d-body>/.venv/Scripts/python.exe -I -B dealer3d/tools/prov-sam.py <film.mp4> <out folder> [--frames 0:97:2]
      [--box 500,30,1380,1174] [--focal 2334] [--min-free 2600] [--overlays 0,16,24,32,40,48,56,66,80,96]

Run it under the shared lock for the graphics card (docs/DRIFT.md), about three minutes at most per run; a second run with
other --frames adds to the same folder. Each frame is kept as frame-NNNN.npz; after every run all frames present are packed:
  verts.f32   frames x vertices x 3, float32, metres, the camera's frame (x right, y down, z into the picture)
  faces.u32   triangles x 3
  sam.json    the frames read, the joints in the same frame and in pixels, the lens, and seconds per frame
"""
import os, sys, json, time, subprocess
from pathlib import Path

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
SAM = Path(os.environ.get('SAM_3D_BODY', r'C:\Users\jakem\dev\sam-3d-body'))
sys.path.insert(0, str(SAM))


def arg(name, fallback):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else fallback


film, out = Path(sys.argv[1]), Path(sys.argv[2])
first, stop, step = (int(n) for n in arg('--frames', '0:97:2').split(':'))
box = [float(n) for n in arg('--box', '500,30,1380,1174').split(',')]
focal, min_free = float(arg('--focal', '2334')), int(arg('--min-free', '2600'))
overlays = {int(n) for n in arg('--overlays', '0,16,24,32,40,48,56,66,80,96').split(',')}
out.mkdir(parents=True, exist_ok=True)

# The card is shared with Jakob's own work: with too little memory free this run would push his into shared memory, so it stops instead of waiting under the lock.
free = int(subprocess.check_output(['nvidia-smi', '--query-gpu=memory.free', '--format=csv,noheader,nounits'], text=True).strip().splitlines()[0])
if free < min_free:
    sys.exit(f'STOPPED: {free} MiB free on the graphics card, {min_free} needed. Nothing was run.')

import numpy as np
import cv2
import torch

torch.set_num_threads(4)
from sam_3d_body import load_sam_3d_body, SAM3DBodyEstimator
from sam_3d_body.metadata.mhr70 import mhr_names

began = time.time()
checkpoint = SAM / 'checkpoints' / 'sam-3d-body-dinov3'


class OnProcessor(torch.nn.Module):
    """The body model (MHR: pose numbers in, vertices and joints out) kept in ordinary memory and asked from the card's side.
    Each of the model's two heads loads its own copy of it, 691 MiB each; the card had about 3 GB free beside Jakob's own
    SAM app when this was written, and the whole model is 3.4 GB. With one copy here, off the card, 2 GB goes on the card.
    The numbers are the same: the same module, the same inputs, in 32-bit floats."""

    def __init__(self, inner):
        super().__init__()
        self.__dict__['inner'] = inner  # not a registered child: model.to('cuda') leaves it where it is

    def forward(self, *inputs):
        device = inputs[0].device
        out = self.__dict__['inner'](*[x.detach().to('cpu', torch.float32) for x in inputs])
        return tuple(o.to(device) for o in out)


available = torch.cuda.is_available
torch.cuda.is_available = lambda: False  # only while the model is built: each head loads MHR straight onto the card otherwise
try:
    model, cfg = load_sam_3d_body(checkpoint_path=str(checkpoint / 'model.ckpt'), device='cpu', mhr_path=str(checkpoint / 'assets' / 'mhr_model.pt'))
finally:
    torch.cuda.is_available = available
body = OnProcessor(model.head_pose.mhr)
model.head_pose.mhr = body
model.head_pose_hand.mhr = body
model = model.to('cuda').eval()
estimator = SAM3DBodyEstimator(model, cfg)
loaded = time.time() - began
print(f'LOADED {loaded:.1f}s, {torch.cuda.memory_allocated() / 2**20:.0f} MiB on the card', flush=True)

cap = cv2.VideoCapture(str(film))
width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
fps, count = cap.get(cv2.CAP_PROP_FPS), int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
cx, cy = (width - 1) / 2, (height - 1) / 2  # the lens's own centre (src/table-lens.ts)
K = torch.tensor([[[focal, 0, cx], [0, focal, cy], [0, 0, 1]]], dtype=torch.float32)
wanted, i, seconds = set(range(first, min(stop, count), step)), 0, []
HAND = [(41, 21), (62, 42)]  # wrist and first finger-tip index of her right and her left hand; each finger is four joints from the tip inward
while True:
    ok, bgr = cap.read()
    if not ok:
        break
    if i in wanted:
        tic = time.time()
        people = estimator.process_one_image(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB), bboxes=np.array([box], dtype=np.float32), cam_int=K)
        if len(people) != 1:
            raise RuntimeError(f'frame {i}: expected one person, got {len(people)}')
        p = people[0]
        took = time.time() - tic
        seconds.append(took)
        t = np.asarray(p['pred_cam_t'], dtype=np.float32)
        np.savez(out / f'frame-{i:04d}.npz', verts=np.asarray(p['pred_vertices'], dtype=np.float32) + t, joints=np.asarray(p['pred_keypoints_3d'], dtype=np.float32) + t,
                 pixels=np.asarray(p['pred_keypoints_2d'], dtype=np.float32), cam_t=t, focal=np.float32(p['focal_length']), seconds=np.float32(took))
        if i in overlays:
            img = bgr.copy()
            for (wrist, tip), colour in zip(HAND, [(230, 180, 30), (40, 190, 250)]):
                px = np.asarray(p['pred_keypoints_2d'])
                for f in range(5):
                    chain = [wrist, tip + f * 4 + 3, tip + f * 4 + 2, tip + f * 4 + 1, tip + f * 4]
                    for a, b in zip(chain, chain[1:]):
                        cv2.line(img, tuple(np.rint(px[a]).astype(int)), tuple(np.rint(px[b]).astype(int)), colour, 2, cv2.LINE_AA)
                    cv2.circle(img, tuple(np.rint(px[tip + f * 4]).astype(int)), 4, (255, 255, 255), -1, cv2.LINE_AA)
            for a, b in [(5, 7), (7, 62), (6, 8), (8, 41), (5, 6)]:
                cv2.line(img, tuple(np.rint(px[a]).astype(int)), tuple(np.rint(px[b]).astype(int)), (255, 255, 255), 2, cv2.LINE_AA)
            cv2.imwrite(str(out / f'overlay-{i:04d}.jpg'), img, [cv2.IMWRITE_JPEG_QUALITY, 92])
        print(f'FRAME {i} {took:.2f}s', flush=True)
    i += 1
cap.release()
np.save(out / 'faces.npy', np.asarray(estimator.faces, dtype=np.uint32))
peak = torch.cuda.max_memory_allocated() / 2**20

# Pack every frame present (this run's and earlier runs').
files = sorted(out.glob('frame-*.npz'))
frames, verts, joints, pixels, per = [], [], [], [], []
for f in files:
    d = np.load(f)
    frames.append(int(f.stem.split('-')[1])); verts.append(d['verts']); joints.append(d['joints']); pixels.append(d['pixels']); per.append(float(d['seconds']))
np.stack(verts).astype('<f4').tofile(out / 'verts.f32')
np.load(out / 'faces.npy').astype('<u4').tofile(out / 'faces.u32')
# How well the joints, seen through the given lens, fall on the pixels the model says: a check of the frame (x right, y down, z in).
J, P = np.stack(joints), np.stack(pixels)
seen = np.stack([focal * J[..., 0] / J[..., 2] + cx, focal * J[..., 1] / J[..., 2] + cy], axis=-1)
miss = float(np.abs(seen - P[..., :2]).max())
runs = json.loads((out / 'runs.json').read_text()) if (out / 'runs.json').exists() else []
runs.append({'frames': [first, stop, step], 'read': len(seconds), 'loadSeconds': round(loaded, 1), 'inferenceSeconds': round(sum(seconds), 1), 'wallSeconds': round(time.time() - began, 1),
             'peakMiB': round(peak), 'freeBeforeMiB': free, 'device': torch.cuda.get_device_name(0)})
(out / 'runs.json').write_text(json.dumps(runs, indent=1))
(out / 'sam.json').write_text(json.dumps({
    'film': str(film).replace('\\', '/'), 'width': width, 'height': height, 'fps': fps, 'frameCount': count, 'frames': frames, 'box': box,
    'lens': {'focalPx': focal, 'cx': cx, 'cy': cy}, 'model': 'sam-3d-body-dinov3, body model only, given box and lens',
    'vertices': int(verts[0].shape[0]), 'triangles': int(np.load(out / 'faces.npy').shape[0]), 'names': mhr_names,
    'joints': np.round(J, 5).tolist(), 'pixels': np.round(P[..., :2], 2).tolist(), 'secondsPerFrame': [round(s, 3) for s in per],
    'reprojectionMaxPx': round(miss, 3), 'runs': runs}), encoding='utf8')
print(f'COMPLETE {len(seconds)} frames this run, {len(files)} in all, load {loaded:.1f}s, inference {sum(seconds):.1f}s, peak {peak:.0f} MiB, joints within {miss:.2f} px of their pixels', flush=True)
