---
name: ny-dealer
description: Använd i dealer-repot när en ny dealer ska göras från en bild av en person, eller en ny uppsättning av en dealer som finns (nya ankare, nya händer, nytt utseende) - från ingångsbild, keystone och ankare till filmerna för en hel runda. Också när frågan är hur långt en dealer har kommit eller vad som saknas för en runda (tools/produce.ts).
---

# En ny dealer från en bild

Den enda vägen står i [`tools/dealer-line.md`](../../../tools/dealer-line.md): femton rader först, sedan stationerna,
ordningen per dealer, det bandet inte kan än, reglerna som kostar pengar och alla format och namn. Läs den uppifrån och
ned; varje beställning på vägen följer skill `bestalla-film`, varje leverans skill `granska-film`. Här står bara var det
står.

## Reglerna som oftast bryts

1. **Dealern i registren först,** i `data/dealers.json` och `data/media-roles.json`, av huvudagenten på Jakobs ord
   (bandet, station 1).
2. **Jakob väljer bilderna.** Ingångsbild, keystone och ankare blir `kandidat`, och bara han sätter `gäller` (AGENTS,
   "Det som skyddar Jakob").
3. **Ett foto av en riktig person som förlaga** ligger i `private/` och går bara till bildmodellen, aldrig till Git,
   ett prov eller sajten (AGENTS, "Det som skyddar Jakob").
4. **Råd: ankare 1 är en redigering** av ett ankare i bankens ruta med dealerns bild, med mallen
   `tools/texts/ankare-1.txt` (bandet, station 4).
5. **Råd: samma sko, grönt och ton** för alla ankare till en dealer (`data/dealer-standard.json`; bandet, "Format och
   namn").
6. **Råd: se vad som saknas först** med `node tools/produce.ts <dealer>` (bandet, station 7).
7. **Råd: en plats före alla, i bandets ordning** (bandet, "Ordningen per dealer"); hela rundan i en tagning har
   hittills fallit.

## Klar

Hon är färdig för en runda när `node tools/produce.ts <dealer>` säger att de steg en runda kräver är klara; prövas i
`game.html?dealer=<id>` eller studions Casino (bandet, station 16).
