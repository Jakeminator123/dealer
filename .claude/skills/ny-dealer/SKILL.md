---
name: ny-dealer
description: Använd i dealer-repot när en ny dealer ska göras från en bild av en person, eller en ny uppsättning av en dealer som finns (nya ankare, nya händer, nytt utseende) - från ingångsbild, keystone och ankare till filmerna för en hel runda. Också när frågan är hur långt en dealer har kommit eller vad som saknas för en runda (tools/produce.ts).
---

# En ny dealer från en bild

Den enda vägen står i [`tools/dealer-line.md`](../../../tools/dealer-line.md): femton rader först, sedan stationerna,
ordningen per dealer, det bandet inte kan än, reglerna som kostar pengar och alla format och namn. Läs den uppifrån och
ned; varje beställning på vägen följer skill `bestalla-film`, varje leverans skill `granska-film`.

## Reglerna som oftast bryts

1. **Dealern i registren först:** en post i `data/dealers.json` och en dealer i `data/media-roles.json`, av
   huvudagenten på Jakobs ord; utan den vägrar Beställ (bandet, station 1).
2. **Jakob väljer bilderna.** Ingångsbild, keystone och ankare blir `kandidat` i Material, och bara han sätter
   `gäller` (bandet, station 2–5; AGENTS, "Det som skyddar Jakob").
3. **Ankare 1 är en redigering** av ett ankare i bankens ruta med dealerns bild, inte en ny person i en annans ruta;
   texten är mallen `tools/texts/ankare-1.txt` (bandet, station 4).
4. **Alla ankare för en dealer har samma sko, grönt och ton** (`data/dealer-standard.json`; bandet, "Format och namn").
5. **Se vad som saknas innan något beställs:** `node tools/produce.ts <dealer>` räknar stegen med samma funktioner som
   Karta (bandet, station 7).
6. **Ordningen per dealer** och **en plats, den svåraste, före alla** (bandet, "Ordningen per dealer" och "Regler som
   kostar pengar när de bryts"). Hela rundan i en tagning har fallit 0 av 7 och beställs inte.
7. **Metoden per steg** väljs efter Jakobs domar och skrivs i `data/order-methods.json` med belägg (bandet, station 7
   och 15).
8. **Ett foto av en riktig person som förlaga** ligger i `private/` och läggs aldrig i Git, i ett prov eller på sajten;
   det går bara till bildmodellen (AGENTS, "Det som skyddar Jakob"; HANDOFF, "Jakobs besked som gäller", Tatueringar
   och händer).

## Klar

Hon är färdig för en runda när `node tools/produce.ts <dealer>` säger att de steg en runda kräver är klara; prövas i
`game.html?dealer=<id>` eller studions Casino (bandet, station 16).
