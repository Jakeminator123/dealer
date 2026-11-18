"""Körare för MuseTalk 1.5 (version 0.2): ritar munnen efter ljudet på ett klipps rutor.

Tre steg; de två första som MuseTalks realtidsväg (scripts/realtime_inference.py):
  forbered  per klipp och inställning för rutan: landmärken, ansiktsruta, latenter, mask. Sparas och återanvänds.
  rita      per replik: ljudets drag (Whisper), UNet + VAE per ruta, utjämning mot grannrutorna, inklistring, kodning.
`rita` förbereder själv om förberedelsen saknas.
  tjanst    samma arbete som en tjänst med modellerna laddade och munnen inlagd som Jakob valde den (tjanst.py).

  python korare.py rita --klipp K.mp4 --ljud tts.mp3 --plan "0..23,23..0" --ljud-start 5280 \
      --bbox_shift 0 --smooth 0.3 --batch 16 --ut /arbete/ut/namn/film.mp4
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time

import cv2
import numpy as np
import torch

MUSETALK_DIR = os.environ.get("MUSETALK_DIR", "/opt/MuseTalk")
MODELLER = os.environ.get("MODELLER", "/modeller")
sys.path.insert(0, MUSETALK_DIR)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ansikte  # noqa: E402

VERSION = "0.2"
PCM_RATE = 24000
VIKTER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vikter.json")


def sha256(path, limit=None):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(1 << 22)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def musetalk_commit():
    try:
        return open(os.path.join(MUSETALK_DIR, "COMMIT")).read().strip()
    except OSError:
        return None


def check_weights(full_hash=False):
    lock = json.load(open(VIKTER))
    out = []
    for w in lock:
        p = os.path.join(MODELLER, w["file"])
        if not os.path.isfile(p) or os.path.getsize(p) != w["bytes"]:
            raise SystemExit(f"Vikten saknas eller har fel storlek: {p} (väntat {w['bytes']} byte)")
        entry = {"file": w["file"], "sha256": w["sha256"], "url": w["url"], "license": w.get("license")}
        if full_hash:
            got = sha256(p)
            if got != w["sha256"]:
                raise SystemExit(f"Fel SHA-256 för {p}: {got}")
            entry["verified"] = "sha256"
        else:
            entry["verified"] = "bytes"
        out.append(entry)
    return out


# ---------------------------------------------------------------- video och ljud

KR, KB = 0.2126, 0.0722  # BT.709, begränsat omfång (klippets märkning: bt709, tv)


def yuv_to_bgr(y, u, v):
    """En ruta yuv420p (BT.709, tv) till BGR uint8; färgplanen förstoras 2 × 2."""
    ey = (y.astype(np.float32) - 16) / 219
    pb = (np.repeat(np.repeat(u, 2, 0), 2, 1).astype(np.float32) - 128) / 224
    pr = (np.repeat(np.repeat(v, 2, 0), 2, 1).astype(np.float32) - 128) / 224
    r = ey + 2 * (1 - KR) * pr
    b = ey + 2 * (1 - KB) * pb
    g = (ey - KR * r - KB * b) / (1 - KR - KB)
    return np.clip(np.round(np.stack([b, g, r], -1) * 255), 0, 255).astype(np.uint8)


def bgr_to_yuv(bgr):
    """BGR (jämna mått) till Y i full upplösning och U, V som medel över 2 × 2, BT.709 tv, som flyttal."""
    f = bgr.astype(np.float32) / 255
    b, g, r = f[..., 0], f[..., 1], f[..., 2]
    ey = KR * r + (1 - KR - KB) * g + KB * b
    y = 16 + 219 * ey
    u = 128 + 224 * (b - ey) / (2 * (1 - KB))
    v = 128 + 224 * (r - ey) / (2 * (1 - KR))
    pool = lambda p: p.reshape(p.shape[0] // 2, 2, p.shape[1] // 2, 2).mean(axis=(1, 3))
    return y, pool(u), pool(v)


def read_frames(path):
    """Klippets rutor som yuv420p-plan (oförändrade, som avkodaren ger dem) och som BGR (BT.709 tv, egen omräkning,
    samma som används tillbaka, så att en oförändrad bildpunkt går fram och tillbaka utan att ändras)."""
    pr = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                             "stream=width,height,r_frame_rate,pix_fmt", "-of", "json", path]))["streams"][0]
    w, h = pr["width"], pr["height"]
    if pr.get("pix_fmt") != "yuv420p" or w % 2 or h % 2:
        raise SystemExit(f"Klippet måste vara yuv420p med jämna mått (är {pr.get('pix_fmt')} {w}×{h}).")
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "yuv420p", "-"])
    size = w * h * 3 // 2
    yuv, bgr = [], []
    for k in range(len(raw) // size):
        a = np.frombuffer(raw, np.uint8, size, k * size)
        y = a[: w * h].reshape(h, w)
        u = a[w * h: w * h * 5 // 4].reshape(h // 2, w // 2)
        v = a[w * h * 5 // 4:].reshape(h // 2, w // 2)
        yuv.append((y, u, v))
        bgr.append(yuv_to_bgr(y, u, v))
    return bgr, yuv, pr["r_frame_rate"]


def put_back(src_yuv, src_bgr, out_bgr, box):
    """Klippets egna yuv-plan, där bara de bildpunkter som inklistringen ändrat (inom box) räknas om ur BGR.
    Ett färgvärde (2 × 2 bildpunkter) byts om någon av dess fyra bildpunkter ändrats."""
    y0, u0, v0 = src_yuv
    x1, y1, x2, y2 = box
    x1, y1 = max(0, x1 - x1 % 2), max(0, y1 - y1 % 2)
    x2, y2 = min(y0.shape[1], x2 + x2 % 2), min(y0.shape[0], y2 + y2 % 2)
    a, b = out_bgr[y1:y2, x1:x2], src_bgr[y1:y2, x1:x2]
    changed = np.any(a != b, axis=2)
    if not changed.any():
        return y0, u0, v0
    yy, uu, vv = bgr_to_yuv(a)
    Y, U, V = y0.copy(), u0.copy(), v0.copy()
    sub = Y[y1:y2, x1:x2]
    sub[changed] = np.clip(np.round(yy[changed]), 16, 235).astype(np.uint8)
    cc = changed.reshape(changed.shape[0] // 2, 2, changed.shape[1] // 2, 2).any(axis=(1, 3))
    us, vs = U[y1 // 2:y2 // 2, x1 // 2:x2 // 2], V[y1 // 2:y2 // 2, x1 // 2:x2 // 2]
    us[cc] = np.clip(np.round(uu[cc]), 16, 240).astype(np.uint8)
    vs[cc] = np.clip(np.round(vv[cc]), 16, 240).astype(np.uint8)
    return Y, U, V


def speech_pcm(path, trim=True):
    """Repliken som 24 kHz mono 16 bit. trim: tystnaden i början och slutet skärs bort (-60 dB), som bankens
    omvandling av repliker gör, så att 'ljudet börjar' betyder att talet börjar."""
    edge = "silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.02"
    af = ["-af", f"{edge},areverse,{edge},areverse"] if trim else []
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", path, *af, "-ac", "1", "-ar", str(PCM_RATE),
                                   "-f", "s16le", "-c:a", "pcm_s16le", "-"])
    return np.frombuffer(raw, np.int16)


def parse_plan(text, n_clip):
    out = []
    for part in text.split(","):
        part = part.strip()
        if ".." in part:
            a, b = [int(v) for v in part.split("..")]
            step = 1 if b >= a else -1
            out += list(range(a, b + step, step))
        else:
            out.append(int(part))
    bad = [f for f in out if f < 0 or f >= n_clip]
    if bad:
        raise SystemExit(f"Planen pekar på rutor som klippet inte har: {bad[:5]} (klippet har {n_clip})")
    return out


# ---------------------------------------------------------------- modellerna

class Models:
    def __init__(self, device, fp16=True, need_whisper=True):
        from musetalk.utils.utils import load_all_model
        t = time.time()
        self.device = device
        self.vae, self.unet, self.pe = load_all_model(
            unet_model_path=os.path.join(MODELLER, "musetalkV15", "unet.pth"),
            vae_type=os.path.join(MODELLER, "sd-vae"),
            unet_config=os.path.join(MODELLER, "musetalkV15", "musetalk.json"),
            device=device)
        dt = torch.float16 if fp16 else torch.float32
        self.pe = self.pe.to(device=device, dtype=dt)
        self.vae.vae = self.vae.vae.to(device=device, dtype=dt)
        self.unet.model = self.unet.model.to(device=device, dtype=dt)
        self.dtype = dt
        self.timesteps = torch.tensor([0], device=device)
        self.whisper = self.audio = None
        if need_whisper:
            from transformers import WhisperModel
            from musetalk.utils.audio_processor import AudioProcessor
            wdir = os.path.join(MODELLER, "whisper")
            self.audio = AudioProcessor(feature_extractor_path=wdir)
            self.whisper = WhisperModel.from_pretrained(wdir).to(device=device, dtype=dt).eval()
            self.whisper.requires_grad_(False)
        self.load_seconds = time.time() - t


# ---------------------------------------------------------------- steg 1: förberedelse

def prep_key(clip_sha, a):
    return f"{clip_sha[:12]}-bs{a.bbox_shift:+d}-m{a.extra_margin}-c{a.cheek}-g{a.sigma:g}"


def prepare(a, models, frames, clip_sha):
    from musetalk.utils.blending import get_crop_box, get_image_prepare_material
    t0 = time.time()
    lmk = ansikte.Landmarker(os.path.join(MODELLER, "mediapipe", "face_landmarker.task"))
    first = lmk(frames[0])
    if first is None:
        raise SystemExit("Inget ansikte i klippets första ruta.")
    fw = first[:, 0].max() - first[:, 0].min()
    cx, cy = first[:, 0].mean(), first[:, 1].mean()
    window = (cx - 1.5 * fw, cy - 1.5 * fw, cx + 1.5 * fw, cy + 1.5 * fw)
    raw = []
    for i, f in enumerate(frames):
        lm = lmk(f, window)
        if lm is None:
            lm = lmk(f)
        if lm is None:
            raise SystemExit(f"Inget ansikte i klippets ruta {i}.")
        raw.append(lm)
    lmk.det.close()
    raw = np.stack(raw)
    lms = ansikte.smooth_track(raw, a.sigma)
    t_lm = time.time() - t0

    h = frames[0].shape[0]
    bboxes = [ansikte.bbox_from_68(ansikte.landmarks68_subset(lm), a.bbox_shift, a.extra_margin, h) for lm in lms]
    # Hur långt bbox_shift får gå enligt MuseTalks egen utskrift (range_minus/range_plus, i klippets bildpunkter).
    nose = np.stack([ansikte.landmarks68_subset(lm)[28:31, 1] for lm in lms]).astype(np.int32)  # punkt 28, 29, 30
    rng = [-int(np.mean(nose[:, 2] - nose[:, 1])), int(np.mean(nose[:, 1] - nose[:, 0]))]

    t1 = time.time()
    torch.manual_seed(a.seed)
    latents = []
    with torch.no_grad():
        for f, (x1, y1, x2, y2) in zip(frames, bboxes):
            crop = cv2.resize(f[y1:y2, x1:x2], (256, 256), interpolation=cv2.INTER_LANCZOS4)
            latents.append(models.vae.get_latents_for_unet(crop).cpu())
    if models.device.type == "cuda":
        torch.cuda.synchronize()
    t_lat = time.time() - t1

    t2 = time.time()
    parser = ansikte.JawParsing(a.cheek, a.cheek)
    masks, crop_boxes = [], []
    for f, bb, lm in zip(frames, bboxes, lms):
        cb, _ = get_crop_box(bb, 1.5)
        parser.set_frame(lm, cb)
        m, cb2 = get_image_prepare_material(f, bb, fp=parser, mode="jaw")
        assert list(cb2) == list(cb)
        masks.append(m)
        crop_boxes.append([int(v) for v in cb])
    t_mask = time.time() - t2

    d = os.path.join(a.prep_dir, prep_key(clip_sha, a))
    os.makedirs(d, exist_ok=True)
    torch.save(latents, os.path.join(d, "latents.pt"))
    np.savez_compressed(os.path.join(d, "ansikte.npz"), landmarks_raw=raw, landmarks=lms,
                        bboxes=np.array(bboxes), crop_boxes=np.array(crop_boxes),
                        **{f"mask_{i}": m for i, m in enumerate(masks)})
    # En bild att se förberedelsen på: ruta 0 med ansiktsrutan (grön), utsnittet (blått) och masken (rött).
    x_s, y_s, x_e, y_e = crop_boxes[0]
    pv = frames[0].copy()
    sub = pv[y_s:y_e, x_s:x_e].astype(np.float32)
    mm = masks[0][: sub.shape[0], : sub.shape[1]].astype(np.float32)[..., None] / 255
    sub = sub * (1 - 0.45 * mm) + np.array([0, 0, 255], np.float32) * 0.45 * mm
    pv[y_s:y_e, x_s:x_e] = sub.astype(np.uint8)
    x1, y1, x2, y2 = bboxes[0]
    cv2.rectangle(pv, (x1, y1), (x2, y2), (0, 255, 0), 1)
    cv2.rectangle(pv, (x_s, y_s), (x_e, y_e), (255, 0, 0), 1)
    pad = 40
    cv2.imwrite(os.path.join(d, "forberedelse-ruta0.png"),
                cv2.resize(pv[max(0, y_s - pad):y_e + pad, max(0, x_s - pad):x_e + pad], None, fx=2, fy=2,
                           interpolation=cv2.INTER_NEAREST))
    info = {"korare": VERSION, "clip": a.klipp, "clipSha256": clip_sha, "frames": len(frames),
            "size": [frames[0].shape[1], frames[0].shape[0]],
            "bbox_shift": a.bbox_shift, "bboxShiftUnit": "klippets bildpunkter (mitten flyttas så mycket; överkanten dubbelt)",
            "bboxShiftRangeMuseTalk": rng, "extra_margin": a.extra_margin, "cheek": a.cheek, "sigma": a.sigma,
            "seed": a.seed, "landmarks": "MediaPipe Face Landmarker (face_landmarker.task) per ruta, i ett fönster kring ansiktet",
            "mask": "jaw-läget ur landmärken (JawParsing), MuseTalks efterbehandling",
            "bboxFrame0": bboxes[0], "bboxSizeMean": [float(np.mean([b[2] - b[0] for b in bboxes])),
                                                    float(np.mean([b[3] - b[1] for b in bboxes]))],
            "musetalkCommit": musetalk_commit(),
            "seconds": {"landmarks": round(t_lm, 2), "latents": round(t_lat, 2), "masks": round(t_mask, 2),
                        "total": round(time.time() - t0, 2)}}
    json.dump(info, open(os.path.join(d, "info.json"), "w"), indent=2, ensure_ascii=False)
    print(f"förberett {d}: {len(frames)} rutor på {info['seconds']['total']} s, ruta 0 {bboxes[0]}, "
          f"bbox_shift-intervall enligt MuseTalk {rng}")
    return d, info


def load_prep(d):
    z = np.load(os.path.join(d, "ansikte.npz"))
    n = len(z["bboxes"])
    return {"latents": torch.load(os.path.join(d, "latents.pt")),
            "bboxes": [list(map(int, b)) for b in z["bboxes"]],
            "crop_boxes": [list(map(int, b)) for b in z["crop_boxes"]],
            "masks": [z[f"mask_{i}"] for i in range(n)],
            "info": json.load(open(os.path.join(d, "info.json")))}


# ---------------------------------------------------------------- steg 2: ritande

def smooth_faces(faces, s):
    """Varje ritad ruta blandas med medlet av sina grannar i filmens ordning: (1-s)·egen + s·(föregående+nästa)/2.
    Vid filmens ändar står rutan själv i grannens ställe."""
    if s <= 0 or len(faces) < 2:
        return faces
    f = [x.astype(np.float32) for x in faces]
    n = len(f)
    out = []
    for k in range(n):
        prev, nxt = f[max(k - 1, 0)], f[min(k + 1, n - 1)]
        out.append(np.clip(np.round((1 - s) * f[k] + s * 0.5 * (prev + nxt)), 0, 255).astype(np.uint8))
    return out


def render(a):
    from musetalk.utils.blending import get_image_blending
    t_start = time.time()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    weights = check_weights(a.verifiera)
    t_read = time.time()
    frames, yuvs, rate = read_frames(a.klipp)
    t_read = time.time() - t_read
    clip_sha = sha256(a.klipp)
    plan = parse_plan(a.plan, len(frames))
    models = Models(device, fp16=not a.fp32)

    d = os.path.join(a.prep_dir, prep_key(clip_sha, a))
    prep_seconds, reused = None, os.path.isfile(os.path.join(d, "info.json")) and not a.ny_forberedelse
    if not reused:
        d, info = prepare(a, models, frames, clip_sha)
        prep_seconds = info["seconds"]
    P = load_prep(d)

    # Ljudspåret: tyst fram till ljud-start, sedan repliken, tyst till filmens slut.
    n = len(plan)
    spf = PCM_RATE // a.fps
    said = speech_pcm(a.ljud, trim=not a.ingen_trim)
    track = np.zeros(n * spf, np.int16)
    keep = max(0, min(len(said), len(track) - a.ljud_start))
    track[a.ljud_start:a.ljud_start + keep] = said[:keep]
    tmp = tempfile.mkdtemp(prefix="korare-")
    wav = os.path.join(tmp, "spar.wav")
    import soundfile as sf
    sf.write(wav, track, PCM_RATE, subtype="PCM_16")

    sync = (lambda: torch.cuda.synchronize()) if device.type == "cuda" else (lambda: None)

    def features():
        with torch.no_grad():
            feats, length = models.audio.get_audio_feature(wav, weight_dtype=models.dtype)
            return models.audio.get_whisper_chunk(feats, device, models.dtype, models.whisper, length, fps=a.fps,
                                                  audio_padding_length_left=2, audio_padding_length_right=2)

    def draw(chunks):
        faces = []
        with torch.no_grad():
            for s in range(0, n, a.batch):
                idx = plan[s:s + a.batch]
                wb = models.pe(chunks[s:s + a.batch].to(device))
                lb = torch.cat([P["latents"][f] for f in idx], dim=0).to(device=device, dtype=models.dtype)
                pred = models.unet.model(lb, models.timesteps, encoder_hidden_states=wb).sample
                faces += list(models.vae.decode_latents(pred.to(dtype=models.vae.vae.dtype)))
        return faces

    # Första varvet är kallt (CUDA-kärnor laddas, minnet tas); det andra mäts som ett varmt arbetare skulle gå.
    timing = {}
    for lap in ("cold", "warm"):
        sync(); t0 = time.time()
        chunks = features()
        sync(); t_audio = time.time() - t0
        if len(chunks) < n:
            raise SystemExit(f"Ljudet gav {len(chunks)} rutor men planen har {n}.")
        chunks = chunks[:n]
        t1 = time.time()
        faces = draw(chunks)
        sync(); t_draw = time.time() - t1
        timing[lap] = {"audioFeatures": round(t_audio, 3), "unetVae": round(t_draw, 3)}
        if a.bara_ett_varv:
            break

    t2 = time.time()
    faces = smooth_faces(faces, a.smooth)
    out_yuv = []
    for k, f in enumerate(plan):
        x1, y1, x2, y2 = P["bboxes"][f]
        xs, ys, xe, ye = P["crop_boxes"][f]
        face = cv2.resize(faces[k], (x2 - x1, y2 - y1))
        H, W = frames[f].shape[:2]
        if xs >= 0 and ys >= 0 and xe <= W and ye <= H:
            # MuseTalks inklistring i ett utsnitt kring crop_box (samma resultat som på hela rutan, snabbare).
            win = frames[f][ys:ye, xs:xe]
            comp = get_image_blending(win, face, [x1 - xs, y1 - ys, x2 - xs, y2 - ys], P["masks"][f], [0, 0, xe - xs, ye - ys])
            full = frames[f].copy()
            full[ys:ye, xs:xe] = comp
        else:
            full = get_image_blending(frames[f], face, [x1, y1, x2, y2], P["masks"][f], P["crop_boxes"][f])
        out_yuv.append(put_back(yuvs[f], frames[f], full, [max(0, xs), max(0, ys), min(W, xe), min(H, ye)]))
    t_comp = time.time() - t2

    t3 = time.time()
    os.makedirs(os.path.dirname(os.path.abspath(a.ut)), exist_ok=True)
    h, w = frames[0].shape[:2]
    pcm = os.path.join(tmp, "spar.pcm")
    track.tofile(pcm)
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", f"{w}x{h}", "-r", str(a.fps),
           "-i", "-", "-f", "s16le", "-ar", str(PCM_RATE), "-ac", "1", "-i", pcm, "-map", "0:v:0", "-map", "1:a:0",
           "-c:v", "libx264", "-preset", "slow", "-crf", str(a.crf), "-pix_fmt", "yuv420p",
           "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
           "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-movflags", "+faststart", a.ut]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for Y, U, V in out_yuv:
        p.stdin.write(Y.tobytes() + U.tobytes() + V.tobytes())
    p.stdin.close()
    if p.wait() != 0:
        raise SystemExit("ffmpeg kunde inte koda filmen.")
    t_enc = time.time() - t3

    gpu = torch.cuda.get_device_name(0) if device.type == "cuda" else None
    rec = {"korare": VERSION, "output": {"path": os.path.basename(a.ut), "frames": n, "fps": a.fps, "width": w,
                                          "height": h, "pixFmt": "yuv420p", "crf": a.crf, "colour": "bt709 tv"},
           "settings": {"bbox_shift": a.bbox_shift, "smooth": a.smooth, "batch": a.batch,
                        "extra_margin": a.extra_margin, "cheek": a.cheek, "sigma": a.sigma, "seed": a.seed,
                        "precision": "fp32" if a.fp32 else "fp16", "parsingMode": "jaw (ur landmärken)",
                        "audioPadding": [2, 2]},
           "input": {"clip": a.klipp, "clipSha256": clip_sha, "clipFrames": len(frames), "clipRate": rate,
                     "plan": plan, "audio": a.ljud, "audioSha256": sha256(a.ljud), "trimmed": not a.ingen_trim,
                     "speechSamples24k": int(len(said)), "speechStartsAtSamples24k": a.ljud_start,
                     "speechStartsAtSeconds": a.ljud_start / PCM_RATE, "speechCutSamples": int(len(said) - keep)},
           "prep": {"dir": d, "reused": reused, "info": P["info"]},
           "musetalkCommit": musetalk_commit(), "weights": weights,
           "seconds": {"readClip": round(t_read, 2), "modelLoad": round(models.load_seconds, 2), "prep": prep_seconds,
                       "cold": timing["cold"], "warm": timing.get("warm"),
                       "smoothAndCompose": round(t_comp, 3), "encode": round(t_enc, 3),
                       "total": round(time.time() - t_start, 2)},
           "framesPerSecond": {lap: {"unetVae": round(n / t["unetVae"], 1),
                                     "withAudioAndCompose": round(n / (t["audioFeatures"] + t["unetVae"] + t_comp), 1)}
                               for lap, t in timing.items()},
           "gpu": gpu, "torch": torch.__version__, "cuda": torch.version.cuda}
    jp = os.path.splitext(a.ut)[0] + ".json"
    json.dump(rec, open(jp, "w"), indent=2, ensure_ascii=False)
    print(f"klar: {a.ut} ({n} rutor). Rutor/s: {json.dumps(rec['framesPerSecond'])}; totalt {rec['seconds']['total']} s")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="steg", required=True)
    for name in ("forbered", "rita"):
        s = sub.add_parser(name)
        s.add_argument("--klipp", required=True)
        s.add_argument("--bbox_shift", type=int, default=0)
        s.add_argument("--extra_margin", type=int, default=10)
        s.add_argument("--cheek", type=int, default=90, help="kindbredd i jaw-masken (MuseTalks left/right_cheek_width)")
        s.add_argument("--sigma", type=float, default=1.5, help="utjämning av landmärkena längs rutorna, i rutor (0 = av)")
        s.add_argument("--seed", type=int, default=0)
        s.add_argument("--prep-dir", dest="prep_dir", default="/arbete/prep")
        s.add_argument("--fp32", action="store_true")
        if name == "rita":
            s.add_argument("--ljud", required=True)
            s.add_argument("--plan", required=True, help='klippets rutor i filmens ordning, t.ex. "0..23,23..0"')
            s.add_argument("--ljud-start", dest="ljud_start", type=int, default=5280,
                           help="samplingar vid 24 000 Hz innan repliken börjar")
            s.add_argument("--ingen-trim", dest="ingen_trim", action="store_true")
            s.add_argument("--smooth", type=float, default=0.0)
            s.add_argument("--batch", type=int, default=16)
            s.add_argument("--fps", type=int, default=24)
            s.add_argument("--crf", type=int, default=10)
            s.add_argument("--ut", required=True)
            s.add_argument("--ny-forberedelse", dest="ny_forberedelse", action="store_true")
            s.add_argument("--bara-ett-varv", dest="bara_ett_varv", action="store_true",
                           help="rita bara en gång (inget varmt mätvarv)")
            s.add_argument("--verifiera", action="store_true", help="räkna SHA-256 på vikterna (tar några sekunder)")
    s = sub.add_parser("tjanst")
    s.add_argument("--port", type=int, default=8791)
    s.add_argument("--prep-dir", dest="prep_dir", default="/arbete/prep")
    s.add_argument("--fp32", action="store_true")
    s.add_argument("--verifiera", action="store_true", help="räkna SHA-256 på vikterna vid start")
    a = ap.parse_args()
    if a.steg == "tjanst":
        import tjanst
        tjanst.serve(sys.modules[__name__], a)
    elif a.steg == "rita":
        render(a)
    else:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        check_weights(False)
        frames, _, _ = read_frames(a.klipp)
        prepare(a, Models(device, need_whisper=False), frames, sha256(a.klipp))


if __name__ == "__main__":
    main()
