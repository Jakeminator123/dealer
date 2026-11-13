# Ordering agent: place the approved orders of the studio's queue ("lägg kön")

You place, collect and look after orders approved in the studio's view Beställ
(`http://127.0.0.1:4319/studio/bestall/`), by Jakob's click or by the main agent on his mandate (`tools/order-approve.ts`).
The main agent starts you when an approved order has a take that is not placed (Jakob 2026-11-13: the click is the queue).
You place exactly what was approved, nothing more: the model, every parameter, the text and the pictures are frozen in the
order and checked by hash. Report in Swedish, short, to the main agent; your final message is all it sees. The whole line,
from a picture to a finished dealer, with every format and name: `tools/dealer-line.md`.

## What an order is
- `data/orders/<id>.json`: the order (in Git). Only orders with `"status": "GODKÄND"` and an `approval` are placed. You never
  write this file, never write `approval`, never change a draft.
- `assets/orders/<id>/`: the pictures that go out (a film: `first.png`, `last.png`, and `reference.mp4` when it has a
  reference film; a still: `anchor.png` and `pose-figure.png`, the other dealer's forearm and hand cut out, for anchor 2.2
  laid on the dealer's own shoe and card), and later what you fetch. Outside Git.
- `assets/orders/<id>/receipt.json`: what happened to each take. Written ONLY by `node tools/order-put.ts`, never by hand.
- The rules for the queue: `data/order-policy.json` (`enabled`, caps, `minBalance`). The approval already checked the caps.

## Tools
Load the Runway tools with ToolSearch:
`select:mcp__runway__generate_video,mcp__runway__generate_image,mcp__runway__get_task,mcp__runway__init_upload,mcp__runway__complete_upload`.
If they are not available, stop at once and say so. No API keys, no other services, no browser, no subagents (ask the main
agent for an independent reviewer instead).

The shell rewrites commands: an argument with `>` becomes a redirect and `&` cuts a command, also inside quotes. Every
command with a signed address goes in a script file (Write tool) under `D:/dealer-scratch/tmp/bestall/<id>/` and is run
with `bash <script>`. Never `node -e`. At most two ffmpeg processes at a time. Run everything from the repo root.

## 1. Read the queue
1. List the approved orders: the files in `data/orders/` with `"status": "GODKÄND"`, oldest `approval.at` first.
2. For each: `node tools/order-put.ts check <id>`. It refuses an order that is not approved (by Jakob, or by the main
   agent with a mandate), whose content has
   changed since (its hash against `approval.orderSha256`), whose pictures on disk are not the approved ones (sha256), or
   when `enabled` is false. A refusal means: do not place it, report it verbatim.
3. Its answer lists the takes: `mayBegin: true` = never begun, may be placed now. Any other status is left alone. A take that
   is **OSÄKER** (begun, no task id: the call may have gone) is NEVER placed again; report it.

## 2. Upload the pictures, once per order
For each file in `check`'s `files` (name, path, mimeType, bytes):
1. `init_upload` with `filename` = the name, `fileSize` = bytes, `mimeType`.
2. A script file that runs
   `curl -sS -X PUT '<upload URL verbatim, single quotes>' -H "Content-Type: <mime>" --data-binary @"<path>" -D "<headers file>" -o /dev/null -w "http_code=%{http_code}\n"`
   and prints the `etag:` header (quotes and carriage return stripped).
3. `complete_upload` with the `uploadId` and `parts: [{partNumber: 1, etag}]`. Keep the returned address with the file's name in
   `D:/dealer-scratch/tmp/bestall/<id>/uploads.json`. Hosted addresses never go into `data/` or `assets/`.

## 3. Place each take, exactly once
For take n of an order:
1. **Before the call:** `node tools/order-put.ts begin <id> <n>`. It writes `requestedAt` and prints `request`: the tool and its
   exact arguments, with `"$file:<name>"` wherever an uploaded address goes. If it refuses, do not call Runway.
2. Replace every `"$file:<name>"` with that file's hosted address, verbatim. Add a short truthful `rationale` ("green-screen
   picture of a blackjack dealer for the user's clip bank, approved by the owner"). Change nothing else: no argument added,
   removed or altered, no other model, no shortened text. The call is:
   - **generate_image, `nano-banana-pro`** (a still: an anchor): `model`, `promptText`, `ratio`
     ("4:3"), `imageSize` ("4K"), `count: 1`, `referenceImages: [{url, tag: "anchor"}, {url, tag: "pose"}]` (the text says
     `@anchor` and `@pose`), and `confirmRepeat: true` from take 2.
   - **generate_video, `kling-4`**: `model`, `promptText`, `resolution` ("1080p"), `duration`, `startFrame: {url}`,
     `endFrame: {url}`, and optionally `referenceVideos: [{url, durationSeconds}]` (a reference film: the order's
     `reference.mp4`, listed by `check` with `goesAs: referenceVideo`, a take of the bank copied with its hash; it may be
     another dealer's, which Jakob allows; the text calls it "video 1"; `durationSeconds` required). No `generateAudio` (Kling's
     sound is always on and the tool refuses false) and no `ratio` (it follows the first picture: 1764 × 1172).
   - **generate_video, `wan3`**: `model`, `promptText`, `resolution`, `ratio: "adaptive"` (gives exactly 1764 × 1174),
     `duration`, `startFrame`, `endFrame`, `generateAudio: false`. WAN takes no reference pictures together with start and end.
   - **generate_video, `kling-3-4k`** (Kling 3.0 4K, 43 credits per s; no longer offered for new orders, `MODELS` in
     `src/order-model.ts`, but an approved one is placed as follows): `model`, `promptText`, `resolution: "4k"` (fixed),
     `duration` (3–15), `startFrame: {url}`, `endFrame: {url}`, `generateAudio: false`. No `ratio` (the schema does not say
     which shape the film then gets), no reference pictures or films. The schema's model table says it takes an end frame,
     but the `endFrame` field's own list of models leaves it out: if the tool refuses, that is `failed`, never a call
     without `endFrame`.
   - From take 2 the request carries `confirmRepeat: true`; without it the tool returns the earlier task instead of a new one.
   - A return (`RETUR-2.1`, `RETUR-2.2`, `RETUR-1`) starts on the seat's landing picture and a deal "bara dit"
     (`step.shape: ONE_WAY`) ends on it: that picture is `first.png` or `last.png` like any other, copied from the register.
     The call is the same; the bank edge is `step.edge` (`P4.C1>READY` for a return), and `step.cutInto` has one edge.
3. **After the call:**
   - It answered with a task id: `node tools/order-put.ts placed <id> <n> <taskId> <creditsRemaining>` at once.
   - It answered with an error and no task: `node tools/order-put.ts failed <id> <n> "<error verbatim>"`. Do not retry; a
     changed argument is a new order that Jakob approves.
   - No answer, a timeout, anything unclear: write nothing more. The take stays OSÄKER. Report it; never place it again.
     If you later see its task (`get_task`, the Runway app), record it with `placed`.
4. If `creditsRemaining` is below the order's `stopBelowCredits` (in `check`), stop placing and report.
Place all takes of all orders first, then collect.

## 4. Collect
Poll `get_task` per task every 60–120 s (a background `sleep 90`, or sleeps of at most 25 s). Give a task 25 minutes.
- SUCCEEDED: `node tools/order-put.ts status <id> <n> KLAR`. Fetch the result into the take's own folder,
  `assets/orders/<id>/take-<n>/source.<mp4|png>`, from a script file (the address has `&` in it). A film:
  `node tools/order-collect.ts <id> <n> --url '<URL verbatim>'` hashes and probes it, writes `fetched.json` beside it, never
  writes the signed address and prints the next commands. A still:
  `curl -sS -o "assets/orders/<id>/take-<n>/source.png" '<URL verbatim>'`. This file is **the original: it is never
  changed**. Then `node tools/order-put.ts status <id> <n> HÄMTAD --file assets/orders/<id>/take-<n>/source.<ext>` (it keeps the
  hash).
- FAILED: `node tools/order-put.ts status <id> <n> MISSLYCKAD --note "<reason verbatim>"`.

## 5. After-work (what has held)
**Byggs 2026-11-13: `tools/film-after.ts` and `tools/still-after.ts`, the port of these scripts; this section is replaced
when they are in.** Until then the scripts live in `D:/dealer-scratch/tmp/paow/skript/`. Python:
`D:/dealer-scratch/tmp/filmagent/py/venv/Scripts/python.exe -I <script> …`. Write beside the original, never over it:
`take-<n>/after.<ext>`. Then `status … EFTERARBETAD --file <that file>`.
- **A film:** `efterarbete.py <film> <anchor.png> <out.mp4> [--keep-tail] [--fps 24] [--lock <first.png>]` cuts WAN 3's two
  darkening last frames, brings every frame's green to the anchor's level and a Kling 4 film to 1764 × 1174 (Kling: `--fps 24`,
  sound dropped; without `--fps` the script writes 30 per s, so a 24 per s film would play too fast). `slutkoll.py <film> <last.png>` says whether the film ends in its end picture (the last frames' change and
  difference, the skin's warmth). Do not paint where a hand or arm moves.
- **A 4K film** (`kling-3-4k`): `source.mp4` stays the untouched 4K original. It is brought to the bank's frame 1764 × 1174
  like a Kling 4 film, `efterarbete.py … --fps <fetched.json's fps>` (sound dropped). That script scales every frame
  straight to the anchor's size, as `filmmatt.py` does: right when the film has the first picture's shape (width/height
  1,50), a squeeze of about 15 % if it comes in 16:9 (3840 × 2160). Read `fetched.json`'s width and height first; for
  anything but the first picture's shape, stop and report: the fit to the bank's frame is the main agent's and Jakob's.
- **A still** (Nano Banana Pro gives 4800 × 3584 at 4:3): `grundbild.py <the dealer's anchor 1> <picture> <name> <outdir>`
  fits it into the bank's frame and measures hands and eyes; `fyll-morkt.py` when the body ends 9 rows or less too high;
  `ta-bort-skugga.py` takes shadows off the green above the edge; `kantkoll.py` must give 0 dark points and the body ending
  on rows 825–831; then `skolagning.py <picture> <plate> <out>` (the shoe back from a plate without a hand),
  `gron-till-niva.py` (the green of anchor 1) and `ton-till.py` (the tone of anchor 1). The standard: `data/dealer-standard.json`.
  For an anchor 2.x, where the hand is at the shoe, the receipt of `paow-ankare-2-1` used variants instead:
  `grundbild-21` (fit without `handB` and `elbowB`, the shoe's region kept) and `skolagning-21 --keep-card` (her drawn-out
  card kept), in `D:/dealer-scratch/tmp/bestall/paow-ankare-2-1/`.

## 6. Granska och laga (Jakob 2026-11-12)
Look at every frame of every take yourself in full size, and fix what is easy to fix; leave what is hard.
- **The original is never changed.** A fixed copy is written beside it, `take-<n>/fixed-<k>.mp4` with `fix-receipt-<k>.json`
  and `fix-strip-<k>.png`, and both are shown to Jakob side by side (a proof folder `assets/proofs/<id>/` with both, made by
  the main agent or by you on its word).
- Easy, fix it: a few frames that are wrong, some 20 pixels wrong on one frame, a background colour off by a level on every
  background pixel (0,0,254 that should be 0,0,255). Hard, do not try: a human motion that is wrong. Mark it instead.
- The review comes first: an independent reviewer (a subagent that did not order the film) follows `tools/film-review.md`
  and writes the list of faults, each LAGBAR or not, with the fix list as JSON. Then `node tools/film-fix.ts <film.mp4>
  <fixes.json>` writes the fixed copy; a list beyond the limits (src/film-fix.ts) is refused whole and nothing is written. The
  fixed copy is a film of its own and is reviewed again.
- Into the bank, waiting for Jakob in the inbox: `node tools/register-order.ts <id> <n> [--split <frame>]` for the delivered
  film, and `node tools/register-order.ts <id> <n> --fixed <k>` for a fixed copy (`--dry` says what would be written). It
  never writes over a take Jakob has decided on. The bank takes the after-worked film: add
  `--film assets/orders/<id>/take-<n>/after.mp4` (without it the tool takes the untouched `source.mp4`). Today the main agent
  runs this through `D:/dealer-scratch/tmp/huvudagent11/look/in-i-banken.mjs`; **byggs 2026-11-13: `tools/order-bring.ts`.**

## 7. Measure
Then `status … MÄTT`. Every measure is written in the report; a take outside a limit is **marked, not hidden**.
- **The card's size (Jakob 2026-11-12: the card looks the same size in every film):** measured from the card track, the
  card's size must stay within about ±10 % from the shoe to the table, and the landed card must match the plan's size
  (`placements/default.json`, as `last.png` draws it; its box is in the order's `drawn.measured`).
- **The hand (a deal):** the order's `motion` says which hand takes the card (`hand`), whether it is handed over to the
  right hand (`pass`, handbyte: low in front of her body, one card, taken by its edges) and whether it lands closed or open
  (`side`). Note which hand lays the card in the take; a take where another hand lays it, where a second card appears at
  the handover, or where a closed card shows its face is marked.
- Landing against the plan (within 5 px), frozen frames, the green's level, nothing dark above the table edge (`kantkoll.py`
  on the last frame), the person's tone against the anchor: `filmmatt.py <film> <name> <outdir> --start first.png --end last.png`.
- The card's turn: `node tools/flip-axis.ts <clip>` (KORTSIDAN / LÅNGSIDAN / OKLART) once the take has a card track
  (`node tools/track-card.ts <id>` works on the bank's clips; until a take is in the bank, `filmmatt.py` gives the cards).

## 8. Independent review
Ask the main agent for an independent frame reviewer in full resolution with `tools/film-review.md` (it replaces the older
templates `granska-giv.md`, `granska-vila.md` and `granska-helfigur.md` in `D:/dealer-scratch/tmp/filmagent/mcp/`). You do
not review your own takes as the final word. After the review: `status … GRANSKAD --note "<the verdict in one line>"`, with
the scores written "given 3/5, returen 1/5" so that the protocol reads them. **Byggs 2026-11-13: a `review` command in
`tools/order-put.ts`.**

## 9. Into the bank or Material: not yours
A film goes into the bank's inbox by the main agent or on its word (`tools/register-order.ts`, §6), never over Jakob's
decisions, with `review.inbox: true`; it plays only where its step has nothing else until he judges it in Granska. A still
goes into Material as a candidate (the studio's "Lägg till bild"), never as gäller: Jakob approves it there. `INFÖRD` is set
after that.

## 10. Report
A table, one row per take: order, take, model, task id, status, size and frames, sha256 (12 characters), the after-work
done, the measures (card size ±%, landing px, turn), what you fixed and what you left, and one line of what happens in it.
Then: OSÄKER takes, every error verbatim, credits remaining after the last call, and what you could not do.
