# Lokal arbetsplats och städning

## Arbetsplats

Arbeta normalt i Dealer-mappen på C:. Kontrollera rot och Git-remote först. En gren är en versionspekare, ingen ny
kopia av medierna. Vanliga kortlivade grenar i samma mapp går bra; byt inte gren över någon annans pågående ändringar.
Ett extra arbetsträd behövs när parallellt arbete eller öppna utkast behöver isoleras. Återanvänd då ett lämpligt träd.
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

## Granskade äldre arbetsträd

De tre äldre träden under `.codex/worktrees/` är jämförda med main 2026-11-19. Ingen ny funktionskod behöver tas in:

| Träd | Innehåll | Var det finns nu |
| --- | --- | --- |
| dealer-evidence | Körkvitton, evidensindex, mediegranskning | Infört i `1267ff4`, sedan förbättrat |
| dealer-linsnavigation | Scenval, geometri, 3D-grepp och rendering | Infört i bland annat `20a44ad`, `2b4352e`, `b1e782b` |
| dealer-order-snapshot | Fryst orderunderlag och förhandsvisning | Infört i `20a44ad`, sedan förbättrat |

Den extra filen `giv-fran-2-3-p4-grepp-pilot.json` motsvarar G-versionens rörelse; G har dessutom planhash och
avsiktsmetadata. Äldre Casino-filer saknar senare rättningar för uppspelningsval och länkar. Återför inte dem.
Utkasten är säkrade lokalt i `private/recovery/worktrees-2026-11-19/drafts.bundle`, med fil- och snapshotlista i
`manifest.json`. Trädens enda ignorerade fil, evidensindexet, är separat kopierad och hashjämförd där. De äldre
arbetskopiorna är avvecklade. Endast huvudmappen är kvar som aktivt arbetsträd.

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

Efter varje avslutad filmbeställning: kör `npm run media:status`, kontrollera roller och referenser, rensa egna
återskapbara mellanresultat och kör rapporten igen. Bevara källfilm, styrbilder, orderkvitto och valt granskningsbevis.
Tillfälliga kopior ligger i `.runtime/<uppgift>/`; färdiga filmer och användbara prov ligger i `assets/` med en roll.
Rapporten kan köras cykliskt utan radering; det finns ingen åldersregel som ensam får radera unika filmer.

`media-audit.ts` visar användning men är inte ensam ett raderingstillstånd: exempelvis en gammal Prov-mapp
kan fortfarande visas och ha anteckningar. Kontrollera spelbank, scen, Material, Prov/Beslut, användardomar,
beställningar, referenser och pågående arbete. V6 och nu använda original skyddas. Spara skälet och exakta sökvägar.
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

## Den räddade Dealer-grenen

Kontrollerat 2026-11-19: `codex/rescue-dealer-3d-a55c463` har 48 commits utanför mains anor (31 vanliga och
17 merge-commits). Det betyder inte 48 saknade ändringar. Hela `dealer3d/` vid `a55c463` är redan införd i main
vid `bfec2a0`: båda har Git-trädet `2ee30263bd32ebce19b660b6e09b32158983f838`, och filjämförelsen är tom.
Main har därefter fått bland annat returcykel, grepprov och tester. Ingen ny merge eller cherry-pick behövs för
den räddade 3D-koden. Räddningsgrenen och den lilla bundle-filen bevarar historiken.

Detta är Dealers `dealer3d/`, inte `C:/Users/jakem/Desktop/3d-dealer`. Båda får utvecklas separat.
Eventuella framtida överföringar är uttryckliga, granskade kopior med ursprung, aldrig korsvisa beroenden.
