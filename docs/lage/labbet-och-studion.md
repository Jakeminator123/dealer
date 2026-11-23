# Läget: labbet och studion

Huvudagentens bana: studion på `http://127.0.0.1:4319/studio/` med vyerna Scen & bord, Karta, Docka, Granska, Material, Lipsync och
Beslut, labbservern och rutinverktygen. Här står bara det som gäller nu; det som hänt står i Git.

**Läget.**
- Scen & bord (adressen `/bordet/`) är labbvyn: Kortplan (tre steg: Var kortet landar, Hur det kommer dit, Beställ),
  Kön, Scen, Råfilm och Efterarbete. `/`, `/scen/`, `/placering/`, `/bestall/` och `/lab.html` leder dit; gamla labbet
  är borttaget. Menyn: Scen & bord, Karta, Docka (en del av Scen & bord: Ställ dockan och Dockans filmer), Granska, Material, Lipsync, Casino; i foten Beslut, Ordlista, Ljud och Modeller.
- Basgrund behåller bordskorten. Överlägg i handen är av i Scen och Casino; Karta skiljer primära från spelbara steg. Scen har labbprovet bordet BORD-02 (Bord → Bordsmodell, `tableModel=bord-02`, 2026-11-20): avslaget som förval, och spelet slår inte på det före Jakobs ja.
- Lokal klickdiagnostik sparar högst 200 långsamma händelser; läs med `node tools/interaction-diagnostics.ts` (rutin: `tools/local-work.md`). Vercels rapporterade 17-minutersvärde är ännu inte återskapat.
- En beställning är en rak linje i Kortplan: plats och kort, hur kortet kommer dit, och i steg 3 "Det här skickas" med serverns text, bilder, pris och värden före sparning; slutbild och referensfilm ändras under Undantag. Saknas platsens slutbild går given utan som förval, och A3 görs ur filmens sista ruta; returen väntar på den. Dockans film spelas vid valet. Knappen Spelet visar filmen i spelets storlek. Utkastet godkänns i Kön. Under korten ligger den valda dealerns docka (en annan väljs i listan, `?bakgrund=docka-standard`; måtten i `dealer3d/LASMIG.md`).
- Karta visar varje dealers träd (Paow: Casino, Tatuerad, Ingången) med vad som finns och saknas av 36 steg, och kommandot som beställer ett saknat steg (`/karta/?dealer=paow&trad=tatuerad`). Material visar ankare 2.3 och en bricka per plats
  för landningar. Studiobyggets fulla SHA står i `studio/out/bygge.json`; `/vinklar.html` binder två kameravinklar i en scen.
- Material för hand (`da339a5`): Jakob kan göra vilken bild som helst gällande, lägga den åt sidan, arkivera den och ta
  tillbaka den, och klipp byggda på en äldre bild mörkas. I Karta (`9a09570`) arkiveras ett klipp för hand och tas
  tillbaka; ett arkiverat klipp spelas inte.
- Prov (`e2a95ae`, `79d1d4a`): bricka bara på tagningar, "Väntar på granskaragenten" där ett omdöme saknas, och Jakobs
  egen åsikt och kommentar på varje film och bild (`data/proof-notes.json`). 96 tagningar i 18 prov saknar en
  granskares omdöme.
- Det oanvända i `assets/` är arkiverat (`53dc116`): 367 enheter, 3,96 GB, ligger med samma sökvägar i
  `D:/dealer-archive/dealer-ej-anvant-2026-11-17/`. Inget Jakob har dömt, inget banken spelar och ingen referens är
  flyttad, och allt går att ta tillbaka.
- `placements/default.json` är Jakobs plan. Bara Bordet skriver den: Kortplan och Efterarbete (Kortmaterial), båda med
  Spara i kortplanen.
- Test och publiceringskontroll skriver lokala körkvitton; [evidensverktyget](../../tools/evidence.md) indexerar körningar och materialets ursprung. Saknade mediespår redovisas som överhoppade tester.

**Nästa steg.**
1. En oberoende granskares omdöme om de 96 tagningarna som väntar (listan `waiting-list.txt`), eller märk avgjorda
   prov som avgjorda, så att inget ligger i Jakobs kö.
2. Steget Granska filmen i Bordet, efter byggordningen i `labbgrund/grund/RAPPORT.md`.
3. Mediestädning: `npm run media:status` ger aktuell storlek och användning; rutinen står i `tools/local-work.md`.
   Färdiga mellanresultat rensas efter uppgiften; labbstart raderar ingenting.
4. Efterarbete, där Scen ligger: kortets förarbete per film och "Rå | renderad" på en tagning. Det kommer efter
   filmerna. Panelen Vila saknas också sedan gamla labbet togs bort.
5. Sidornas ord: 72 ställen säger annat än ordlistan (`stadning/ord/ORD.md`, del c, med fil, rad och förslag);
   kontrollera radnumren, filerna har ändrats sedan listan skrevs.

**Väntar på Jakob.** Inget utanför Beslut.

**Var saker ligger.** Studions kod i `studio/`, labbserverns adresser i `tools/lab-routes.ts`, sidorna bredvid studion
(`/scene3d.html`, `/sound.html`, `/props.html`) i `pages/`. Rutinverktygen: `node tools/studio-from-commit.ts --trad
<byggträdet dealer-bygg>` (studion byggs ur en commit i ett rent träd), `node
tools/lab-look.ts` (skärmbilder av labbsidor under låset), `node tools/push-clean.ts --trad <byggträdet dealer-bygg>` (push),
`node tools/proof-notes.ts` (hans anteckningar i Prov) och `node tools/media-audit.ts` (vad en mapp i `assets/` är och
vad som använder den). På slaskdisken, under `D:/dealer-scratch/tmp/`: `labbgrund/` (utredningarna
`placering/RAPPORT.md` och `grund/RAPPORT.md`), `prov-egna-ord/waiting-list.txt`, `stadning/` (`FORSLAG.md`,
`ord/ORD.md`, och i `inventering-2026-11-17/` arkivets plan, logg och `aterstall.mjs`, som tar tillbaka allt) och
huvudagentens egna skript i `huvudagent11/look/`.

**Fällor.**
- Läs Jakobs anteckningar med `node tools/proof-notes.ts` före varje svar till honom; han skriver dem i Prov och
  väntar sig att de är lästa.
- Bygg studion han ser ur en commit (`studio-from-commit`), aldrig ur ett träd där en underagent har halvfärdiga filer.
- Ingen knapp raderar betald media: en bild eller ett klipp arkiveras och kan tas tillbaka.
- Inte tryckt av en hand i en webbläsare: Godkänn i Bordet, och att dra Perspektiv och trycka Spara.
- Lösa sidor under `D:/dealer-scratch` visas inte för Jakob; det han ska se är ett Prov eller en sida i labbet (skillen
  `visa-for-jakob`).
- Det han har sagt om labbet, menyn och efterarbetet står i [BESKED](../BESKED.md), "Labbet och studion"; läs det
  före en ändring av en vy.
