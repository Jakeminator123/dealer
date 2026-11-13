// Speech for a dealer, made on this machine: a rest film of the bank becomes a film in which she says a line, with sound.
//   node tools/speech.ts check
//   node tools/speech.ts bank  --dealer paow
//   node --env-file=.env.local tools/speech.ts say --dealer paow --line placebets [--lang sv] [--voice <name>] [--text "…" --as <word>] [--again ja]
//   node tools/speech.ts reel  --dealer paow --lines placebets,goodluck,blackjack,win [--name demo] [--rests <rest film>,…]
//   node tools/speech.ts over  --dealer paow --film paow-giv-2-1-p4-04-01 --line goodluck [--at 0.6]
//   node tools/speech.ts warm  --dealer paow [--idle 300]      (and: warm --dealer paow --stop ja)
//   node tools/speech.ts proof --dealer paow
// The mouth is drawn by Scoutgaming's lip-sync renderer (services/moving-gpu-worker in Jakeminator123/scoutgaming, MuseTalk), run as
// the image data/speech.json names, in Docker inside WSL on this machine's graphics card and without network. Nothing is sent to
// Scoutgaming's production, and RunPod is not used. The voice is ElevenLabs (ELEVENLABS_API_KEY in .env.local; paid per character).
//
//   bank   once per dealer and rest film: the film is bridged to the renderer's frame (src/speech-plan.ts), the renderer's own
//          builder makes the frame pool and prepares it on the graphics card. Written to assets/speech/<dealer>/bank/: sources/
//          (the bridged clip and sources.json), prepared/ (bank-receipt.json and <id>.tar) and receipt.json. An existing bank of
//          the same film is kept.
//   say    one line: the voice reads the text (once; the sound is kept and reused), the plan goes out from the rest frame and back,
//          the renderer bakes the clip, the answer is checked against exactly what was sent, and the drawn face is laid back into
//          the film's own frames. Written to assets/speech/<dealer>/<dealer>-tal-<line>-<lang>-<nn>/: tts.mp3, job.json, worker.mp4
//          (the renderer's answer, 1080 × 1920), source.mp4 (the bank's frame, 24 frames a second, H.264 CRF 12, AAC sound) and
//          receipt.json. The film starts and ends on the rest film's first played frame, as every rest film does.
//   reel   one film of several lines in a row with rest in between, made from the takes that exist (nothing is read or rendered
//          anew): assets/speech/<dealer>/<dealer>-tal-reel-<name>/source.mp4 and receipt.json. A film to show, not a take of the bank.
//   over   a line said over another film than the rest (a deal, 24 frames a second): the film gets a bank of its own and the sound
//          already read is laid from --at seconds: assets/speech/<dealer>/<dealer>-tal-<line>-over-<film>/. A proof, not a take.
//   warm   keeps one renderer in memory with the dealer's bank, so that say and over take 10–15 s a line instead of a minute or
//          more: the same bake as cold, frame for frame (measured 2026-11-13: no pixel differs). It holds nearly all of a 12 GB
//          card while it is up, so it ends itself after --idle seconds without work (300 if nothing is said); start it for a
//          batch or a chat and stop it after. Without it everything is baked cold as before.
//   proof  gathers the reels, the lines over other films and the newest take of every line in assets/proofs/<dealer>-tal/ with a
//          proof.json, for the studio's view Prov.
// A film made here is a take like any other: it is reviewed frame by frame (tools/film-review.md) before Jakob judges it.
import {readFile, writeFile, mkdir, mkdtemp, rm, rename, copyFile, readdir, stat, open} from 'node:fs/promises';
import {existsSync, createReadStream} from 'node:fs';
import {spawn, execFileSync} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {BRIDGE, RENDER, bridgeProblems, bridgeFilter, clipLength, filmFrameOf, lineFrames, longestSound, restPath, planRows, canonical, sourcesOf, bakeJob, answerVideo, sameWords,
  changedBox, unionBox, grownBox, featherMask, blendFrame, type BakeJob, type BankId, type Box, type Bridge, type PlanRow, type Sources} from '../src/speech-plan.ts';

const scratch = 'D:/dealer-scratch/tmp', env = existsSync(scratch) ? {...process.env, TEMP: scratch, TMP: scratch} : process.env;
const ffmpeg = process.env.FFMPEG ?? 'ffmpeg', ffprobe = process.env.FFPROBE ?? 'ffprobe';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ENCODING = 'H.264 High, yuv420p (4:2:0), CRF 12, preset slow, untagged like the bank\'s films; sound AAC as the renderer wrote it';
// What is laid back: the box around everything the renderer changed, grown by MARGIN, eased over FEATHER pixels from its edge.
const LEVEL = 6, MARGIN = 40, FEATHER = 24;

export type Voice = {provider: 'elevenlabs'; voiceId: string; name: string; modelId: string; settings: Record<string, number | boolean>};
export type Register = {schemaVersion: 1; renderer: {image: string; wsl: string}; voices: Record<string, Voice>;
  dealers: Record<string, {bankId: string; rest: string; voice: string; language: string}>; names?: Record<string, string>; lines: Record<string, Record<string, string>>; chat?: Record<string, Record<string, string>>};
export async function readRegister(file = path.join(repo, 'data/speech.json')): Promise<Register> {
  const r = JSON.parse(await readFile(file, 'utf8')) as Register;
  if (r.schemaVersion !== 1 || !/^[\w./-]+@sha256:[a-f0-9]{64}$/.test(r.renderer?.image ?? '')) throw Error('data/speech.json: renderer.image ska vara en image med digest (…@sha256:…).');
  for (const [id, d] of Object.entries(r.dealers ?? {})) if (!r.voices?.[d.voice] || !r.lines?.[d.language] || !/^[a-z][a-z0-9-]{0,39}$/.test(d.bankId)) throw Error(`data/speech.json: dealern ${id} pekar på en röst, ett språk eller ett bank-id som inte finns.`);
  return r;
}

// ── files and films ──────────────────────────────────────────────────────────
export const sha256File = (file: string) => new Promise<string>((resolve, reject) => { const hash = createHash('sha256'); createReadStream(file).on('data', c => hash.update(c)).on('error', reject).on('end', () => resolve(hash.digest('hex'))); });
const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
export type Probe = {width: number; height: number; fps: string; frames: number; audio: boolean};
export function probe(file: string): Probe {
  const streams: Record<string, string>[] = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,width,height,r_frame_rate,nb_read_frames', '-of', 'json', file], {env, windowsHide: true}).toString()).streams ?? [];
  const v = streams.find(s => s.codec_type === 'video');
  if (!v) throw Error(`${file}: ingen videoström.`);
  return {width: Number(v.width), height: Number(v.height), fps: String(v.r_frame_rate), frames: Number(v.nb_read_frames), audio: streams.some(s => s.codec_type === 'audio')};
}
const run = (bin: string, args: string[], input?: (stdin: NodeJS.WritableStream) => Promise<void>) => new Promise<string>((resolve, reject) => {
  const child = spawn(bin, args, {stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'], windowsHide: true, env: {...env, WSL_UTF8: '1'}});
  let out = '', err = ''; child.stdout!.on('data', c => { out += c; }); child.stderr!.on('data', c => { err += c; });
  child.on('error', reject); child.on('close', code => code === 0 ? resolve(out) : reject(Object.assign(Error(`${path.basename(bin)} ${code}: ${(err || out).trim().slice(-600)}`), {code, out})));
  if (input) { child.stdin!.on('error', () => {}); input(child.stdin!).then(() => child.stdin!.end(), reject); }
});
const ff = (args: string[], input?: (stdin: NodeJS.WritableStream) => Promise<void>) => run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args].filter(a => input ? a !== '-nostdin' : true), input);
/** A film's frames as planar 4:2:0, one buffer per frame, exactly as decoded (no colour conversion). */
export async function* rawFrames(file: string, bytes: number): AsyncGenerator<Buffer> {
  const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', file, '-map', '0:v:0', '-an', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-'], {stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true, env});
  let frame = Buffer.allocUnsafe(bytes), filled = 0;
  for await (const chunk of child.stdout as AsyncIterable<Buffer>) { let at = 0;
    while (at < chunk.length) { const take = Math.min(chunk.length - at, bytes - filled); chunk.copy(frame, filled, at, at + take); filled += take; at += take;
      if (filled === bytes) { yield frame; frame = Buffer.allocUnsafe(bytes); filled = 0; } } }
  if (filled) throw Error(`${file}: en ofullständig bildruta i slutet.`);
}
/** The bridge: the bank's film to the renderer's clip (src/speech-plan.ts). Lossless by default (crf 0), so a pixel of the clip
 * is the film's pixel exactly and the only encoding between the film and the answer is the renderer's own. */
export async function bridgeFilm(film: string, out: string, crf = 0, b: Bridge = BRIDGE): Promise<Probe> {
  const source = probe(film), problems = bridgeProblems(b);
  if (source.width !== b.film.width || source.height !== b.film.height) problems.push(`${film} är ${source.width} × ${source.height}; bryggan gäller bankens ruta ${b.film.width} × ${b.film.height}.`);
  const frames = clipLength(source.frames, b);
  if (frames < 2 || frames > RENDER.maxFrames) problems.push(`${film} ger ${frames} rutor; ett klipp ska ha 2–${RENDER.maxFrames}.`);
  if (problems.length) throw Error(problems.join(' '));
  await ff(['-y', '-i', film, '-filter_complex', bridgeFilter(source.frames, b), '-map', '[out]', '-r', String(RENDER.fps), '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-bf', '0', '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', out]);
  const made = probe(out);
  if (made.width !== RENDER.width || made.height !== RENDER.height || made.fps !== `${RENDER.fps}/1` || made.frames !== frames) throw Error(`Bryggan gav ${made.width} × ${made.height}, ${made.fps}, ${made.frames} rutor; väntat ${RENDER.width} × ${RENDER.height}, ${RENDER.fps}/1, ${frames}.`);
  return made;
}

// ── the renderer in Docker ───────────────────────────────────────────────────
// Run as a file (wsl -d <distro> -- bash <file> …), never as bash -c with values in the text. The stores live in the Linux home,
// because the renderer's user writes there and Windows folders are slow and owned differently. No container gets a network.
const DOCKER = String.raw`#!/usr/bin/env bash
# tools/speech.ts: the lip-sync renderer on this machine's graphics card.
#   check <image> | bank <image> <sources> <out> | bake <image> <tar> <receipt> <job> <result>
set -uo pipefail
mode="$1"; img="$2"
py=/workspace/mt-venv/bin/python; worker=/opt/moving-worker
command -v docker >/dev/null 2>&1 || { echo "NO_DOCKER"; exit 21; }
docker info >/dev/null 2>&1 || { echo "DOCKER_NOT_RUNNING"; exit 22; }
{ command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; } || { echo "NO_GPU"; exit 23; }
docker image inspect "$img" >/dev/null 2>&1 || { echo "NO_IMAGE"; exit 24; }
if [ "$mode" = check ]; then
  echo "GPU $(nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv,noheader | head -n 1)"
  echo "RELEASE $(docker image inspect "$img" --format '{{index .Config.Labels "org.scoutgaming.moving.release"}}')"
  exit 0
fi
home="$HOME/.cache/dealer-speech"
if [ "$mode" = bank ]; then
  sources="$3"; out="$4"
  stage="$home/bank-$$"; rm -rf "$stage"; mkdir -p "$stage/out"; chmod 777 "$stage/out"; cp -r "$sources" "$stage/sources"
  # The pool on the processor, then the preparation on the graphics card, both with the renderer's own builder.
  docker run --rm --network none -v "$stage/sources:/in/sources:ro" -v "$stage/out:/out" --entrypoint "$py" "$img" \
    -I "$worker/prep/build-moving-speech-bank.py" --sources /in/sources --output /out/pool >"$stage/pool.log" 2>&1 || { tail -n 5 "$stage/pool.log"; echo "POOL_FAILED"; exit 25; }
  sha=$(sha256sum "$stage/out/pool/bank-receipt.json" | cut -c1-64)
  docker run --rm --gpus all --network none -v "$stage/out/pool:/in/pool:ro" -v "$stage/out:/out" -w "$worker" --entrypoint "$py" "$img" \
    -I "$worker/prep/build-moving-speech-bank.py" --pool /in/pool --expected-receipt-sha256 "$sha" --prepare-with "$worker/vendor" --output /out/bank >"$stage/prep.log" 2>&1 || { tail -n 12 "$stage/prep.log"; echo "PREP_FAILED"; exit 26; }
  rm -rf "$out"; mkdir -p "$(dirname "$out")"; cp -r "$stage/out/bank" "$out"; cp "$stage/out/pool/bank-receipt.json" "$out/pool-receipt.json"; rm -rf "$stage"
  echo "POOL_RECEIPT $sha"; echo "BANK_DONE"; exit 0
fi
if [ "$mode" = bake ]; then
  tar="$3"; receipt="$4"; job="$5"; result="$6"
  store="$home/banks"; mkdir -p "$store"
  a=$(sha256sum "$tar" | cut -c1-64); r=$(sha256sum "$receipt" | cut -c1-64)
  [ -f "$store/$a.tar" ] || cp "$tar" "$store/$a.tar"
  [ -f "$store/$r.json" ] || cp "$receipt" "$store/$r.json"
  docker run --rm -i --gpus all --network none -e MOVING_BANK_STORE=/banks -v "$store:/banks:ro" \
    --entrypoint "$py" "$img" "$worker/bake.py" < "$job" > "$result.part" 2>"$result.log"
  code=$?
  mv "$result.part" "$result"
  echo "BAKE_EXIT $code"
  exit 0
fi
warm="$home/warm"; name=dealer-speech-warm
if [ "$mode" = warm-status ]; then
  [ -n "$(docker ps -q -f "name=^$name$")" ] && echo "WARM_RUNNING" || echo "WARM_DOWN"; exit 0
fi
if [ "$mode" = warm-stop ]; then
  docker stop "$name" >/dev/null 2>&1; echo "WARM_STOPPED"; exit 0
fi
if [ "$mode" = warm-start ]; then
  # One renderer kept in memory; its jobs and answers are files in $warm. No network. It ends itself after $4 idle seconds.
  script="$3"; idle="$4"
  if [ -n "$(docker ps -q -f "name=^$name$")" ]; then echo "WARM_RUNNING"; exit 0; fi
  mkdir -p "$warm/in" "$warm/out" "$home/banks"; rm -f "$warm/in"/* "$warm/out"/* 2>/dev/null; chmod 777 "$warm" "$warm/in" "$warm/out"; cp "$script" "$warm/warm.py"
  docker run -d --rm --name "$name" --gpus all --network none -e MOVING_BANK_STORE=/banks -v "$home/banks:/banks:ro" -v "$warm:/jobs" \
    --entrypoint "$py" "$img" /jobs/warm.py "$idle" >/dev/null || { echo "WARM_FAILED"; exit 27; }
  echo "WARM_STARTED"; exit 0
fi
if [ "$mode" = warm-job ]; then
  tar="$3"; receipt="$4"; job="$5"; result="$6"; wait="$7"
  [ -n "$(docker ps -q -f "name=^$name$")" ] || { echo "WARM_DOWN"; exit 0; }
  store="$home/banks"
  a=$(sha256sum "$tar" | cut -c1-64); r=$(sha256sum "$receipt" | cut -c1-64)
  [ -f "$store/$a.tar" ] || cp "$tar" "$store/$a.tar"
  [ -f "$store/$r.json" ] || cp "$receipt" "$store/$r.json"
  id="job-$$-$(date +%s%N)"
  cp "$job" "$warm/in/$id.part" && mv "$warm/in/$id.part" "$warm/in/$id.json"
  for _ in $(seq 1 $((wait * 5))); do
    [ -f "$warm/out/$id.json" ] && { cp "$warm/out/$id.json" "$result"; rm -f "$warm/out/$id.json"; echo "WARM_DONE"; exit 0; }
    [ -n "$(docker ps -q -f "name=^$name$")" ] || { rm -f "$warm/in/$id.json"; echo "WARM_DOWN"; exit 0; }
    sleep 0.2
  done
  rm -f "$warm/in/$id.json"; echo "WARM_TIMEOUT"; exit 0
fi
echo "BAD_MODE"; exit 2
`;
// The warm renderer: Scoutgaming's bake, its own functions and recipe (bake.py in the image), with the one difference that the
// models and the bank stay in memory between jobs. A cold bake loads them for every line (most of its minute); a warm one renders
// a line in a few seconds. One bank at a time: a job for another bank is refused (warm_other_bank) and is then baked cold.
const WARM = String.raw`# tools/speech.ts: a renderer kept warm. Jobs are files in /jobs/in, answers files in /jobs/out. No network.
import base64, hashlib, json, os, sys, tempfile, time
from pathlib import Path
ROOT = Path("/opt/moving-worker")
sys.path.insert(0, str(ROOT)); os.chdir(ROOT)
# The same four processors a cold bake gives itself (bake.py, _child), set before anything starts threads: the encoder then
# cuts the picture the same way, and a warm clip is the cold clip.
if hasattr(os, "sched_getaffinity"):
    os.sched_setaffinity(0, sorted(os.sched_getaffinity(0))[:4])
import bake

IDLE = int(sys.argv[1]) if len(sys.argv) > 1 else 300
INBOX, OUTBOX = Path("/jobs/in"), Path("/jobs/out")
STORE = Path(os.environ.get("MOVING_BANK_STORE", "/banks"))
RELEASE = bake.verify_release(ROOT)
state = {}

def start(binding):
    destination = Path(tempfile.mkdtemp(prefix="warm-bank-")) / "avatars"
    mapping = bake.verify_bank(STORE / (binding["avatarSha256"] + ".tar"), STORE / (binding["bankReceiptSha256"] + ".json"), destination, binding)
    bake.verify_models("/workspace/MuseTalk/models")
    os.environ.update(AVATAR_DIR=str(destination), **bake.RENDER_ENVIRONMENT)
    sys.path.insert(0, str(ROOT / "vendor"))
    import motor, torch
    torch.set_num_threads(4)
    state.update(key=(binding["avatarSha256"], binding["bankReceiptSha256"]), mapping=mapping, motor=motor, renderer=motor.Motor([binding["workerAvatar"]]))

def one(job):
    if not isinstance(job, dict) or set(job) != {"id", "input"}:
        return {"status": "failed", "code": "invalid_provider_envelope"}
    try:
        attestation, pcm, rows, total = bake.validate_job(job["input"], RELEASE, job["id"])
        binding = job["input"]["binding"]
        if not state:
            start(binding)
        if state["key"] != (binding["avatarSha256"], binding["bankReceiptSha256"]):
            return {"status": "failed", "code": "warm_other_bank"}
        bake.check_plan(state["mapping"], rows, total)
        R = state["motor"].R
        began = time.time()
        with tempfile.TemporaryDirectory(prefix="warm-out-") as out:
            probed, measurement = bake.render_take(state["motor"], state["renderer"], binding["workerAvatar"], rows, pcm, out,
                                                   open_encoder=lambda path, w, h: R.encoder(str(path), w, h, bake.VIDEO_CRF), ffmpeg=R.FFMPEG, ffprobe=R.FFPROBE)
            video = bake.check_probe(probed, total)
            data = (Path(out) / "take.mp4").read_bytes()
        if len(data) > bake.MAX_VIDEO_BYTES:
            return {"status": "failed", "code": "bake_output_too_large"}
        return {"status": "complete", "attestation": attestation,
                "video": {"schemaVersion": 1, **video, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "base64": base64.b64encode(data).decode("ascii")},
                "warm": {"seconds": round(time.time() - began, 2), "framesPerSecond": measurement.get("rutor_per_s")}}
    except BaseException as error:
        if isinstance(error, (KeyboardInterrupt, SystemExit)):
            raise
        return {"status": "failed", "code": bake.failure_code(error)}

last = time.time()
print("WARM_READY", RELEASE, flush=True)
while time.time() - last < IDLE:
    waiting = sorted(INBOX.glob("*.json"))
    if not waiting:
        time.sleep(0.1)
        continue
    path = waiting[0]
    try:
        job = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        job = None
    saved, sys.stdout = sys.stdout, sys.stderr  # the renderer prints as it works; the answer is the only thing written out
    try:
        answer = one(job)
    finally:
        sys.stdout = saved
    part = OUTBOX / (path.stem + ".part")
    part.write_text(json.dumps(answer), encoding="utf-8")
    os.replace(part, OUTBOX / path.name)
    path.unlink(missing_ok=True)
    last = time.time()
`;
const DOCKER_SAYS: Record<number, string> = {21: 'Docker finns inte i WSL.', 22: 'Docker är installerat men svarar inte (docker info).', 23: 'Inget NVIDIA-grafikkort syns i WSL (nvidia-smi).',
  24: 'Rendererns image finns inte här. Hämta den en gång i WSL: docker pull <image i data/speech.json> (kräver inloggning mot ghcr.io).', 25: 'Rutpoolen kunde inte byggas.', 26: 'Förberedelsen på grafikkortet föll.'};
const toWsl = (p: string) => { const full = path.resolve(p), m = /^([A-Za-z]):[\\/](.*)$/.exec(full); return m ? `/mnt/${m[1].toLowerCase()}/${m[2].replaceAll('\\', '/')}` : full.replaceAll('\\', '/'); };
async function docker(register: Register, work: string, mode: string, ...paths: string[]): Promise<string> {
  const script = path.join(work, 'speech-docker.sh');
  await mkdir(work, {recursive: true}); await writeFile(script, DOCKER.replaceAll('\r\n', '\n'));
  // What follows the mode is files, written for the side that reads them, and now and then a bare number (seconds).
  const args = ['bash', process.platform === 'win32' ? toWsl(script) : script, mode, register.renderer.image, ...paths.map(p => !/[\\/]/.test(p) ? p : process.platform === 'win32' ? toWsl(p) : path.resolve(p))];
  try { return await (process.platform === 'win32' ? run('wsl', ['-d', register.renderer.wsl, '--', ...args]) : run(args[0], args.slice(1))); }
  catch (e) { const {code, out} = e as {code?: number; out?: string}; throw Error(`${DOCKER_SAYS[code ?? 0] ?? 'Docker-steget föll.'} ${(out ?? String((e as Error).message)).trim().slice(-500)}`); }
}
export async function check(register: Register, work: string): Promise<{gpu: string; release: string}> {
  const out = await docker(register, work, 'check'), gpu = /^GPU (.+)$/m.exec(out)?.[1] ?? '', release = /^RELEASE ([a-f0-9]{64})$/m.exec(out)?.[1] ?? '';
  if (!release) throw Error(`Imagen ${register.renderer.image} säger inte vilken release den är (etiketten org.scoutgaming.moving.release).`);
  return {gpu, release};
}

// ── the bank ─────────────────────────────────────────────────────────────────
type BankReceipt = BankId & {status: string; poolFrames: number; visualApproval: boolean};
export type Bank = {dir: string; id: BankId; sources: Sources; tar: string; receipt: string; film: string};
// A dealer's bank is made of her rest film. A film she is to speak over while she does something else (a deal) has a bank of its
// own, bank-<film>, made of that whole film: its first frame stands where the rest frame stands in the rest bank.
const bankDir = (root: string, dealer: string, film?: string) => path.join(root, 'assets/speech', dealer, film ? `bank-${film}` : 'bank');
const WHOLE: Bridge = {...BRIDGE, skipStart: 0, skipEnd: 0};
export async function readBank(root: string, dealer: string, over?: string): Promise<Bank | null> {
  const dir = bankDir(root, dealer, over), receiptFile = path.join(dir, 'prepared/bank-receipt.json'), own = path.join(dir, 'receipt.json');
  if (!existsSync(receiptFile) || !existsSync(own)) return null;
  const receipt = JSON.parse(await readFile(receiptFile, 'utf8')) as BankReceipt, sources = JSON.parse(await readFile(path.join(dir, 'sources/sources.json'), 'utf8')) as Sources & {sourceSetSha256: string};
  const tar = path.join(dir, 'prepared', receipt.workerAvatar + '.tar');
  if (receipt.status !== 'prepared' || await sha256File(tar) !== receipt.avatarSha256 || receipt.sourceSetSha256 !== sources.sourceSetSha256) throw Error(`Banken i ${dir} stämmer inte med sitt kvitto; flytta den åt sidan och bygg om.`);
  const film = (JSON.parse(await readFile(own, 'utf8')) as {film: {path: string}}).film.path;
  return {dir, sources, tar, receipt: receiptFile, film, id: {dealerId: receipt.dealerId, workerAvatar: receipt.workerAvatar, sourceSetSha256: receipt.sourceSetSha256, avatarSha256: receipt.avatarSha256, bankReceiptSha256: await sha256File(receiptFile)}};
}
export async function makeBank(register: Register, root: string, dealer: string, log = console.log, over?: string): Promise<Bank> {
  const d = register.dealers[dealer]; if (!d) throw Error(`data/speech.json har ingen dealer ${dealer}.`);
  if (over !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(over)) throw Error('Filmen anges med sitt id i banken (små bokstäver, siffror och bindestreck).');
  const filmRel = `assets/motions/${over ?? d.rest}/source.mp4`, film = path.join(root, filmRel), dir = bankDir(root, dealer, over), b = over ? WHOLE : BRIDGE;
  if (!existsSync(film)) throw Error(`${filmRel} finns inte.`);
  const filmSha = await sha256File(film), had = await readBank(root, dealer, over);
  if (had) { const own = JSON.parse(await readFile(path.join(dir, 'receipt.json'), 'utf8')) as {film: {sha256: string}};
    if (own.film.sha256 !== filmSha || had.id.dealerId !== d.bankId) throw Error(`Banken i ${dir} är gjord av en annan film eller för ett annat id; flytta den åt sidan innan en ny görs.`);
    log(`Banken finns redan och återanvänds: ${dir}`); return had; }
  const {gpu, release} = await check(register, path.join(dir, '_work'));
  log(`Grafikkort: ${gpu} · renderer ${release.slice(0, 12)}…`);
  await mkdir(path.join(dir, 'sources/sources'), {recursive: true});
  const bridged = path.join(dir, 'sources/bridged.mp4'), made = await bridgeFilm(film, bridged, 0, b), clipSha = await sha256File(bridged);
  const sources = sourcesOf(d.bankId, {sha256: clipSha, bytes: (await stat(bridged)).size, frameCount: made.frames});
  // The builder wants the clip under its id, beside sources.json.
  const clip = path.join(dir, 'sources/sources', sources.clips[0].videoId + '.mp4'); await rename(bridged, clip);
  await writeFile(path.join(dir, 'sources/sources.json'), json({...sources, sourceSetSha256: sha256(canonical(sources))}));
  log(`Klippet: ${made.frames} rutor ur ${filmRel} (rutorna ${b.skipStart}–${filmFrameOf(made.frames - 1, b)}). Förbereder banken på grafikkortet …`);
  const started = Date.now(), out = await docker(register, path.join(dir, '_work'), 'bank', path.join(dir, 'sources'), path.join(dir, 'prepared'));
  await rm(path.join(dir, 'prepared', d.bankId), {recursive: true, force: true}); // the builder's working copy; the archive beside it holds the same files
  await writeFile(path.join(dir, 'receipt.json'), json({schemaVersion: 1, dealer, bankId: d.bankId, createdAt: new Date().toISOString(), by: 'tools/speech.ts bank',
    film: {path: filmRel, sha256: filmSha}, bridge: b, clip: {path: path.relative(root, clip).replaceAll('\\', '/'), sha256: clipSha, frames: made.frames, fps: RENDER.fps, restFrame: 0, longestSoundSeconds: Number(longestSound(made.frames).toFixed(2))},
    renderer: {image: register.renderer.image, releaseSha256: release, gpu, seconds: Math.round((Date.now() - started) / 1000)}, poolReceiptSha256: /^POOL_RECEIPT ([a-f0-9]{64})$/m.exec(out)?.[1] ?? null}));
  await rm(path.join(dir, '_work'), {recursive: true, force: true});
  const bank = await readBank(root, dealer, over); if (!bank) throw Error('Banken skrevs inte.');
  log(over ? `Banken klar: ${dir}` : `Banken klar: ${dir} (längsta ljud ${longestSound(made.frames).toFixed(1)} s)`);
  return bank;
}

// ── a line ───────────────────────────────────────────────────────────────────
/** What the renderer must attest for a job: the binding, the job's id and the hashes of exactly the sound and plan that were sent. */
export function attestationOf(job: BakeJob, jobId: string) {
  return {...job.binding, jobId, pcmSha256: sha256(Buffer.from(job.audio.base64, 'base64')), planSha256: sha256(canonical(job.karta)), frameCount: job.karta.reduce((n, row) => n + row[2], 0)};
}
/** The same value whatever order its fields were written in. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => k in b && sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
/** One call to ElevenLabs, never repeated by itself: a call that did not answer may still have been charged. */
async function readAloud(voice: Voice, text: string, out: string): Promise<void> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw Error('ELEVENLABS_API_KEY saknas (kör med node --env-file=.env.local …).');
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.voiceId}?output_format=mp3_44100_128`, {method: 'POST', signal: AbortSignal.timeout(120_000),
    headers: {'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg'}, body: JSON.stringify({text, model_id: voice.modelId, voice_settings: voice.settings})});
  if (!r.ok) throw Error(`ElevenLabs nekade (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  if (!bytes.length) throw Error('ElevenLabs gav ett tomt svar; kontrollera historiken där innan ett nytt anrop.');
  await writeFile(out, bytes);
}
/** What the sound says according to ElevenLabs' speech-to-text (a paid call, a fraction of the reading's price): the check that
 * the voice read the words of the line. Null when the service does not answer; the take is then marked as not listened to. */
async function listen(mp3: string, language: string): Promise<string | null> {
  const key = process.env.ELEVENLABS_API_KEY?.trim(); if (!key) return null;
  const form = new FormData(); form.set('model_id', 'scribe_v1'); form.set('language_code', language); form.set('file', new Blob([await readFile(mp3)]), 'tts.mp3');
  try { const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {method: 'POST', headers: {'xi-api-key': key}, body: form, signal: AbortSignal.timeout(120_000)});
    return r.ok ? String(((await r.json()) as {text?: string}).text ?? '') : null; }
  catch { return null; }
}
/** The voice's sound as the renderer wants it: 24 kHz mono 16-bit, silence at both ends removed (the renderer adds its own). */
export async function toPcm(mp3: string, out: string): Promise<Buffer> {
  const edge = 'silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.02';
  await ff(['-y', '-i', mp3, '-af', `${edge},areverse,${edge},areverse`, '-ac', '1', '-ar', String(RENDER.pcmRate), '-f', 's16le', '-c:a', 'pcm_s16le', out]);
  const pcm = await readFile(out); if (!pcm.length || pcm.length % 2) throw Error('Ljudet blev tomt efter omvandlingen.');
  return pcm;
}
const FILM_BYTES = BRIDGE.film.width * BRIDGE.film.height * 3 / 2, CLIP_BYTES = RENDER.width * RENDER.height * 3 / 2;
type Raw = {frames: number; read(frame: number): Promise<Buffer>; close(): Promise<void>};
/** A film of the bank decoded once to raw 4:2:0 in the work folder, so that any of its frames can be read in any order. */
async function openRaw(film: string, work: string): Promise<Raw> {
  const raw = path.join(work, `${sha256(path.resolve(film)).slice(0, 16)}.yuv`), size = probe(film);
  if (size.width !== BRIDGE.film.width || size.height !== BRIDGE.film.height) throw Error(`${film} är ${size.width} × ${size.height}; bankens ruta är ${BRIDGE.film.width} × ${BRIDGE.film.height}.`);
  await ff(['-y', '-i', film, '-map', '0:v:0', '-an', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', raw]);
  const handle = await open(raw, 'r'), frames = (await handle.stat()).size / FILM_BYTES;
  return {frames, close: async () => { await handle.close(); await rm(raw, {force: true}); },
    read: async frame => { if (!Number.isInteger(frame) || frame < 0 || frame >= frames) throw Error(`Planen pekar på ruta ${frame}; ${path.basename(path.dirname(film))} har ${frames}.`); const b = Buffer.allocUnsafe(FILM_BYTES); await handle.read(b, 0, FILM_BYTES, frame * FILM_BYTES); return b; }};
}
/** Lays the renderer's clip back into the film's frames and writes the film with the clip's sound. Returns what was laid back. */
// options: b the bridge the clip was cut with (the rest bank's by default); extra how many frames the renderer's clip has after the
// plan's last (a film that does not end on its first frame gets that frame added last for the renderer, and it is left out here);
// pcm the film's whole sound at 24 kHz when it is not the renderer's own track (then one frame longer than the film).
export async function layBack(film: string, worker: string, frames: number[], out: string, work: string, options: {b?: Bridge; extra?: number; pcm?: Buffer} = {}): Promise<{box: Box; changed: Box; frames: number}> {
  const b = options.b ?? BRIDGE, extra = options.extra ?? 0, {width: W, height: H} = b.film, clipBytes = CLIP_BYTES, opened = await openRaw(film, work), read = opened.read, handle = {close: opened.close};
  try {
    let changed: Box | null = null, k = 0;
    for await (const clip of rawFrames(worker, clipBytes)) { if (k >= frames.length + extra) throw Error('Rendererns klipp är längre än planen.'); if (k < frames.length) changed = unionBox(changed, changedBox(await read(filmFrameOf(frames[k], b)), clip, b, LEVEL)); k++; }
    if (k !== frames.length + extra) throw Error(`Rendererns klipp har ${k} rutor; planen ${frames.length + extra}.`);
    if (!changed) throw Error('Rendererns klipp skiljer sig inte från filmen: ingen mun är ritad.');
    const box = grownBox(changed, MARGIN, b), mask = featherMask(box.w, box.h, FEATHER), clips = rawFrames(worker, clipBytes), soundFile = path.join(work, 'film.pcm');
    if (options.pcm) await writeFile(soundFile, options.pcm);
    const sound = options.pcm ? ['-f', 's16le', '-ar', String(RENDER.pcmRate), '-ac', '1', '-i', soundFile] : ['-i', worker], coded = options.pcm ? ['-c:a', 'aac', '-b:a', '128k', '-ar', '48000'] : ['-c:a', 'copy'];
    await ff(['-y', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', `${W}x${H}`, '-r', String(RENDER.fps), '-i', 'pipe:0', ...sound, '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', ...coded, '-movflags', '+faststart', out], async stdin => {
      let n = 0;
      for await (const clip of clips) { if (n >= frames.length) { n++; continue; } const frame = await read(filmFrameOf(frames[n++], b)); blendFrame(frame, clip, box, mask, b); if (!stdin.write(frame)) await new Promise(resolve => stdin.once('drain', resolve)); }
    });
    return {box, changed, frames: frames.length};
  } finally { await handle.close(); }
}

// ── a reel: several lines one after the other, with rest in between ───────────
type TakeReceipt = {id: string; line: string; language: string; text: string; voice: Voice; kind?: string; sound: {heard?: string | null; seconds: number}; plan: {restFilm: string; rows: [string, number, number][]};
  laidBack: {box: Box; feather: number}; output: {frames: number; sha256: string}};
/** The finished takes of a dealer's lines, oldest first, without the ones the independent review failed. */
async function finishedTakes(base: string): Promise<{id: string; receipt: TakeReceipt}[]> {
  const out: {id: string; receipt: TakeReceipt}[] = [];
  for (const id of existsSync(base) ? (await readdir(base)).sort() : []) { const file = path.join(base, id, 'receipt.json'), review = path.join(base, id, 'review.json');
    if (id === 'bank' || !existsSync(file) || !existsSync(path.join(base, id, 'source.mp4'))) continue;
    const receipt = JSON.parse(await readFile(file, 'utf8')) as TakeReceipt; if (receipt.kind) continue; // a reel or a line over another film is made of takes, it is not one
    if (existsSync(review) && (JSON.parse(await readFile(review, 'utf8')) as {verdict?: string}).verdict === 'failed') continue;
    out.push({id, receipt}); }
  return out;
}
export type ReelOptions = {dealer: string; lines: string[]; name?: string; rests?: string[]; log?: (text: string) => void};
/**
 * One film of several lines in a row: rest, a line, rest, the next line, … and rest last, all at 24 frames a second in the bank's
 * frame, with sound. Every piece begins and ends on a rest film's first played frame, so the cuts are the bank's own cuts between
 * rest clips. The lines are not rendered again: each line's frames are laid back from its take's kept answer (worker.mp4) exactly
 * as its film was made, and its sound is the take's own, placed where the renderer placed it (0,22 s into the line).
 */
export async function reel(register: Register, root: string, options: ReelOptions): Promise<{dir: string; id: string}> {
  const log = options.log ?? console.log, d = register.dealers[options.dealer]; if (!d) throw Error(`data/speech.json har ingen dealer ${options.dealer}.`);
  const name = options.name ?? 'demo', own = register.voices[d.voice]?.name, base = path.join(root, 'assets/speech', options.dealer), id = `${options.dealer}-tal-reel-${name}`, dir = path.join(base, id);
  if (!/^[a-z0-9]{1,24}$/.test(name) || !options.lines.length) throw Error('Ange --lines (repliker med komma emellan) och ett namn med små bokstäver och siffror.');
  const all = await finishedTakes(base), takes = options.lines.map(line => { const hit = all.filter(t => t.receipt.line === line && t.receipt.language === d.language && t.receipt.voice.name === own).at(-1);
    if (!hit) throw Error(`Ingen färdig tagning av ${line} med rösten ${own}.`); return hit; });
  const restFilms = (options.rests?.length ? options.rests : [d.rest]).map(film => `assets/motions/${film}/source.mp4`), filmOf = (rel: string) => path.join(root, rel);
  for (const rel of restFilms) if (!existsSync(filmOf(rel))) throw Error(`${rel} finns inte.`);
  const work = await mkdtemp(path.join(existsSync(scratch) ? scratch : os.tmpdir(), 'speech-')), raws = new Map<string, Raw>();
  const raw = async (rel: string) => { let r = raws.get(rel); if (!r) { r = await openRaw(filmOf(rel), work); raws.set(rel, r); } return r; };
  try {
    // The pieces: which film each frame comes from, and for a line the renderer's frames and the sound.
    type Piece = {kind: 'rest' | 'line'; source: string; film: string; frames: number[]; text?: string; take?: {id: string; receipt: TakeReceipt}; pcm?: Buffer};
    const pieces: Piece[] = [];
    const rest = async (i: number) => { const rel = restFilms[i % restFilms.length], n = (await raw(rel)).frames; pieces.push({kind: 'rest', source: rel.split('/')[2], film: rel, frames: Array.from({length: clipLength(n)}, (_, k) => filmFrameOf(k))}); };
    for (const [i, take] of takes.entries()) { await rest(i);
      const pcm = await toPcm(path.join(base, take.id, 'tts.mp3'), path.join(work, `${take.id}.pcm`)), frames = take.receipt.plan.rows.flatMap(([, first, count]) => Array.from({length: count}, (_, k) => filmFrameOf(first + k)));
      if (lineFrames(pcm.length) !== frames.length || frames.length !== take.receipt.output.frames) throw Error(`${take.id}: ljudet ger ${lineFrames(pcm.length)} rutor men tagningen har ${frames.length}; gör om tagningen.`);
      pieces.push({kind: 'line', source: take.id, film: take.receipt.plan.restFilm, frames, text: take.receipt.text, take, pcm}); }
    await rest(takes.length);
    const total = pieces.reduce((n, p) => n + p.frames.length, 0), sound = Buffer.alloc(total * (RENDER.pcmRate / RENDER.fps) * 2); let at = 0;
    for (const p of pieces) { if (p.pcm) p.pcm.copy(sound, (at * (RENDER.pcmRate / RENDER.fps) + RENDER.leadSamples) * 2); at += p.frames.length; }
    const soundFile = path.join(work, 'reel.pcm'), out = path.join(dir, 'source.mp4'); await mkdir(dir, {recursive: true}); await writeFile(soundFile, sound);
    log(`${id}: ${pieces.length} delar, ${total} rutor (${(total / RENDER.fps).toFixed(1)} s). Lägger ihop …`);
    const {width: W, height: H} = BRIDGE.film, cuts: {after: string; before: string; meanLumaDifference: number}[] = [];
    const differ = (a: Buffer, b: Buffer) => { let sum = 0, n = 0; for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { sum += Math.abs(a[y * W + x] - b[y * W + x]); n++; } return Number((sum / n).toFixed(2)); };
    await ff(['-y', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-s', `${W}x${H}`, '-r', String(RENDER.fps), '-i', 'pipe:0', '-f', 's16le', '-ar', String(RENDER.pcmRate), '-ac', '1', '-i', soundFile, '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', out], async stdin => {
      let last: Buffer | null = null, before = '';
      for (const p of pieces) { const film = await raw(p.film), mask = p.take ? featherMask(p.take.receipt.laidBack.box.w, p.take.receipt.laidBack.box.h, p.take.receipt.laidBack.feather) : null;
        const clips = p.take ? rawFrames(path.join(base, p.take.id, 'worker.mp4'), CLIP_BYTES) : null;
        for (const [k, index] of p.frames.entries()) { const frame = await film.read(index);
          if (clips && mask) { const clip = await clips.next(); if (clip.done) throw Error(`${p.source}: rendererns klipp är kortare än planen.`); blendFrame(frame, clip.value, p.take!.receipt.laidBack.box, mask); }
          if (k === 0 && last) cuts.push({after: before, before: p.source, meanLumaDifference: differ(last, frame)});
          if (k === p.frames.length - 1) { last = Buffer.from(frame); before = p.source; }
          if (!stdin.write(frame)) await new Promise(resolve => stdin.once('drain', resolve)); }
        if (clips) await clips.return(undefined); }
    });
    const made = probe(out); if (made.frames !== total || !made.audio) throw Error(`Filmen blev ${made.frames} rutor, ljud ${made.audio}; väntat ${total} med ljud.`);
    let start = 0; const segments = pieces.map(p => { const s = {kind: p.kind, source: p.source, frames: p.frames.length, startSeconds: Number((start / RENDER.fps).toFixed(3)), ...(p.text ? {text: p.text, soundStartSeconds: Number((start / RENDER.fps + RENDER.leadSamples / RENDER.pcmRate).toFixed(3))} : {})}; start += p.frames.length; return s; });
    await writeFile(path.join(dir, 'receipt.json'), json({schemaVersion: 1, id, dealer: options.dealer, role: 'film', kind: 'reel', createdAt: new Date().toISOString(), by: 'tools/speech.ts reel', voice: own, segments, cuts,
      output: {path: 'source.mp4', sha256: await sha256File(out), width: made.width, height: made.height, fps: RENDER.fps, frames: made.frames, seconds: Number((total / RENDER.fps).toFixed(2)), audio: true, encoding: ENCODING.replace('as the renderer wrote it', '128 kbit/s')},
      note: 'A film to show the lines in a row; not a take of the bank. The rest films run at 24 frames a second here (every frame kept), as inside the spoken films.'}));
    log(`${id}: klart → ${path.relative(root, out).replaceAll('\\', '/')} (${(total / RENDER.fps).toFixed(1)} s; största skillnad i ett klipp ${Math.max(...cuts.map(c => c.meanLumaDifference))} nivåer)`);
    return {dir, id};
  } finally { for (const r of raws.values()) await r.close().catch(() => {}); await rm(work, {recursive: true, force: true}); }
}
export type SayOptions = {dealer: string; line: string; language?: string; voice?: string; text?: string; again?: boolean; log?: (text: string) => void};
export async function say(register: Register, root: string, options: SayOptions): Promise<{dir: string; id: string}> {
  const log = options.log ?? console.log, d = register.dealers[options.dealer]; if (!d) throw Error(`data/speech.json har ingen dealer ${options.dealer}.`);
  const language = options.language ?? d.language, voiceName = options.voice ?? d.voice, voice = register.voices[voiceName], text = options.text ?? register.lines[language]?.[options.line] ?? register.chat?.[language]?.[options.line];
  if (!voice) throw Error(`data/speech.json har ingen röst ${voiceName}.`);
  if (!text) throw Error(`Ingen text för ${options.line} på ${language}; ge --text.`);
  if (!/^[a-z0-9]{1,24}$/.test(options.line) || !/^[a-z]{2}$/.test(language)) throw Error('Repliken ska heta med små bokstäver och siffror, språket med två bokstäver.');
  const bank = await readBank(root, options.dealer); if (!bank) throw Error(`Ingen bank för ${options.dealer}; kör först: node tools/speech.ts bank --dealer ${options.dealer}`);
  const base = path.join(root, 'assets/speech', options.dealer), stem = `${options.dealer}-tal-${options.line}-${language}-`;
  // The same text in the same voice is not read twice by accident: a finished take is answered with (unless a new reading is asked
  // for), and one that has its sound but no film (the renderer or the laying back fell) is taken up again. Otherwise the next number.
  const taken = existsSync(base) ? (await readdir(base)).filter(n => n.startsWith(stem)).sort() : [];
  let id = '';
  for (const name of taken) { const told = path.join(base, name, 'said.json'); if (!existsSync(told)) continue;
    const s = JSON.parse(await readFile(told, 'utf8')) as {text: string; voice: Voice}; if (s.text !== text || !sameValue(s.voice, voice)) continue;
    if (!existsSync(path.join(base, name, 'source.mp4'))) { id = name; break; }
    if (!options.again) { log(`${name}: finns redan med samma text och röst; --again ja ger en ny läsning.`); return {dir: path.join(base, name), id: name}; } }
  if (!id) id = stem + String(Math.max(0, ...taken.map(n => Number(n.slice(stem.length)) || 0)) + 1).padStart(2, '0');
  const dir = path.join(base, id), mp3 = path.join(dir, 'tts.mp3'), work = await mkdtemp(path.join(existsSync(scratch) ? scratch : os.tmpdir(), 'speech-'));
  try {
    const {gpu, release} = await check(register, work);
    await mkdir(dir, {recursive: true});
    const saidFile = path.join(dir, 'said.json');
    if (!existsSync(mp3)) { log(`${id}: ${voice.name} läser "${text}" (${text.length} tecken hos ElevenLabs)`); await writeFile(saidFile, json({text, voice, language, at: new Date().toISOString()})); await readAloud(voice, text, mp3); }
    else log(`${id}: ljudet finns redan och återanvänds (inget nytt anrop).`);
    const said = JSON.parse(await readFile(saidFile, 'utf8')) as {heard?: string | null};
    if (typeof said.heard !== 'string') { said.heard = await listen(mp3, language); await writeFile(saidFile, json(said)); }
    const heard = said.heard ?? null, wordsMatch = heard === null ? null : sameWords(heard, text);
    if (wordsMatch === false) log(`${id}: OBS, avlyssningen hörde "${heard}"; läs och lyssna innan filmen används.`);
    if (heard === null) log(`${id}: ljudet är inte avlyssnat (tjänsten svarade inte).`);
    const pcm = await toPcm(mp3, path.join(work, 'speech.pcm')), total = lineFrames(pcm.length), clipFrames = bank.sources.clips[0].frameCount;
    if (pcm.length / 2 / RENDER.pcmRate > longestSound(clipFrames, bank.sources.rest.frame)) throw Error(`Ljudet är ${(pcm.length / 2 / RENDER.pcmRate).toFixed(1)} s; vilofilmen bär högst ${longestSound(clipFrames, bank.sources.rest.frame).toFixed(1)} s.`);
    const frames = restPath(bank.sources.rest.frame, clipFrames, total), rows = planRows(bank.sources.clips[0].take, frames);
    log(`${id}: ljud ${(pcm.length / 2 / RENDER.pcmRate).toFixed(2)} s → ${total} rutor (${(total / RENDER.fps).toFixed(2)} s). Renderar på ${gpu.split(',')[0]} …`);
    const baked = await render(register, work, bank, rows, pcm, id), {job, jobId, data} = baked, started = Date.now() - baked.seconds * 1000;
    await writeFile(path.join(dir, 'job.json'), json({id: jobId, input: {...job, audio: {...job.audio, base64: `(${pcm.length} byte, se tts.mp3)`}}}));
    const worker = path.join(dir, 'worker.mp4'), out = path.join(dir, 'source.mp4'); await writeFile(worker, data);
    const filmRel = bank.film, laid = await layBack(path.join(root, filmRel), worker, frames, out, work), made = probe(out);
    if (made.width !== BRIDGE.film.width || made.height !== BRIDGE.film.height || made.frames !== total || !made.audio) throw Error(`Filmen blev ${made.width} × ${made.height}, ${made.frames} rutor, ljud ${made.audio}; väntat ${total} rutor med ljud.`);
    await writeFile(path.join(dir, 'receipt.json'), json({schemaVersion: 1, id, dealer: options.dealer, role: 'film', createdAt: new Date().toISOString(), by: 'tools/speech.ts say',
      line: options.line, language, text, voice, sound: {path: 'tts.mp3', sha256: await sha256File(mp3), characters: text.length, pcmSha256: sha256(pcm), seconds: Number((pcm.length / 2 / RENDER.pcmRate).toFixed(3)), heard, wordsMatch},
      plan: {restFilm: filmRel, restFilmSha256: await sha256File(path.join(root, filmRel)), clipFrames: [frames[0], Math.max(...frames), frames[frames.length - 1]], filmFrames: [filmFrameOf(frames[0]), filmFrameOf(Math.max(...frames)), filmFrameOf(frames[frames.length - 1])], rows},
      bank: bank.id, renderer: {image: register.renderer.image, releaseSha256: release, gpu, jobId, requestId: job.binding.requestId, warm: baked.warm, seconds: Math.round((Date.now() - started) / 1000)},
      worker: {path: 'worker.mp4', sha256: sha256(data), bytes: data.length, width: RENDER.width, height: RENDER.height},
      laidBack: {bridge: BRIDGE, changed: laid.changed, box: laid.box, level: LEVEL, margin: MARGIN, feather: FEATHER},
      output: {path: 'source.mp4', sha256: await sha256File(out), width: made.width, height: made.height, fps: RENDER.fps, frames: made.frames, audio: true, encoding: ENCODING},
      note: 'Outside the box every pixel is the rest film\'s own frame (encoded once more). Not reviewed: tools/film-review.md before Jakob judges it.'}));
    log(`${id}: klart → ${path.relative(root, out).replaceAll('\\', '/')} (${total} rutor, munnen lagd i ${laid.box.w} × ${laid.box.h} vid ${laid.box.x},${laid.box.y})`);
    return {dir, id};
  } finally { await rm(work, {recursive: true, force: true}); }
}

// ── a line over another film: she speaks while she does something else ────────
/** One job in the renderer: sent, run, and its answer checked against exactly what was sent. Returns the renderer's clip. */
export async function render(register: Register, work: string, bank: Bank, rows: PlanRow[], pcm: Buffer, name: string): Promise<{data: Buffer; job: BakeJob; jobId: string; release: string; gpu: string; warm: boolean; seconds: number}> {
  const {gpu, release} = await check(register, work), total = rows.reduce((n, row) => n + row[2], 0);
  const job = bakeJob(bank.id, release, rows, {bytes: pcm.length, sha256: sha256(pcm), base64: pcm.toString('base64')}, `${name}-${randomBytes(4).toString('hex')}`), jobId = `local-${randomBytes(8).toString('hex')}`;
  const jobFile = path.join(work, 'job.json'), resultFile = path.join(work, 'result.json'), started = Date.now();
  await writeFile(jobFile, JSON.stringify({id: jobId, input: job}));
  type Answer = {status: string; code?: string; attestation?: unknown; video?: Record<string, unknown> & {base64?: string}};
  // The warm renderer first, when it is up and holds this bank; otherwise, or if it does not answer, a cold bake as always.
  let answer: Answer | null = null, warm = false;
  if ((await docker(register, work, 'warm-job', bank.tar, bank.receipt, jobFile, resultFile, '120')).includes('WARM_DONE')) { const said = JSON.parse(await readFile(resultFile, 'utf8')) as Answer; if (said.status === 'complete') { answer = said; warm = true; } }
  if (!answer) { await docker(register, work, 'bake', bank.tar, bank.receipt, jobFile, resultFile); answer = JSON.parse(await readFile(resultFile, 'utf8')) as Answer; }
  if (answer.status !== 'complete') throw Error(`Renderern nekade: ${answer.code ?? 'okänt fel'}.`);
  if (!sameValue(answer.attestation, attestationOf(job, jobId))) throw Error('Rendererns intyg stämmer inte med jobbet (bank, ljud, plan, release eller jobb-id).');
  const {base64, ...video} = answer.video ?? {}, data = Buffer.from(String(base64 ?? ''), 'base64');
  if (!sameValue(video, {...answerVideo(total), sha256: sha256(data), bytes: data.length})) throw Error('Klippet i svaret stämmer inte med kontraktet (rutor, mått, spår eller bytes).');
  return {data, job, jobId, release, gpu, warm, seconds: Math.round((Date.now() - started) / 1000)};
}
/** Starts the warm renderer (or finds it running) and has it load a dealer's bank with one short silent job, so that the next line is quick. */
export async function warmUp(register: Register, root: string, dealer: string, idleSeconds = 300, log = console.log): Promise<void> {
  const bank = await readBank(root, dealer); if (!bank) throw Error(`Ingen bank för ${dealer}; kör först: node tools/speech.ts bank --dealer ${dealer}`);
  const work = await mkdtemp(path.join(existsSync(scratch) ? scratch : os.tmpdir(), 'speech-'));
  try {
    const script = path.join(work, 'warm.py'); await writeFile(script, WARM.replaceAll('\r\n', '\n'));
    const said = await docker(register, work, 'warm-start', script, String(idleSeconds)), started = Date.now();
    log(said.includes('WARM_RUNNING') ? 'Den varma renderern går redan.' : 'Den varma renderern startar och läser in modellen och banken …');
    const pcm = Buffer.alloc(2 * RENDER.pcmRate / 10), clip = bank.sources.clips[0], rows = planRows(clip.take, restPath(bank.sources.rest.frame, clip.frameCount, lineFrames(pcm.length)));
    const made = await render(register, work, bank, rows, pcm, `${dealer}-warm`);
    log(made.warm ? `Varm: en tyst provreplik på ${((Date.now() - started) / 1000).toFixed(0)} s. Den stänger sig själv efter ${Math.round(idleSeconds / 60)} min utan arbete; stoppa med: node tools/speech.ts warm --stop ja` : 'Den varma renderern svarade inte; repliker bakas kallt som förut.');
  } finally { await rm(work, {recursive: true, force: true}); }
}
export type OverOptions = {dealer: string; film: string; line: string; at?: number; log?: (text: string) => void};
/**
 * A line said over another film of the bank than the rest, a deal for one: she speaks while her hands work. The film gets a bank
 * of its own (bank-<film>), the line's sound is the one already read (no new reading), set to begin `at` seconds into the film,
 * and the renderer draws the mouth over every frame of the film in order. The renderer wants a clip to end on the frame it began
 * on, so the film's first frame is added last for it and left out again here: the film that comes out has the film's own frames,
 * all of them, and its length. Only for a film of 24 frames a second, the renderer's own rate.
 * Written to assets/speech/<dealer>/<dealer>-tal-<line>-over-<film>/. A proof: not a take of the bank until it has a card track
 * and a verdict.
 */
export async function over(register: Register, root: string, options: OverOptions): Promise<{dir: string; id: string}> {
  const log = options.log ?? console.log, d = register.dealers[options.dealer]; if (!d) throw Error(`data/speech.json har ingen dealer ${options.dealer}.`);
  const own = register.voices[d.voice]?.name, base = path.join(root, 'assets/speech', options.dealer), filmRel = `assets/motions/${options.film}/source.mp4`, at = options.at ?? 0.6;
  if (!existsSync(path.join(root, filmRel))) throw Error(`${filmRel} finns inte.`);
  const size = probe(path.join(root, filmRel)); if (size.fps !== `${RENDER.fps}/1`) throw Error(`${filmRel} går i ${size.fps} rutor per sekund; tal över en film är byggt för ${RENDER.fps}, rendererns takt.`);
  const take = (await finishedTakes(base)).filter(t => t.receipt.line === options.line && t.receipt.language === d.language && t.receipt.voice.name === own && !t.receipt.kind).at(-1);
  if (!take) throw Error(`Ingen färdig tagning av ${options.line} med rösten ${own}; gör den först med say.`);
  const lead = RENDER.leadSamples / RENDER.pcmRate; if (!(at >= lead)) throw Error(`Ljudet kan börja tidigast ${lead} s in i filmen.`);
  const bank = await makeBank(register, root, options.dealer, log, options.film), clip = bank.sources.clips[0], total = clip.frameCount + 1;
  const id = `${options.dealer}-tal-${options.line}-over-${options.film.replace(new RegExp(`^${options.dealer}-`), '')}`, dir = path.join(base, id), work = await mkdtemp(path.join(existsSync(scratch) ? scratch : os.tmpdir(), 'speech-'));
  try {
    const said = await toPcm(path.join(base, take.id, 'tts.mp3'), path.join(work, 'speech.pcm')), samples = total * (RENDER.pcmRate / RENDER.fps) - RENDER.leadSamples - RENDER.trailSamples, before = Math.round(at * RENDER.pcmRate) - RENDER.leadSamples;
    if (before + said.length / 2 > samples) throw Error(`Ljudet (${(said.length / 2 / RENDER.pcmRate).toFixed(1)} s från ${at} s) ryms inte i filmens ${(clip.frameCount / RENDER.fps).toFixed(1)} s.`);
    const pcm = Buffer.alloc(samples * 2); said.copy(pcm, before * 2);
    // Every frame of the film in order, and its first frame once more for the renderer.
    const rows = planRows(clip.take, [...Array.from({length: clip.frameCount}, (_, k) => k), 0]);
    log(`${id}: "${take.receipt.text}" från ${at} s över ${options.film} (${clip.frameCount} rutor). Renderar …`);
    const made = await render(register, work, bank, rows, pcm, id);
    await mkdir(dir, {recursive: true});
    const worker = path.join(dir, 'worker.mp4'), out = path.join(dir, 'source.mp4'); await writeFile(worker, made.data);
    // The film's sound: the renderer's timeline (its lead, then the padded sound), cut to the film's own length.
    const track = Buffer.alloc(clip.frameCount * (RENDER.pcmRate / RENDER.fps) * 2); pcm.copy(track, RENDER.leadSamples * 2, 0, Math.min(pcm.length, track.length - RENDER.leadSamples * 2));
    const laid = await layBack(path.join(root, filmRel), worker, Array.from({length: clip.frameCount}, (_, k) => k), out, work, {b: WHOLE, extra: 1, pcm: track}), film = probe(out);
    if (film.frames !== clip.frameCount || !film.audio) throw Error(`Filmen blev ${film.frames} rutor, ljud ${film.audio}; väntat ${clip.frameCount} med ljud.`);
    await writeFile(path.join(dir, 'receipt.json'), json({schemaVersion: 1, id, dealer: options.dealer, role: 'film', kind: 'over', createdAt: new Date().toISOString(), by: 'tools/speech.ts over',
      line: options.line, language: take.receipt.language, text: take.receipt.text, voice: take.receipt.voice, film: {id: options.film, path: filmRel, sha256: await sha256File(path.join(root, filmRel))},
      sound: {from: `${take.id}/tts.mp3`, seconds: Number((said.length / 2 / RENDER.pcmRate).toFixed(3)), heard: take.receipt.sound.heard ?? null, startsAtSeconds: at, endsAtSeconds: Number((at + said.length / 2 / RENDER.pcmRate).toFixed(3))},
      plan: {rows, note: 'the film\'s frames in order and its first frame once more for the renderer; that last frame is not in the film'}, bank: bank.id,
      renderer: {image: register.renderer.image, releaseSha256: made.release, gpu: made.gpu, jobId: made.jobId, requestId: made.job.binding.requestId, seconds: made.seconds},
      worker: {path: 'worker.mp4', sha256: sha256(made.data), bytes: made.data.length}, laidBack: {bridge: WHOLE, changed: laid.changed, box: laid.box, level: LEVEL, margin: MARGIN, feather: FEATHER},
      output: {path: 'source.mp4', sha256: await sha256File(out), width: film.width, height: film.height, fps: RENDER.fps, frames: film.frames, audio: true, encoding: ENCODING.replace('as the renderer wrote it', '128 kbit/s')},
      note: 'A proof of speech over a deal. Outside the box every pixel is the film\'s own frame (encoded once more). Not a take of the bank: it has no card track and no verdict.'}));
    log(`${id}: klart → ${path.relative(root, out).replaceAll('\\', '/')} (${film.frames} rutor, munnen lagd i ${laid.box.w} × ${laid.box.h} vid ${laid.box.x},${laid.box.y})`);
    return {dir, id};
  } finally { await rm(work, {recursive: true, force: true}); }
}

/** The newest finished take of every line, gathered for the studio's view Prov. */
export async function proof(register: Register, root: string, dealer: string, log = console.log): Promise<string> {
  const base = path.join(root, 'assets/speech', dealer), dir = path.join(root, 'assets/proofs', `${dealer}-tal`), newest = new Map<string, {id: string; receipt: Record<string, any>}>(), reels: {id: string; receipt: Record<string, any>}[] = [];
  for (const id of existsSync(base) ? (await readdir(base)).sort() : []) { const file = path.join(base, id, 'receipt.json'); if (id === 'bank' || !existsSync(file) || !existsSync(path.join(base, id, 'source.mp4'))) continue;
    const receipt = JSON.parse(await readFile(file, 'utf8')); if (receipt.kind) reels.push({id, receipt}); else newest.set(`${receipt.line}-${receipt.language}-${receipt.voice.name}`, {id, receipt}); }
  if (!newest.size) throw Error(`Inga färdiga repliker för ${dealer}.`);
  await mkdir(dir, {recursive: true});
  // The dealer's own voice first, in the register's order of lines; other voices after. A label is a short name, a colon and the
  // rest (the view splits there). review.json beside a take ({verdict, note}, written after the independent review) is shown.
  // The films of several lines in a row come first, then the round's lines in their order, then the chat's replies; other voices last.
  const d = register.dealers[dealer], own = register.voices[d?.voice ?? '']?.name, order = (line: string, language: string) => { const i = [...Object.keys(register.lines[language] ?? {}), ...Object.keys(register.chat?.[language] ?? {})].indexOf(line); return i < 0 ? 999 : i; };
  const takes = [...newest.values()].sort((a, b) => Number(a.receipt.voice.name !== own) - Number(b.receipt.voice.name !== own) || order(a.receipt.line, a.receipt.language) - order(b.receipt.line, b.receipt.language) || a.id.localeCompare(b.id));
  const labels: Record<string, string> = {}, verdicts: Record<string, string> = {}; let reviewed = 0;
  const reviewOf = async (id: string) => { const file = path.join(base, id, 'review.json'); return existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) as {verdict?: string; score?: string; note?: string; more?: string} : null; };
  const verdictOf = (review: {verdict?: string} | null) => ['ok', 'remarks', 'failed'].includes(review?.verdict ?? '') ? review!.verdict! : 'unreviewed';
  reels.sort((a, b) => Number(a.receipt.kind !== 'reel') - Number(b.receipt.kind !== 'reel') || a.id.localeCompare(b.id));
  for (const {id, receipt} of reels) { const name = `${id}.mp4`, review = await reviewOf(id), judged = review?.note ? ` Granskaren${review.score ? ` ${review.score}` : ''}: ${review.note}${review.more ? ` ${review.more}` : ''}` : ''; await copyFile(path.join(base, id, 'source.mp4'), path.join(dir, name));
    labels[name] = receipt.kind === 'reel' ? `Demo: ${(receipt.segments as {kind: string}[]).filter(s => s.kind === 'line').length} repliker i följd med vila emellan. ${receipt.voice}, ${String(Math.round(receipt.output.seconds))} s.${judged}`
      : `Tal medan hon rör sig: "${receipt.text}" över filmen ${receipt.film.id}. ${receipt.voice.name}, ${(receipt.output.frames / RENDER.fps).toFixed(1).replace('.', ',')} s. Ett prov, inte en tagning i banken.${judged}`;
    verdicts[name] = verdictOf(review); }
  for (const {id, receipt} of takes) { const name = `${id}.mp4`; await copyFile(path.join(base, id, 'source.mp4'), path.join(dir, name));
    const review = await reviewOf(id), title = register.names?.[receipt.line] ?? receipt.line;
    if (review) reviewed++;
    const misheard = typeof receipt.sound.heard === 'string' && !sameWords(receipt.sound.heard, receipt.text);
    labels[name] = `${title}${receipt.voice.name === own ? '' : `, röst ${receipt.voice.name}`}: "${receipt.text}" ${receipt.voice.name}, ${(receipt.output.frames / RENDER.fps).toFixed(1).replace('.', ',')} s.${misheard ? ` Avlyssnat som "${receipt.sound.heard}".` : ''}${review?.note ? ` Granskaren${review.score ? ` ${review.score}` : ''}: ${review.note}` : ''}`;
    verdicts[name] = verdictOf(review); }
  const who = dealer[0].toUpperCase() + dealer.slice(1);
  await writeFile(path.join(dir, 'proof.json'), json({schemaVersion: 1, createdAt: new Date().toISOString(), tool: 'tools/speech.ts proof', title: `${who} talar: läppsynk över vilan`,
    description: `Vilofilmen ${register.dealers[dealer]?.rest} med munnen ritad efter ljudet (Scoutgamings renderer, körd på den här datorn) och rösten från ElevenLabs. Varje film börjar och slutar på vilans första ruta. Slå på ljudet. ${reviewed === takes.length ? 'Oberoende granskat ruta för ruta; domen står vid varje film.' : reviewed ? `Oberoende granskat: ${reviewed} av ${takes.length} filmer.` : 'Inte oberoende granskat.'}`,
    film: {fps: RENDER.fps}, labels, verdicts}));
  // A film that is no longer the newest take of its line is taken out of the proof (it stays where it was made).
  for (const file of await readdir(dir)) if (file.endsWith('.mp4') && !(file in labels)) await rm(path.join(dir, file));
  log(`Prov: ${path.relative(root, dir).replaceAll('\\', '/')} (${newest.size + reels.length} filmer)`);
  return dir;
}

// ── the command ──────────────────────────────────────────────────────────────
async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv, flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) { const m = /^--([a-z-]+)$/.exec(rest[i]); if (!m || rest[i + 1] === undefined) { console.error(`Okänt argument: ${rest[i]}`); return 2; } flags[m[1]] = rest[++i]; }
  const register = await readRegister(), root = path.resolve(flags.root ?? process.cwd());
  if (command === 'check') { const work = await mkdtemp(path.join(existsSync(scratch) ? scratch : os.tmpdir(), 'speech-'));
    try { const {gpu, release} = await check(register, work); console.log(`Grafikkort: ${gpu}\nRenderer: ${register.renderer.image}\nRelease: ${release}`);
      for (const dealer of Object.keys(register.dealers)) { const bank = await readBank(root, dealer); console.log(`${dealer}: ${bank ? `bank ${bank.id.dealerId}, ${bank.sources.clips[0].frameCount} rutor ur ${bank.film}` : 'ingen bank än'}`); } }
    finally { await rm(work, {recursive: true, force: true}); } return 0; }
  if (!flags.dealer) { console.error('Ange --dealer.'); return 2; }
  if (command === 'bank') { await makeBank(register, root, flags.dealer); return 0; }
  if (command === 'say') { if (!flags.line && !flags.as) { console.error('Ange --line (eller --text med --as).'); return 2; }
    await say(register, root, {dealer: flags.dealer, line: flags.as ?? flags.line, language: flags.lang, voice: flags.voice, text: flags.text, again: flags.again !== undefined}); return 0; }
  if (command === 'reel') { await reel(register, root, {dealer: flags.dealer, lines: (flags.lines ?? '').split(',').map(s => s.trim()).filter(Boolean), name: flags.name, rests: flags.rests?.split(',').map(s => s.trim()).filter(Boolean)}); return 0; }
  if (command === 'warm') { if (flags.stop !== undefined) { const work = await mkdtemp(path.join(existsSync(scratch) ? scratch : os.tmpdir(), 'speech-')); try { await docker(register, work, 'warm-stop'); console.log('Den varma renderern är stoppad.'); } finally { await rm(work, {recursive: true, force: true}); } return 0; }
    await warmUp(register, root, flags.dealer, flags.idle === undefined ? undefined : Number(flags.idle)); return 0; }
  if (command === 'over') { if (!flags.film || !flags.line) { console.error('Ange --film (filmens id i banken) och --line.'); return 2; }
    await over(register, root, {dealer: flags.dealer, film: flags.film, line: flags.line, at: flags.at === undefined ? undefined : Number(flags.at)}); return 0; }
  if (command === 'proof') { await proof(register, root, flags.dealer); return 0; }
  console.error('Kommandon: check | bank --dealer <id> | say --dealer <id> --line <replik> | reel --dealer <id> --lines <a,b,c> | over --dealer <id> --film <film> --line <replik> | proof --dealer <id>'); return 2;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => { console.error(String(error?.message ?? error)); process.exitCode = 1; });
