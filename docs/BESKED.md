# Jakobs besked som gäller

Slå upp ditt ämne när ett beslut är i fråga. En punkt är ett besked: rubrik, datum och vad som gäller nu, på högst två
rader. Hans egna ord står kvar bara där ordalydelsen själv styr (skydden och smaken); stavningen är hans. Ett nytt
besked skrivs in samma dag som en rad under sitt ämne. Ett besked som ett senare ord har ändrat skrivs om till det som
gäller, och en beställning som är utförd stryks. Äldre och ersatta besked, med hela citaten, finns i Git (sista långa
versionen: `c7bd6fe`). Det som väntar på hans svar står som kort i Beslut (`data/decisions.json`), inte här.

## Arbetet och dokumenten

- **Målet** (2026-11-13): "nu ska vi skapa en bättre version av blackjackspelet". Arbetet gäller spelet i studion.
- **Frikopplat från Scoutgaming** (2026-11-23): "Detta proejkt ska vara frikopplat mot scoutgaming i nuläget". Repot
  står på egna ben och behöver inget därifrån; inget ändras i Scoutgaming härifrån.
- **Normalt repo utan specialregler** (2026-11-13): "så normalt som möjligt i repot, utan specialregler". Arbetet görs i
  mappen `dealer` på `main`; ett extra träd bara när det uttryckligen behövs (2026-11-21).
- **Rensa bort regler och låsningar som blockerar** (2026-11-23): en regel står bara om den är hans daterade ord eller
  skyddar honom; efter ett fel rättas orsaken, utan nytt förbud, test eller spärr (AGENTS, "Regler och spärrar").
- **Dokumenten ska vara smidiga** (2026-11-23): "docks/besked måste bli betydligt smidigare", och det gäller alla
  dokument och rutiner i `docs/`. Kort, en sak på ett ställe; det en commit eller ett register säger står inte här.
- **Städa löpande och hårt** (2026-11-17, 2026-11-19): "Jag vill att det mesta som inte används ska raderas". Det en
  ändring gör överflödigt tas bort i samma ändring; kontrollera användning före radering.
- **Tester: en kärna** (2026-11-21): kvar är de som skyddar publiceringen, spelets regler, hans domar och val och
  beställningarna. Den lokala sviten körs en gång per push.
- **Media på datorn gallras** (2026-11-20, 2026-11-21): det en regel ensam avgör (hans Inte bra, återskapbart,
  dubbletter) tas bort och går att ta tillbaka i 14 dygn; annat tas på hans ord (`tools/local-work.md`).
- **Aldrig gallrat:** Primär, Godkänd, Variant, ankare och det spelet spelar; varianterna är han "rädd för att
  förlora" (2026-11-21).
- **Media på nätet** (2026-11-21): bara det Casinot använder och det som prövas i Scen & bord, i en Blob på Vercel med
  ett träd per dealer från A1. Görs vid en publicering på hans ord.
- **Den enda vägen** (2026-11-13): en ny dealer och varje film görs längs `tools/dealer-line.md`.
- **Fria händer med ansvar** (2026-11-14): "Du har fria privilegier och kör på. men se till att dokumentera coh städa".
- **Ordlistan följer hans ord** (2026-11-17), och sidornas ord rättas efter den.
- **Huvudagenten orkestrerar** (2026-11-13, 2026-11-18, 2026-11-20): delar ut arbetet till underagenter och sidochattar,
  granskar, slår ihop, committar och svarar honom. Vem det är står i HANDOFF, "Vem äger vad".
- **Han talar helst med huvudagenten** (2026-11-17): ett önskemål, inget förbud; han öppnar andra chattar när han vill.
- **3D-banan** (2026-11-17): arbetar avskilt i `dealer3d/` och lämnar sitt arbete till huvudagenten.
- **Spara tokens** (2026-11-18): kontots gräns delas av alla sessioner. En underagent bara för det han har beställt,
  mekaniskt arbete till en mindre modell, och en rapport till huvudagenten per färdig sak.
- **Överlämningen** (2026-11-18): `HANDOFF.md` är en startsida med tak; motsägelser rättas, och "Allt ska vara 4./5."
- **Svaren till honom:** korta, i punktform, med procent och poäng; en stillbild bredvid varje film han ska döma.
- **Den riktiga dealerns film** (2026-11-18): den mäts bara, och går aldrig in i Git, `assets/` eller ett prov.
- **Räddningsuppdraget** (2026-11-18): en kortgeometri och kamera, ett referensval, ankare och nodkarta, spelkärnans
  gräns och samma väg i labbet och Casinot drivs av huvudagenten tills varje punkt är stängd eller står i BRISTER.

## Labbet och studion

- **Labbet först** (2026-11-11): prov och effekter hör hemma i labbet; spelet (`game.html`) får bara det han har
  godkänt där.
- **Ett labb** (2026-11-17, 2026-11-23): studion på `http://127.0.0.1:4319/studio/` är den lokala sajten, och inget
  byggs utanför den. Han visas sidor där, inte lösa provsidor ("Nu komemr massa gammal provsidor upp hela tiden").
- **Bordet (Scen & bord) är den enda labbvyn** (2026-11-17, 2026-11-19): plan, scen och beställning i en vy, och allt
  ändras i högerspalten. "Fortsätt standarlisera och förenkla allt i denna riktning."
- **Enkelt och logiskt, och en beställning ska gå att kontrollera** (2026-11-21): varje steg visar sin slutbild, och
  texterna är "så bra som möjligt utan att vara onödigt avancerade". Gammalt och döda sökvägar tas bort.
- **Paows träd fylls med kommandon** (2026-11-21): beställningar "på det nya sättet och helst genom typ kommandon", och
  "bara en giv per kort för respektive spelare" tills trädet är fullt.
- **Kort i Beslut bara för provmaterial** (2026-11-21): ett kort bär en film eller bild han ska döma. Teknik,
  publicering, Blob och arbetssätt frågas i chatten: "Sånt här ska den inte ha att göra med alls!"
- **Överlägg i handen är av i grunden** (2026-11-19), även i Casino: "Ta bort det svarta kortöverlägget som standard så
  jag slipper speciallänkar. Behåll korten som ligger på bordet."
- **Beställ visar exakt vad som skickas** (2026-11-17): varje rad visar instruktionerna och referenserna som går till
  Runway, och inget beskrivs i labbet som inte skickas.
- **Färre val när en film beställs** (2026-11-18): från vilket ankare och till vilken plats. Resten är stegets recept
  (`data/order-methods.json`), och texten som skickas säger varje sak en gång.
- **Efterarbetet för sig, efter filmerna** (2026-11-17): "filmerna är det vi först måste få rätt". Kortens och
  markernas utseende ändras bara i Bordets läge Efterarbete; valören ritas när rundan spelas.
- **Grafiken på kortet** (2026-11-23, till dealer-e7): "grafiken" är det som läggs på kortets baksida och framsida, på
  kortmodellens spår. Han vill se den "på och mot" alla filmer som finns (`/kortlandning.html`) och "ett bra system med grafiken".
- **Styvt kort i handen, utan vit kant** (2026-11-23, två ja i Beslut): Scen ritar kortet med en storlek i handen och tar
  bort den vita kanten kring filmens kort. Spelet rörs inte förrän han har sagt ja till det där.
- **Kortets efterarbete görs i förväg per film** (2026-11-17): spelet målar inte kortet medan filmen spelas; det ritade
  kortet är "något procent större än kortet".
- **Kortbanan följer filmerna** (2026-11-17, "VIKTIGT"): labbets ritade bana och vändning stämmer med hur dealern
  faktiskt släpar eller nyper kortet, inte tvärtom. Skons kort i labbet mäts mot en ruta ur en film.
- **Karta med Primära** (2026-11-17): en sida där nodträdet följs, med Primär och högst tre sekundära filmer per steg.
- **Rundan byggs av noderna** (2026-11-17): egna vägar ur de noder som finns, inga tre förval.
- **Menyn** (2026-11-17): det som hör ihop är en knapp: Placering, Beställ och Scen i Bordet, Prov i Granska. Att spela
  i Casino från labbet är samma Casino.
- **Val för hand i Material** (2026-11-18): han kan göra vilken bild som helst gällande, lägga den åt sidan, arkivera
  och ta tillbaka; klipp byggda på en äldre bild mörkas. Betald media raderas aldrig från en knapp.
- **Hans kommentarer i Prov** (2026-11-18): hans åsikt och kommentar på varje film och bild läses med
  `node tools/proof-notes.ts` före varje svar till honom.
- **Inget dubbelt för mobilen, ingen Pamela av sig själv** (2026-11-18): en vy; en mobilvy härleds ur samma kort och
  lins. Paow står först, och en pausad dealer visas bara när en adress nämner den.

## Domar, beställningar och pengar

- **Hans domar är hans** (2026-11-13): domarna i Granska och Material och valet av Primär sätts bara av honom. En
  tagning han själv har dömt rörs aldrig, och hans beslut ersätter en dom som gjorts åt honom.
- **Domar åt honom, och ingen kö** (2026-11-13): "Med andra ord vill jag inte se en sån här lista när jag är tillbaka!"
  Huvudagenten och en oberoende granskare dömer i hans ställe (`node tools/review-put.ts`), märkt som inte hans.
- **Betald generering utan hans klick** (2026-11-13): "beställer lämpliga filmer automatiskt utan mitt godkännande".
  Huvudagenten godkänner på hans uppdrag inom `data/order-policy.json`, genom Beställ och `tools/film-prompting.md`.
- **Två tagningar per klipp** (2026-11-12, 2026-11-13): en ändring och en tagning per metodprov; två per klipp när
  metoden är vald, en tredje bara om båda faller. Varje omgång granskas oberoende i full upplösning före nästa.
- **Mandatet** (2026-11-18): "Ja du får generera tills kontot är typ tomta!". 2026-11-23 kväll: "du får 1000 i timmen, men vi kan öka
  till 2000 timmen idag"; kl. 21.10 "Du får 3k denna timme för att producera material" (`data/order-policy.json`). En granskad
  pilot föregår en serie; kostnaden sägs efteråt.
- **Kvalitet före kvantitet** (2026-11-18): "men om allt sitter, får du gärna gå vidare och skapa mycket material så
  länge det är bra."
- **API-nyckeln** (2026-11-20): beställningar får gå genom nyckeln i `.env.local` (utvecklarprojektets krediter) när
  Runways MCP-inloggning saknas.
- **Taket per beställning är 2 000** (2026-11-17), som skydd mot ett misstag (`data/order-policy.json`). Saldot sätter
  gränsen, och påfyllningen gör bara han.
- **Klicket är kön** (2026-11-13): en godkänd order läggs utan att han säger till (`tools/order-clerk.md`).
- **Underlag till nya filmer** (2026-11-12): bara tagningar han har godkänt rakt av, i bankens format. Astrids och
  Kevins stående material används inte.
- **Betalt utanför Beställ:** Meshy bara på hans eget ja; varje betalt anrop utanför Beställ rapporteras till
  huvudagenten med belopp.
- **Inget körs hos GitHub** (2026-11-18): "om allt detta görs på github ska det inte göras, utan göras lokalt".
  Kontrollen är pre-push och `push-clean` på datorn; det som hör till ett annat repo eller kontot föreslås för honom.

## Dealern och ankarna

- **Paow är dealern; Pamela är arkiverad** (2026-11-23): "ingenting ska behöva ha dennes referenser. Vi har en docka som
  används". Hon, V6 och originalen ligger i `D:/dealer-archive/`. Hennes filmer på sajten: fråga före publicering (2026-11-12).
- **Namnet är Paow** (2026-11-18), inte Paulina; hennes utseende är "de yngre och nättare bilderna" (2026-11-12).
- **Ingångsbild och keystone** (2026-11-12): ingångsbilden är det en ny dealer börjar från, "vilken bild som helst"; av
  den görs keystone, förlagan i hög upplösning, som aldrig spelas upp.
- **Ett ankare heter alltid A och sitt nummer** (2026-11-21): "Det är alltid ett stort A. För ett ankare." A1, A2.1,
  A2.2, A2.3 och A3P2C1 ("Ankare 3, Player 2, card 1", skrivet ihop). Aldrig en bokstav efteråt; register-id:n är id.
- **Vad ankarna är** (2026-11-12, 2026-11-21): A1 vila, A2.1 nyp i skons fönster, A2.2 "som 2.1 fast med tatueringarna"
  (enhandsgiv), A2.3 båda händerna vid skon före draget, A3 där ett kort har landat, ett per spelare och kort.
- **Släpet med handbyte ges från A2.3** (2026-11-21): ett kort vars plan säger handbyte beställs från A2.3, där
  vänster hand drar ut kortet och höger lägger det.
- **A2.3 som gäller** (2026-11-18, 2026-11-20, 2026-11-23): en riktig filmruta med blicken ned mot kortet
  (`paow-ankare-2-3-d`, "Ja, byt blicken"). A1 får gå direkt till A2.3; ingången `paow-ingang-2-3-03-01`: "Jättebra!"
- **A2.2 är arkiverad** (2026-11-23): han arkiverade båda A2.2-bilderna i Material: "Ser inte att den används".
  Casinots giv till plats 6 börjar där tills den "kan passas in i de andra nodträden via befintliga klipp".
- **S är sätet, kameravinkeln ett ankare ses ifrån** (2026-11-21): S2-A2.2 är ankaret sett från plats 2:s kamera;
  utan S är det den raka kameran.
- **Karta får kameran som en dimension** (2026-11-23): den börjar på "standard-plats 4-kameran", och "ett reglage",
  kanske musens hjul, byter till kamera 1–7. En film från en annan stol sparas i sitt träd där.
- **En film från en annan stol** (2026-11-23): "Detta skulle kunna vara en bra video", men kortet ska byta sida efter
  hur det ses från stolen, "inte tidpunkt", och kameran "känns högre än kamera frammifrån".
- **Träd läggs ihop till en komposition** (2026-11-23): nodträd kombineras med andelar ("A2.3 … 20% och 80% A2.1"), varianter
  likaså; en retur går hem till sitt eget A2, med skarv eller kort brygga emellan. Alla vyer ska hänga ihop med träden.
- **Bara träd som passar ihop** (2026-11-23 kl. 21.10): "för nu … INTE får sätta samman nodträd om de är inkompatibla såsom
  nu" (olika händer). Det tatuerade trädet byggs vidare; A2.1 görs om med hennes mindre händer och tatueringar.
- **Fart** (2026-11-23): klipp ska kunna spelas i 1,5× eller 2×, sparat i en komposition och som klippets egen standard;
  givarna gärna i dubbel fart.
- **Kartas meny, nivåer och bryggor** (2026-11-23 kl. 21.35): raden med träd och kompositioner är "ful" och görs om; i den
  sammanlagda vyn ska träden gå att se som nivåer man rullar mellan, och bryggorna ska gå att klicka fram.
- **Registren i en databas** (2026-11-23 kl. 21.35): "Alla .json i tex 'motion' måste in" i en SQLite-databas och filerna
  tas bort, "självsanerande": tas en film bort försvinner dess poster. Byggs på grenen `register-sqlite`.
- **Flera namngivna träd per dealer** (2026-11-21): omkring tre träd, och löst material för sig som är lätt att radera,
  på hans ord. Datorn och nätet ska kunna läsa samma Blob; uppladdning kräver hans ord.
- **Den tatuerade uppsättningen är förstahandsvalet** (2026-11-17, 2026-11-18): tatuerade händer, 10 % mindre. Nya
  ankare och filmer beställs ur den; bankens äldre filmer spelas tills en ny finns.
- **Hans foto som förlaga** (2026-11-17): det får skickas till bildmodellen; det ligger i `private/referenser/` och
  läggs aldrig i Git, i ett prov eller på sajten.
- **Kortets tre mått** (2026-11-12): riktning, lutning och perspektiv, alla ställbara "men också ha en normal" (0°, 0°,
  87 %).
- **Hela rundan** (2026-11-12): Paow ska kunna spela en hel runda; spelets nödlösningar ger vika när banken har egna
  filmer (`src/game-director.ts`).
- **Förvalen han sade ja till** (2026-11-13): ljuset utjämnat mellan filmer, liv i överkroppen, kopparna i relingen,
  plats 6 från A2.2, och en runda ska kunna gå via A2.2.
- **Mer rörelse när hon delar ut** (2026-11-13): "jag vill i allmänhet att paow rör sin kropp och huvud och SIN högerarm
  aningen mer när HENNES vänsterarm dealar." Hur, utan att det kostar kortet, är öppet (`tools/film-prompting.md` §5).
- **Returen efter en tvåhandsgiv** (2026-11-13) görs med den hand som är ute (`motion.releaseHand`).
- **Farten** (2026-11-13): filmerna spelas i filmad fart (`filmTempo` 1); en vilogest spelas klart som filmad.
- **Vilans slinga** (2026-11-14): godkända vilofilmer går in i slingan av sig själva (`docs/SYSTEM.md`, Vilan).
- **Dockan per dealer** (2026-11-21, 2026-11-23): dealerns mått, naturlig och inte "kuvad"; den valda dealerns docka
  ligger under korten i Kortplan i stället för Siluett. `ultimate-reality` är bara läsreferens.
- **Dockan rättas mot hennes filmer innan den styr en beställning** (2026-11-23): axlar, fingrar och armbåge ska se ut
  som i de filmer som är bra; SAM-dockan byggs på de mätningarna ("Ja bygg den riktiga SAM-dockan").
- **Dockans vändning längre ut: bättre, men inte än** (2026-11-23): vänster arm mot sko och kort, djupet och avståndet
  till skon stämmer inte; handen över skon är "fel i grunden … typ lillfingret". Givarna från A2.3 beställs ändå med dockans film.
- **En sparad rörelse per kort och ankare** (2026-11-23): A2.1, A2.2 och A2.3 är olika in- och utgångar; dockan ska ha en
  sparad giv per spelare och per ingång. Uppdraget: fyll A2.3 → spelarnas C1 och tillbaka, återgången sparad.
- **Handens vinkel: 17° när kortet tas, −30° när det är vänt** (2026-11-23): "rimligare är typ 17 grader för när dealerns
  högerhand som tar emot kortet görs … vid själva slutet … snarare -30", främst P4. Återgången väljs i Docklabbet.
- **Ett kort vänds av händer och fingrar** (2026-11-23, sagt förut): "ett kort måste vändas av händer och fingrar och ska
  inte kunna vändas av tom luft".
- **Handens landning ska gå att välja** (2026-11-23): läget vid det lagda kortet "är bra", men långfingret pekar alltid
  ned kortet. Dockan ska ha förval eller egna landningar, så att slutposen inte är samma för alla platser.
- **Händerna fria i givarna** (2026-11-23): överlämningen vid skon är "ihopkrånglat med dealerns överdrivna vridningar
  med händerna"; han har sagt det två gånger och själv ställt om och sparat. Händerna ska frigöras mer.
- **Docklabbet** (2026-11-23): "Jag gillar verkligen docklabbet!" Konstiga ställningar blir naturligare som standard,
  vridning och axlar är reglage, fingrarna visar hur de verkar på kortet; allt "kompatibelt med material skapat".
- **Dockan framåt** (2026-11-23): en giv till en spelare tar 2 s som förval, valbart i Docka. För framtiden: A2.2 ur
  fotot, och dockan tar över Siluetten i Scen & Bord med valen som finns där.
- **Skon** (2026-11-23): "Se över och fixa så allt blir rätt bara": den ritade skon i 3D-scenen flyttas till filmens
  plats; inga filmer ändras.
- **3D-labbet har samma standard som allt övrigt** (2026-11-23): "det ska vara och ha samam standard som allt övrigt".
  En egen standard där kan vara skälet till att dockan ser ihoptryckt ut.
- **Nej till Meshy-modellen av Paow** (2026-11-18); ja till att avlästa leder styr en klädd figur (2026-11-20).
- **A3P6C1 ges utan sista bild** (2026-11-23): ingen genererad A3-bild för plats 6; given dit beställs med dockans film
  som ledning när dockan har hans ja.
- **Dealern från en annan stol** (2026-11-18): sidans kamera har samma höjd och lutning som den i mitten, bara flyttad
  åt sidan.
- **Ett tredje och fjärde dealerkort** (2026-11-13) är önskat men inte byggt: planen har sexton platser.
- **Önskemål för senare** (2026-11-11, 2026-11-13; inget är beställt): mer av höger arm, kaffe ur en mugg som finns i
  bilden, en animation på bordet, marker som dealern tar och betalar, insamling av korten, en andra spelarfigur.

## Filmerna och given

- **Hela trädet från A2.3** (2026-11-23): en giv per plats i trädet Tatuerad. Kort 2–7 och dealerns kort återbrukar
  filmer, också mellan träd: "överflödigt med helt nya klipp för respektive kort".
- **Plats 6 och 7** (2026-11-23): "hennes vänsterarm tar ut kortet, och … hennes högerarm tar emot och vänder upp",
  samma tvåhandsgiv som plats 1–5 har från A2.3.
- **Naturlig rörelse går före dockans** (2026-11-23): dockans film är en grov ledning ("var inte extremt nitsk med
  dockans rörelse"); kortets vändning och hennes rörelser får filmen skapa fritt, "då dockan mest är en grund".
- **Kortet vänds av hennes händer** (2026-11-23): filmen följer dockan "nitiskt"; dockan ska ha "mycket bra fog" för hur
  kortet vänds och filmmodellen lite mer frihet där, inte "osynligt stoff". Given till plats 6: "Bra"; plats 7: "Inte bra".
- **Kortplanen i Bordet gäller** (2026-11-23): har han ställt in korten där "så är det ju det som gäller såklart".
  Receptet för en A3-bild är ett och samma för varje dealer och plats, inte handarbete per dealer.
- **Handleden vrider kortet** (2026-11-17): "Oavsett om hon nyper eller släpar ut kortet … måste hon vrida över
  handleden." Den som förklarar en fallen giv läser först vad ordern faktiskt skickade.
- **Vändningen: sättet är fritt, den ska bli bra** (2026-11-17, 2026-11-18): handleden (`FREE`, förvalet), nyckeln
  kring långsidan (`LONG_EDGE`) eller ände över ände; rätt sida upp mot spelaren, gult till blått.
- **En vändning är hel** (2026-11-18): aldrig påbörjad och avbruten.
- **Kortet sitter i fingrarna genom vändningen** (2026-11-18, 2026-11-23): inte "utanpå fingrarna" och inte "för långt
  från fingrarna". Det gäller dockan som förlaga också.
- **Handen vänds en gång, i luften, aldrig i slutet** (2026-11-18); ordningen per ankare står i
  `tools/film-prompting.md` §5.
- **Ingen vit kant på kortet** (2026-11-17, 2026-11-23): "Det sk inte finnas." Ingen order ber om den; kanten tas
  bort i efterarbetet. Det vita bakom kortet i skons fönster ska bort, synkat så att "ingenting vi har idag förstörs".
- **Kanten bort: rätt håll, men inte förval än** (2026-11-23): i en A3-bild fylls kantlinjen med det blå; i en färdig
  film kan kortet ersättas av kortöverlägget: "kortet är ju ändå bara referens för hur ett kort ska ersättas".
- **En giv är tre sekunder** (2026-11-18, 2026-11-21): "Ja, tre sekunder är lagom".
- **Takten** (2026-11-18): en giv är en sammanhängande rörelse utan stopp med kortet rest, och en film slutar när
  rörelsen är klar. Bordets gröna är densamma genom filmen, och kortet är slätt, utan vitt eller mönster.
- **Flera kameravinklar ur samma film** (2026-11-18): en sidovinkel görs av bankens egen film i Runways videoredigerare
  (35 % och 70 % åt sidan, också speglat), inte av en ny tagning. Först ett labbprov där två vinklar binds ihop.
- **Givens sex steg från A2.1** (2026-11-13): Nyp, Dra, För fram, Vrid, Vänd upp, Lägg. Det är valet Vänd vid platsen
  (`AT_PLACE`) per kort i Kortplan; förvalet för en ny giv är handleden på vägen.
- **Nypet** (2026-11-13): i A2.1 håller tumme och pekfinger i själva det gula kortet, inte i skons kant.
- **Kortet ur skon** (2026-11-12): "Ett kort ska tas som det ser ut i skon … Sedan ska handen vrida kortet." För Paow
  används skon med kortet i en öppning snett framtill.
- **Fria händer med beställningstexterna** (2026-11-17): huvudagenten skriver om dem efter vad proven visar.
- **Giv och återgång i samma film** (2026-11-23): provet till plats 5 fick "Rätt … i övrigt - perfekt". Återgången
  klipps ut och sparas i banken automatiskt: "dessa är faktist nästa alltid bra".
- **Sista given går direkt till vila** (2026-11-23): från det lagda kortet ska hon "återgå till A1-vila direkt" och "inte
  passera A2.'n' över huvud taget"; ingången baklänges fick nej. Returerna för plats 2–5: "Bra", "återgången till A1 kanon"; plats 6: "Inte bra".
- **Varianter på lek** (2026-11-23): till t.ex. plats 3 får hon göra "något helt annat": kasta upp kortet, låta det
  landa och rätta till det leende. Det som godkänns byggs in så att det hänger ihop med Scen & bord.
- **Fria givar är varianter med namn** (2026-11-23): "kan man inte frångå bara lite?" Plats 4 "ja"; Kortet i luften och
  plats 7 "Svinbra variant!"; Kortet bakom ryggen "hon ser inte ut som PAOW riktigt när hon tittar mot oss". Andra handen ska arbeta.
- **Högerhanden vid nedsläppet** (2026-11-23): den ska inte vara "så vriden vid nedsläpp". Given till plats 5 gjordes
  om så, och givarna till plats 1–5, kort 1, med återgång fick hans "Ja, alla håller" i Beslut.
- **V6 är arkiverad** (2026-11-20; filmen och rutorna följde 2026-11-23): allt ligger i `D:/dealer-archive/v6-2026-11-23/`.
  V6 är ingen referens "att dö för"; dess kortstorlek kallade han "väldigt bra" (2026-11-12).
- **Trailern är pausad** (2026-11-17): rollblad 4 med tatuerade händer har hans ja, men inget beställs och inget byts i
  trailern tills han säger till.

## Kortet

- **Gul rygg, blå framsida** (2026-11-17, 2026-11-20): gult är ryggen (stängt kort, slätt), blått är framsidan (öppet
  kort); utan vit kant, "bara … blåa, med rundade kanter".
- **Märket på blå sidan** (2026-11-20): ett litet rosa kryss och en liten röd cirkel i ett hörn, så att filmen inte kan
  "fuska med vilken sida av kortet som syns".
- **Märke på gula sidan, som prov** (2026-11-23, till dealer-e7): fylld röd cirkel i mitten och rosa kryss nära kortänden,
  blå sidans färger "men motsatta symboler". Prövas på en film först (`paow-giv-2-3-p4-03`); A2.3 gäller oförändrat.
- **Kortens färger** (2026-11-20) står på ett ställe, `CARD_RGB` (`src/placement-model.ts`): gul 241, 216, 0 · blå
  0, 130, 218 · kryss 255, 120, 200 · cirkel 225, 30, 35.
- **Rent tills efterarbetet** (2026-11-18): "Du kan behålla SG-ryggen. men so msagt vill jag allt ska vara rent tills
  efterarbete gjörs". Inget annat än märket trycks på filmens kort; valören ritas när rundan spelas.
- **En linje för korten** (2026-11-13): huvudagenten bestämmer linjen och visar resultatet, inte valen: ritade kort hela
  vägen, en storlek, en brytare i spelet. Kortmattan ur filmens eget kort: "ja som val i labbet, nej för spelet".
- **Ett kortformat:** kortet på plats 4 är standard och allt annat anpassar sig ("Storleken är inte problemet, utan att
  det finns olika format").
- **Verkligt kort, storlek 1,00** (2026-11-17): "Gör allt enkelt bara. kör vi 1.0". Kortplanen ritar ett verkligt kort
  genom linsen utan eget storleksreglage; storleken justeras bara i Efterarbete.
- **Perspektiv ändrar bara kortens form** (2026-11-18): varje kort har kamerans storlek och plats; reglaget smalnar av
  den bortre kanten, ett värde för alla kort (hans plans 87 % om inget är sparat).
- **Planen är hans** (2026-11-11, 2026-11-12): `placements/default.json` är incheckad på hans ja: perspektiv 87 %,
  vridning 0°, platserna speglade, dealerns två kort centrerade. Bara Bordet skriver filen, när han trycker Spara.
- **B-linsen är standard för nya filmer** (2026-11-19): linsen i D.C3-prov B. Det är inget Primär-val, och före en
  massbeställning krävs en godkänd helgiv med rätt hand och tempo.
- **Perspektivet som sparat val** (2026-11-19, 2026-11-21): kamerans vinkel och avstånd ställs i Scen & bord och sparas
  för Casino med Använd i Casino, Bred lins inräknad. Ringar och kort följer samma bord och kamera.
- **Andra kortet** (2026-11-11, 2026-11-19): tills en egen giv finns spelar platsens andra och senare kort första
  kortets film med det ritade kortet flyttat.

## Läpparna och talet

- **Läpparna i realtid är huvudmålet** (2026-11-17), på hans RunPod: "Det är det som är huvudmålet." Replikfilmerna
  kommer i andra hand, och en modell som inte går i realtid är avförd.
- **Den neutrala munnen är standard för alla Paows repliker** (2026-11-21). Skiljer sig dess format från det som
  renderaren och imagen på hans RunPod väntar sig ska det stå i klartext (`docs/TAL.md`).
- **Egen körare** (2026-11-17): Scouts renderer har ett avsiktligt lås som vi inte går förbi; en egen körare byggs ur
  öppen källkod. En provkväll på hans pod: högst 5 USD, med besked till honom samma dag före start.
- **Munnen** (2026-11-17): storlek F, bara läpparna läggs in (huden runt är vilofilmens), mindre öppning och färre
  tänder i vanligt tal ("Nu ser det nästan lite överdrivet ut"). Provet `paow-realtid-mun-6` har hans ja.
- **Inte löst i hans ögon:** mungiporna ("lite som typ clown-mungipor", 2026-11-14) och överläppen, som "borde bli något
  större" (2026-11-17).
- **Hans ja före ett byte av läppar** (2026-11-17): först en jämförelse i spelets storlek och i rörelse (granskarna
  föredrog 30 av 30 det han kallade "värre än förut"). Hans godkända `paow-tal-blackjack-sv-04` rörs inte.
- **Sättet dokumenteras per dealer** (2026-11-17): vyn Lipsync och `data/lipsync.json`.
- **Munnen ur hennes egen film** (2026-11-17, hans idé, obyggd): leendefilmen `paow-vila-03-01` som underlag.

## Scenen och spelet

- **Naturligt utseende:** ljuset kommer ur rummet (panoramat som ljuskälla, skuggor i världens koordinater), inte
  målade sken. Duken han vill ha som bordets yta är `assets/scene/table.png`.
- **Looken i Scen** (2026-11-20): förvalet Jakob-1 "är verkligen det bästa", och "Bred lins är vad jag älskar och som
  gör jobbet." Standard är kvar som grund; ingen lutning av bordet är byggd.
- **3D-scenen:** "fantastiskt"; bordet från backad kamera "fruktansvärt fult". Monacos bakgrund är bra som den är
  (2026-11-17).
- **Bordet BORD-02** (2026-11-20): "skitbra" som alternativ; ett labbprov som spelet inte slår på före hans ja.
  Gräsduken är kvar som val.
- **Spelet på telefon** (2026-11-14): markeröverlägget "smartare och mindre så det inte täckeer bla vart marker ska in",
  också liggande. Filmen före spelet ligger i mitten på en liggande telefon (2026-11-17).
- **Görans material** används inte (`docs/SYSTEM.md`, "Återbruk och införande").

## Kopian och nätet

- **En publicering görs bara på hans uttryckliga ord**, och ett ja gäller den publiceringen; nästa kräver hans ord igen
  (2026-11-18). "Allt på nätet är sekundärt" (2026-11-17); `cloud/` står kvar tills han säger att den ska bort.
- **En sida på nätet** (2026-11-23): kopian på `dealer-lake.vercel.app`; gamla labbet och de udda adresserna är
  raderade.
- **Filmdörren står kvar** (2026-11-23): `/trailer`, där "kman kommer in via en noir-film till casinodelen som är en
  specialanpassning för PAOW". Den läser inget sparat förval och ingen Bred lins (2026-11-21).
- **Casinot på nätet visar det som är inställt i studion** (2026-11-21): det som sparats med Använd i Casino, och hela
  det pushade läget, är vad dörren `/casino` visar efter nästa publicering.
- **Kopian är öppen för läsning** (2026-11-14): "Se till att den inte är lösenordsskyddad." Boten och önskemålslådan
  kräver lösenordet tills han säger annat.
- **Lösenord** (2026-11-18): "Lösenordet ska sättas i .env.local"; inget lösenord skrivs i en fil som Git följer.
- **Kopian har samma meny som studion** (2026-11-13).
- **Noirfilmen** (2026-11-21): v4 och klippen den byggts av sparas (`assets/noir/`); allt före v4 fick raderas. Den är
  filmen före spelet och ligger för sig på Blob, som gruppen `ingång`.
- **Trailrar hålls utanför kopian** (2026-11-12), utom filmen före spelet bakom `/trailer`; trailerproven i Prov är
  spärrade (`data/studio-release.json`).
- **Vercel** (2026-11-12): kopian och botens anrop ligger i hans eget team, där krediterna finns (`docs/DRIFT.md`).
