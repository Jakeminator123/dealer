"""Tjänsten: köraren med modellerna laddade, och inläggningen (storlek F, bara läpparna) inbyggd.

  python korare.py tjanst --port 8791

En process läser in modellerna en gång, ritar ett varv för att värma grafikkortet, och svarar sedan på:

  GET  /halsa      läget: version, grafikkort, tider för inläsning och uppvärmning, vilka klipp som ligger i minnet
  POST /forbered   {"klipp": sökväg, ...}: läser klippet och dess förberedelse till minnet (förbereder om det behövs)
  POST /rita       {"klipp", "ljud", "plan", ...}: ritar repliken och lägger in munnen; svaret är en rad JSON per
                   händelse medan arbetet pågår (rutor som blivit färdiga, med millisekunder sedan frågan kom), sist en
                   sammanfattning. Med "ut" skrivs filmen (klippets storlek, med ljud) och ett kvitto bredvid.
  POST /stang      stänger tjänsten

Fälten i /rita: klipp, ljud, plan ("0..23,23..0"), ljud_start (samplingar vid 24 kHz, 5280), ingen_trim, smooth (0.3),
batch (16), forsta_batch (som batch), recept (det som ska skilja från den versionerade munprofilen), skift ("hela": läpparnas färgskifte ur alla
rutor, som i proven; annars ur det som är ritat när första rutan med mun ska ut), fonster ([x, y, w, h] i stället för
klippets eget), ut, samt förberedelsens bbox_shift, extra_margin, cheek, sigma, seed.

Två trådar arbetar samtidigt med en replik: en ritar på grafikkortet (UNet och VAE, en batch i taget), en klistrar in
modellens ansikte i klippets ruta (MuseTalks inklistring), lägger munnen (inlaggning.py) och lämnar ut rutorna i
filmens ordning. En ruta lämnas ut när de tre följande är ritade (grinden väljer bytets ruta bland dem) och grannrutan
för utjämningen finns. En replik i taget.
"""
import json
import os
import queue
import subprocess
import tempfile
import threading
import time
import traceback
import types
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np
import torch

import ansikte
import inlaggning as inl
from munprofil import load_profile, resolve_recipe


class Tjanst:
    def __init__(self, K, a):
        from musetalk.utils.blending import get_image_blending
        self.K, self.a, self.blend = K, a, get_image_blending
        self.profile = load_profile()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.weights = K.check_weights(a.verifiera)
        self.models = K.Models(self.device, fp16=not a.fp32)
        self.clips, self.busy, self.tmp, self.started, self.served = {}, threading.Lock(), tempfile.mkdtemp(prefix="tjanst-"), time.time(), 0
        self.warm_seconds = self.warm()

    # ---- modellerna
    def features(self, track, fps):
        import soundfile as sf
        m, wav = self.models, os.path.join(self.tmp, "spar.wav")
        sf.write(wav, track, self.K.PCM_RATE, subtype="PCM_16")
        with torch.no_grad():
            feats, length = m.audio.get_audio_feature(wav, weight_dtype=m.dtype)
            return m.audio.get_whisper_chunk(feats, self.device, m.dtype, m.whisper, length, fps=fps,
                                             audio_padding_length_left=2, audio_padding_length_right=2)

    def draw(self, latents, chunks):
        m = self.models
        with torch.no_grad():
            pred = m.unet.model(latents, m.timesteps, encoder_hidden_states=m.pe(chunks.to(self.device))).sample
            return m.vae.decode_latents(pred.to(dtype=m.vae.vae.dtype))

    def warm(self):
        """Ett varv på en sekund tystnad: CUDA-kärnorna laddas och minnet tas, så att första frågan går som de följande."""
        t, laps = time.time(), []
        for _ in range(2):
            t1 = time.time()
            chunks = self.features(np.zeros(self.K.PCM_RATE, np.int16), 24)
            self.draw(torch.zeros((16, 8, 32, 32), device=self.device, dtype=self.models.dtype), chunks[:16])
            laps.append(round(time.time() - t1, 3))
        self.warm_laps = laps
        return round(time.time() - t, 2)

    # ---- klippen
    def clip(self, q):
        K = self.K
        s = types.SimpleNamespace(klipp=q["klipp"], bbox_shift=int(q.get("bbox_shift", 0)), extra_margin=int(q.get("extra_margin", 10)),
                                  cheek=int(q.get("cheek", 90)), sigma=float(q.get("sigma", 1.5)), seed=int(q.get("seed", 0)),
                                  prep_dir=q.get("prep_dir", self.a.prep_dir))
        st = os.stat(s.klipp)
        key = (s.klipp, st.st_size, st.st_mtime_ns, s.bbox_shift, s.extra_margin, s.cheek, s.sigma, s.seed, s.prep_dir)
        if key in self.clips and not q.get("ny_forberedelse"):
            return self.clips[key], None
        t0 = time.time()
        frames, yuvs, rate = K.read_frames(s.klipp)
        sha = K.sha256(s.klipp)
        t_read = time.time() - t0
        d, prepared = os.path.join(s.prep_dir, K.prep_key(sha, s)), None
        if not os.path.isfile(os.path.join(d, "info.json")) or q.get("ny_forberedelse"):
            d, info = K.prepare(s, self.models, frames, sha)
            prepared = info["seconds"]
        t1 = time.time()
        P = K.load_prep(d)
        lm = np.load(os.path.join(d, "ansikte.npz"))["landmarks"]
        h, w = frames[0].shape[:2]
        c = {"path": s.klipp, "sha": sha, "frames": frames, "yuvs": yuvs, "rate": rate, "P": P, "dir": d, "settings": vars(s),
             "lat": torch.cat(P["latents"], 0).to(device=self.device, dtype=self.models.dtype),
             "win": inl.window_from_lips(lm[:, ansikte.LIPS_OUTER], w, h), "own": {}}
        self.clips[key] = c
        return c, {"lasaKlipp": round(t_read, 2), "forberedelse": prepared, "lasaForberedelse": round(time.time() - t1, 2),
                   "totalt": round(time.time() - t0, 2)}

    def compose(self, c, f, face):
        """MuseTalks inklistring av det ritade ansiktet i klippets ruta f; ger rutans plan (Y, U, V) som köraren skriver dem."""
        P, frames = c["P"], c["frames"]
        x1, y1, x2, y2 = P["bboxes"][f]
        xs, ys, xe, ye = P["crop_boxes"][f]
        face = cv2.resize(face, (x2 - x1, y2 - y1))
        H, W = frames[f].shape[:2]
        if xs >= 0 and ys >= 0 and xe <= W and ye <= H:
            comp = self.blend(frames[f][ys:ye, xs:xe], face, [x1 - xs, y1 - ys, x2 - xs, y2 - ys], P["masks"][f], [0, 0, xe - xs, ye - ys])
            full = frames[f].copy()
            full[ys:ye, xs:xe] = comp
        else:
            full = self.blend(frames[f], face, [x1, y1, x2, y2], P["masks"][f], P["crop_boxes"][f])
        return self.K.put_back(c["yuvs"][f], frames[f], full, [max(0, xs), max(0, ys), min(W, xe), min(H, ye)])

    # ---- en replik
    def rita(self, q, emit):
        K = self.K
        t0 = time.perf_counter()
        ms = lambda: round((time.perf_counter() - t0) * 1000)  # noqa: E731
        recipe = resolve_recipe(self.profile, q.get("recept"))
        c, loaded = self.clip(q)
        if loaded:
            emit({"klippLast": loaded, "ms": ms()})
        plan = K.parse_plan(q["plan"], len(c["frames"]))
        n, fps = len(plan), 24
        t = time.perf_counter()
        said = K.speech_pcm(q["ljud"], trim=not q.get("ingen_trim"))
        start = int(q.get("ljud_start", 5280))
        track = np.zeros(n * (K.PCM_RATE // fps), np.int16)
        keep = max(0, min(len(said), len(track) - start))
        track[start:start + keep] = said[:keep]
        t_decode = time.perf_counter() - t
        t = time.perf_counter()
        chunks = self.features(track, fps)
        if len(chunks) < n:
            raise ValueError(f"Ljudet gav {len(chunks)} rutor men planen har {n}.")
        chunks = chunks[:n]
        if self.device.type == "cuda":
            torch.cuda.synchronize()
        t_audio = time.perf_counter() - t
        heard = inl.heard_frames(track, n)
        win = tuple(int(v) for v in q["fonster"]) if q.get("fonster") else c["win"]
        line = inl.Line(win, heard, recipe["recept"], shift="hela" if q.get("skift") == "hela" else None, own_cache=c["own"].setdefault(win, {}))
        smooth, batch = float(q.get("smooth", 0.3)), int(q.get("batch", 16))
        first_batch = int(q.get("forsta_batch", batch))
        jobs, result, events, T, err = queue.Queue(), [None] * n, [], {"compose": 0.0, "layin": 0.0}, []

        def cpu():
            raw, made = [], 0
            try:
                while True:
                    item = jobs.get()
                    if item is None:
                        return
                    raw.extend(item)
                    got = len(raw)
                    for k in range(made, got if got == n else got - 1):
                        t1 = time.perf_counter()
                        face = raw[k]
                        if smooth > 0 and n > 1:
                            prev, nxt = raw[max(k - 1, 0)].astype(np.float32), raw[min(k + 1, n - 1)].astype(np.float32)
                            face = np.clip(np.round((1 - smooth) * face.astype(np.float32) + smooth * 0.5 * (prev + nxt)), 0, 255).astype(np.uint8)
                        planes = self.compose(c, plan[k], face)
                        t2 = time.perf_counter()
                        line.add(plan[k], c["yuvs"][plan[k]], planes)
                        T["compose"] += t2 - t1
                        T["layin"] += time.perf_counter() - t2
                    made = got if got == n else got - 1
                    t2 = time.perf_counter()
                    ready = line.ready()
                    T["layin"] += time.perf_counter() - t2
                    if ready:
                        for k, w, laid in ready:
                            result[k] = (w, laid)
                        e = {"rutor": [ready[0][0], ready[-1][0]], "ms": ms()}
                        events.append(e)
                        emit(e)
            except BaseException as ex:  # noqa: BLE001
                err.append(ex)

        th = threading.Thread(target=cpu, daemon=True)
        th.start()
        t_draw_start, t_unet, s = time.perf_counter(), 0.0, 0
        while s < n and not err:
            b = first_batch if s == 0 else batch
            t = time.perf_counter()
            faces = self.draw(c["lat"][plan[s:s + b]], chunks[s:s + b])
            t_unet += time.perf_counter() - t
            jobs.put(list(faces))
            s += b
        jobs.put(None)
        th.join()
        if err:
            raise err[0]
        t_done = time.perf_counter()
        wall = t_done - t0
        summary = {"klar": True, "korare": K.VERSION, "rutor": n, "fonster": list(win), "vikter": line.weights,
                   "skift": [round(float(v), 2) for v in line.shift] if line.shift else None,
                   "ms": {"tillForstaRutor": events[0]["ms"] if events else None, "forstaRutor": events[0]["rutor"] if events else None,
                          "tillSistaRuta": round(wall * 1000), "ljudAvkodning": round(t_decode * 1000), "ljudDrag": round(t_audio * 1000),
                          "unetVae": round(t_unet * 1000), "inklistring": round(T["compose"] * 1000), "inlaggning": round(T["layin"] * 1000)},
                   "rutorPerSekund": {"unetVae": round(n / t_unet, 1), "ritaOchLagga": round(n / (t_done - t_draw_start), 1),
                                      "franFragaTillSistaRuta": round(n / wall, 1)},
                   "installningar": {"smooth": smooth, "batch": batch, "forstaBatch": first_batch, **recipe,
                                     "skift": "hela" if line.whole else "forsta", **{k: v for k, v in c["settings"].items() if k != "klipp"}},
                   "gpu": torch.cuda.get_device_name(0) if self.device.type == "cuda" else None}
        if q.get("ut"):
            t = time.perf_counter()
            self.write(q["ut"], c, plan, result, win, track, fps, int(q.get("crf", 10)))
            summary["ut"] = q["ut"]
            summary["ms"]["skrivaFilm"] = round((time.perf_counter() - t) * 1000)
            rec = {**summary, "klipp": c["path"], "klippSha256": c["sha"], "plan": plan, "ljud": q["ljud"], "ljudStart": start,
                   "talSamplingar": int(len(said)), "handelser": events, "hord": [int(v) for v in heard],
                   "forberedelse": c["P"]["info"], "musetalkCommit": K.musetalk_commit(), "vikterFiler": self.weights}
            json.dump(rec, open(os.path.splitext(q["ut"])[0] + ".json", "w"), indent=2, ensure_ascii=False)
        self.served += 1
        return summary

    def write(self, out, c, plan, result, win, track, fps, crf):
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        h, w = c["frames"][0].shape[:2]
        pcm = os.path.join(self.tmp, "spar.pcm")
        track.tofile(pcm)
        cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", f"{w}x{h}", "-r", str(fps),
               "-i", "-", "-f", "s16le", "-ar", str(self.K.PCM_RATE), "-ac", "1", "-i", pcm, "-map", "0:v:0", "-map", "1:a:0",
               "-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-pix_fmt", "yuv420p",
               "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
               "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-movflags", "+faststart", out]
        p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        for f, (wgt, laid) in zip(plan, result):
            Y, U, V = c["yuvs"][f] if laid is None else inl.put(c["yuvs"][f], win, laid)
            p.stdin.write(Y.tobytes() + U.tobytes() + V.tobytes())
        p.stdin.close()
        if p.wait() != 0:
            raise RuntimeError("ffmpeg kunde inte koda filmen.")

    def health(self):
        return {"korare": self.K.VERSION, "gpu": torch.cuda.get_device_name(0) if self.device.type == "cuda" else None,
                "torch": torch.__version__, "sekunder": {"modellerna": round(self.models.load_seconds, 2), "uppvarmning": self.warm_seconds,
                                                         "uppvarmningensVarv": self.warm_laps, "uppe": round(time.time() - self.started, 1)},
                "klipp": [{"klipp": c["path"], "rutor": len(c["frames"]), "fonster": list(c["win"]), "forberedelse": c["dir"]} for c in self.clips.values()],
                "upptagen": self.busy.locked(), "repliker": self.served, **resolve_recipe(self.profile), "grind": inl.GATE}


class Handler(BaseHTTPRequestHandler):
    tjanst = None

    def log_message(self, fmt, *args):
        print("tjanst:", fmt % args, flush=True)

    def answer(self, code, obj):
        body = (json.dumps(obj, ensure_ascii=False) + "\n").encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/halsa":
            return self.answer(200, self.tjanst.health())
        self.answer(404, {"fel": "okänd adress"})

    def do_POST(self):
        t = self.tjanst
        try:
            q = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0)) or 0) or b"{}")
        except ValueError:
            return self.answer(400, {"fel": "frågan är inte JSON"})
        if self.path == "/stang":
            self.answer(200, {"stanger": True})
            return threading.Thread(target=self.server.shutdown, daemon=True).start()
        if self.path not in ("/rita", "/forbered"):
            return self.answer(404, {"fel": "okänd adress"})
        if not t.busy.acquire(blocking=False):
            return self.answer(409, {"fel": "tjänsten ritar redan en replik"})
        try:
            if self.path == "/forbered":
                c, loaded = t.clip(q)
                return self.answer(200, {"klipp": c["path"], "rutor": len(c["frames"]), "fonster": list(c["win"]), "forberedelse": c["dir"],
                                         "sekunder": loaded, "fannsIMinnet": loaded is None})
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
            self.end_headers()
            lock = threading.Lock()

            def emit(e):
                with lock:
                    self.wfile.write((json.dumps(e, ensure_ascii=False) + "\n").encode())
                    self.wfile.flush()
            try:
                emit(t.rita(q, emit))
            except BaseException as ex:  # noqa: BLE001
                traceback.print_exc()
                emit({"fel": f"{type(ex).__name__}: {ex}"})
        except BaseException as ex:  # noqa: BLE001
            traceback.print_exc()
            try:
                self.answer(500, {"fel": f"{type(ex).__name__}: {ex}"})
            except OSError:
                pass
        finally:
            t.busy.release()


def serve(K, a):
    t = Tjanst(K, a)
    Handler.tjanst = t
    server = ThreadingHTTPServer(("0.0.0.0", a.port), Handler)
    print(f"tjanst: uppe på port {a.port}; modellerna {t.models.load_seconds:.1f} s, uppvärmning {t.warm_seconds} s (varv {t.warm_laps})", flush=True)
    server.serve_forever()
    print("tjanst: stängd", flush=True)
