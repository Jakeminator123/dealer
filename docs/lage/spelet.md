# Läget: spelet

Huvudagentens bana: spelet (`game.html`), 3D-scenens filmlager, kopian på nätet och det de stängda banorna Tal, Scen
och Trailer lämnade. Här står bara det som gäller nu; kontraktet står i `docs/SYSTEM.md`, "Spelet".

**Läget.**
- Spelet i studion är ett mellansteg mot Scoutgaming, som äger regler, slump och kortvärden; den fristående spelmotorn
  ligger i `game/`. Paow är dealern och Pamela är pausad. Spelets nödlösningar (en ersättare där en film saknas,
  utgången baklänges) ger vika när banken har egna filmer (`src/game-director.ts`). Kärnans gräns mot sidan är prövad
  (`docs/SYSTEM.md`, "Gränsen mellan kärnan och presentationen"; `de1883c`), inte sedd i en webbläsare än.
- Banorna Tal, Scen och Trailer stängdes 2026-11-17. Deras filer (bordet, rummet och ljuset i `src/scene3d-*.ts` och
  `data/scene-*.json`; talet i `tools/speech.ts`, `src/speech-*.ts` och `data/lipsync.json`; `src/game-intro.ts`)
  hålls av huvudagenten tills en ny bana får dem.
- Läpparna: sättet för munnen i realtid har Jakobs ja (provet `paow-realtid-mun-6`: storlek F, bara läpparna, mindre
  öppning i vanligt tal med dagens som tak, hakan följer mjukt). Den egna köraren går lokalt med 12–13 rutor per
  sekund mot 24 för realtid. I spelet är receptet lyftet med ritad underläpp (`src/speech-plan.ts`).
- Kopian på nätet är sekundär på Jakobs ord: inget arbete läggs där, den står på `2e3967c` (publicerad 2026-11-18 på
  hans ja, med nytt lösenord), och `cloud/` står orörd tills han säger att den ska bort. Nästa publicering kräver hans
  ord igen.
- Filmen till hans chef ligger på hans skrivbord (`paow-runda-6-till-chefen-spelet.mp4` och `-scenen.mp4`, 124 s,
  blint granskad 3,75/5). Ingen granskare har hört ljudet, och `paow-runda-2-` till `-5-` ska inte skickas.
- Filmen före spelet (`/trailer`) är `assets/films/intro/noir-3/film-2.mp4`.

**Nästa steg.**
1. En ny talsession börjar från talbanans överlämning: munnen strömmad till spelet, och sedan provkvällen på Jakobs
   pod (högst 5 USD, besked till honom samma dag före start; Dockerfilens steg körs där som ett skript, som inte är
   skrivet).
2. Körarens kod för munnen ligger bara på D: (`tal/korare/`) och ska in i repot efter städning av två skript.
3. Replikerna som munlappar över en vilofilm (kortet `repliker-som-munlappar`): villkoret, att läpparnas väg är
   avgjord, är uppfyllt sedan hans ja 2026-11-17.
4. En ny runda till chefen när läpparna är inne (`node alla.mjs <namn>`, blind granskning mot `chef-jakob-1-1x-v10`);
   Jakob lyssnar innan han skickar.
5. Kopian publiceras igen först på Jakobs ord, efter att dess tre fel är rättade ([BRISTER](../BRISTER.md)).

**Väntar på Jakob.** Inget utanför Beslut.

**Var saker ligger.** Kopians adresser, lås och publicering i [docs/DRIFT.md](../DRIFT.md), "Den låsta kopian på
nätet", och i skillen `publicera-kopian`; `/meta.json` på kopian säger vilken commit den bär. Den äldre publika sajten
från 2026-11-11 visar 22 filmer från `b65fd9b` (`evidence/public-release.json`). Talet i [docs/TAL.md](../TAL.md) och
vyn Lipsync. På slaskdisken, under `D:/dealer-scratch/tmp/`: talbanans överlämning
`tal/LASMIG-OVERLAMNING-2026-11-17.md` med `tal/korare/`, `tal/realtid/PLAN.md` och `tal/stabilt/LASMIG.md`;
scenbanans arbete i `levande-objekt/` (skarvarnas verktyg i `ljus/`, rummets film i `rumsliv/`);
`huvudagent11/chefsfilm/inspelare/` (en hel runda inspelad) och i `huvudagent11/look/` kopians kontroller
(`kopian-forval.mjs`, `kopian-forsta-dealer.mjs`, `kopian-casino.mjs`, `spar-pa-kopian.mjs`). Trailerns överlämning
står i [film.md](film.md). Scoutgamings huvudagent har fått besked: inget härifrån är infört där, och insatsrutor bör
vara data per bord och filmbank.

**Fällor.**
- Jakobs telefon är inte headless Chrome: ett fel där läses med en skärmbild av `/trailer?diagnos=1` (DRIFT, "Ett fel
  som bara syns på en telefon") och kallas inte rättat efter en inspelning. Det gäller också om det svarta spelet
  kommer tillbaka.
- En ny modul under `src/` listas i labbserverns `SCRIPTS` (`tools/lab-routes.ts`) innan något importerar den, annars
  dör spelet för alla; kör `tools/lab-modules.test.ts` och starta om labbservern.
- Före nästa byte av läppar visas en jämförelse i spelets storlek och i rörelse, och Jakobs ja krävs; granskarnas
  poäng räcker inte ([BESKED](../BESKED.md), "Läpparna och talet"). Hans godkända `paow-tal-blackjack-sv-04` rörs inte.
- Scouts renderer har ett avsiktligt lås mot ändrade filer, som vi inte går förbi; den egna köraren är vägen.
- Ingen granskare kan höra: ljud och röst bedöms av Jakob.
- Prov och effekter hör hemma i labbets sidor och kommer in i `game.html` först efter hans ja.
- Filmen före spelet får ett nytt filnamn när den görs om (kopian svarar med ett dygns lagringstid), och den spelas
  in på nytt när spelets vilobild ändras.