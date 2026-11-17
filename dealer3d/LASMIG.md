# dealer3d: dealern som verklig geometri

3D-banans arbetsmapp (startad 2026-11-17 på Jakobs ord: en dealer i 3D, så att olika stolar ser samma giv från sin
egen vinkel, "avskilt i en egen undermapp" tills delarna är värda att lyfta in). Vem som äger banan och vad som väntar
på Jakob står i [HANDOFF](../HANDOFF.md); här står bara vad mappen innehåller och hur den körs.

Mappen rör inget annat i repot. Den läser `placements/default.json` (aldrig skriver) och `src/placement-model.ts`, och
använder repots låsta `three` och `sharp`.

## Vad som finns

| Fil | Vad |
| --- | --- |
| `../src/table-lens.ts` (repots `src/`) | **Bordets lins**, skriven här och lyft till `src/` 2026-11-17: en fysisk kamera för bankens bild (1764 × 1174) i verkliga meter, linsen som tal (`TABLE_LENS`), `realCardQuad` (plats i bankens bildpunkter och riktning in, ett verkligt korts fyra hörn ut) och `shoeCardQuad` (kortet som står i skons fönster). Kortplanen ritas med den (`src/card-plan.ts`); testet är `tools/table-lens.test.ts`. |
| `src/camera.ts` | Passningen: linsfamiljen `lensForFocal` (alla linser som ger kortet vid plats 4 dess storlek och form i filmen) och vad en lins gör av en sträcka i bilden. Lämnar vidare allt ur `src/table-lens.ts`. Ren räkning. |
| `src/world.ts` | Det filmen visar (`MEASURED`) och det som antas (`ASSUMED`); `filmLens()`, passningen som väljer den lins som ritar dealerns kropp i verklig storlek (ett test håller den lika med `TABLE_LENS`); planens kortplatser på filten; stolarnas ögon. Ren räkning. |
| `src/deal.ts` | En giv som tidslinje: kortets läge och vridning och handens grepp för varje tidpunkt, till vilken kortplats som helst. Bana och tempo ur Paows giv till plats 4. Ren räkning. |
| `src/body.ts` | Provdockans skelett, löst ur var händerna ska vara: hon böjer sig från höften och vrider fram axeln så långt armen behöver. Ren räkning. |
| `src/stage.ts` | Ritningen i three.js: bord, sko, ett kort med två sidor och provdockan, sedda genom flera ögon samtidigt. Två utseenden: `room` (filtbord) och `plain` (vit docka på grått, för en förlagefilm). |
| `page/` | Sidan. `?eyes=1,4` väljer ögon (en stol 1–7 eller `film` för bankens kamera), `?to=P4.C1` kortplatsen, `?look=plain`, `?tags=0`, `?t=1.9`, `?play=1`. |
| `tools/measure.ts` | Kalibreringen som tal: linsfamiljen, den valda linsen, ett verkligt kort på planens platser mot planens kontur, kortet i skon, stolarnas ögon. |
| `tools/camera-proof.ts` | Bilderna till provet `dealer-3d-kamera`: planens kort och verkliga kort på en filmruta, och skons kort förstorat. |
| `tools/shoot.ts` | Spelar in sidan utan labbserver: en egen filserver på 127.0.0.1 under körningen, headless Chrome med egen profil och port, en PNG per tidpunkt. Körs under det delade låset. |
| `tests/world.test.ts` | Elva tester av passningen, världen och given, utan media och utan webbläsare; läser bara `placements/default.json`. |

## Det som är mätt och det som är antaget

- **Mätt på filmen** (paow-giv-2-1-p4-11-01): kortet som ligger vid plats 4 (nära kant 84,5, bortre 77,5, djup 72
  bildpunkter, läst på fyra gångers förstoring); kortets mitt i sju rutor (kortspåret); kortet i skons fönster
  (51,0 × 92,2, gula bildpunkter i ruta 120); dealerkantens rad 831,5 (kontraktet).
- **Läst för ögat, ±10 bildpunkter:** axlar, pupiller, hjässa och haka på ankaret `paow-nyp-ung-1`; skons fot.
- **Antaget:** verkliga mått (knogar 76 mm, kavajens axlar 400 mm, pupiller 62 mm), att hon sitter 0,18 m bakom
  kanten, skons form (frontplattan lutad 58°), kortets höjd över filten under given, och hur handen släpper kortet.

## Fynd (2026-11-17)

- **Planens kort och dealerns kropp hör till två linser.** Planens avsmalning 0,87 hör till brännvidd cirka 800
  bildpunkter, och under den vore hon dubbelt så stor som en människa (kontraktets k = 2 säger samma sak). Linsen som
  ritar henne i verklig storlek har brännvidd 2334 bildpunkter (bildvinkel 28,2°, lutning 25,1°, 1,110 m över filten,
  1,844 m från dealerkanten). Skons fot blir då 0,451 m och kortet i skons fönster 0,94 av ett verkligt kort på
  längden (0,95 där skomodellen själv ställer kortet), två saker som inte ingick i passningen.
- **Under kroppens lins** är planens kort rätt vid plats 4 (0,97) och för små närmare dealern: plats 3 och 5 × 1,04,
  plats 2 och 6 × 1,11, plats 1 och 7 × 1,19, dealerns kort × 1,34. Kortet i nypet (ankare 2.1) är 8–13 % för långt
  (spårets kontur 1,13; det synliga kortet läst för ögat cirka 1,08).
- **Jakob sade ja 2026-11-17 kl. 23.02** till att kortplanen ritas med verkligt perspektiv (Beslut,
  `kortplanen-verkligt-perspektiv`). Kortplanen ritas sedan samma kväll med `realCardQuad` (`planCardQuad` i
  `src/card-plan.ts`), `grow` 1,00 på hans ord, alltså kortet i verklig storlek: 84,5 bildpunkter i nära kant vid plats 4.
- **Från bankens kamera ligger 3D-kortet där filmens kort ligger** i de nycklade rutorna, och kameran ser baksidan
  till ruta 44, kanten kring ruta 45 och framsidan från ruta 48, som spåret säger (test).
- Vägarna till en verklig 3D-dealer och deras licenser: forskningsrapporten ligger på slaskdisken,
  `D:/dealer-scratch/tmp/dealer-3d/forskning-3d-avatarer-2026-11-17.md`.

## Köra

```
node --test dealer3d/tests/world.test.ts tools/table-lens.test.ts
node dealer3d/tools/measure.ts
node dealer3d/tools/camera-proof.ts --frame <ruta 120, png> --pinch <ruta 0, png> --out <mapp>
node dealer3d/tools/shoot.ts --out <mapp> --eyes 1,4 --times 1.25,1.9,3.5 --size 1920x640
node dealer3d/tools/shoot.ts --out <mapp> --eyes film --look plain --tags 0 --film 24 0 4 --size 1764x1174
```

Inspelningen körs under det delade låset för grafikkortet och headless Chrome (DRIFT), en körning i taget; skriptet
stänger sin Chrome och sin filserver själv. En hel omgång (stillbilder, två filmer) tar cirka en minut på Jakobs dator.

## Kvar

- Dockan är en provdocka av klot och rör. Jakob gör en Meshy-modell av Paow (riggad, med fingerben); den ska ta
  dockans plats, styrd av samma `deal.ts` och `body.ts`.
- Bara given till plats 4 är jämförd med en film. Banan till andra platser är samma bana böjd mot platsen.
- Två datorer som delar en giv (händelse, kortplats, `DEAL_VERSION`, starttid) är inte byggt.
