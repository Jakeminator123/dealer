# Python-skripten i efterarbetet

Den egna MuseTalk-köraren finns i [mouth-runner](mouth-runner/README.md). Dess MediaPipe-mask, versionerade munprofil
och källproveniens följer med repot; modellvikter och lokala förberedelser gör det inte. Profilens regressioner körs
även av `npm test` när Python 3 finns, annars redovisas just den kontrollen som överhoppad.

Fem skript som det löpande bandet ([dealer-line.md](../dealer-line.md), [order-clerk.md](../order-clerk.md) §5–6,
[handboken](../film-prompting.md)) fortfarande kör i Python. Fyra hittar händer, ögon, axlar eller ansikten med
MediaPipe eller OpenCV:s ansiktsmodeller, som repots TypeScript inte har; det femte (`forlang-plagg.py`) är inte
porterat. Resten av efterarbetet är porterat till `tools/film-after.ts` och `tools/still-after.ts`. Ett sjätte,
`landmarks.py`, hör till 3D-banan och ligger här för att det kör i samma MediaPipe-miljö.

Skripten flyttades hit 2026-11-13 från D:-slasket (`D:/dealer-scratch/tmp/bestall/paow-ankare-2-1/` och
`D:/dealer-scratch/tmp/paow/skript/`). Bara sökvägarna till modellerna och repot är ändrade (`forlang-plagg.py` är
oförändrat); allt annat är byte för byte som de skript som gjorde Paows ankare och mått. `grundbild-21.py` gav här samma `w1-final.png` (SHA-256 lika) som körningen
2026-11-13 för `paow-ankare-2-1` tagning 1.

| Skript | Vad det gör | Används i |
| --- | --- | --- |
| `grundbild-21.py` | Passar en levererad stillbild till bankens ruta mot dealerns ankare 1 (en likformighetsavbildning på händer, axlar, armbågar och ögon) och mäter resultatet. Skriver `<namn>-final.png`, `<namn>-ark.jpg` och `<namn>.json`. | Steg 1 för en stillbild (order-clerk §5) |
| `skolagning-21.py` | Lägger tillbaka bankens egen sko från en platta utan hand och behåller bara dealerns hand ovanpå (`--keep-card` behåller kortet hon rör). | Steg 3 för en stillbild (order-clerk §5) |
| `filmmatt.py` | Mäter en film ruta för ruta: format, grönt, frysta rutor, händer och kropp, färgade kort, landning mot planen (`--seats`, läser `placements/default.json` i repot) och första och sista ruta mot beställningens bilder (`--start`, `--end`). Skriver `<namn>.film.json`. | Händer och kropp per ruta (order-clerk §5–6, film-review.md) |
| `forlang-plagg.py` | Förlänger ett ljust plagg nedåt i en passad stillbild så att kroppen slutar vid bordets bakkant, bakom armar och händer. Behöver ingen modell. | Kroppen kapad i en stillbild med ljust plagg (handboken, felistan) |
| `identitet.py` | Ansiktslikhet per ruta mot stillbilder av den nya och den gamla dealern, och hur mycket tatueringsbläck handryggarna bär. Kräver `filmmatt.py`:s mått för samma film. | Likhet för en ny dealer (dealer-line.md, station 3) |
| `landmarks.py` | Läser en film ruta för ruta och skriver allt MediaPipe ser av händerna (21 punkter var, i bankens bildpunkter och som en hand i meter) och kroppen (33 punkter) till en JSON-fil. Talen är MediaPipes egna, ojämnade. Tillkom 2026-11-17 (3D-banan), inte flyttad från slasket. | En verklig giv lagd i rummet (`dealer3d/tools/lift.ts`, `dealer3d/LASMIG.md`) |

Användning står överst i varje skript. Kör alltid med `-I` (isolerat läge), från repots rot:

```
tools/python/.venv/Scripts/python.exe -I tools/python/filmmatt.py <film.mp4> <namn> <utmapp> --start first.png --end last.png
```

## Kortdatasetet (`kort-dataset/`)

Verktygen som gjorde datasetet över kortets rygg och framsida ruta för ruta (2026-11-20), mätte dagens kortspår mot det
och bygger labbprovet `kortprov` ([BRISTER](../../docs/BRISTER.md), "Kortet"). Datasetet ligger kvar på slaskdisken,
`D:/dealer-scratch/tmp/kort-dataset/` (etiketter i `labels/`, `manifest.jsonl`, `rutor.csv`, modellen `modell-v1.pt`):
skripten läser och skriver där och läser repots `assets/`. Referensfilmen under `yt-referens/` mäts men kopieras
aldrig; ur den sparas inga utsnitt. Skripten behöver bara `numpy` och `cv2`: etiketteringen kördes i miljön här
(`.venv`, OpenCV 5.0), mätningarna och provets skript med datorns Python 3.13 (OpenCV 4.13). `train.py` och `eval.py`
behöver också `torch` (miljön `D:/dealer-scratch/tmp/kort-dataset/venv`, torch 2.6) och kör på grafikkortet under det
delade låset. Användning står överst i varje skript.

| Vad | Skript |
| --- | --- |
| Datasetet, i ordning | `inventory.py` (alla filmer), `probe.py` (snabbprov), `valj.py` (kortfilmerna), `dela.py` (listor för två etiketterare), `label.py` (kortets kontur per ruta), `export.py` (manifest och tabell). `sheet.py` ritar etiketten på filmrutor för ögat. |
| Mätningar mot dagens spår | `storlek.py`, `spar_noter.py`, `spar_storlek.py`, `vandning.py`, `ljus_check.py` |
| Modellen (v1 och v2; `--version 2` ritar märke, tryck och fingrar som störning) | `train.py`, `eval.py` (`--modell`, `--ut`) |
| Labbprovet | `spar_b.ts` (provets spår ur etiketterna, regeln `refineFrames` i `src/card-track.ts`), `spela_in.ts` (spelar in Scen ruta för ruta, headless under låset), `ljus_serie.py` (ljusets steg ur en inspelning), `titta_val.py` (spåren ritade på filmrutor), `prov_bygg.py` (provets filmer och stillbilder) |

```
tools/python/.venv/Scripts/python.exe -I tools/python/kort-dataset/label.py D:/dealer-scratch/tmp/kort-dataset/lista-a.jsonl --workers 2
tools/python/.venv/Scripts/python.exe -I tools/python/kort-dataset/export.py
node tools/python/kort-dataset/spar_b.ts --alla
node tools/python/kort-dataset/spela_in.ts <bankklipp> 10 80 <utmapp> fore=mat@1764x1174/640 efter=1@1764x1174/640
```

De två TypeScript-skripten ligger här för att verktygen ska hålla ihop.

## Miljön

Python 3.13 (miljön skripten kördes i hade 3.13.11). En gång per checkout:

```
py -3.13 -m venv tools/python/.venv
tools/python/.venv/Scripts/python.exe -m pip install -r tools/python/requirements.txt
```

`requirements.txt` är `pip freeze` ur den miljö skripten kördes i (`D:/dealer-scratch/tmp/filmagent/py/venv`, 2026-11-13);
skripten själva importerar bara `numpy`, `cv2` (OpenCV 5.0) och `mediapipe`. Samma versioner behövs för samma pixlar.
`.venv/` och `models/` här är Git-ignorerade.

## Modellerna

Modellfilerna är för stora för Git (upp till 37 MB). Lägg dem i `tools/python/models/`, eller peka miljövariabeln
`DEALER_MODELS` på en mapp som har dem. SHA-256 är de filer som användes; kontrollera en nedladdad fil mot dem.

| Fil | Källa | SHA-256 |
| --- | --- | --- |
| `hand_landmarker.task` | MediaPipe, `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task` | `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1` |
| `face_landmarker.task` | MediaPipe, `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task` | `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff` |
| `pose_landmarker_heavy.task` | MediaPipe, `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task` | `64437af838a65d18e5ba7a0d39b465540069bc8aae8308de3e318aad31fcbc7b` |
| `face_detection_yunet_2023mar.onnx` | OpenCV Zoo, `models/face_detection_yunet/` | `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` |
| `face_recognition_sface_2021dec.onnx` | OpenCV Zoo, `models/face_recognition_sface/` | `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79` |

På Jakobs dator ligger de använda filerna kvar på D:: `D:/dealer-scratch/tmp/filmagent/py/models/` (hand) och
`D:/dealer-scratch/tmp/paow/modeller/` (face, pose, yunet, sface). Adresserna ovan är MediaPipes och OpenCV Zoos
publicerade; `latest` kan ha flyttats sedan dess, därför kontrollsummorna.
