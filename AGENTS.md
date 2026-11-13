# Dealer – arbetsregler

Här byggs en filmad dealer till Jakobs blackjackspel: korta filmklipp mellan fasta ankare, spelade i studion, i
3D-scenen
och i spelet. Scoutgaming (ett annat repo) är slutmålet på sikt och äger regler, slump och kortvärden. Jakob äger
projektet; han är inte programmerare, så förklara val i vanliga ord.

## Läs först

1. `README.md`: vad repot är, mapparna och hur det körs.
2. `HANDOFF.md`: läget nu, vem som äger vad, vad som väntar på Jakob och nästa steg.
3. Det ämne du arbetar med: `docs/SYSTEM.md` (kontrakt: koordinater, register, notation, ordlista), `docs/DRIFT.md`
   (rutiner: Git, kontrollen, labbservern, Runway, publicering, slaskdisken) och arbetsinstruktionerna i `tools/*.md`
   (`tools/dealer-line.md` är ingången för en ny dealer eller en filmbeställning).

## Var kunskap står

- Läget nu, ägare och Jakobs gällande besked: `HANDOFF.md`. Ersätt det som inte längre gäller; ingen dagbok per körning.
- Kontrakt och format: `docs/SYSTEM.md`. Rutiner, anslutningar och sådant som gäller en viss dator eller ett visst
  verktyg:
  `docs/DRIFT.md`.
- Ett ämne som växer ur sitt avsnitt får en egen sida under `docs/`, länkad från README:s tabell.
- Hur ett arbetsmoment görs: en instruktion i `tools/` bredvid verktygen (som `tools/dealer-line.md`,
  `tools/python/README.md`).
- Beslut och fakta per film, bild eller körning: registren (`motions/`, `data/*.json`, `placements/`, `evidence/`).
  Dokumenten länkar dit i stället för att kopiera.
- Vad som hände och varför: commitmeddelandet.
- Skriv hellre en mening för mycket än för lite (Jakob 2026-11-13), men på rätt ställe och en gång.

## Det som skyddar Jakob

- Media och hemligheter stannar utanför Git: `assets/`, `output/`, `.runtime/`, `.env*` och `private/` är ignorerade,
  och kontrollen stoppar en push som bär sådant. Repot är publikt (`Jakeminator123/dealer`).
- Bilder och filmer som används eller kan komma att användas ligger i `assets/` och har en roll i
  `data/media-roles.json`. Slaskdisken är bara för tillfälligt arbete, arkiv och säkerhetskopior (DRIFT).
- Betald generering bara inom `data/order-policy.json` (huvudagenten godkänner beställningar på Jakobs uppdrag; se
  HANDOFF, "Jakobs besked som gäller"). Betalda anrop utanför Beställ rapporteras till huvudagenten med belopp.
- Deploy, mediauppladdning, databasändring och integration i Scoutgaming bara på Jakobs uttryckliga ord.
- Jakobs domar i Granska och Material, och valet av Primär, är hans: inget verktyg och ingen agent sätter eller skriver
  över dem. En agent eller granskare föreslår.
- V6 är Jakobs visuella referens och återskapas byteidentiskt. Bevara original och referenser; ändra aldrig en
  referenshash för att dölja en avvikelse.
- Det tidigare projektet (arkivet snyggare-dealer) och Scoutgaming är bara läsreferenser: inga länkar, junctions eller
  beroenden dit, och en fil som hämtas därifrån registreras i `data/manifest.json`.
- Spelregler, slump och kortvärden flyttas inte från Scoutgaming. Undantaget är den fristående spelmotorn i `game/`
  (Jakob 2026-11-11); inget ändras i Scoutgaming härifrån.

## Labbservern

- En adress, `http://127.0.0.1:4319` (`START.cmd`, `STATUS.cmd`, `STOPP.cmd`), och en flik i Jakobs webbläsare.
- Visa en sida för Jakob med `node tools/preview.ts --open "<sida>"`, som återanvänder den öppna fliken; öppna aldrig
  en labbadress på annat sätt (äldre sessioner lämnade honom med ett tjugotal flikar som ingen agent kan stänga).
- Före en länk till Jakob: `node tools/preview.ts --ensure`, så att servern går.
- Stoppa servern bara med `STOPP.cmd` eller `node tools/preview.ts --stop`, aldrig via processnamn eller port, och rör
  inte andra projekts servrar.
- Den som startar ett eget headless-fönster stänger det; en körning i taget, eftersom det belastar Jakobs dator.

## Git och samarbete

- En huvudagent äger commits, taggar och push. Vilken session det är, och vem som äger vilka filer, står på raden
  "Vem äger vad" i HANDOFF och ingen annanstans. Andra sessioner skriver bara i sina egna filer och lämnar över till
  huvudagenten med en fillista. En skribent per fil.
- `main` är den enda långlivade grenen. En kortlivad gren för ett avgränsat arbete slås ihop i `main` eller tas bort.
- Installera kontrollen en gång per checkout: `npm run hooks:install` (pre-push kör då publiceringskontrollen,
  `tools/publication-check.ts`).
- Avsluta färdigt arbete så här: `npm test`, uttrycklig staging av egna filer, commit, `npm run check`, push, och
  kontrollera fjärrens SHA och GitHub-kontrollen. Samma kontroll före en PR.
- Ingen force-push, ingen `--no-verify`, ingen filbevakare och ingen automatisk commit av utkast.
- Rött i kontrollen stoppar; utred orsaken och rätta den. Sänk aldrig en kontroll eller ändra en referens bara för att
  få grönt. En verklig kvarvarande begränsning skrivs kort i HANDOFF.
- Städa löpande: det som en ändring gör överflödigt (kod som inget anropar, ersatt status, döda sökvägar) tas bort i
  samma ändring, och det nya beteendet beskrivs där det hör hemma.

## Kod

- Ny kod skrivs i TypeScript. Undantaget är skripten i `tools/python/`, som kräver MediaPipe.
- Node enligt `package.json` (Volta, `v24.21.0`); kontrollera med `node -p process.version`.
- Högst fyra render- eller testarbetare samtidigt: datorn delas med labbservern och andra sessioner.
- Verifiera det beteende du ändrat med ett avgränsat test eller en körning. Full rendering och deploy kräver egen
  verifiering; `npm test` täcker dem inte.

## Svar till Jakob

- Svenska, slutsatsen först, så kort som frågan tillåter, men varje fråga han ställer får sitt svar.
- Punktform, procent och poäng (till exempel 4/5) uppskattas.
- Skilj det som är verifierat från det som är skattat.
- Säg kort vad som återstår och vad som hindrar att arbetet stängs.
- Avsluta med antalet aktiva underagenter.
