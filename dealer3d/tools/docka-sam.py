"""Reads a dealer's body off still pictures in the bank's frame with SAM 3D Body: the 127 joints of its skeleton (with
names and parents, fingers and the head's joints among them), its 70 key points and its surface, for a doll with her
measures (dealer3d/src/doll.ts; dealer3d/tools/docka-mat.ts turns this into numbers).

Written 2026-11-21 for the doll "paow" on the way dealer3d/tools/prov-sam.py reads a film: the body model only, with the
person's box and the table's lens given (src/table-lens.ts TABLE_LENS: focal 2334 px, centre in the middle), so that
every joint is in the bank's camera frame. The way to the skeleton's names and parents (MHR's own model file,
get_joint_names and character_torch.skeleton.joint_parents) is the one Jakob's project ultimate-reality uses in
tools/mhr_seated_rig.py; it is written anew here, nothing is imported from there. It runs in the Python environment of the
local checkout C:/Users/jakem/dev/sam-3d-body, which it only reads.

  <sam-3d-body>/.venv/Scripts/python.exe -I -B dealer3d/tools/docka-sam.py <out folder> <picture.png> [<picture.png> ...]
      [--box 470,20,1300,1060] [--focal 2334] [--min-free 2600]

Under the shared lock for the graphics card (docs/DRIFT.md); about a minute. Writes into the out folder:
  <folder>-<stem>.npz   verts (18439 x 3), keypoints (70 x 3), pixels (70 x 2), joints (127 x 3), metres in the camera's frame
                (x right, y down, z into the picture), and the model's own numbers (shape, scale, hand, body pose)
  <folder>-<stem>.verts.f32   the same vertices as little-endian float32, for the measuring tool
  faces.npy, faces.u32        the surface's triangles
  sam.json      per picture: its file and SHA-256, the 70 key points and 127 joints in that frame, their names, the
                skeleton's parents, the lens, the box, and how far the joints fall from their own pixels
"""
import os, sys, json, time, hashlib, subprocess
from pathlib import Path

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
SAM = Path(os.environ.get('SAM_3D_BODY', r'C:\Users\jakem\dev\sam-3d-body'))
sys.path.insert(0, str(SAM))


def arg(name, fallback):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else fallback


plain = [a for i, a in enumerate(sys.argv[1:], 1) if not a.startswith('--') and not sys.argv[i - 1].startswith('--')]
out, pictures = Path(plain[0]), [Path(p) for p in plain[1:]]
if not pictures:
    sys.exit(__doc__)
box = [float(n) for n in arg('--box', '470,20,1300,1060').split(',')]
focal, min_free = float(arg('--focal', '2334')), int(arg('--min-free', '2600'))
out.mkdir(parents=True, exist_ok=True)

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
mhr_file = checkpoint / 'assets' / 'mhr_model.pt'


class OnProcessor(torch.nn.Module):
    """The body model kept in ordinary memory and asked from the card's side, as in prov-sam.py: the same numbers, 2 GB on the card instead of 3.4."""

    def __init__(self, inner):
        super().__init__()
        self.__dict__['inner'] = inner

    def forward(self, *inputs):
        device = inputs[0].device
        result = self.__dict__['inner'](*[x.detach().to('cpu', torch.float32) for x in inputs])
        return tuple(o.to(device) for o in result)


available = torch.cuda.is_available
torch.cuda.is_available = lambda: False
try:
    model, cfg = load_sam_3d_body(checkpoint_path=str(checkpoint / 'model.ckpt'), device='cpu', mhr_path=str(mhr_file))
finally:
    torch.cuda.is_available = available
mhr = model.head_pose.mhr
body = OnProcessor(mhr)
model.head_pose.mhr = body
model.head_pose_hand.mhr = body
model = model.to('cuda').eval()
estimator = SAM3DBodyEstimator(model, cfg)
loaded = time.time() - began
print(f'LOADED {loaded:.1f}s, {torch.cuda.memory_allocated() / 2**20:.0f} MiB on the card', flush=True)

# The skeleton's names and parents, from MHR's own model file (the module SAM loaded from it).
names127 = [str(n) for n in mhr.get_joint_names()]
parents127 = [int(p) for p in mhr.character_torch.skeleton.joint_parents.numpy()]

width = height = None
read = []
for picture in pictures:
    bgr = cv2.imread(str(picture), cv2.IMREAD_COLOR)
    if bgr is None:
        sys.exit(f'Could not read {picture}.')
    h, w = bgr.shape[:2]
    if (w, h) != (1764, 1174):
        sys.exit(f'{picture} is {w} x {h}; the bank\'s frame is 1764 x 1174.')
    cx, cy = (w - 1) / 2, (h - 1) / 2
    K = torch.tensor([[[focal, 0, cx], [0, focal, cy], [0, 0, 1]]], dtype=torch.float32)
    tic = time.time()
    people = estimator.process_one_image(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB), bboxes=np.array([box], dtype=np.float32), cam_int=K)
    if len(people) != 1:
        raise RuntimeError(f'{picture}: expected one person, got {len(people)}')
    p = people[0]
    took = time.time() - tic
    t = np.asarray(p['pred_cam_t'], dtype=np.float32)
    verts = np.asarray(p['pred_vertices'], dtype=np.float32) + t
    keypoints = np.asarray(p['pred_keypoints_3d'], dtype=np.float32) + t
    joints = np.asarray(p['pred_joint_coords'], dtype=np.float32) + t
    pixels = np.asarray(p['pred_keypoints_2d'], dtype=np.float32)[:, :2]
    np.savez(out / f'{picture.parent.name}-{picture.stem}.npz', verts=verts, keypoints=keypoints, pixels=pixels, joints=joints, cam_t=t,
             shape=np.asarray(p['shape_params']), scale=np.asarray(p['scale_params']), hand=np.asarray(p['hand_pose_params']),
             body_pose=np.asarray(p['body_pose_params']), global_rot=np.asarray(p['global_rot']), mhr_model_params=np.asarray(p['mhr_model_params']))
    verts.astype('<f4').tofile(out / f'{picture.parent.name}-{picture.stem}.verts.f32')
    seen = np.stack([focal * keypoints[:, 0] / keypoints[:, 2] + cx, focal * keypoints[:, 1] / keypoints[:, 2] + cy], axis=-1)
    read.append({'picture': str(picture).replace('\\', '/'), 'sha256': hashlib.sha256(picture.read_bytes()).hexdigest(), 'seconds': round(took, 2),
                 'keypoints': np.round(keypoints, 5).tolist(), 'pixels': np.round(pixels, 2).tolist(), 'joints': np.round(joints, 5).tolist(),
                 'reprojectionMaxPx': round(float(np.abs(seen - pixels).max()), 3)})
    print(f'READ {picture.name} {took:.2f}s', flush=True)

np.save(out / 'faces.npy', np.asarray(estimator.faces, dtype=np.uint32))
np.asarray(estimator.faces, dtype='<u4').tofile(out / 'faces.u32')
(out / 'sam.json').write_text(json.dumps({
    'model': 'sam-3d-body-dinov3, body model only, given box and lens', 'box': box, 'lens': {'focalPx': focal, 'cx': (1764 - 1) / 2, 'cy': (1174 - 1) / 2},
    'frame': 'metres, the bank camera\'s frame: x right, y down, z into the picture', 'keypointNames': mhr_names, 'jointNames': names127, 'jointParents': parents127,
    'vertices': int(verts.shape[0]), 'pictures': read, 'loadSeconds': round(loaded, 1), 'wallSeconds': round(time.time() - began, 1),
    'peakMiB': round(torch.cuda.max_memory_allocated() / 2**20), 'freeBeforeMiB': free, 'device': torch.cuda.get_device_name(0)}), encoding='utf8')
print(f'COMPLETE {len(read)} pictures, load {loaded:.1f}s, wall {time.time() - began:.1f}s', flush=True)
