# Läget: spelet

Huvudagentens bana: spelet, scenens filmlager, nätkopian och stängda banor. Kontrakt: `docs/SYSTEM.md`, "Spelet".

**Läget.**
- Spelet i studion är ett mellansteg mot Scoutgaming, som äger regler, slump och kortvärden; den fristående spelmotorn
  ligger i `game/`. Paow är dealern och Pamela är pausad. Spelets nödlösningar (en ersättare där en film saknas,
  utgången baklänges) ger vika när banken har egna filmer (`src/game-director.ts`). Kärnans gräns mot sidan är prövad
  (`docs/SYSTEM.md`, "Gränsen mellan kärnan och presentationen"; `de1883c`) och sedd i en webbläsare 2026-11-18.
- Realtidsmunnen har Jakobs ja (`paow-realtid-mun-6`, F). Koden och profilhashen finns i `tools/python/mouth-runner`.
  Tre lokala GPU-prov 2026-11-18 använde samma hash; varm fart 5,6–6,7 rutor/s med fyra CPU:er, under realtidens 24.
- Den neutrala munnen är standard för alla Paows repliker (Jakob 2026-11-21): spelet säger 24 av 25 så, och de fyra
  munlapparna. Blackjack spelar kvar `paow-tal-blackjack-sv-04`, som har hans egen dom; den neutrala `-14` väntar på
  hans ja i Granska. Ljudet är byteidentiskt med förut; ingen har hört det (Prov `paow-munbyte-neutral-alla-20261121`; TAL).
- `dealTempo` är ett prov med standard 1 och intervallet 1–1,15. Bara tysta givar och returer ändrar takt efter
  munlappsvalet. I Chrome verifierades tredje P6-kortet vid filmruta 86 och 1,12×, samt tre P6-kort och två
  dealerkort efter returen. Mjukhet och övergång i rörelse återstår att bedöma.
- `diagnos=1` på `/game.html` och `/studio/game/` ger paus/stegning. Casino behåller även kortfärg, kortmetod och
  `dealTempo` i ramen och vid förvalsbyte/nytt bord. Hålkortets värde följer visad ruta: native-provet
  `paow-game-frame-20261118` höll 8 i över 22 s paus; ruta 60 visade 8, ruta 61 visade 13. Maskens kvalitet bedöms separat.
- Filmkortsprovet behåller filmens kort vid eget mål och ritar återbruk till C2/split på spelplatsen. Spår måste täcka
  landning/övertoning genom returskarven. `paow-game-carry-20261118`: native split 18/17 mot 17, saldo 1005; C2-kant högst 1 px vid två gränser. Full rörelsedom återstår.
- Kopian på nätet står på `c9d006d` (2026-11-20). Nästa bär bara det spelet spelar, rummen och ingångsfilmen (DRIFT).
  Telefonmått senast på `1206c43`: nätkontroll 19/19; IAB-hand 18 mot 19, saldo 995. Lokal native-hand: 20 mot 17, 1005.
  Bevis: `assets/proofs/paow-mobile-studio-20261118`. Stående beskär ytterplatser; liggande visar alla sju.
- Filmen till hans chef ligger på hans skrivbord (`paow-runda-6-till-chefen-spelet.mp4` och `-scenen.mp4`, 124 s,
  blint granskad 3,75/5). Ingen granskare har hört ljudet, och `paow-runda-2-` till `-5-` ska inte skickas.
- Filmen före spelet (`/trailer`) är `assets/films/intro/noir-3/film-2.mp4`.

**Nästa steg.**
1. Använd den versionerade köraren; ny Docker-image, strömning till spelet och podprov återstår. Podtaket är 5 USD med
   besked till Jakob före start. Original på D: bevaras, men de gamla startskripten med delat containernamn används inte.
2. Repliker som munlappar över vila (`repliker-som-munlappar`) kan provas efter Jakobs ja till realtidsmunnen 2026-11-17.
3. En ny runda till chefen när läpparna är inne (`node alla.mjs <namn>`, blind granskning mot `chef-jakob-1-1x-v10`).
   Jakob lyssnar innan han skickar.
4. Nätkopian på `c9d006d` är inte prövad i mobilmått än; fysisk telefon och ljud återstår. Material kallar ännu opublicerade ankare saknade.

**Väntar på Jakob.** Inget utanför Beslut.

**Var saker ligger.** Kopians adresser och publicering i [DRIFT](../DRIFT.md) och skillen `publicera-kopian`.
`/meta.json` på kopian visar commit. Den äldre publika sajten är nedtagen (2026-11-23, DRIFT).
Talet i [TAL](../TAL.md) och vyn Lipsync. Under `D:/dealer-scratch/tmp/` finns
`tal/LASMIG-OVERLAMNING-2026-11-17.md`, `tal/korare/`, `tal/realtid/PLAN.md` och `tal/stabilt/LASMIG.md`.
Scenbanan finns i `levande-objekt/`, skarvarna i `levande-objekt/ljus/`, rummets film i `levande-objekt/rumsliv/`.
Chefsfilmens inspelare ligger i `huvudagent11/chefsfilm/inspelare/` och kopians kontroller i `huvudagent11/look/`.
Scoutgamings huvudagent har fått besked att integration återstår och att insatsrutor bör vara data per bord och filmbank.

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
