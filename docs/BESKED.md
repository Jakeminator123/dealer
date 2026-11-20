# Jakobs besked som gäller

Slå upp ditt ämne här när ett beslut är i fråga; sidan läses per ämne, inte i sin helhet. Ett besked per punkt: datum,
hans ord inom citattecken precis som han skrev dem (stavfelen är hans och rättas aldrig), och vad det betyder i
arbetet. Ett besked som han har ersatt flyttas till "Ersatta besked" med vad som ersatte det; inget tas bort. Ett nytt
besked skrivs in här samma dag, under sitt ämne. En punkt utan datum bar inget datum i den äldre överlämningen. Det
som väntar på hans svar står inte här utan som kort i Beslut
(`data/decisions.json`).

Innehåll: [Arbetet och dokumenten](#arbetet-och-dokumenten) · [Labbet och studion](#labbet-och-studion) ·
[Domar, beställningar och pengar](#domar-beställningar-och-pengar) · [Dealern och ankarna](#dealern-och-ankarna) ·
[Filmerna och given](#filmerna-och-given) · [Kortet](#kortet) · [Läpparna och talet](#läpparna-och-talet) ·
[Scenen och spelet](#scenen-och-spelet) · [Kopian och nätet](#kopian-och-nätet) · [Ersatta besked](#ersatta-besked) ·
[Utgått](#utgått)

## Arbetet och dokumenten

- **Projektmapp och städning** (2026-11-19): "Du ska jobba i projektet och i den mapp eller det arbetsträd som
  `codebase` eller en annan IDE använder"; "Jag vill att det mesta som inte används ska raderas". Fria händer att
  förbättra lokal struktur och rutiner. D: är inte arbetsförval. Kontrollera användning före radering; betalning
  ensam är inget skäl att arkivera allt. Båda separata projekten får utveckla 3D; förslaget att frysa Dealer drogs
  tillbaka i samtalet Jakob bifogade. Ingen hopslagning av projekten följer av detta.
  Förtydligande samma dag: "arbetar kontinuerligt i mappen på C" och "allt normalt, men gärna med omtanke om att
  repot arbetar med just videomaterial". Vanliga grenar och bra ändringar från andra IDE:er får användas; granska
  och inför det som faktiskt tillför något. Rensa färdiga mellanresultat löpande och håll materialet överblickbart.

- **Sammanhängande lokal räddning** (2026-11-18, Codex): "Styr upp det här och gör det så bra som möjligt för att spela
  upp Black Jack"; "Samordna arbetet så att vi har kontroll, även med flera metoder." Jakob gav fria händer för lokala
  ändringar, underagenter efter behov, kompakt lagring (gärna SQLite) och smart dokumentation. Arbetet fortsätter i
  befintligt repo. Han begärde återkommande push och GPT-browser-granskningar under fem timmar, med avläsning efter
  5–10 minuter. Sol 6.2 används för kvantitativa deluppgifter. Underlagets råd prövas mot aktuell kod; original,
  användarbedömningar och kortplan bevaras. Lokal kod/publicering till GitHub innebär ingen webbdeploy.

- **Målet** (2026-11-13): "nu ska vi skapa en bättre version av blackjackspelet". Arbetet gäller spelet i studion
  först; Scoutgaming är slutmålet på sikt och äger regler, slump och kortvärden.
- **Den enda vägen** (2026-11-13, kl. 07.45): "Se till att verkligen ha denna 'enda bästa väg' när jag vaknar imorgon",
  och samma natt: "Jag vill systematisera skapandet av dealer och kortflöden." En ny dealer och varje film görs längs
  den enda vägen i `tools/dealer-line.md`.
- **Normala regler, städning och dokumentation** (2026-11-13): "Gör bara det här så normalt som möjligt i repot, utan
  specialregler. Ha kontinuerlig städning och dokumentera gärna mer, det har varit ett misstag från min sida att inte
  dokumentera tillräckligt." Repot sköts som ett vanligt repo, och det som görs skrivs ned på rätt ställe.
- **Fria händer med ansvar** (2026-11-14): "Du har fria privilegier och kör på. men se till att dokumentera coh städa
  och så vidare." Huvudagenten väljer väg själv men lämnar ordning efter sig.
- **Rensa gammalt** (2026-11-17, efter frågan om projektet borde startas om; svaret var nej, navigeringen är felet):
  "Rensa gammalt otydligt skit i projektet gärna också." Det som en ändring gör överflödigt tas bort i samma ändring.
- **Ordlistan och städningen** (2026-11-17): "Finns vår ordlista som är ouppdaterad eller pekar på fel saker utifrån hur
  jag använder ord - se till att en opus 5.5 extra hög fixar det. Samt en anna opus 5.5 som får städa och radera skit
  som bara förvirrar." Ordlistan följer hans ord, och sidornas ord rättas efter den.
- **Han talar bara med huvudagenten** (2026-11-17): "kan jag kanske tala med dig hela tiden så får du delegera".
  Huvudagenten delar ut arbetet; det som bara han kan svara på blir ett kort i Beslut.
- **Huvudagenten håller ihop sessionerna** (2026-11-13): "Kör på och du delegerar och kanske nu tom ska komma vad de tre
  andra agenterna gör och se till att du har kontroll över vad alla gör". Varje bana får sin kö av huvudagenten och gör
  en typ av uppgift (samma dag).
- **Nya agenter i stället för gamla banor** (2026-11-17, kväll): "resätts eller arkiveras så att vi kan börja om med nya
  agenter". Banorna Scen, Tal och Trailer är stängda; deras filer hålls av huvudagenten tills en ny bana får dem.
- **3D-banan** (2026-11-17, kväll): "en till agent som arbetar parallellt med dig och som ska förbättra
  3D-visualiseringen av det som idag är 2D". Banan arbetar avskilt i `dealer3d/` och lämnar sin gren till huvudagenten.
- **Mått ur en riktig dealers film** (natten till 2026-11-18, till sessionen som mäter filmen): den ska se filmen, ta
  hennes handrörelser, bordets bilder, kortens storlek "och annat", bygga en modell, och "komplettera framförallt den
  som äger checkout med mått på saker samt vinklar". Hans plan är ett ankare "A3 (eller kanske A2.2 ...)" (återgivet av
  huvudagenten) och flera filmer; sessionen beställde inget förrän han sade det, vilket han gjorde med ankare 2.3
  (Dealern och ankarna), och filmen går aldrig in i Git, `assets/` eller ett prov.
- **Svaren till honom:** korta, i punktform, med procent och poäng (AGENTS). Filmer kan se utfrätta ut i hans flik
  (troligen hans skärm, inte filerna): lägg alltid en stillbild bredvid en film han ska döma.
- **Överlämningen** (2026-11-18, kl. 01.10): den gamla filen "ska raderas, elelr summerqas till några % bara av vad
  den faktistär. Det ska i grunden göras omett system så handoffsen blir rimligare sch
  smartare eller itne användas allt, eller hälst som best practice. Detta är PRIO 1 nu." och "Se till att ordna motsägelser
  och även instruktioner. Allt ska vara 4./5."
  Därför är `HANDOFF.md` en startsida med ett tak som ett test håller, och resten står här, i
  [BRISTER.md](BRISTER.md) och i lägesfilerna under `docs/lage/`.
- **Huvudagenten orkestrerar** (2026-11-18, kl. 01.54): "När du är klar med ditt arbete, försök att sätta en eller ett
  par underagenter i arbete. Du ska mest orkestrera. Se till att du får en städagent som rensar upp, samt en agent som
  stramar upp så att allt följer en rak linje." och "Delegera och använd underagenter elelr sidocahttar". Huvudagenten
  delar ut arbetet till underagenter och sidochattar och gör själv granskningen, sammanslagningen och svaren till honom.
- **Räddningsuppdraget, och banorna som underagenter** (2026-11-18, kl. 04.05, med uppdraget bifogat;
  `D:/dealer-scratch/tmp/raddning/UPPDRAG.md`): "Också vill jag att du försöker se till det som nämnts ang kritik till
  repot och att det behövs "räddas" i och med att saker blandats ihop (läs bifogat). Se om det behövs bättre rensning
  och städning. mer av "en väg" ect", och om sidochattarna 3D och MODEL: "Sdan ska du stareta upp dessa men användas
  som underagenter utifrån hur du vill använda dessa (jag kommer arkivera de sidochattarna nu)." Uppdragets fem
  kontrollpunkter (en kortgeometri och kamera, ett referensval, ankare och nodkarta, spelkärnans gräns, samma väg i
  labbet och Casinot) drivs av huvudagenten tills var och en är stängd eller står som en brist; 3D-banan och banan
  mätning och ankare 2.3 är underagenter till huvudagenten.
- **Spara tokens** (2026-11-18, kl. 03.42): "Kan du på något sätt se till att vi inte spenderar så mycket tokens? Det
  går snabbt med den här femtimmarsgrejen som körs". Kontots gräns delas av alla sessioner. En underagent startas bara
  för det han har beställt, en oberoende granskare bara för en tagning som den automatiska kontrollen släpper igenom,
  mekaniskt arbete går till en mindre modell, och en session skriver till huvudagenten en gång per färdig sak.
- **Städningen, och vem som ser över och committar** (2026-11-20). Hans ja till alla städpaket, i Beslut (kortet
  `stada-paketen`): "AJ alltihopa. men se till att underätta alla agenter med vad som ska görs och vilka filer som ska
  ske vad med typ. kanske dokumentera också elelr liknande. Gärna med bokkom up-logik så dokumetation ändras utifrån
  vad som faktist finns (kanske lite luddugt, men..). Protokollför allt som ändras7raderas och så vidare gärna åpå
  förhand i den mån det går så andra agenterna enkelt kan förstå om berörs elelr inte." Protokollet förs av
  städsessionen (STÄD) före och efter varje steg. Samma dag, till städsessionen och upprepat till sessionen dealer-29:
  "Låt de köra klart eller synaka md dem då.. När du är kalr med allt ditt ska du rapportera till agenten som ahr
  chatten "Schen & Bord från Referensbilder" som seda nska göra en övergripande koll och committa allt i proejktet
  typ". Den chatten gör alltså den samlade kontrollen och committar; varje session lämnar sin fillista dit.
- **Ny orkestrerande session, och Node 24.22.3 i hela projektet** (2026-11-20, till sessionen dealer-37 när chatten
  ovan stängdes): "Jag vill att du gör flera saker och använder underagenter för allt. Du ska mest orkestrera det som
  sker." Den sessionen tar därmed över den samlade kontrollen och commits. Om Node samma gång: "prova att installera
  den nya node-versionen och testa att allt fungerar. Om det gör det, byt över till den nyare node-versionen överallt."

## Labbet och studion

- **Handöverlägget av i grunden** (2026-11-19): "Ta bort det svarta kortöverlägget som standard så jag slipper speciallänkar. Behåll korten som ligger på bordet."
  Scen har separata reglage för Kort på bordet och Överlägg i handen. Det senare är av som standard, även i Casino;
  filmens gula/blå originalkort kan synas under utdelningen. Huvudvyn heter Scen & bord; adressen `/bordet/` består.

- **Labbet först** (2026-11-11): prov och effekter hör hemma i labbets sidor; spelet (`game.html`) är ett mellansteg
  mot Scout och får bara det han har godkänt i labbet.
- **Ett labb** (2026-11-17, kväll): "Angående det gamla och nya labbet skulle jag vilja att du lyfter över relevanta
  delar från det gamla labbet till det nya labbet och raderar allt som har med det gamla labbet att göra för att undvika
  förvirring." Det gamla labbet är borttaget; inget nytt byggs utanför studion.
- **Placering och Beställ i en vy** (2026-11-17, kväll): "Dessutom skulle jag vilja att det som nu heter placering på
  något sätt bakas ihop med det som är beställ och eventuellt fler av dessa sidomenyer, så att vi får en grund för hur
  hela det nya labbet ska vara." Det är vyn Bordet. Om det nya Placering sade han: "Nu ser allt mycket bättre ut
  angående placeringen i det nya."
- **En film ska kunna jämföras med det som skickades** (2026-11-17): med sina instruktioner och referenser ("visuella,
  om json skickas, ock skrivna"). Varje rad i Beställ visar därför exakt vad som går till Runway.
- **Bara det som skickas beskrivs** (Beslut 2026-11-17, kl. 20.22, "Ja bygg men med anmärkning"): "angående det som är
  till för att beskriva det som ska gå till runway, så ska bara instruktioner som faktist ska komma med till runway -
  finnas som är tänmkt att beskriva just detta, så att inte olika beskrivningar i nya labbet skapas som finns bara för
  att beskriva för användaren saker som ändå inte kommer komma med till runway". Skisserna (Prov `labbets-grund`) har
  hans ja; beskrivningar av rörelsen som inte skickas tas bort ur labbet.
- **Efterarbetet för sig, efter filmerna** (2026-11-17): "Det här vill jag att vi behandlar separat från hur vi
  hanterar filmerna, eftersom filmerna är det vi först måste få rätt", och det läggs där Runda och Scen ligger ("Kan vi
  också separera att själva spelet ritar saker. Utan att detta görs i ett mellansteg/efterlabborering från råmaterial
  till färdigt material - fast som är tillordnat kanske just ett företag som önskar sin företagsloggo eller liknande"),
  med prov av läppsynk under samma del. Vilket kort det är bestäms när rundan spelas, så valören ritas då; hur korten
  ser ut bestäms i efterarbetet (huvudagentens svar, som han inte har sagt emot).
- **Kortets efterarbete görs i förväg per film** (2026-11-17): "Det är bättre att vi gör detta i en post- eller
  efterkonstruktion. […] om det behövs, ta ruta för ruta och måla ut ett kort som ser riktigt bra ut", med det ritade
  kortet "något procent större än kortet". Spelet målar alltså inte kortet medan filmen spelas.
- **Skons kort i labbets bild** (2026-11-17): "Den gulaktiga kortsiluetten är cirka 50 grader för tiltat nedåt från
  ovansidan och ska vändas innot (så man ser mindre) […] Jämför bara mot kortet i en bild från en video eller bild".
  Skons kort i labbet mäts mot en ruta ur en film.
- **Bordet: en vy för plan, scen och beställning** (2026-11-17, kl. 21.46, med en bild av Placering): "Jag vill att vi
  ska ordna en bättre vy för det nya labbet. Vi ska radera det gamla labbet men se till att behålla det som är bra från
  det. […] Eftersom vi har en stillbild under placering, och att placering ska bli det nya labbet helt och hållet,
  borde det inkludera andra element, som scenen med nyvalet till vänster. Scen och placering bör ha samma typ av vy,
  och på högersidan ska man kunna ändra och laborera med detta. Detta ska också vara underlaget för beställning av nya
  filmer. Man ska kunna se vilket av filmerna man beställer, eller om man kan kombinera och beställa flera filmer. En
  specifik sak jag vill lösa är vyn för zoomning. Eftersom detta är en stillbild blir korten stela och har olika
  format, och framförallt är skons kort alldeles för stort." och "Se till att gammalt skit tar bort också och att
  strukturen blir tydlig i projektet!" Huvudagentens läsning: en vy med en ram, där bilden är kortplanen eller den
  levande 3D-scenen, allt ändras i högerspalten och beställningen är en lista av filmer i samma vy.
- **Bordet som det blev** (2026-11-17, sent; hans ord står i commit `c9a1873`): "Bra. Fortsätt standarlisera och
  förenkla allt i denna riktning. Se till attproejktet också vet vad som är vad." Bordet är den enda labbvyn, och
  Placering, Beställ och Scen leder dit.
- **Menyn** (2026-11-17, kl. 21.58): "Inte 3D leder bara till greenscreenen, så den borde heta något annat"; "Spela i
  `casino` bör rimligtvis vara samma som i `casino`, alltså som det är i `runtime`"; "Den vänstra knappen där det står
  beställ ska också ingå i den huvudsakliga menyn som nu till stor del handlar om knappen scen. Detsamma gäller knappen
  placering."; "prov och granska […] slås ihop till en knapp". Menyn är Bordet (lägena Kortplan, Beställ, Scen, Råfilm
  och Efterarbete), Karta, Granska, Material, Lipsync och Casino, med Beslut, Ordlista, Ljud och Modeller i foten.
- **Karta med Primära** (2026-11-17, kl. 21.58): "Karta och primära ska bli en och samma typ av sida, så att man kan
  följa nodträdet och se vilka som är primära och sekundära klipp och hur de sekundära klippen används […] vi ska
  högst ha några stycken videor för respektive". Kartan visar Primär och högst tre sekundära per steg.
- **Knappen Efterarbete** (2026-11-17, kl. 21.58): den stora scenen "ska ha en annan knapp på sin sida där det står 3D,
  inte 3D, spela i `casino` och så vidare. Den knappen ska heta efterarbete, där till exempel kort eller marker kan
  ligga. Här kan man efterarbeta utifrån videon och efter att man lagt på bakgrund och bord kan man lägga på overlay av
  hur korten och markerna ska se ut." Kortens och markernas utseende ändras bara i Bordets läge Efterarbete.
- **Rundan byggs av noderna** (2026-11-17, kl. 21.58): "Varför finns "Runda" ens som förval med 3 alternativ, varför
  ska mkan tex inte få lägga in egna vägar utifrån vilka noder som finns". En runda byggs av de noder som finns.
- **Städa hårt** (2026-11-17, kl. 21.58): "var aggressiv med att rensa upp och fixa i ordning nu". Gamla sidor och skal
  tas bort när deras delar har flyttat.
- **Kortbanan ska stämma med filmerna** (2026-11-17, "VIKTIGT"): det som används som instruktion eller material för
  kortets vändning ("kortbana" i Rörelse) "måste stämma med hur rörelserna är i antingen filmen om det görs postumt
  eller som det är tänkt att vara utifrån om dealern släpar eller nyper kortet och sedan öppnar upp det till själva
  spelaren. Nu så tror jag korten vrids aningen onaturligt och felaktigt från hur kortet faktist är ställt som
  utgångspossition." Labbets ritade kortbana följer filmerna, inte tvärtom.
- **Val för hand i Material** (natten till 2026-11-18): "Jag vill också kunna manuellt ändra typ ankare och klipp så
  jag får välja de som är primära eller radera eller arkivera och så vidare. Men samtidigt om jag väljer ett visst,
  kanske nytt ankare, så ska då såklart vissa andra klipp som bygger på det ankaret i så fall "gråas" eller mörkas för
  att de då inte kan härledas ur rätt ankare förslagsvis". Vilken bild som helst kan göras gällande, läggas åt sidan,
  arkiveras och tas tillbaka av honom; klipp byggda på en äldre bild mörkas. Betald media raderas aldrig från en knapp.
- **Hans egen kommentar i Prov** (natten till 2026-11-18): "Står också "inte granskad" på massor av klipp. Varför
  granskas de inte? Är det jag som ska granska? Då måste jag ju få val att kommentera.." Bara tagningar får en bricka,
  en tagning utan omdöme säger att den väntar på granskaren, och hans åsikt och kommentar på varje film och bild läses
  med `node tools/proof-notes.ts` före varje svar till honom.
- **Inget dubbelt för mobilen, och ingen Pamela av sig själv** (2026-11-18, cirka kl. 00.00): "Jag trodde att ingenting
  skulle göras dubbelt för mobilen. Generellt förstår jag inte varför vi automatiskt kan komma in till Pamela".
  Kortplan har en vy; behövs en mobilvy härleds den ur samma kort och lins. Paow står först, och en pausad dealer
  visas bara när en adress nämner den.
- **Färre val när en film beställs** (2026-11-18, kl. 01.54): "Trots att mycket har blivit tajtare finns det
  fortfarande för många val som kan leda till överlappande instruktioner för att skapa videos." En film beställs längs
  en rak linje: från vilket ankare och till vilken plats. Resten är stegets recept (`data/order-methods.json`), och
  texten som skickas säger varje sak en gång.

## Domar, beställningar och pengar

- **Utökat totalmandat för filmer** (2026-11-18, senare svar på frågan om H24-cykel-01): "Ja du får generera tills kontot är typ tomta!"
  Det ersätter totalsumman 2 500, inte kravet på granskad kvalitet. Tidigare 800 krediter per timme gäller fortsatt;
  huvudagenten förnyar det tidsatta ordermandatet inför konkreta beställningar utan att nollställa journalen.
  "Kvalitet före kvantitet, men om allt sitter, får du gärna gå vidare och skapa mycket material så länge det är bra."
  En granskad pilot föregår serien. 3D-Dealer har ett eget repo; saldot samordnas i skrivbordets DISKMASKIN.TXT.
  Senare samma dag: "max 2000 mer idag" gäller hans möjliga påfyllning; saldot räknas inte upp före ett kvitto.

- **Timtaket för sessionen 222 KORTMÄRKE** (2026-11-20): "Andra agenten får beställa för 800 krediter per timme - så
  'ja'." Sagt till sessionen dealer-29 om den nya stillbilden av Paows ankare 2.3 (två bilder, 2 × 40 krediter).
  Samma dag om städningen, om dubbletterna i `assets/` och om förkastade tagningar och äldre prov: "radera"
  (`tools/local-work.md`, "Radera oanvänt material").

- **API-nyckeln, 3 000 krediter och granskning utan kö** (2026-11-20, kl. 13.05, till sessionen dealer-37 när Runways
  MCP-inloggning saknades). Han pekade på `RUNWAY_API_KEY` i `.env.local` och skrev: "Du har 3k i budget, men behöver
  inte använda så mkt såkalrt. me ngår allt bra - fortsä'tt. Livegranskning avklipp med second opinion funkar skitbra
  från browsern så jag inte behöver gransla allt heal tiden". Beställningar får alltså gå genom API-nyckeln
  (utvecklarprojektets krediter) inom 3 000 krediter; timtaket 800 står kvar, och mandatet i `data/order-policy.json`
  är förnyat med de talen. En tagning döms av en oberoende granskare som ser den i rörelse i webbläsaren, och väntar
  inte på honom.

- **Domar åt honom, och ingen kö** (2026-11-13): "jag måste sova och du får granska och godkänna alla klipp", och kl.
  15.50, på väg ut: "jag vill nu för jag ska iväg att du godkänner allt videomaterial som innehåller de där kriterierna
  så vi får en roligare grundloop i idle/ankjare 1" och "Med andra ord vill jag inte se en sån här lista när jag är
  tillbaka!". Huvudagenten och en oberoende granskare dömer det som annars skulle vänta (`node tools/review-put.ts`),
  märkt som inte hans och ersatt av hans eget beslut; en tagning han själv har dömt rörs aldrig. Primär väljer bara han.
- **Betald generering** (2026-11-13): "Kan vi nu göra så att du beställer lämpliga filmer automatiskt utan mitt
  godkännande, för det är bara jobbigt för mig att göra allt detta med att godkänna!" Huvudagenten godkänner på hans
  uppdrag (`approval.by: "huvudagent"`; hans eget klick står som `"jakob"`) inom `data/order-policy.json`. Ramen, som
  han kan ändra: allt genom Beställ och handboken `tools/film-prompting.md`; en ändring och en tagning per metodprov,
  två tagningar per klipp när metoden är vald; varje omgång oberoende granskad innan nästa bygger på den; kostnaden
  berättas efter varje omgång. Hans är domarna i Granska och Material och allt utanför filmbeställning.
- **Budgeten** (2026-11-13, cirka kl. 15.13): "Nej du får obegränsat i budget!", och kl. 16.37 "inga tak idag".
  2026-11-17: "Vi ska inte ha någon limit på 400 krediter.. Höjj till 2k åtminstonde." Taket per beställning är 2 000
  (`data/order-policy.json`) och står som skydd mot ett misstag. Saldot sätter gränsen tills han fyller på, och
  påfyllningen gör bara han.
- **Klicket är kön** (2026-11-13): "jag vill ju kunna klicka bara i stället för att säga lägg kön, så görs det per
  automatik." Huvudagenten startar beställningsagenten (`tools/order-clerk.md`) så snart en godkänd order har en
  tagning som inte är lagd.
- **Två tagningar per klipp** (om Paow 2026-11-12): "Kör på, men kontrollerat, med det som faktiskt fungerar". Två
  tagningar, en tredje bara om båda faller, och oberoende rutgranskning i full upplösning före hans dom. Underlag till
  nya filmer är bara tagningar han har godkänt rakt av, i bankens format; Astrids och Kevins stående material används
  inte.
- **Meshy och annat betalt utanför Beställ:** Meshy bara på hans eget ja; varje betalt anrop utanför Beställ rapporteras
  till huvudagenten med belopp.
- **GitHubs kostnad** (Beslut 2026-11-18, kl. 01.47, på kortet om den låsta betalningen): "Fixat. undersök vad som
  kostar så mkt och gör så att det som kostar inte kostar så mycket". Vad som kostar på kontot är utrett
  ([BRISTER.md](BRISTER.md), "Labbet och verktygen"). Kl. 02.41, på kortet om ett tak: "Gör saker mycket enklare med
  kontroller och se till att detta repo har minimalt. […] Altså om allt detta görs på github ska det inte göras, utan
  göras lokalt gällande om det är för "dealer"", och på kortet om låset: "Vi ska inte behöva licens och radera massa
  skit om sådant finns". Det här repot kör därför ingen kontroll hos GitHub: kontrollen är pre-push och `push-clean`
  på datorn. Det som hör till ett annat repo eller till kontots inställningar föreslås för honom och ändras inte härifrån.
  Undantaget han själv gav (Beslut 2026-11-18, kl. 03.05, om kontrollerna i `scoutgaming`): "ja stäng av dem i så fall
  om elller oavsätt. Elelr ha dem på om jag pushar. men går dem nu om Kevin eller Emil pushar också?" Den stora
  kontrollen där (`croupier.yml`) är avstängd hos GitHub, ingen fil är ändrad; vad som är gjort och hur det slås på igen
  står i `D:/dealer-scratch/tmp/github-kostnad/FORSLAG-TILL-SCOUTGAMING.md`.
- **Två tusen krediter för proven** (2026-11-18, cirka kl. 02.45, om provet från en annan vinkel och givarna från
  ankare 2.3): "du får 2000 krediter att använda om du vill.. Ändra där det står 260 krediter som gräns.." Taket för de
  proven är 2 000 krediter i stället för 260; varje anrop står i en liggare, och kostnaden berättas efter varje omgång.

## Dealern och ankarna

- **Paow är dealern, Pamela är pausad** (2026-11-12): "Vi pausar Pamela när vi är klara. Sedan går vi vidare med Paow."
  och om Paows utseende "jag vill ha de yngre och nättare bilderna". Om Pamelas filmer på sajten (2026-11-17): "Jag
  vill ha kvar dem." Pamelas öppna frågor tas upp först när han häver pausen.
- **Namnet är Paow** (Beslut 2026-11-18, kl. 04.39): på frågan om hon ska heta Paulina i studion och spelet, som
  räddningsuppdraget skriver, svarade han "Nej, Paow". Inget döps om; Paulina är trailerversionen han valde bort.
- **Ingångsbild och keystone** (2026-11-12): ingångsbilden är det vi börjar från för en ny dealer, "vilken bild som
  helst"; av den görs keystone, förlagan i hög upplösning, som aldrig spelas upp. Hans tanke är att ankaret tas ur en
  video av keystone, "så att inte keystonebilder kommer in i videosekvenser"; Paows ankare är redigerade stillbilder,
  och han har inte avgjort vägen.
- **Ankare** (2026-11-12): de gröna bilderna i bankens format heter ankare, inte keystone: ankare 1 är vila, 2.1 nyp i
  skons fönster och 2.2 handen över kortet i skons öppning (orden och koderna står i `docs/SYSTEM.md`, Ordlista).
- **Kortets tre mått** (2026-11-12): riktning, lutning och perspektiv. "perspektiv är bättre", och han vill kunna
  ställa in alla tre "men också ha en normal" (förslaget: 0°, 0°, 87 %).
- **Visningen:** Paow ska kunna spela en hel runda; spelets nödlösningar (ersättare där en film saknas, utgången
  baklänges) ger vika när banken har egna filmer (`src/game-director.ts`).
- **Förvalen han sade ja till** (2026-11-13): "Jag håller med om allt annat du nämnde, så jag kan acceptera det rakt
  av". Ljuset utjämnat mellan filmer, liv i överkroppen och kopparna i relingen (de två sista när de är sedda rena),
  plats 6 från ankare 2.2, och en runda ska kunna gå via 2.2.
- **Mer rörelse när hon delar ut** (2026-11-13): "jag vill i allmänhet att paow rör sin kropp och huvud och SIN
  högerarm aningen mer när HENNES vänsterarm dealar." Bara mall 7 skrev det, och då gick kortet fel i 15 av 18
  tagningar; hur hon rör sig utan att det kostar kortet är öppet (handboken §5).
- **Returen efter en tvåhandsgiv** (2026-11-13): "OM hon har någon deal där hon använder sin vänster och högerarm så
  måste retreat/tillbakagången vara annorlunda då den andra armen är den som är utsträckt." I texten `SAY.backPass`, i
  rundan en retur med den hand som är ute (`motion.releaseHand`).
- **Farten** (2026-11-13, kl. 19.13): "Dessutom har jag tyvärr bett om att snabba upp vissa typer av rörelser, kanske
  till och med vissa `talk clips`, vilket har resulterat i att hon är jättesnabb i vissa lägen och ser konstig ut."
  `filmTempo` är 1 och en vilogest spelas klart som filmad (`IDLE_RULE.exitRate` 1); reglaget Givarnas tempo står kvar.
- **Vilans slinga** (2026-11-14): "Flera animationer kommer sedan inte in automatiskt i "grundloopen" idle eller vad vi
  nu kallar det." och "Den där hon dricker från undersidan av bortet är bra, och säkert andrasakeer som ska in i
  grundloopen". Godkända vilofilmer går in i vilans slinga av sig själva (`docs/SYSTEM.md`, Vilan).
- **Tatuerade och mindre händer** (Beslut 2026-11-17, `tatuerade-mindre-hander`): "starta upp nya filmer från "ankare
  2.2 där hon har aningen indre händer och även taueringarna. […] men också får till rätt beställningsmetod". En ny
  uppsättning byggs med tatuerade händer 10 % mindre; att måla tatueringar i färdiga filmer har fallit två gånger.
- **Fotot som förlaga** (2026-11-17): "Punkt tre, ja, foton får skickas." Hans foto får skickas till bildmodellen som
  förlaga; det ligger i `private/referenser/` och läggs aldrig i Git, i ett prov eller på sajten.
- **Den tatuerade uppsättningen är förstahandsvalet** (natten till 2026-11-18): "vi också sätter hennes tatuerade
  keystone/som förstahandsval". Keystone sittande och stående och ankare 1 med tatuerade händer gäller; nya ankare och
  filmer beställs ur dem, och bankens äldre filmer spelas tills en ny finns.
- **Ankare 2.2 ska ha blicken mot skon och en styvare hand** (natten till 2026-11-18): "Ankare 2.2 för paow vill jag
  ska vara så att hon tittar mot kortet/skon/handen […] Just hennes ankare 2.2 är dåligt i alla fall på grund av att
  hon inte har en "styvare" handhållning för att "stryka/dra trycka ut kortet ur skon, och att hennes blick inte är
  just mot skon"". Ett nytt ankare 2.2 görs; hans två anteckningar om kandidaterna (lyft armbågen; händerna lika stora
  och tummen synlig) står i Prov `paow-ankare-2-2-blick`. Kandidaterna föll ([film](lage/film.md)); nästa försök tas ur en film.
- **Ankare 2.3** (2026-11-18, cirka kl. 01.10, till sessionen MODEL; hans ord som MODEL:s rapport återger dem): "Jag
  vill att du skapar ett nytt ankare, ankare 2.3, och inget annat. Ankare 2.3 ska göra ett undantag, där ankare 1 får
  gå till ankare 2.3. Ankare 1 ska nu vara paushänder som är tatuerade, om du kan hitta det. En videofilm ska
  genereras från ankare 1, det nya, till 2.3. Där ska hon försöka ha sitt nya ankare 2.3, som de i din granskade film
  har skapat, med händerna precis vid utdelningen." Till huvudagenten kl. 01.54: "Jag vill att du inspireras av hur hon
  arbetar med händerna för att skapa ett ankare som är 2.3. […] Hon ska gå från ankare 1 till ankare 2.3 och titta ner
  mot sin hand eller den som hon ska fösa ur kortet med. Skapa en film som går dit." Ankare 2.3 är båda händerna vid
  skon precis före draget, tatuerade som i ankare 1, med blicken ned mot handen som föser ut kortet. MODEL gör det, med
  en tagning inom huvudagentens tak. Kandidaten, händerna, ansiktet och bilden i spelets storlek märkte han som Bra i
  Prov `paow-ankare-2-3` 2026-11-18, kl. 02.24, och i Beslut kl. 02.39 svarade han "Ja, registrera" på bilden med
  omgjort efterarbete (`assets/anchors/paow-ankare-2-3-a/`).
- **Dealern från en annan stol** (Prov `dealer-fran-stol-1`, 2026-11-18, kl. 02.46): första bilden "Ser "okej" ut som
  referensmaterial till en tagning från första s isidan typ", och om sista bilden: "tänk på att detta är ovanifrån och
  inte från samam vinkel". Vägen med en stillbild från sidan och dockans film från samma öga får fortsätta, men sidans
  kamera ska ha samma höjd och lutning som den i mitten, bara flyttad åt sidan.
- **Landningar per plats, eller inga** (2026-11-18, kl. 01.54, om Materials station Landningar): "Jag undrar också om
  det som kallas landningar alltid har en referensbild för kortplats nummer ett och spelare fyra. Detta bör rimligtvis
  tas bort helt, eller så bör vi skapa nya bilder för respektive position." Huvudagentens val: en giv slutar på
  platsens egen slutbild, en per plats, och den ensamma bilden för plats 4 ställs undan.
- **3D-dockan** (Beslut 2026-11-18, kl. 01.04): ja till blicken och den friare vilande handen, nej till att bygga
  vidare på Meshy-modellen av Paow, och ja till ett betalt prov av dealern sedd från stol 1.
- **Ett tredje och fjärde dealerkort** (2026-11-13): "Skapa då ett tredje och fjärde till dealer". Inte byggt: planen
  har sexton platser, så en film dit går inte att beställa; hur det ska byggas är en fråga för ett kort i Beslut.
- **Önskemål för senare** (hans lista 2026-11-11 och 2026-11-13; inget är beställt): mer av höger arm, kaffe ur en mugg
  som finns i bilden från början (gärna med Scout Gaming-loggan, pålagd efteråt), en animation på bordet, marker som
  dealern tar och betalar, insamling av korten, och en andra spelarfigur, "Astrid", som kommer in från sidan och satsar.

## Filmerna och given

- **Handleden vrider kortet** (2026-11-17): "Oavsett om hon nyper eller släpar ut kortet, alltså om hon kommer från
  ankaret 2.1 eller 2.2, måste hon vrida över handleden. Jag har pratat med dig i flera timmar om det här, men det
  verkar inte fungera. Det måste bero på något konstigt i den prompt som skickas." Han hade rätt om texten; varje mall
  för en giv säger handleden, och den som förklarar en fallen giv läser först vad ordern faktiskt skickade.
- **Kortets vändning: två sätt gäller** (2026-11-17, cirka kl. 21): "Båda dessa två sätt är giltiga som du ger exempl
  på är rimliga och gilltiga. Altså både vrida som en nyckel samt den andra. Huvudsaken är att rätt sida kommer upp mot
  spelaren och att korten har symetriskt samma storkel som de rimligen borde ha, och/eller som välj si labbet och att
  det är gult till blått som görs." Handleden vrids över (`FREE`, förvalet) eller nyckeln kring långsidan som Pamela
  (`LONG_EDGE`).
- **Ingen vit rand** (2026-11-17, samma meddelande): "Vad som får mig att böli så tveksam till det mesta i övrgt är den
  vita rand runtom korten som är en gammal instruktion jag givit - det rä därför jag undrar om kanske gammla
  instruktioner kommer med?" Ingen instruktion om vit kant har skickats (alla 98 ordrar lästa), och gamla
  beställningstexter kan inte längre skrivas in i en ny order.
- **Pröva vilka instruktioner som håller** (2026-11-17): "Men jag vill nu du testar vilka av våra instruktioner som
  fungerar bäst. Ta det bästa från Pamela och det bästa från det vi har idag. I och med att vi redan har tillbakagången
  från respetive A3 så kanske vi bara kan producera några filmer som är själva utgiven. Du får fria händer att skriva
  om instruktionerna. Kanske om du vill lägga till en bild eller beskrivning för hur korten ska vara storleksmässigt
  med." Givar beställs bara dit, och huvudagenten skriver om beställningstexterna efter vad proven visar.
- **Förlagefilmen, också för släpet** (Beslut 2026-11-17, `givprovet-forlagefilm`): "Ja, absolut. Det här skulle kunna
  vara en vridning, givet att dealern nu nyper upp kortet för att sedan vrida över det med en rörelse. Å andra sidan
  krävs det också en sådan här för när hon släpar ut ett kort, antar jag." och "det behövs ju också för och från A2.2
  till P4C1.. och kanske för alla andra spelare". Metoden med en referensfilm prövas från båda ankarna och för varje
  plats.
- **Hans öga på följdproven** (2026-11-17, cirka kl. 23.47): "Alla A-filmer ser bra ut.. C nyp ser bra ut!", och om B:
  "hela B:serien som är fel.. Det kan finnas fel eftersom Pamelas grundfilm är otydlig; det är oklart om hon växlar
  över till rätt sida innan hon trycker ner kortet, som dessutom är för litet och har vitt runt det blåa […] färgerna
  växlar en gång för mycket […] Pau i båda tagningarna släpper ner fel sida". Han godtar dockans tagning, där kortet
  glider utan finger: i den automatiska kontrollen är det en anmärkning och inget fall, och en referensfilm mäts
  själv innan den används.
- **Givens slut ska ha en logik** (natten till 2026-11-18, om arket för prov C): "Det måste finnas en logik i allt
  detta också. DOCK om det är så att det är tänkt att hon ska de sista ca 30 bildrutorna vända handen igen och skjuda
  in det så är det såkalrt bra. Men vi måste vet vd som sker!", och "När "2.1" används så ska ju rimligen
  "nyckelvridning" av kortet ske i allmänhet utan att hon ska "lyfta kortet efter det släpats" eller tryckts ut".
  Handen vänds en gång, i luften, och aldrig i slutet; ordningen per ankare står i handboken
  (`tools/film-prompting.md` §5).
- **Kortare givar, och en film till alla platser** (2026-11-18, kl. 01.54, om nästa film efter ankare 2.3): "Utifrån
  det kan vi prova att göra en film efter en förenkling av hur man skapar filmer från menyvalet bordet. En beställning
  ska läggas, och jag vill att vi kortar ner till endast två eller tre sekunder, eller vad YouTube-filmen säger
  angående utdelning till de olika positionerna. Alternativt kan du skapa en 15-sekunders film där hon delar ut till
  kort nummer ett i alla positioner." En giv beställs på 3 s (det kortaste Kling 4 tar), och filmen med kort ett till
  alla platser prövas som en tagning.
- **Given från 2.3 till plats 5, från två håll** (2026-11-18, cirka kl. 02.45): "Skapa en video när den här dealen går
  till plats nummer fem, kort ett. Jag vill ha en tagning från ankare 2.3 till den här positionen, eller
  kortpositionen ett, och spelare fem. Jag vill se detta från en sidovinkel och en rakt fram." Två tagningar av samma
  giv till P5.C1: en från bankens kamera och en från sidan.
- **Vilken vändning som helst, bara den blir bra** (2026-11-18, samma meddelande): "SE BARA TILL ATT ALLA VRIDNINGAR
  BLIR BRA, LITEW SKITSAMMA VILKEN VRIDNING SOM GJÖRS i övrigt", och om tagningen från stol 1: "i ruta 34 påbörjas en
  vridning som inte fullföljs vilket bara ser konstigt ut.. annars kanske bra." En vändning är en hel rörelse, aldrig
  påbörjad och avbruten; sättet (handleden, nyckeln kring långsidan eller ände över ände som den riktiga dealern)
  väljs efter vad som blir bäst i filmen.
- **Takten: ingången fortare, given i ett svep** (2026-11-18, kl. 03.15, om proven `paow-ankare-2-3` och
  `giv-fran-2-3-p5`): "Ankare 2.3 går för sakta. Given 2.3 är för upphackad och borde bli mer naturlig.. Den stannar
  lixom upp i mitten typ. Sista videon är okej men hon har ett bord som ändrar färger och ett ort som visar textur av
  vitt". Filmen från vila till ankare 2.3 ska gå fortare. En giv är en sammanhängande rörelse, utan stopp med kortet
  rest. Bordets gröna är densamma genom hela filmen, och kortet är slätt, utan vitt eller mönster. Om ingångsfilmen i
  Beslut kl. 04.31, efter att ha sett farterna: "Det går för sakta, och är för hackigt och hon lutar sig för mkt".
  Ingången till 2.3 beställs om: kortare, i en mjuk rörelse utan borttagna rutor, och utan att hon lutar sig längre
  än ankaret gör; ingen av de tre farterna förs in i banken.
- **Två givar till från ankare 2.3, och ingången i dubbel fart** (Prov 2026-11-18, kl. 03.30–03.55). Om tagning 3
  till plats 5: "Kan vara bra. men hon gör verkligen en konstig vridning med andra handen som tippar över kortet i
  mitten av videon. men kanske kan vi följa upp på detta och skapa två till voideos, en för kort plats nummer 1 och
  plats nummer 4. Men från samma ankare." Tagning 4 märkte han Bra. Ingångsfilmen: 2 gånger farten Bra, 1,5 gånger
  "hackar och långsam" (hans svar 1,5 på kortet i Beslut var ett misstag, sade han). Nästa filmer är given från 2.3
  till plats 4 och till plats 1, utan att den andra handen tippar kortet; ingången går in i banken i dubbel fart.
- **Ett slutbildsankare per plats, en gång för alla** (2026-11-18, cirka kl. 04.25, om att given från 2.3 saknade slutbild):
  "kan du inte skapa som en bra och logisk slutbildsankare (A3P'n') för respektive possition som sätts in på något
  sätt? Kan du inte bara lösa detta en gång för alla! Lös allt och ta oss vidare. VIll se nya filmer. Ska inte bättre
  modell än Nao Banana användas elelr använder vi någon annan?" Varje kortplats får ett ankare 3 (A3 · P1 till P7 och
  dealerns kort): bilden en giv slutar på, med handen som lade kortet vid kortet, registrerad per plats och hand och
  använd av varje giv dit. Bildmodellen väljs efter ett prov med flera modeller på en plats, inte av vana.
- **Ingången på halva tiden, eller en film genom hela rörelsen** (Granska 2026-11-18, cirka kl. 05.13, hans dom
  Underkänd på den omgjorda ingången `paow-ingang-2-3-01`): "Från ruta 45 är hon i samma possition hela tiden.
  Rimligen ska denna göras på halva tiden, eller görqas utifrån A1 till A2.3 och till sedan A3P'n' som sedan klipps
  eller nått". En film slutar när rörelsen är klar, utan ett stilla slut; hans andra väg är en enda film från vila
  via 2.3 till platsens slutbild, klippt i två. Samma stund märkte han givarna till plats 4 och plats 1 som Inte bra
  i Prov, utan skäl.
- **Dockan ska hålla kortet genom vändningen** (Prov 2026-11-18, cirka kl. 05.14, om given till plats 4): "Hon
  flippar korten lixom utanpå fingrarna.. Är denn gjort av en sån vitfigur så måste vit-figuren bli bättre med att
  sköta kordineringen med kort/fingrar". Kortet ligger kvar mellan tumme och fingrar genom hela vändningen, och det
  är handleden som vrider det (hans regel sedan 2026-11-17, "Handleden vrider kortet"); en docka där kortet rullar
  fritt i en ring av fingrar duger inte som förlaga.
- **Flera kameravinklar ur samma film** (2026-11-18, kl. 03.10 och 03.25). Först: "Kna du itne bara prova att
  förenkla.. Typ skicka filemn för när PAOW dealar till P4C1 och sedan säger du att samma video ska genereras med säg
  35% från sida". Om provet `sidovinkel-ur-film`: "Det här är mycket bra, jag vet inte hur du gjorde. Det kanske är
  exakt allt som behövs. Vi har med andra ord 35% framifrån, 35% åt sidan, och vi skulle kunna göra 70% åt sidan. Vi
  kan också spegelvända filmen till andra sidan, vilket ger oss fem olika kameravinklar. Utifrån det kan vi binda
  samman dessa vinklar för att titta åt ett visst håll. Innan vi gör det kanske vi kan göra ett prov där vi binder
  ihop de två videorna på bordet med en egen scen. Hon ser lite kantig ut, så jag kan generera en bild där hon är 35%
  åt sidan, som kan användas som ett alternativt ankare eller `keystone`-bild." En sidovinkel görs av bankens egen
  film i Runways videoredigerare, inte av nya stillbilder och en ny tagning. Först ett prov i labbet där filmen
  rakt fram och filmen från sidan binds ihop i en scen där man kan se åt sidan; hans egen bild från sidan blir
  stillbilden som styr nästa film.
- **Givens sex steg från ankare 2.1** (2026-11-13, hans skiss, inte underlag i repot): Nyp, Dra (ned på filten,
  baksidan upp), För fram (lågt längs filten, inte vänt i luften), Vrid (kortet reser sig på långsidan), Vänd upp,
  Lägg. Det är valet Vänd vid platsen (`AT_PLACE`), som planen väljer per kort i Bordets Kortplan; förvalet för en ny
  giv är handleden på vägen (`defaultFlip` i `src/order-model.ts`).
- **Nypet** (2026-11-13): i ankare 2.1 håller tumme och pekfinger i själva det gula kortet, inte i skons kant ("hon
  nyper tag i skons kant mer"); kortet får gärna vikas lite. Det står i texten, syns i posebilden och prövas i
  granskningen.
- **Kortet ur skon** (2026-11-12): "Ett kort ska tas som det ser ut i skon (inte den konstiga bild som har ett kort som
  är kort och tjockt). Sedan ska handen vrida kortet." Skon är den svarta behållaren; av bankens två bilder av den
  används för Paow den med kortet i en öppning snett framtill, i alla lägen, om han inte säger annat.
- **Referenser** (2026-11-12): V6 är i hans ögon den bästa filmen av en hel giv, "A2.1 - P4C1 - A2.1 - P4C2 - A2.1"
  (handen vänds inte vid vändningen, och kortet byter hand), och dess kortstorlek kallar han "väldigt bra" (Prov
  `v6-referens`). Plats 4 i 3D-scenen (`pamela-idle-ready-entry-01`, `pamela-p4-c1-plan-deal-02`,
  `pamela-p4-c1-plan-return-idle-01`): "väldigt bra". Betyg samma dag: P4.C1 rått original 4,5/5, V6 4/5, vita banken
  3/5, gul/blå sekvens 2,5/5, READY2 "konstiga". Senare ord om V6: se nästa punkt.
- **V6 som läge i labbet** (2026-11-18, cirka kl. 00.00): "V6-läget är jag skeptisk mot i sin helhet". V6-bilden är ute
  ur Kortplans lista. V6 står kvar som referens och kontrolleras vid varje push (AGENTS); om den ska arkiveras är hans
  ord och inte frågat än. Senare ord om V6: se nästa punkt.
- **V6 behöver inte längre vara en referens att dö för** (2026-11-20, i Beslut, anteckningen på kortet
  `stada-paketen`): ""V6"- kan vi cokså "läätta" lite på. Det som har att göra med det kan vi kanske lägga lite
  säkrare, mne behöver inte vara referenser att dö för längre alls". Skyddet får alltså lättas och V6-materialet
  läggas säkrare undan. Inget som rör V6 ändras förrän städsessionen har inventerat det och han har sett förslaget;
  regeln i AGENTS (byteidentisk återskapning, kontrollen vid varje push) gäller tills den är omskriven där.
- **Trailern med tatuerade händer** (2026-11-17, kl. 19.40): rollblad 4 har hans ja, "Ja hennes 5-faldiga bilder:er är
  nu bra". **Pausad** samma kväll: "Om allt med videon är dåligt.. Låt mig titta, mne strunt i det och pausa det
  sålänge". Inget beställs och inget byts i trailern tills han säger till.

## Kortet

- **Återbruk före egna andrakortsfilmer** (2026-11-19): spelarnas C2, C3 och senare kort använder tills vidare
  C1-rörelsen med en liten förskjutning av kortet. Egna filmer för dessa är nästa steg, inte nödvändiga luckor nu.
- **Perspektivet som sparat val** (2026-11-19): Jakob gillar ovalerna och djupkänslan. Kamerans vinkel och avstånd
  ska kunna ändras i Scen & bord och sparas för Casino. Ringar och kort följer samma bord och kamera; ingen separat
  ovaleffekt för bara markeringarna. Han vill att Casino använder det som faktiskt ställts in där. Hans förtydligande:
  det bredare, mer ovala perspektivet ska finnas som alternativ, inte automatiskt som grund (Scen: **Bred lins**).

- **B-linsen som utgångspunkt nu** (2026-11-19): Jakob vill att nya filmer följer en överenskommen standard och
  väljer tills vidare linsen i D.C3-prov B. Han bedömer B:s rörelse som rätt; kortet kan behöva granskas. C vänder
  igen till fel fysisk sida trots rätt färg. A kan vara en variant, men det landade kortet är för litet. Detta är
  inte ett Primär-val. Nya labbordrar använder redan linsen; befintliga filmer blir inte omgjorda av valet.
  Casino och labbet använder samma geometri. Före massbeställning återstår en godkänd helgiv med rätt hand och tempo;
  den matematiska perspektivkontrollen är inte ett godkännande av filmens grepp.
- **Tre geometrier som jämförelse** (2026-11-19): "Skapa en film med den gamla spelgeometrin, en för den nya och en som den gamla geometrin med nya storleken på korten"; lägg också in det nya kortet redigerbart i labbet. Jakob godkände tre D.C3-prov och deras styrbilder till Runway, högst 495 krediter. Proven ersätter inga gällande ankare, Primär-val eller labbförval; uppladdade bilder blir inte automatiskt framtida standarder. Nästa order hämtar fortfarande uttryckliga referenser ur labbets materialregister.
- **En linje för korten** (2026-11-13, kl. 15.47): "Angående förvalda och icke-förvalda kort, är jag osäker på vad som
  ska gälla. Jag vill bara att det ska bli en linje och att allt ska anpassas till en standard som passar med det som
  för närvarande finns i systemet, om det ens behövs. Jag har svårt att förstå vad som gäller för korten." Huvudagenten
  bestämmer linjen och visar resultatet, inte valen: ritade kort hela vägen, en storlek, en brytare i spelet (Ritade
  kort i Miljö; `docs/SYSTEM.md`, "Ritade kort"). Kortmattan ur filmens eget kort: "ja som val i labbet, nej för
  spelet".
- **Korten ser inte bra ut än** (2026-11-14, kl. 15.14): "Ang spelkorten så ser de inte skitbra ut heller än så länge."
  Underlägget är förvalet sedan samma timme; det som är kvar står i [BRISTER.md](BRISTER.md).
- **Kortets sidor: gul rygg, blå framsida** (Beslut 2026-11-17, `kortets-baksida`): "Kortryggen, den del av kortet som
  inte visas, ska vara gul, medan den sida där kortet visas ska vara blå. Detta kommer att ske via en overlay eller
  något annat som vi kommer överens om, vilket hör till efterarbetet. […] Allt ska ju gjöras sen gällande fram och
  baksida", och samma kväll att korten ska vara utan vit kant, "bara … blåa, med rundade kanter". Bordet visar släta
  gula och blå kort; det tryckta kortet med SG är ett val märkt som efterarbete. Vilken variant som visas avgör
  huvudagenten ("Du får ta det sista beslutet"). Tillagt på kortet 2026-11-18, kl. 01.44: "Du kan behålla SG-ryggen.
  men so msagt vill jag allt ska vara rent tills efterarbete gjörs". Spelets rygg med SG står alltså kvar, och inget
  trycks på korten före efterarbetet.
- **Märket på blå sidan** (2026-11-20): "Kan vi göra en markering på kortets blåa sida […] med ett litet rosa kryss?
  I ena hörnet av alla blåa kort ska det också finnas en liten röd cirkel. På så sätt kommer videon ha svårare att
  fuska med vilken sida av kortet som syns. Krysset kan också bidra till bättre vinklar. Spara RGB-färgen för det gula,
  blåa, kryssets färg och den lilla cirkelns färg på alla kort. Det ska synas i scen och bord, men även på andra
  ställen för att få beställningarna korrekta." Det ändrar "inget trycks på korten före efterarbetet" ovan på en
  punkt: filmkortets blå sida bär krysset och cirkeln, i labbet och på beställningens bild; den gula sidan är slät.
  I frågan stod "alltså korttryggen" om den blå sidan; samma dag rättade han det: "Jag menade att "gula" ska vara
  ryggen. Förlåt!" Gult är alltså ryggen (stängt kort, slätt), blått är framsidan (öppet kort) och bär krysset och
  cirkeln, som i beskedet ovan och i registren. Samma dag: "notera/dokumentera det X, och prick och blå och gul RGB vi
  hoppas använda i videogenereringen": gul rygg 241, 216, 0 · blå framsida 0, 130, 218 · rosa kryss 255, 120, 200 ·
  röd cirkel 225, 30, 35, på ett ställe i koden, `CARD_RGB` (`src/placement-model.ts`), och i handboken
  (`tools/film-prompting.md` §2). Var cirkeln sitter och måtten valde sessionen 222 KORTMÄRKE.
- **Ett kortformat:** kortet på plats 4 är standard och allt annat anpassar sig ("Storleken är inte problemet, utan att
  det finns olika format"; `docs/SYSTEM.md`).
- **En film per plats** (2026-11-11): platsens andra kort spelar första kortets filmer med det ritade kortet flyttat.
- **Kortens storlek: verkligt kort, justering i efterarbetet** (2026-11-17, kl. 23.14): "`assets\reference\native-0694.png`
  har ju tex skitbra kortstorlekar […] är så osäker på allt. Men finns så många spår!", och kl. 23.22: "Ang kort. Gör
  allt enkelt bara. kör vi 1.0 så kanske det är bra. men bara allt är logiskt. Min ide är ju att vi ska kunna
  efterarbeta fram en ovelay ändå där vi kanske ska kunna justera just som sånt här." Kortplanen ritar ett verkligt
  kort (storlek 1,00) genom linsen, utan eget storleksreglage; storleken justeras bara i Efterarbete.
- **Perspektiv ändrar bara kortens form** (natten till 2026-11-18, om den förra versionen): "Kortet i skon är större än
  korten som ligger närmare oss […] DC1 kanske 65% av storleken av kortet i skon […] Är det perspektivet som är fel".
  Varje kort har den verkliga kamerans storlek och plats; reglaget Perspektiv smalnar bara av den bortre kanten, ett
  värde för alla kort, och utan sparat värde ritas hans plans 87 %.
- **Planen är hans** (2026-11-11 och 2026-11-12): `placements/default.json` är incheckad på hans ja; på hans ord gäller
  perspektiv 87 %, vridning 0°, platserna speglade kring bildens mitt och dealerns två kort centrerade. Bara Bordet
  skriver filen, när han trycker Spara.

## Läpparna och talet

- **Läpparna i realtid är huvudmålet** (2026-11-17): "Jag vill ju kunna använda mig av min runpod framgent för att
  skapa realtidslipsynk. Det är det som är huvudmålet. hennes talade replikklipp är av mindre relevans, även fast dessa
  också ska sitta såklart." Arbetet med munnen gäller först realtid på hans pod; replikfilmerna kommer i andra hand.
  Runway-modellen (Seedance) är avförd, eftersom den inte går i realtid.
- **Egen körare** (2026-11-17, om Scouts lås): "Jag har ju min egna runpod och så vidare på ett eget konto ju! DU kan
  absolut skapa en egen grejj lokalt vi kanske sedan kan lägga upp på min pod om du vill?" Scouts renderer har ett
  avsiktligt lås som vi inte går förbi; en egen körare byggs ur öppen källkod, och en provkväll på hans pod är godkänd
  till högst 5 USD, med besked till honom samma dag före start.
- **Munnens storlek** (2026-11-17): "ser nog F bäst ut givet att hon faktist säger något där hon rör munnen mycket."
  Storlek F gäller.
- **Runt munnen** (2026-11-17, kvällens prov): "Runt munnen ser det inte jättebra ut, men det är godkänt för nu. Hennes
  överläpp borde bli något större"; munnen är "tillräckligt bra för att godkännas", men "området runt hennes mouth
  [är] fortfarande lite utdraget och ser överjusterat ut. Skulle det vara möjligt att få just de ytorna omkring hennes
  mouth att bli mindre animerade?" Bara läpparna läggs in; huden runt är vilofilmens, näsan påverkas inte och området
  runt munnen får röra sig lite.
- **Mindre öppen mun** (Beslut 2026-11-17, svar "Ändra": "Just när hon säger detta lägger jag insatser, tack, så ska
  hon förmodligen ha en lite mindre öppen mun. […] Utifrån hur hennes mun ser ut när den är stängd ska den max kunna gå
  upp så här, men den ska kunna gå upp lite mindre och hon ska visa mindre tänder. […] Nu ser det nästan lite
  överdrivet ut."). Provet `paow-realtid-mun-6` har hans ja kl. 21.38: storlek F, bara läpparna, mindre öppning i
  vanligt tal med dagens som tak, och hakan följer mjukt.
- **Mungiporna och överläppen** är inte lösta i hans ögon: "Hon får lixom lite som typ clown-mungipor." (2026-11-14),
  "måste som sagt med" (2026-11-17), och om den lyfta överläppen "Denna lipsync är typ sämre, bara underläppen som
  pratar" (2026-11-13).
- **Hans ja före ett byte av läppar** (2026-11-17): granskarna föredrog omläggningen i 30 av 30 och han kallade den
  "värre än förut", så den togs ut. Före nästa byte visas en jämförelse i spelets storlek och i rörelse, och hans ja
  krävs. Hans godkända `paow-tal-blackjack-sv-04` rörs inte.
- **Sättet ska dokumenteras per dealer** (2026-11-17, kl. 21.58): det nya sättet (på hans dator eller på hans RunPod)
  "ska dokumenteras så att vi vid beställning av nya videor eller arbete med `lipsync` förstår och kan ställa in vad
  som stämmer och inte stämmer för just den dealern". Det är vyn Lipsync och `data/lipsync.json`.
- **Munnen ur hennes egen film** (2026-11-17, kl. 17.20, hans idé, obyggd): leendefilmen `paow-vila-03-01` som underlag,
  så att munnen hämtas ur hennes egen film och modellen bara bestämmer när och hur mycket.

## Scenen och spelet

- **Naturligt utseende:** ljus ska komma ur rummet (panoramat som ljuskälla, skuggor i världens koordinater), inte
  målade sken. Duken han vill ha som bordets yta är `assets/scene/table.png`; 3D-filten ritar trycket med kod.
- **3D-labbet:** "fantastiskt". Bordsbenen får vara så länge de inte kostar minne; markerbrädet är reserv, avstängt.
  Bordet från backad kamera: "fruktansvärt fult" (därför underredet Två ben, obedömt). Monacos bakgrund är bra som den
  är (Beslut 2026-11-17).
- **Spelet på telefon** (2026-11-14): markeröverlägget ska göras "smartare och mindre så det inte täckeer bla vart
  marker ska in osv", "..men liggande också ser jag." Om den nya konsolen (2026-11-17): "Angående mobilversionen ser
  allt bättre ut", och filmen före spelet ligger i mitten på en liggande telefon på hans ord samma dag.
- **Scoutgaming:** inget härifrån införs där utan hans uttryckliga ord (AGENTS). Scoutgamings huvudagent har fått
  besked om det, och om att insatsrutor bör vara data per bord och filmbank.
- **Görans material** används inte (`docs/SYSTEM.md`, "Återbruk och införande").
- **Looken i Scen** (2026-11-20): förvalet Jakob-1 "är verkligen det bästa", även om det kanske inte "hänger ihop
  exakt". Basgrund med Standard ger "det här tråkiga bordet som ser ut som att det står på golvet", och "bordet är för
  stort". Dealern ses nästan framifrån, så bordet ska inte "ligga så mkt" utan vinklas mer mot spelaren: "Bred lins är
  vad jag älskar och som gör jobbet." Samma dag: "Eller ska vi ha som nu kanske så kan man ju alltid ändra efter vår
  grund?" Därför är inget ändrat: Standard är kvar som grund och Bred lins som alternativ ("Kortet", Perspektivet som
  sparat val), och ingen lutning av bordet är byggd.
- **Bordet BORD-02 i Scen** (2026-11-20): "en utomstående agent har lagt in nya bordet, som alternativ och är skitbra"
  (läst som BORD-02, det enda nya bordet i projektet den dagen; tolkningen är sessionen dealer-e7:s). Gräsduken, valet
  Gräsmatta under Spelyta, ska vara kvar som val: "behåll gräsdike". Bordet är ett labbprov, avslaget som förval, och
  spelet slår inte på det före hans ja.

## Kopian och nätet

- **Sju filmer till mobilkopian** (2026-11-19, Codex): "Ja, publicera dessa sju filmer". Beskedet gäller exakt de
  sju namngivna källfilmerna, 24,1 MB, till `dealer-lake.vercel.app`; befintligt inloggningsskydd bevaras.
  Filförteckning och verifiering finns i `assets/proofs/paow-mobile-studio-20261118/publication-20261119.json`.
- **Mobilkopia och slut på arbetspasset** (2026-11-18, senare på kvällen): "Skcika - bara om möjligt - ngonting till vercel
  som jag kan klla in från mobilen" och "Avsluta när du känner att det är nog bra. Eller om högst 4h."
  Det ger mandat att förbereda och publicera Dealer-kopian i detta arbetspass; den befintliga åtkomsten bevaras.
- **Allt på nätet är sekundärt** (2026-11-17, sent): "Allt på nätet är sekundärt". Inget arbete läggs på kopian, och
  `cloud/` står orörd tills han säger att den ska bort. En publicering görs bara på hans uttryckliga ord (AGENTS och
  skillen `publicera-kopian`).
- **Kopians lösenord** (2026-11-18, kl. 01.10): "Lösenordet ska sättas i .env.local eller om det är .env." Inget
  lösenord skrivs i någon fil som Git följer. Det gamla ordet har stått i repots historik och ska bytas: ett nytt ord
  i `.env.local` och sedan en publicering, som är hans ord. Hans ord kom i Beslut 2026-11-18, kl. 01.47, på kortet
  `kopians-losenord`: "Ja, publicera". Det gällde den publiceringen; nästa kräver hans ord igen.
- **Kopian till chefen** (2026-11-13): "Sedan valet att spela i casinot eller komma till studio/labbet … Eller bara
  samma radda av alternativ som finns på vänsterspalten". Kopian har samma meny som studion.
- **Kopian är öppen för läsning** (2026-11-14): "Se till att den inte är lösenordsskyddad." Boten och önskemålslådan
  kräver fortfarande lösenordet, eftersom boten kostar per fråga; han svarade "Ja" i Beslut på att öppna den, med
  frågan "Vilkne är botten?". Det är förklarat, och boten öppnas först när han säger det igen.
- **Trailrar** hålls utanför kopian (2026-11-12), utom filmen före spelet bakom `/trailer` (2026-11-13: "så att man
  övergår till henne i URL:en på vercel"); trailerproven i Prov är spärrade (`data/studio-release.json`).
- **Vercel** (2026-11-12): kopian och botens anrop via AI Gateway ligger i hans eget team, där krediterna finns
  (`docs/DRIFT.md`).

## Ersatta besked

- **Tidigare budget i räddningsomgången** (2026-11-18, ersatt av senare totalmandat ovan): "du har totalt 800 krediter per timme och 2500 krediter för att generera filmer."
  Det ersatte tidigare svaret "Högst 1 000 krediter totalt". Timtaket 800 gäller fortfarande.

- **Räddningsomgångens första budget** (2026-11-18, Codex): "Högst 1 000 krediter totalt" för nya betalda Runway-försök
  under femtimmarsarbetet. Ersatt samma dag av 800 per timme och 2 500 totalt (Domar, beställningar och pengar).

- **Publicering efter varje färdig del** (hans stående ord enligt den gamla överlämningen, som inte återgav det som
  citat: kopian publiceras ur `main` efter varje färdig del, push och publicering, så att det syns på Vercel). Ersatt
  2026-11-17 av "Allt på nätet är sekundärt" (Kopian och nätet); inget har publicerats sedan dess, och AGENTS kräver
  hans uttryckliga ord. Att han har dragit tillbaka det stående ordet är huvudagentens läsning åt det säkra hållet och
  bör bekräftas av honom med ett kort i Beslut.
- **Tak på 400 krediter per beställning.** Ersatt 2026-11-17 av "Höjj till 2k åtminstonde" (Domar, beställningar och
  pengar).
- **Dagstak och golv för krediter.** Ersatta 2026-11-13 av "Nej du får obegränsat i budget!" (samma avsnitt).
- **Betald generering kräver hans ja per beställning.** Ersatt 2026-11-13 av uppdraget till huvudagenten (samma
  avsnitt).
- **Den tatuerade uppsättningen bredvid den gamla** (2026-11-17, kl. 21.38, hans svar om det nya ankare 1): "Ja. Mne vi
  kanske kan göra om en 'A1 till A2.2 och sedan framgent de filmer som görs, tillsi får till hur vi ska göra filmerna,
  faktist , så kan vi göra med tatueringar. men låt nuvarande vara kvar så kan vi fylla i dem när vi får till resten".
  Ersatt natten till 2026-11-18 av att den tatuerade uppsättningen är förstahandsvalet (Dealern och ankarna); det som
  står kvar av svaret är att dagens filmer ligger kvar och spelas tills nya finns.
- **Kandidaten för ankare 2.2 gäller** (2026-11-13, ett av förvalen han sade ja till). Ersatt natten till 2026-11-18
  av hans ord att ankare 2.2 "är dåligt" och görs om (Dealern och ankarna).
- **Alla kort ×1,20 i planen** (2026-11-11; P4 86,6 × 71,8 bildpunkter). Ersatt 2026-11-17 kl. 23.22 av "kör vi 1.0"
  (Kortet) för det som Bordet ritar; planfilen själv är inte omskriven, och spelet ritar ännu sina liggande kort på
  det äldre sättet ([BRISTER.md](BRISTER.md), Kortet).
- **V6 som den bästa filmen och förlaga för kortens storlek** (2026-11-12). Delvis ersatt 2026-11-18 av "V6-läget är
  jag skeptisk mot i sin helhet" (Filmerna och given): V6 är kvar som skyddad referens men inte som läge i labbet.
- **En yta för beställning** (2026-11-17): "Vart är min 'labb'-yta där jag kan se en typ avatar/siluett och sedan kort
  och bord, jag kan ställa in allt som jag vill, sedan ska jag kunna lägga en beställning för en film. Tex 'A2.2 till
  P3C2 och tillbaka till A2.2'?" Uppfyllt och ersatt samma kväll av beskedet om Bordet (Labbet och studion).
- **Omläggningen av läpparna med hennes egen underläpp och gipor.** Uttagen 2026-11-17 på hans dom (Läpparna och talet).

## Utgått

Citat ur den gamla överlämningen (`HANDOFF.md` till och med commit `aa5f7e7`) som inte är ett besked av Jakob och
inte styr något arbete framåt. De står här för att kontrollen av citaten ska gå jämnt ut, med skälet.

- "like turning a key": mall 10:s egna ord för vändningen, inte Jakobs. Orden står i `src/order-prompts.ts` och
  handboken (`tools/film-prompting.md` §5).
- "Ny beställning som den här": namnet på en knapp i Beställ, nämnt i rapporten om städningen 2026-11-17, som är
  avslutad (knappen skriver med dagens mall).
- "Kortens storlek och perspektiv": rubriken på en punkt under de kända bristerna som beskrev läget före `918e7f4`
  och `f8c637f`; det som återstår av den står i [BRISTER.md](BRISTER.md) och i [lage/kort.md](lage/kort.md).

