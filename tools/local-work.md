# Lokal arbetsplats och städning

## Arbetsplats

Allt arbete görs i mappen `dealer` på C: (AGENTS, "Git och samarbete"). Kontrollera rot och Git-remote först. En gren
är en versionspekare, ingen ny kopia av medierna; byt inte gren över någon annans pågående ändringar. Ett eget
arbetsträd bara när ett arbete uttryckligen behöver isoleras. Byggträdet
`C:/Users/jakem/dev/super-feature-sg/dealer-bygg` är bara för `push-clean` och `studio-from-commit`, och står kvar.
Ändringar från andra IDE:er jämförs med main, granskas och testas. Använd merge för en sammanhängande gren,
cherry-pick för en avgränsad commit eller en granskad patch för osparade ändringar. Kopiera inte tillbaka äldre hela filer.
`push-clean.ts` och `studio-from-commit.ts`
kräver `--trad <absolut mapp>`. Inga nya källkopior eller arbetsmappar skapas automatiskt på D:.

- `assets/`: en kanonisk kopia av material som används eller har en konkret roll; registrera rollen.
- `.runtime/<uppgift>/`: tillfälliga bilder, filmer, byggen och lokala kvitton. Ta bort egna överflödiga kopior
  efter kontroll; flytta det som ska visas till `assets/` och registrera det. En kort README beskriver syftet,
  vad som ska sparas och hur ett mellanresultat kan göras om. Ingen ny full mediekopia per IDE eller granskare.
- `evidence/` och registren: små sökvägar, hashvärden, domar och kvitton. Spara inte en ny filmkopia per rapport.
- Släpp egna hjälpprocesser och färdiga arbetsträd efter att deras ändringar och nödvändiga filer säkrats.
  Behåll Jakobs aktiva förhandsvisning. Rör aldrig ett annat projekt som en del av den här städningen.

## Översikt och mängd

`npm run media:status` bygger `.runtime/media-status/LASMIG.md` och `status.json` ur befintliga register och filer.
Översikten visar vad de största mapparna är, hur de används, tillfälliga mappar och förändringen sedan föregående
inventering. Den är en återbyggbar rapport, inget nytt register att underhålla. Hårda länkar räknas en gång i
unika filbytes; storlek per sökväg visas separat. Rapporten följer inga junctions och raderar ingenting.

Video tar plats, men en bildserie kan vara mycket större än sin film. `render-reference.ts` tar därför bort
mellanrutorna efter lyckad filmkontroll, kontaktark och slutruta. Filmen, indata, kontaktark, slutruta och kvitto
stannar kvar. `--keep-frames` används bara när rutorna behövs för felsökning. Misslyckade körningar behåller sitt
underlag tills felet har utretts. Spara ett valt resultat och relevanta jämförelser, inte varje omrendering.

Efter mediearbete: rensa egna färdiga mellanresultat, flytta och registrera den valda leveransen, kör översikten.
Äldre unika original granskas efter användning, inte efter en automatisk åldersgräns. D: kan vara ett uttryckligt
arkivval för sådant som ska bevaras men inte används; flytt är inte en minskning av den totala mängden.

## Äldre träd och grenar

De tre äldre Codex-träden (dealer-evidence, dealer-linsnavigation, dealer-order-snapshot) jämfördes med main
2026-11-19. Det som tillförde något är infört (bland annat `1267ff4` och `20a44ad`); äldre filer därifrån återförs
inte. Utkasten är säkrade i `private/recovery/worktrees-2026-11-19/drafts.bundle`, med fil- och snapshotlista i
`manifest.json`. Git har bara `dealer` och byggträdet `dealer-bygg` som arbetsträd.

Räddningsgrenen `codex/rescue-dealer-3d-a55c463` och bundle-filen bredvid projektet bevarar historiken. Hela dess
`dealer3d/` finns redan i main (`bfec2a0`, samma Git-träd), så ingen merge behövs. Detta är Dealers `dealer3d/`, inte
`C:/Users/jakem/Desktop/3d-dealer`: båda får utvecklas separat, och en överföring är en uttrycklig, granskad kopia med
ursprung, aldrig ett korsvis beroende.

## Automatisk återkoppling från webbläsaren

Lokala labbet registrerar långsamma interaktioner (minst 200 ms) i
`.runtime/interaction-diagnostics/recent.json`. Alla IDE:er kan läsa dem med
`node tools/interaction-diagnostics.ts`. Läs vid rapporterad tröghet och efter klickprov.
Loggen skiljer väntetid före händelsen, händelsehantering och tid till nästa bild. Sökvägen före
navigeringen, mållänk, studiobyggets SHA och flikens synlighet följer med. Inmatad text, URL-parametrar och
sidinnehåll sparas inte. Högst 200 poster behålls; inget skickas till en extern tjänst.

Detta är felsökningsprov, inte en beräkning av webbplatsens INP eller bevis för orsaken till ett extremvärde.
En siffra i en skärmbild räcker inte för att skylla tiden på menylänken. Återskapa klicket och jämför delarna.
Loggningen laddas efter omladdning; webbläsare utan Event Timing stöder inte insamlingen.

Vercels [Interaction Timing](https://vercel.com/docs/vercel-toolbar/interaction-timing-tool) visar den aktuella
sessionens mätning. Sparade Toolbar-kommentarer kan hämtas med Vercel-anslutningens `list_toolbar_threads`
och `get_toolbar_thread` för projektets verifierade ID. INP-rutan blir inte automatiskt en sådan kommentar.
Nätkopian har inte denna lokala loggning; publicering och extern insamling är separata ändringar.

## Radera oanvänt material

Gallringen (Jakob 2026-11-21: "kan du inte bara fixa upp något bra ang detta?") är ett verktyg i tre nivåer.
`npm run gallra` skriver bara rapporten: `.runtime/gallring/LASMIG.md` och `plan.json`, med varje fil, skälet, storleken
och antalet hårda länkar. `npm run gallra -- --kor` utför nivån **säkert** och inget annat: hans egna Inte bra som
inget pekar på, det som bevisligen går att göra igen, och byteidentiska filer som blir en fil. `--kor --grupp <namn>`
utför EN grupp ur **förslag**, och bara på hans ord om den gruppen. Nivån **blob** är bara förberedd: det som kan
ligga enbart på den nya Blobben när den finns. Spärren (Primär, Godkänd, Variant, det spelet har, roller, V6,
original, referenser, noir-samlingen, filmen före spelet, det Beslut eller en öppen order nämner, och allt yngre än
tre dygn) kontrolleras för varje fil precis innan den rörs. Det som går flyttas först till
`D:/dealer-scratch/papperskorg/<datum>/` och ligger där i 14 dygn (`--tom-korgen` tömmer det äldre); planen gäller
i 24 timmar, sedan görs rapporten om. Kör rapporten efter varje filmomgång och `--kor` när den visar något säkert.

Efter varje avslutad filmbeställning: kör `npm run media:status`, kontrollera roller och referenser, rensa egna
återskapbara mellanresultat och kör rapporten igen. Bevara källfilm, styrbilder, orderkvitto och valt granskningsbevis.
Tillfälliga kopior ligger i `.runtime/<uppgift>/`; färdiga filmer och användbara prov ligger i `assets/` med en roll.
Rapporten kan köras cykliskt utan radering; det finns ingen åldersregel som ensam får radera unika filmer.

`assets/noir/` är Jakobs samling av noir-filmerna (2026-11-21: "hitta alla noir-filmer och lägga dem i en speciell
mapp"), med `LASMIG.md`: v4 av trailern och det som kom efter, originalet på 30 sekunder och klippen v4 är byggd av.
Det som kom före v4 och alla lätta kopior raderades samma kväll på hans ord. Samlingen bevaras och är inte löst
material; filerna som redan fanns i projektet är hårda länkar dit, så originalen i provet och spelets ingång ligger
kvar. Bygget av v4 läser ljud och typsnitt ur slaskdiskens `tmp/trailer-2/`: de mapparna raderas inte.

`media-audit.ts` visar användning men är inte ensam ett raderingstillstånd: exempelvis en gammal Prov-mapp
kan fortfarande visas och ha anteckningar. Kontrollera spelbank, scen, Material, Prov/Beslut, användardomar,
beställningar, referenser och pågående arbete. Det som står kvar av V6 (filmen och 18 rutor i `assets/reference/`,
duken och plåten; resten är arkiverat, DRIFT "D: och städning") och nu använda original skyddas. Spara skälet och exakta sökvägar.
Unikt material som verifierats oanvänt får raderas enligt Jakobs besked 2026-11-19; arkivera inte allt för att det
en gång kostade krediter. Registren ska samtidigt beskriva att materialet tagits bort, så inga aktiva länkar bryts.

Byteidentiska mediefiler i `assets/` kan dela en och samma fil på disken genom hårda länkar (Jakob 2026-11-20:
"radera" om dubbletterna; båda sökvägarna finns kvar, så inget register ändras). Skriv därför aldrig om en färdig
mediefil på plats: en ny version får ett nytt namn, eller skrivs till en tillfällig fil som sedan byter namn, annars
ändras tvillingen med. Talets filer (`assets/speech/`), V6, originalen och referenserna delar inte fil med något.
En förkastad tagning vars film är raderad har en `RADERAD.txt` i sin mapp; registret i `motions/` står kvar.

För gamla dubbla arbetskopior finns `node tools/media-dedupe.ts --source <absolut slaskmapp>`.
Förvalet inventerar bara. `--apply` raderar gamla mediekopior först efter SHA-256-jämförelse med en bevarad fil
i projektets `assets/`. Det väljer ingen disk, följer inga länkar, hoppar över källträd och beroenden, skyddar
namngivna sökvägar och processer samt filer yngre än tre dygn. Varje borttagen fil kvitteras under
`.runtime/cleanup/`. Kontrollera först att den valda mappen ägs av detta projekt; verktyget kan inte avgöra
ägarskap åt operatören. Kvittots byteantal är filernas logiska storlek, inte uppmätt frigjort diskutrymme.
