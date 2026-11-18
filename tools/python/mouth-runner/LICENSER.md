# Licenser för köraren (slagna upp 2026-11-17)

MuseTalks fullständiga licenstext och attribution finns i [licenses/MuseTalk.LICENSE](licenses/MuseTalk.LICENSE).
`provenance.json` anger vilka delar av köraren som använder kod därifrån.

Uppslagna på nätet i dag (GitHub, Hugging Face, Googles sidor), inte ur minnet. "Kommersiellt" = om licensen tillåter
användning i en betald produkt. Ingen av raderna är juridisk rådgivning; de återger vad källan säger.

## Det köraren använder

| Del | Källa | Licens | Kommersiellt | Krav |
| --- | --- | --- | --- | --- |
| MuseTalks kod, commit `0a89dec45a0192b824e3cf4daf96c239440c5ed8` | https://github.com/TMElyralab/MuseTalk (filen `LICENSE`, README "Disclaimer/License") | MIT, "Copyright (c) 2024 Tencent Music Entertainment Group" | Ja. README: "There is no limitation for both academic and commercial usage." | MIT-texten och upphovsraden följer med kopior av koden (de ligger kvar i `/opt/MuseTalk/LICENSE` i imagen). |
| MuseTalk 1.5-vikter (`musetalkV15/unet.pth`, `musetalk.json`), revision `2bcb936e2fddb4d86db4c62fd45b387d0c061571` | https://huggingface.co/TMElyralab/MuseTalk (modellkortet) | MIT (modellkortets metadata) | Ja. Kortet: "The trained model are available for any purpose, even commercially." | Kortet: andra öppna modeller som används "must comply with their license" (whisper, ft-mse-vae, dwpose, S3FD). Testdatan i MuseTalks repo är bara för icke-kommersiell forskning; köraren använder den inte (mappen `assets/` och `data/` tas bort i imagen). |
| VAE `stabilityai/sd-vae-ft-mse`, revision `31f26fdeee1355a5c34592e401dd41e45d25a493` | https://huggingface.co/stabilityai/sd-vae-ft-mse | MIT (modellkortets metadata; kortet har ingen egen licenstext) | Ja enligt MIT-märkningen; kortet säger inget eget om kommersiellt bruk. MuseTalks LICENSE listar den också som MIT. | MIT-notis vid vidarespridning av vikterna (vi sprider dem inte; de hämtas från källan). |
| Whisper tiny `openai/whisper-tiny`, revision `169d4a4341b33bc18d8881c4b69c2e104e1cc0af` (bara kodaren används, för ljudets drag) | https://huggingface.co/openai/whisper-tiny ; koden https://github.com/openai/whisper | Vikterna: Apache-2.0 (modellkortet). Koden: MIT, "Copyright (c) 2022 OpenAI" (enligt MuseTalks LICENSE). | Ja (båda licenserna tillåter det). | Apache-2.0: licenstexten följer med vid vidarespridning, ändringar märks. |
| MediaPipe Face Landmarker (`face_landmarker.task`, SHA-256 `64184e22…bc9ff`) och Python-paketet `mediapipe==0.10.31` (PyPI) | https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker ; https://github.com/google-ai-edge/mediapipe | Apache-2.0 (paketet och repot). Modellkortet för Face Mesh V2, som ingår i paketet, anger "Apache License, Version 2.0" (läst via sökning; Googles PDF gick inte att läsa maskinellt i dag, se nedan). | Ja. Kortets avsedda bruk är AR/underhållning; inte ansiktsigenkänning eller livsavgörande beslut, vilket vi inte gör. | Apache-2.0: licenstext och NOTICE följer med vid vidarespridning. |
| Bibliotek i imagen: PyTorch (BSD-3), diffusers och transformers (Apache-2.0), OpenCV (Apache-2.0), librosa (ISC), NumPy/SciPy (BSD) | PyPI | Tillåtande licenser | Ja | Licensfilerna ligger kvar i paketen. |
| ffmpeg från Ubuntu 24.04 (med libx264) | Ubuntus paket | GPL-2.0+ (byggd med GPL-delar) | Ja att köra. | Om imagen sprids till andra (inte bara körs på egen maskin eller egen RunPod) gäller GPL:s krav på källkod för ffmpeg/x264. |

## Det köraren medvetet INTE använder

| Del | Varför |
| --- | --- |
| Ansiktssegmenteringen `face-parse-bisent/79999_iter.pth` (BiSeNet från https://github.com/zllrunning/face-parsing.PyTorch) | Repots kod är MIT, men repot säger inget om vikternas licens, och modellen är den som tränades på CelebAMask-HQ (19 klasser; repots träningsinstruktion använder bara den datamängden). CelebAMask-HQ (https://github.com/switchablenorms/CelebAMask-HQ): "available for non-commercial research purposes only" och "You agree not to ... exploit for any commercial purposes ... any portion of derived data." En tränad vikt är härledd data. **Osäkert eller otillåtet för kommersiellt bruk, så köraren bygger inte på den.** Masken för munnens område ritas i stället ur MediaPipes landmärken (egen kod), med MuseTalks öppna logik för `jaw`-läget (kindbredd, nedre halvan, oskärpa). OBS: Scouts arbetare laddar just den vikten (`prep-models.lock.json`), så frågan gäller även dem. |
| ResNet-18 ImageNet-vikter (`resnet18-5c106cde.pth`) | Behövs bara som start för BiSeNet ovan. |
| DWPose / mmpose (`yzd-v/DWPose`, Apache-2.0) och S3FD (face-alignment, BSD-3) | Inte förbjudna, men tunga att bygga; landmärkena tas med MediaPipe i stället. |
| SyncNet (`ByteDance/LatentSync`) | Används bara vid träning. |

## Öppet

- Googles PDF för Face Mesh V2:s modellkort (`storage.googleapis.com/mediapipe-assets/Model Card MediaPipe Face Mesh V2.pdf`)
  hämtades men gick inte att läsa som text här; Apache-2.0 för den bekräftades via sökresultat som citerar kortet.
  Bör läsas en gång för hand innan kommersiell drift.
- sd-vae-ft-mse har bara MIT-taggen; ingen egen licenstext i repot.
