# Dealer – arbetsregler

Här byggs en filmad dealer till Jakobs blackjackspel: korta filmklipp mellan fasta ankare, spelade i studion, i
3D-scenen och i spelet. Projektet är tills vidare frikopplat från Scoutgaming (Jakob 2026-11-23) och behöver inget
därifrån. Jakob äger projektet; han är inte programmerare, så förklara val i vanliga ord.

## Läs först

En ny session läser TRE filer innan den börjar, och inget mer (Jakob 2026-11-18: en avlämning ska vara normal, och
den långa inläsningen ska inte göras om):

1. Den här filen.
2. `HANDOFF.md`: startsidan, en sida: läget i korthet, nästa steg, vem som äger vad och pekarna vidare.
3. EN lägesfil, din banas: `docs/lage/<bana>.md` (3D-banan: bara avsnittet "Överlämning" i `dealer3d/LASMIG.md`).

Tillsammans är det under 3 500 ord; `tools/handoff.test.ts` håller taken. Saknas något du behöver för att börja är
det ett fel i överlämningen: rätta det där, i stället för att läsa mer.

Allt annat slås upp när arbetet kräver det, ETT AVSNITT i taget (sök på rubriken), aldrig ett helt dokument:

- Jakobs besked per ämne i `docs/BESKED.md` när ett beslut är i fråga, och kända brister i `docs/BRISTER.md`.
- `docs/SYSTEM.md` (kontrakt: koordinater, register, notation, ordlista), `docs/DRIFT.md` (rutiner: Git, kontrollen,
  labbservern, Runway, publicering, slaskdisken), `README.md` (mapparna, registren, hur det körs) och
  arbetsinstruktionerna i `tools/*.md` (`tools/dealer-line.md` är ingången för en ny dealer eller en filmbeställning).
- Ett arbetsmoment som återkommer (beställa eller granska en film, visa Jakob något, avsluta och pusha, arbeta bredvid
  andra sessioner, en ny dealer, publicera kopian) har en skill i `.claude/skills/<namn>/SKILL.md`: läs den som gäller
  innan du börjar. Den pekar på dokumentet med rutinen och skriver aldrig om den.

Sökningen ser inte allt, med avsikt: `.ignore` och `.cursorignore` döljer maskindata, binärer, `evidence/`, dockans
rörelsedata och pausade Pamelas filmregister (Jakob 2026-11-18, för att spara tokens). Filerna läses med
sin sökväg; en tom sökträff betyder inte att filen saknas. `.claude/settings.json` nekar läsning av modeller,
film, ljud och låsfiler, och en vakt (`.claude/hooks/read-guard.mjs`) nekar en hel läsning av ett dokument eller
register över 32 KB: sök upp stället och läs med `offset` och `limit`, högst 400 rader åt gången.

Läs inte för att komma igång: chatthistorik, äldre överlämningar, Git-historiken, eller rapporter och anteckningar
på slaskdisken. En underagent läser den här filens regler och det dess uppdrag namnger; uppdraget bär själv det den
behöver veta och namnger högst tre filer eller avsnitt att läsa.

## Var kunskap står

- Startsidan `HANDOFF.md` (läget, nästa steg, ägare, pekare) är högst 120 rader och 900 ord; `tools/handoff.test.ts`
  håller taket. Ersätt det som inte längre gäller; ingen dagbok per körning.
- Läget per bana: `docs/lage/<bana>.md` i fast form, högst 60 rader och 800 ord. Jakobs gällande besked med hans ord och datum:
  `docs/BESKED.md` (ett ersatt besked flyttas till "Ersatta besked", aldrig bort). Kända brister: `docs/BRISTER.md`.
- Ett prov (film, bild) som väntar på Jakobs dom är ett kort i Beslut (`data/decisions.json`). Andra frågor ställs i
  chatten, aldrig som lista i ett dokument.
- Kontrakt och format: `docs/SYSTEM.md`. Rutiner, anslutningar och sådant som gäller en viss dator eller ett visst
  verktyg: `docs/DRIFT.md`.
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
  `docs/BESKED.md`, "Domar, beställningar och pengar"). Betalda anrop utanför Beställ rapporteras till huvudagenten med belopp.
- Deploy, mediauppladdning, databasändring och integration i Scoutgaming bara på Jakobs uttryckliga ord.
- Jakobs domar i Granska och Material, och valet av Primär, är hans: inget verktyg och ingen agent sätter eller skriver
  över dem. En agent eller granskare föreslår. Bara när han uttryckligen har lämnat över domen för vissa filmer kan
  huvudagenten och en oberoende granskare döma i hans ställe (`node tools/review-put.ts`): domen ser aldrig ut som
  hans, den väntar inte i hans kö (Jakob 2026-11-13: "Med andra ord vill jag inte se en sån här lista när jag är
  tillbaka!"), den går att hitta i Granska under Dömda åt dig, och hans eget beslut ersätter den.
- Bevara original och referenser (V6 är arkiverad, 2026-11-20); ändra aldrig en referenshash för att dölja en
  avvikelse.
- Det tidigare projektet (arkivet snyggare-dealer) och Scoutgaming är bara läsreferenser: inga länkar, junctions eller
  beroenden dit, och en fil som hämtas därifrån registreras i `data/manifest.json`.
- Spelregler, slump och kortvärden flyttas inte från Scoutgaming. Undantaget är den fristående spelmotorn i `game/`
  (Jakob 2026-11-11); inget ändras i Scoutgaming härifrån.

## Regler och spärrar

- En regel står här eller i en skill bara om den är Jakobs ord (daterat i `docs/BESKED.md`) eller skyddar honom
  (ovan). Annat en agent har skrivit är råd och stryks när det hindrar.
- Efter ett fel rättas orsaken: inget nytt förbud, test eller spärrande status (Jakob 2026-11-23).
- När hans ord ändrar en regel ändras den där den står, i samma commit.
- Rött i kontrollen stoppar; utred orsaken. Ett test som bara låser hur kod eller text ser ut i dag stryks när det
  hindrar; skyddet sänks aldrig och ingen referens ändras för att få grönt.

## Labbservern

- En adress, `http://127.0.0.1:4319` (`START.cmd`, `STATUS.cmd`, `STOPP.cmd`), och en flik i Jakobs webbläsare,
  öppnad med `node tools/preview.ts --open "<sida>"`.
- Omladdning, navigering och skärmbilder i labbet görs utan att fråga.
- Före en länk till Jakob: `node tools/preview.ts --ensure`, så att servern går.
- Stoppa servern bara med `STOPP.cmd` eller `node tools/preview.ts --stop`, aldrig via processnamn eller port, och rör
  inte andra projekts servrar.
- Den som startar ett eget headless-fönster stänger det; en körning i taget, eftersom det belastar Jakobs dator.

## Git och samarbete

- Allt arbete görs i mappen `dealer` på C:, på `main`, den enda långlivade grenen; en gren eller ett eget träd bara
  när ett arbete uttryckligen behöver isoleras, och den slås sedan ihop i `main` eller tas bort. Byggträdet `../dealer-bygg` är bara för kontrollen och `studio-from-commit` (DRIFT).
- Checka in egna färdiga filer direkt, i små commits, så att `dealer` oftast är rent.
- Tillfälliga arbetsfiler hör hemma i `.runtime/<uppgift>/`; städa egna kopior och byggrester efteråt. Medier städas
  enligt `tools/local-work.md` (en gammal fil är inte automatiskt oanvänd); `npm run media:status` visar läget.
- En huvudagent äger commits, taggar och push; vem det är och vem som äger vilka filer står under "Vem äger vad" i
  HANDOFF. Andra sessioner skriver bara i egna filer och lämnar över med en fillista. En skribent per fil.
- Installera kontrollen en gång per checkout: `npm run hooks:install` (pre-push kör då publiceringskontrollen,
  `tools/publication-check.ts`).
- Avsluta färdigt arbete så här: uttrycklig staging av egna filer, commit, `npm run check` (hela sviten, en gång),
  push och fjärrens SHA. Andras öppna filer stoppar ingen push: commiten testas då i byggträdet. GitHub kör ingen.
- Ingen force-push, ingen `--no-verify`, ingen filbevakare och ingen automatisk commit av utkast.
- Städa löpande: det som en ändring gör överflödigt (kod som inget anropar, ersatt status, döda sökvägar) tas bort i
  samma ändring, och det nya beteendet beskrivs där det hör hemma.

## Kod

- Ny kod skrivs i TypeScript. Undantaget är skripten i `tools/python/`, som kräver MediaPipe.
- Node 24 enligt `package.json` (Volta); kontrollera med `node -p process.version`.
- Högst fyra render- eller testarbetare samtidigt: datorn delas med labbservern och andra sessioner.
- Verifiera en ändring med en körning eller de berörda testfilerna, inte hela sviten. Nya tester bara för det som ska
  bestå: kontrakt, spelregler, Jakobs godkända resultat, publiceringsskyddet. Rendering och deploy verifieras för sig.

## Svar till Jakob

- Svenska, slutsatsen först, så kort som frågan tillåter, men varje fråga han ställer får sitt svar.
- Punktform, procent och poäng (till exempel 4/5) uppskattas.
- Skilj det som är verifierat från det som är skattat.
- Säg kort vad som återstår och vad som hindrar att arbetet stängs.
- Avsluta med antalet aktiva underagenter.
