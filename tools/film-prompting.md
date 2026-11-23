# Handbok: så komponeras en filmbeställning

En av fyra: [dealer-line.md](dealer-line.md) är ingången (stationerna från en bild till en färdig dealer, alla format
och namn), [order-clerk.md](order-clerk.md) säger hur en beställning läggs, [film-review.md](film-review.md) hur filmen
granskas, och den här hur beställningen sätts ihop (bilder, referensfilm, text, modell, längd, tagningar) och **vad som
har hållit och vad som har fallit** (§5). Skriven 2026-11-13 ur tillverkarnas guider, våra liggare
(`D:/dealer-scratch/tmp/paow/`), kvittona `assets/orders/*/receipt.json`, protokollet (`node tools/order-ledger.ts`) och
Jakobs domar (`review.userReview` i `motions/paow-*.json`). Underlaget i längre form:
`D:/dealer-scratch/tmp/huvudagent11/recept/RAPPORT.md`.

**Märkning.** (V) = verifierat: läst i källan, i liggaren, i kvittot eller sett i rutor. (S) = skattat: egen slutsats,
inte prövad. Källtyp: *Tillverkare* (officiell dokumentation), *Praktiker* (namngiven, utan prov), *Hörsägen*
(osignerat). Två tagningar bevisar lite; där belägget är en eller två tagningar står det så. **Jakobs dom avgör**; där
granskaren dömde annorlunda står båda.

## Slutsats

1. **Bilderna säger vem och var, texten bara rörelsen.** Inget om hennes utseende; platsen sägs i ord utan bildpunkter
   (mall 5).
2. **En handling per film, ett kort, få led.** Vändningen sägs med en mening, en gång.
3. **Positivt formulerat, inga förbud.** Ingen lista "Nothing of this happens", inga "not/never/without".
4. **En rörelse låses med en bild eller en referensfilm, inte med ord.** Det texten inte kan låsa löses med ett ankare
   eller en film av rörelsen.
5. **Allt som syns i en bild eller film följer med.** Fel sko, en annan dealers hand, ett föremål: modellen kopierar
   det.
6. **Två tagningar sållar, de avgör inget.** En metod blir regel först efter fler tagningar (§5).
7. **Jakob dömer kortet, granskaren måtten.** Han har godkänt 11 av 22 givar och 16 av 21 returer (räknat ur
   `motions/paow-giv-*` 2026-11-13 på morgonen), och underkänt för kortets färg och vändning ("Här ändrar kortet färg
   ungefär halvvägs", "två vridningsmoment", "ett blått spelkort"), för ett gult kort i slutet och för stelhet ("Hon är
   väldigt stel"); ett kort som skjuts längs filten har han godkänt (`p1-04`, cirka 790 px) (V). Mönstret är skattat
   (S).

## 1. Reglerna med belägg

| Regel | Starkaste källa | Vårt eget belägg |
|---|---|---|
| 1 Bilderna bär vem och var | Runway Gen-4: "Focus on describing the motion, rather than the input image … can lead to reduced motion" (Tillverkare, V). Alibaba: "Prompt = Motion + Camera movement" (V). Kling: "Keyframes show the important moments. The prompt explains how the video moves between them" (V) | b6 nyp till P4 (Kling 4, 127 ord, utseendet nämns inte): användbar, händer och kort 5/5 (V). Men Jakobs bästa giv, `paow-giv-2-1-p4-04` (Primär, "Kanske den bästa!"), har mall 3 med utseende och förbudslista, 377 ord (V). Våra domar bekräftar alltså inte regeln; tillverkarnas råd står |
| 2 En handling, få led | Alibaba: "Keep actions simple and short", "One clip = one continuous shot" (V). Runway Gen-4: "Avoid overly complex prompts" (V) | Hela rundan i en tagning: 0 användbara av 7 filmer, cirka 3 500 krediter (V). `paow-giv-p4`: cirka åtta led på 7 s, vändningen i tre; tagning 1 vände kortet två gånger (ruta 61–63 och 90–93) (V). Korta vägar får korta klipp, annars hittar modellen på extra rörelser (DRIFT till `f6f68ef`, V) |
| 3 Inga förbud | Runway Gen-4: "Negative phrasing is not supported and may produce unpredictable or even opposite results" (V). Kling 4: "Negative prompts can increase the likelihood of errors" (V) | `paow-giv-p4`: åtta förbud, minst tre hände ändå (V). Jakobs godkända givar per stil: Utförlig (med förbud) 2 av 4, Kort 8 av 16, Minimal 1 av 2 (V): sambandet syns inte i våra domar |
| 4 Bild eller film låser rörelsen | Kling 4: referensfilm för "moves and … timing in @Video1" (V). Alibaba WAN 3: referens "to replicate … action choreography" (V). Kling 4 kopierar referensens rörelse nästan bildpunkt för bildpunkt (DRIFT till `f6f68ef`) | Nyp-giv med Kling 4 och bankens tur och retur till samma plats höll i b6, b17 (P4), b19 (D) och b20 (P1, 2 av 2) (V). `p1-05` följer referensens väg och takt ut till P1 (mätt, V). Samma referens till fel plats: kortet läggs där referensen lägger det (b19 P7) (V) |
| 5 Bilden följer med | Runway I2V: "Visual artifacts, such as blurry hands or faces, may be intensified" (V) | Ankare 2.2: posebilden visade Pamelas sko med öppen front, båda tagningarna ritade den (0/2) (V). Med Pamelas film som referens tappar Paows givande hand tatueringen i snabb rörelse (Prov `paow-plats-4-som-mall`) (V) |
| 6 Två tagningar sållar | Jakob: två tagningar per klipp, en tredje om båda faller (`docs/BESKED.md`, "Domar, beställningar och pengar") | Är två metoder lika bra med 50 % lyckade blir utfallet 2–0 mot 0–2 av slump i ungefär 1 fall av 8 (S) |

**Där källorna säger emot varandra (V):** Klings egna exempel innehåller förbud ("Avoid duplicate limbs …") trots rådet.
WAN:s promptomskrivare för första och sista bild säger både "emphasize potential changes … between the two frames" och
"reference … clothing, backgrounds" (80–100 ord). Runway Gen-4.5 sägs klara "complex, sequenced instructions", Gen-4
vill ha enkelhet. Google säger för stillbilder "Be Hyper-Specific" och "semantic negative prompts" (beskriv det önskade
positivt), så en stillbildstext får vara lång men inte förbjuda. Runways hjälpsida säger att Seedance 2.5 tar
nyckelbilder och referenser samtidigt; vårt verktygs schema säger att bara `kling-4` tar första och sista bild
tillsammans med referensfilm. Schemat gäller för oss.

## 2. Formeln

**En rak linje (2026-11-18).** Den som beställer väljer tre saker: dealern, steget (som säger ankaret) och, för en film
med kort, platsen och kortet. Allt annat är stegets ENDA recept i `data/order-methods.json` (modell, upplösning, sekunder,
tagningar, textens stil och mall, form, vändning, regeln för referensfilmen, var sista bilden kommer ifrån), läst genom
`recipeFor` i `src/order-methods.ts`. Lagret fyller i receptet (`tools/order-store.ts`), och Bordets rad, Ny
beställning och produktionslistan visar samma sak ur samma funktioner; `studio/tests/line-same.test.ts` håller raden och
lagret lika för varje steg och kort. Det ett utkast säger emot receptet är ett medvetet undantag: det skickas bara när
det är satt (i studion under "Receptet · gör ett undantag"), och utkastets anteckningar nämner det. Ett steg utan metod har
inget förval alls, och där receptets regel inte hittar någon referensfilm beställs inget. Stegen i `STEPS`
(`src/order-model.ts`) säger bara vad en film går mellan, aldrig hur den beställs.

En beställning är en ren funktion av linjen och undantagen: samma val ger samma bilder, text, modell och kostnad. Texten
skrivs aldrig för hand i en order; ändras den, ändras mallen och versionen räknas upp. De exakta orden står i `SAY` i
`src/order-prompts.ts` (mall 12, `TEMPLATE_VERSION`: en öppen giv med handen vid skon skrivs ord för ord som givproven
skickade den i mall 10, §5; Utförlig = mall 3; en order återges med sin egen version, så äldre mallars ord gäller bara
deras egna ordrar och står kvar i `SAY.v6`, `SAY.v8` och `SAY.v11`); reglerna och recepten står här. Kort är receptets
stil, Minimal är Jakobs prov, Utförlig bara för jämförelse. Skiljer orden sig från reglerna här, rättas orden. Format,
filer och priser: [dealer-line.md](dealer-line.md), "Format och namn".

**Märket på blå sidan (2026-11-20, prövat i tre filmer utanför Beställ).** Filmkortets rygg är gul och slät (stängt kort); framsidan är blå (öppet
kort) och bär märket (Jakob 2026-11-20: "gula" ska vara ryggen). Ett öppet kort som lagret ritar på en bild bär ett
litet rosa kryss i mitten och en liten röd cirkel i hörnet nere till vänster (`layCard` i `tools/order-images.ts`).
Färgerna som bilderna till en film ritas med, och som en granskare mäter mot (`CARD_RGB`, `src/placement-model.ts`):

| Del | RGB | Hex |
|---|---|---|
| Gul rygg | 241, 216, 0 | `#f1d800` |
| Blå framsida | 0, 130, 218 | `#0082da` |
| Rosa kryss (X), mitt på den blå sidan | 255, 120, 200 | `#ff78c8` |
| Röd cirkel (prick), hörnet nere till vänster | 225, 30, 35 | `#e11e23` |

Krysset är 34 % av kortets bredd från spets till spets och 7 % tjockt; cirkeln har radien 7,5 % av bredden och sitter
20 % in från båda kanterna, så att blått omger den (`CARD_MARK`). Siffrorna står aldrig i en filmtext: en videomodell
läser färgen ur bilden, och texten säger bara "small pink cross" och "small red dot". Texten följer bilden: visar sista bilden märket (`markSeen` läser bildens egna punkter, så
det gäller också en A3 och en snittruta) sparas `prompt.faceMark`, och meningen om kortets utseende i Kort och Minimal
säger "its face is solid blue with a small pink cross in the middle and a small red dot in one corner, as the last frame
shows it" i stället för en slät blå sida. Utan märke i bilden är varje text ord för ord som förut, och mallens version
är densamma: ordern bär själv vilket som gäller. Prövat i tre vändfilmer utanför Beställ (Kling 4, Prov
`paow-ankare-2-3-b`; raden i [film-prov.md](film-prov.md), Oavgjort): kortet ligger till slut med kryss och prick som i
sista bilden i alla tre (V, mätt); i handen ritas krysset fyra till nio gånger större och krymper när kortet släpps
(V); märket hindrade inte att ytan bytte färg utan kantläge i en film och visade en vit sida i en annan (V). Genom
Beställ bär sju ordrar märket (`prompt.faceMark`), bland dem piloterna till plats 4 från A2.3, där
`paow-giv-2-3c-p4-pilot-02` har Jakobs ja (Beslut 2026-11-21) (V, läst i `data/orders/` 2026-11-21).

GIV-2.3 med KORT har en fast kortändevändning sedan mall 11. Ett uttryckligt val av LONG_EDGE eller AT_PLACE avvisas före
sparning; MINIMAL låter referensfilmen beskriva vändningen. Den frysta placeringsplanens avsikt behålls separat.

**Varje sak sägs en gång** (Jakob 2026-11-18: "för många val som kan leda till överlappande instruktioner"; 2026-11-20:
"så att det inte blir dubbla typer av meningar"). `tools/order-line.test.ts` bygger texten för varje kombination linjen
tillåter (receptet för varje steg och kort med receptets eget tillägg, varje undantag, filmerna utan kort och
stillbilderna) och faller när:
- ett ämne skrivs i två meningar (kameran, referensfilmen, greppet ur skon, vändningen, läggningen, vägen tillbaka, den
  vilande handen, blicken, kortets utseende, vad som tas ur `@pose`);
- ett tillstånd sägs i två bisatser: vilken sida som är upp ("yellow side up", "blue side up"), "as in the last frame"
  och "as in the first frame" högst en gång i hela texten, "palm down" högst en gång på vägen dit och en gång på vägen
  tillbaka;
- fem ord eller fler i följd står två gånger i samma text (undantagen är uppräknade i testet, vart och ett för att
  samma sak NÄMNS två gånger, inte sägs två gånger: "the next card in the window" är både var handen stannar och hur
  kortet ser ut);
- två meningar säger emot varandra, eller samma mening står två gånger.

Mall 11 kom ur ämnesräkningen: en giv bara dit med den andra handen, med handbyte eller stängd sade slutet två gånger i
mall 10 ("lets go of it … her empty hand turn palm down" och sedan "Her hand ends at the card, as in the last frame"),
och ingången sade den vilande handen två gånger. Mall 12 kom ur en sökning efter ordföljder som står två gånger i varje
text linjen kan sätta ihop (1 640 texter): vilken sida som är upp sägs nu där kortet bärs eller vänds och inte en gång
till i läggningen (stängda givar och given med två händer från 2.3), "as in the last frame" står en gång i ingången
till 2.3, en stillbild säger en gång vad som tas ur `@pose`, och returen till 2.3 nämner handen vid skon en gång. Den
öppna given med handen vid skon är oförändrad, ord för ord, liksom varje Minimal text.

Ett tillägg säger bara det mallen inte redan säger. Receptets eget tillägg prövas av testet tillsammans med mallen; en
orders eget tillägg prövas inte av linjen, så den som skriver ett läser först stegets text. Skickade tillägg har både
upprepat mallen (14 av 37 tillägg: kortets utseende i `paow-giv-2-2-p6-02` och sju givar i mall 4; vägen tillbaka i
tur och retur från 2.3, där `paow-giv-2-3-p4-h24-cykel-01` säger "to its pose in the first frame" två gånger) och
brutit mot listan nedan (förbud i `paow-ingang-2-3-01`: "with no pause and no jerk"; tidsangivelser i åtta vilor,
`paow-vila-01` till `-08`) (V, lästa ur ordrarna 2026-11-20). Det som visas i studion bredvid ett val är valets namn
och inget annat: rörelsen beskrivs bara av texten som skickas (Jakob 2026-11-17).

| Del | Kommer från valet | Regel |
|---|---|---|
| Första bild | Steget: ankaret det börjar på (1, 2.1, 2.2 eller 2.3), det som gäller i Material; en retur börjar på platsens landningsbild | Hel verklig ruta i bankens format, samma grönt, sko och ton som sista bilden |
| Sista bild | Receptets `lastPicture`. En giv bara dit slutar på PLATSENS EGEN slutbild (`seatEndOf` i `src/order-model.ts`): platsens landningsbild där en gäller, annars snittrutan, sista rutan i given i dealerns egen tur och retur från samma ankare till platsen, vars retur Jakob har godkänt rakt och som är lagd med samma hand (`cutFrameOf`; lagret tar rutan ur filmen, prövar att kortet ligger på planens och sätter tillbaka skon ur ankare 1 om fönstrets kort är tryckt; den nya given bär `endsOn`, och den returen följer den). En plats med ingetdera har ingen slutbild och kan inte beställas bara dit; en plats bild står aldrig för en annan plats. Övriga steg: ankaret de slutar på; ett undantag tur och retur: första bilden plus kortet där planen säger | Exakt samma kort som första bilden plus det enda som delas ut |
| Mellanbild | Ingen i vårt nuvarande MCP | Extra referensbild är inte en tidsatt mellanbild; b1b och b4 läste extra bilder som start, slut eller följd (V). Runways API för `kling_4` har nu uttryckliga mellanbilder (3.8); de kräver ett eget kontrollerat prov. |
| Referensfilm | Receptets regel (`referenceByRule` i `src/order-methods.ts`, det enda stället som väljer): dockans renderade film till platsen först (`data/rendered-references.json`), annars en film ur banken av samma steg till samma plats | Bara `kling-4`; obruten, 3–30 s, samma kortföljd och samma plats som sista bilden, rakt godkänd av Jakob, lagd med samma hand, och för en giv bara dit given ensam (en tagning ur en tur och retur skickar hela filmen, som slutar vid skon); aldrig en arkiverad tagning; ytterplatserna tar bara dockans film; meningen `SAY.reference` ("video 1"). Den väljs också efter vad den visar: samma kontroll som en levererad giv körs på den (`checkReference` i `src/deal-check.ts`), och en film där kortet står på kant före vändningen eller är större än ett verkligt kort erbjuds inte först (givprov 2B) |
| Text | Steg, plats; sidan ur planen; handen ur receptet (handen vid skon hela vägen, som proven som höll; planens handbyte för ett kort är ett undantag som måste sägas, eftersom handbytet föll i båda sina prov och ingen referensfilm eller slutbild visar det); vändningen ur receptet (ingen väljer den: Jakob 2026-11-18, "SE BARA TILL ATT ALLA VRIDNINGAR BLIR BRA") | Skelettet nedan |
| Modell, längd | Receptet. Längden: med referensfilm filmens egen längd i hela sekunder (texten säger "with the same timing"), annars receptets; en giv bara dit 3 s, det kortaste Kling 4 tar (3–30 s; WAN 3 2–30 s). Den uppmätta riktiga dealern lägger ett kort var 0,75–0,9 s | Tabellen nedan |
| Tagningar | 1 per metodprov, 2 per klipp när metoden är vald | En tredje bara om båda faller |

**Textens skelett, i denna ordning (film):** 1 `SAY.camera` ("Locked camera, one continuous shot."). 2 Med referensfilm
`SAY.reference`. 3 Handlingen i en mening, handen pekad ut genom var den är (`SAY.handAtShoe`; Runway: "clear positional
language"; undviker spegelförväxling, S), med platsen i ord (`whereShort`, "towards its place at the far left of the
picture, where the last frame shows it"). 4 Vändningen, bara om kortet landar öppet: exakt en av `turnAtPlace`,
`turnOnTheWay`, `rollOnTheWay` (§3.3). 5 Vägen tillbaka, bara i tur och retur (`backPinch`, `backDrag`). 6 Andra handen
(`otherRests`). 7 Kortet (`oneCardMoves`). 8 Jakobs tillägg, en positiv mening.

**Står aldrig i en filmtext:** utseende, kläder, hår; förbud eller "not/no/never/without"; bildpunkter; tidsangivelser
(WAN läser dem som scenlista, S); en andra handling; samma tillstånd i två meningar eller bisatser ("as in the last
frame", vilken sida som är upp, "palm down" på samma väg). Längd: så kort som skelettet tillåter; mall 4 och 5 gav
79–132 ord (protokollet, V); recepttexterna i mall 12 är 36–267 ord och 194–1 328 tecken, den längsta en stillbild
(V, räknat 2026-11-20), och den längsta text som har skickats 2 738 tecken (mall 3). Linjen känner ingen teckengräns
hos modellerna; den enda gräns den håller är tilläggets 600 tecken (`EXTRA_LIMIT`).

Receptens modell och längd står i `data/order-methods.json`; tabellen säger varför, och vad filmerna visade när 172
filmer mättes 2026-11-20 (128 levererade, 28 ur Pamelas bank, dockans 16; bildskillnad ruta för ruta: hur länge bilden
står stilla i början och i slutet, och hur länge rörelsen pågår; median och spann, V).

| Steg | Receptet | s | Varför, och vad mätningen visade |
|---|---|---|---|
| Ingång 1 → 2.1, 1 → 2.2 | WAN 3, 1080p | 4 | Ger bankens ruta direkt; 4K gav ingen skärpa (V). Rörelsen pågår 3,6–3,9 s, 90 % av den inom 2,4–3,4 s (4 filmer). Pamelas godkända ingång är 2 s. Om 3 s räcker är oprövat |
| Ingång 1 → 2.3 | Kling 4, 1080p, dockans film | 3 | Referensens längd, det kortaste Kling 4 tar. Rörelsen pågår 1,4 s och bilden står stilla 1,4 s i slutet (1 film); dockans film gör likadant, så stillheten kommer ur referensen |
| Giv bara dit från 2.1, 2.2 och 2.3 | Kling 4, 1080p, referensfilm | 3 | Receptet för varje giv. Från 2.3 (8 filmer): rörelsen 2,4 s (2,1–3,0), kortet lagt efter 2,1 s (1,8–2,25), stilla 0,5 s i slutet (0–0,6); filmen följer dockans takt. Äldre prov på 4 s med bankens referens: till P4 3 av 4 och 2 av 2, till P1 0 av 2 (§5, givprov 1 och 2) |
| Giv tur och retur (undantag, inget recept) | Kling 4 eller WAN 3 | 7 från 2.1, 6 från 2.2, 4 från 2.3 | Rörelsen fyller filmen: stilla högst 0,3 s i var ände i median (82 filmer). I Paows bank tar given 4,1 s (2,6–5,7) och returen 2,7 s av en film på 7 s (46 filmer) |
| Vändningen som egen film | Prov: WAN 3 och Kling 4 | 3 | Oprövat |
| Retur som egen film | Till 2.3: Kling 4, 1080p. Till 2.1, 2.2 och 1: ingen metod | 3 | Oprövat; kort väg, kort film. Pamelas returer är 3 s och rör sig 2,8 s (8 filmer) |
| Utgång 2.1 → 1, 2.2 → 1 | WAN 3, 1080p | 4 | Rörelsen pågår 3,6–3,8 s (4 filmer) |
| Hålkortet | WAN 3, 1080p | 5 | Rörelsen pågår 4,2–4,8 s (4 filmer); Pamelas är 4 s och rör sig 3,7 s |
| Vila | WAN 3, 1080p | 4 | Samma bild först och sist. Bilden står stilla 0,4 s i var ände (6 filmer på 4 s): det är skarven texten ber om ("holds still for the last half second"), inte död tid. Längre vilor (5, 6, 8 s) är undantag för en större handling |
| Stillbild (ankare, landning) | Nano Banana Pro, 4K, 4:3 | – | Redigerar dealerns egen bild med `@anchor` och `@pose` |

Ingen film är för lång av sig själv: det som står stilla följer referensfilmen (ingången till 2.3, givens slut) eller
är en beställd skarv (vilan). Om given på 3 s är för snabb är en smakfråga för Jakob: de givar han har godkänt tar
cirka 4 s (Paows 4,3 s i median, 16 filmer; Pamelas 4,0 s, 14 filmer; ur bankens register), den nya lägger kortet
efter cirka 2,1 s i en film på 3 s, och en sekund till kostar cirka 21 krediter per film (Kling 4, 1080p). En längre
giv är en längre referensfilm, eftersom filmen tar referensens längd.

Billig sållning: WAN 3 i 480p kostar 5 krediter per s och visar om modellen gör rörelsen (`data/order-policy.json`, V).
Kling 3.0 4K beställs inte längre (`MODELS['kling-3-4k'].off`: ingen skärpevinst, 172 krediter mot 80; Jakob: "det är
dumt att ta ett klipp i 4K om övriga klipp inte är i 4K"). Seedance 2.5 i 1080p kostar 68 per s plus 34 per s
referensfilm (Runway, V): en 7 s giv går över taket 400.

## 3. Recept per steg

Orden står i `SAY`; här står vad som har hållit och varför.

### 3.1 Ingång: ankare 1 → 2.1 och → 2.2
- Orden: `SAY.reach['2.1']` eller `['2.2']`, `SAY.eyes`, `SAY.otherRests`. WAN 3, 1080p, 4 s, två tagningar. Blicken är
  med för att Jakob sade om `paow-ingang-2-1-01`: "En bra variant! Men hon rör inte blicken filket är tråkigt" (V).
  Recepten till och från 2.2 bär tillägget om det enfärgade kortet i fönstret ("The yellow card in the window is plain,
  one flat solid yellow from edge to edge."), som deras beläggsordrar skickades med; recepten till och från 2.1 skickades
  utan och står kvar så. Ingången till 2.3 (Kling 4 med dockans film): `SAY.reach['2.3']` och `SAY.eyesStay`.
- Har hållit: `paow-ingang-2-1-01` (WAN): granskaren 3,5/5 (äldre HANDOFF, i Git), Jakob Variant; `-02` (Kling 3.0 4K, 172 krediter):
  3/5, Jakob Godkänd, "bra men tråkig" (V, en tagning var). Kavajomgången: 1 → 2.2 gav en huvudtagning av två (V).
- Har fallit: båda ingångarna rörde fönstrets ram före kortet (WAN ruta 44–59, 4K ruta 38–55) (V). Troligen geometrin:
  fingret kommer uppifrån och kortets kant sitter bakom ramen (S). Ordet "rim" är struket; att texten flyttar fingret är
  oprövat.

### 3.2 Giv med nyp från ankare 2.1
- **Med referensfilm (det som har hållit):** Kling 4, 1080p, 7 s, referens = bankens rakt godkända tur och retur **till
  samma plats**. Höll: b6 P4, b17 P4, b19 D, b20 P1 2 av 2 (V); `paow-giv-2-1-p4-11` given godkänd av Jakob ("Tack!"),
  granskaren 3/5 (vänd i luften som referensen, lägst hand, lagt utan skjut) (V); `paow-giv-2-1-p1-08` (omgång 5, P1,
  samma referens, vändning vid platsen i texten): båda tagningarna lades av handen 2–3 px från planen och vändes en gång
  på långsidan vid platsen (kantrutor 69–70, 22 och 27 px från platsen) (mätt, granskning pågår); Jakob godkände tagning
  2 ("Ser jättebra ut. Kortet kan möjligen vara lite litet, men jag är osäker.") och underkände tagning 1 ("Kortet kapas
  när det läggs ner, vilket är mycket konstigt.") (V). `paow-giv-2-1-p1-05` (omgång 4, samma referens, fri vändning):
  granskaren 3,5/5, men Jakob underkände: "Här ändrar kortet färg ungefär halvvägs." (V). Referens från en annan
  startpose (`p2-03`, Pamelas släp ur ankare 2.2): kortet lades framför skon som i referensen och sköts cirka 725 px
  till P2; Jakob godkände ("det håller helt klart") (V). Föll: referens till annan plats (b19 P1, P7) (V).
- **Bara dit med referens (givprov 1 och 2, 2026-11-17):** Kling 4, 4 s, första bild ankare 2.1, sista bild rutan där
  banken delar en godkänd tur och retur till platsen (given slutar, returen börjar på nästa ruta), referensen en rakt
  godkänd giv till samma plats. Till P4 med `pamela-p4-c1-plan-deal-02`: vänt genom kantläget 4 av 4, granskaren 3 av 4
  (V). Till P1 med `pamela-p1-c1-plan-deal-01`: 0 av 2 (V): modellen vände kortet där referensen visar kortet på kant,
  i svingen upp ur fönstret, och bar det 15–30 % större än ett verkligt kort i bilden. Alltså väljs referensen också
  efter vad den visar: kortet på kant bara i vändningen, och i verklig storlek (S, ur två platser). Modellen kopierar
  referensens väg, takt, kortets skenbara storlek och var kortet är på kant; utseende, sko och var kortet ligger tar den
  ur bilderna (V, nio tagningar med referens). Handen lyfts eller släpper och läggs om i slutet i alla, eftersom sista
  bildens hand är bankens platta hand och referensens slutar med fingertoppen på kortet (V).
- Risk: referensen är Pamelas, och hennes hand läcker in (tatueringen försvinner i snabb rörelse) (V). Studion stoppar
  bara hela bilder av en annan dealer; en annan dealers film som referens tillåter Jakob (order-clerk §3).
- **Utan referens:** `paow-giv-2-1-p4-04` (mall 3, rullas kring långsidan, Kling 4): Jakobs Primär, "Kanske den bästa!",
  fast kortet lyfts till brösthöjd och växer cirka 21 % och skjuts 160 px (mätt, inte granskad, V). `paow-giv-p4` (mall
  3, Kling 4): tagning 1 underkänd ("just denna omsvängning av kortet sista tredjedelen av videon som förstör.."),
  tagning 2 godkänd ("Denna är bra"), granskaren 2/5 och 2,5/5 (V). Till P1 med fri vändning (omgång 4): `p1-06` (WAN 3)
  Primär, "Mycket bra, kan konkurrera om att bli den primära." (granskaren 3/5); `p1-04` (Kling 4) godkänd fast kortet
  tappades och sköts cirka 790 px (granskaren 1,5/5) (V).
- Bankens givar vänder kortet i luften, inte vid platsen (V). För Jakobs sex steg finns ingen referens i banken: se 3.3.

### 3.3 Vändningen vid platsen (Jakobs sex steg)
Nyp, Dra, För fram, Vrid, Vänd upp, Lägg: kortet ligger gult upp mot filten hela vägen och vänds först vid platsen. 22
tagningar har beställts så; fyra vände vid platsen (V): `p4-07` (Jakob: "gör två vridningsmoment … återigen fel färg"),
`p1-07` t2 (WAN 3, underkänd), och `p1-08` t1 och t2 (Kling 4 med referens till samma plats: 2 av 2; t2 godkänd). Utan
referens, WAN 3 i omgång 5: 1 av 5 (P7 0 av 2; till D.C1 vändes kortet i luften). Metodregistret
(`data/order-methods.json`) beställer i dag varje giv bara dit med Kling 4, kort text, 3 s och referensfilm: från
ankare 2.1 till spelarplatserna och från ankare 2.3 med fri vändning (handleden på vägen; från 2.3 över kortändan),
dealerns kort från 2.1 med vändningen som planen säger, och från ankare 2.2 (släp) med vändningen vid platsen; alla med
status `prov`. Där receptet lämnar vändningen till planen beställs vändningen
vid platsen bara där planen säger det för kortet: planen säger "i luften" på alla 16 kort, så förvalet i
Beställ (`defaultFlip`) är fri vändning (V). Två vändningar en vänsterhand kan göra:

**Vändning A, "tummen lyfter, kortet fälls över" (Jakobs skiss, `SAY.turnAtPlace`; S, inte prövad som bild).**
Kortets långsidor pekar mot spelaren. Vänsterhanden kommer från skon med handflatan ned; tummen ligger vid kortets inre långsida, pek- och
långfinger på baksidan. Tummen glider in under den inre långsidan och lyfter den; underarmen roterar utåt (tummen
uppåt); den yttre långsidan ligger kvar mot filten som gångjärn. Kortet står på kant med tummen på den blå sidan; tummen
fäller kortet över gångjärnet och följer med ned på framsidan. Greppet är inte fast: fingrarna lämnar kortet en stund
medan det står på kant.

**Vändning B, Pamelas nyckelvridning (bankens), giltig.** Jakob fick 2026-11-17 välja mellan Pamelas vändning och en
tagning där handleden vrids så att handflatan går uppåt, och svarade: "Båda dessa två sätt är
giltiga […] Altså både vrida som en nyckel samt den andra. Huvudsaken är att rätt sida kommer upp mot spelaren och att
korten har symetriskt samma storkel som de rimligen borde ha, och/eller som välj si labbet och att det är gult till
blått som görs." Belägget för nyckeln är granskningen av Pamelas vändningar
(`D:/dealer-scratch/tmp/pamela-formel/RAPPORT.md`, nio bra vändningar sedda i full upplösning, V). Formeln:
1. Korta filmer med en handling var: Pamelas givar var WAN 3-filmer på 4–6 s, bara dit, och returen en egen film (V).
2. Kortet hålls i sin kortända mellan tumme och fingrar, som en förlängning av handen, med den breda sidan mot
   kameran (V).
3. Hand och kort vänds tillsammans, en gång, kring kortets långa axel, som när man vrider om en nyckel: gult smalnar
   till en tunn ljus kant i 2–5 rutor och blått öppnar sig mot kameran (V).
4. Handen stannar vriden: greppet behålls tills kortet ligger, och handflatan pekar aldrig uppåt när kortet läggs (V).
5. Kortet syns slätt redan i första bilden: varje giv började på samma verkliga nyp-ruta (V); att det hjälper är
   skattat (S).
6. Texten säger det kameran ser ("the broad yellow back is seen, then the thin pale edge, then the broad plain blue
   face"); att den meningen ger kanten är skattat (S).
Rapporten har en provorder med formeln och vad den ska klara, och den säger var formeln skiljer sig från dagens mall.

**Vad en bild av varje ögonblick visar (A):** *Före:* kortet gult och plant en kortbredd mot hennes mitt från
landningsplatsen, handflatan ned, två fingertoppar på baksidan. *På kant:* kortet upprätt på sin yttre långsida, en smal
ljus remsa framifrån; tummen på den blå sidan. *Efter:* kortet blått och plant på planens plats; tumtoppen på framsidan,
handen på kant. En platt handrygg över kortet är aldrig slutet på en vändning (Jakob 2026-11-13, om landningsrutan ur
`paow-giv-p4` tagning 2).

**Metoder som konkurrerar, i den ordning de prövas:** 0 *Referensfilm till samma plats och vändningen vid platsen i
texten* (Kling 4): 2 av 2 i `p1-08`, ledande. 1 *Text i en giv "bara dit"* från ankare 2.1 till landningsbilden, WAN 3
och Kling 4, 7 s. 2 *Vändningen som egen film* mellan stillbilderna Före och Efter, 3 s (kräver en ny nod i banken,
huvudagentens). 3 *Referensfilm av Jakobs egen hand* (3.8) med Kling 4, om 1 och 2 ger 0 av 4. 4 *Renderat kort*: rätt
hand men fel kort ger målat kort (äldre HANDOFF, i Git); fel hand hjälper inget kort. En metod går vidare om minst 1 av 4
tagningar vänder kortet en gång vid platsen så som en hand kan, med kortet inom ±10 % (film-review §3–4).

### 3.4 Giv med släp från ankare 2.2 (stängt kort)
- Orden: `SAY.slideOut`, `SAY.dragBack`, `SAY.stopFlat`, `SAY.backDrag` (sidan som är upp sägs i släpet, inte en gång
  till där kortet stannar). Tur och retur med WAN 3, 1080p, 6 s, två tagningar, höll till
  P1: cirka 7 verkliga släp av 9 tagningar (b9–b17, V). Föll till P4 (0 av 2) och P7 (0 av 2: kortet går först åt
  vänster) (V). Pröva P1 först.
- **Öppet, bara dit med referens (givprov 2A, 2026-11-17; V):** Kling 4, 4 s, första bild ankare 2.2, sista bild ruta
  126 ur `paow-giv-2-2-p4-01-01` (där returen, som Jakob godkände, börjar; skons tryckta kort ersatt med ankare 1:s),
  referensen Pamelas släp `pamela-p4-c1-drawn-deal-01` ("Svinbra", från ankaret DRAWN). 2 av 2 användbara med
  anmärkningar (granskaren 4/5 och 3/5): kortet släps plant längs filten, reses på kant nära platsen och vänds genom
  kantläget som i referensen (gångjärn mot filten, tumme och pekfinger; texten sade nyckel), läggs 0–1 px från sista
  bilden. Fel: turkos i 3–5 rutor kring kanten, en ljus kant upp till 34 % runt kortet i tagning 2 (ruta 72), kortet
  växer cirka 24 % på släpet i tagning 2 (referensens släpta kort är självt för stort). Bara P4 är prövat; Paow har
  ingen snittruta från 2.2 till någon annan plats.
- Förutsättning: ett ankare 2.2 som gäller; Paows gällde 2026-11-13 till 2026-11-20 (`paow-ankare-2-2-t1`, 3.7; sedan
  dess `paow-ankare-2-2-blick-a`). Skon i b17 hade öppen front (V). Med fönsterskon, kortet öppet och vänt vid
  platsen: P1 0 av 1, P4 och P6 Variant för Jakob men med tryckt kort, och P6 med enfärgat kort när tillägget om
  enfärgat kort står i ordern (§5, omgång 12–15).

### 3.5 Retur
- **I samma film som given (tur och retur):** Jakob har godkänt 16 av 21 returer, två som Primär (`paow-giv-2-1-p4-04`:
  "förmodligen den bästa"; `paow-giv-2-1-p1-01`: "hon går tilbaka från possitionen med handen vilket hon gör bra"), och
  underkänt fem: för kortet (`p1-08` t2: "Halvvägs dyker det upp ett gult kort."; `p3-01`, `p4-12`: tryckt kort; `p4-09`
  utan egna ord) och för gult (`p4-14` t2: "Eftersom det är gult, underkänner jag.") (V). Granskaren gav dem 0,5–4/5,
  ofta för en knytnäve i brösthöjd (V). Hans dom gäller: returen i tur och retur håller.
- **Som egen film** (`RETUR-2.1`, `-2.2`, `-1`): från landningsbilden till ankaret, orden `SAY.liftOff` och
  `SAY.glideTo`. WAN 3, 1080p, 3 s. Oprövad; behövs för en giv "bara dit". En film som startar på en annan films ruta
  skiftar cirka 5 nivåer i ton (Paows videoprov, V); därför en stillbild som första bild. Returen till 2.3 är den enda
  med recept (Kling 4, 1080p, 3 s, prov): `SAY.liftOffRight` och `SAY.glideBeside`, där handen vid skon nämns en gång.
  Första provet (2026-11-21) föll på vägen: ändarna och kortet höll, men "glides back low over the felt" blev en hand
  som stryker över bordet. Nästa prov byter bara den meningen mot en kort, rak väg till skon ([film-prov.md](film-prov.md)).

### 3.6 Vila
- Orden: `SAY.rest` plus en liten handling som Jakobs tillägg: `takes one slow, deep breath`, `smiles briefly`,
  `nods once`, `straightens her back`, `taps her fingers once on the felt`. WAN 3, 1080p, 4 s (receptet; 5–8 s har
  beställts som undantag för en större handling), första och sista bild = ankare 1. Tillägget säger handlingen och inget
  om när: mallen säger redan att hon står stilla den sista halva sekunden.
- Jakob godkände alla åtta (`paow-vila-01` rakt; 02–08 som Variant: "Jättebra variant!", "Jättebra.. Hon ler!",
  "Kanon!", "Toppen!") (V). Granskaren gav 1–3/5, mest för munnen: öppen eller tänder i 4 av 6 granskade (V). Nästa text
  för munnen: "her lips stay together as the corners of her mouth lift a little"; prövad i omgång 12 (`paow-vila-10`):
  leendet kom med stängda läppar i båda tagningarna, men andetaget i `paow-vila-11` togs ändå med öppen mun (§5, V).
- Jakob om ordet: "Det är fortfarande oklart vad som ska vara en variant och vad som är godkänt." (`paow-vila-08`, V).

### 3.7 Stillbilder: ankare 2.1, 2.2, landningsbild
Nano Banana Pro, 4K, 4:3, `referenceImages` `@anchor` (dealerns egen bild) och `@pose` (bara en utklippt underarm och
hand, `tools/order-images.ts`). För stillbilder gäller Googles råd: detaljerat får det vara, men det oönskade sägs
positivt ("one card", inte "no second card"). Orden för ankarna: `SAY.still*` och `STANDARD_STILL`. Vad som tas ur
`@pose` sägs en gång, i meningen om `@pose` (`SAY.stillPose`); meningen om handen (`SAY.stillChange`) säger bara vad
handen gör.
```
This is an edit of the picture @anchor. Keep everything in @anchor exactly as it is: the framing and camera, the flat chroma-green background and table, the black card shoe at the right with the yellow card in its window, and the woman's face, hair, clothes, build and her hand at the left of the picture. Change only her hand nearest the shoe: it rests at the blue card lying flat on the felt in front of her, the tips of her forefinger and middle finger on the card's edge nearest her, the wrist raised above the knuckles and the thumb free beside the card. @pose is a cut-out on plain green that shows only a forearm and hand; take from it only where the hand is and how the fingers touch the card. [STANDARD_STILL] There is one card on the felt and one in the shoe, each the size and shape of the card in the window.
```
- Exemplet är **landningsbilden** (S, oprövad): `@anchor` = ankare 1 med kortet ritat där planen säger; `@pose` = armen
  ur Pamelas godkända giv till samma plats, rutan där fingertopparna vilar på kortet. Efteråt ritas kortet om ur planen
  och skon tas från ankare 1 (`tools/python/skolagning-21.py`, order-clerk §5).
- **Ankare 2.1:** `paow-ankare-2-1` gav 4/5 och 2/5 (dubbla kort); Jakob godkände tagning 1 och underkände tagning 2
  (V).
- **Ankare 2.2:** 1 av 6 tagningar i tre ordrar, och bara efter lagning; varje gång ritade bildmodellen om skon, också
  när ankare 2.1 var `@anchor` (§5, V). `paow-ankare-2-2` tagning 1 (Pamelas öppna sko ritad; ersatt 2026-11-20 av
  `paow-ankare-2-2-blick-a`) gällde sedan skolagningen satt ankare 1:s sko och kort i fönstret, ett förpass med
  `fillDark` vid snitt 828 fått kroppen att sluta på rad 831 och tre lokala lagningar gjorts (kavajens hörnsteg 24 ×
  10 px, glipan vid pekfingret, manschettskarven): granskaren 3/5 för provfilmer, Jakob: gäller (besked 15:47;
  `paow-ankare-2-2-t1`) (V, kvittot och Material). Oprövat: en ruta ur en film som börjar på ankare 2.1, eftersom
  filmen behåller skon där första rutan har den (S). En runda kan dela en plats från ankare 2.2 (`SEAT_HUB`, SYSTEM),
  i dag Paows plats 6, när ingången, given, returen och utgången är dömda.
- **Före vändningen** (3.3): ingen pose finns i banken; en ruta ur Jakobs egen film (3.8), utklippt till handen, är
  förslaget (S).

### 3.8 Referensfilm, Motion Control och Jakobs egen hand
**Extern genomgång 2026-11-19, kontrollerad mot tillverkaren.** `RUNWAY_DEALER.md` från Jakob är råd, inte en ny
orderinstruktion. Beställ, de versionsmärkta mallarna och Jakobs val gäller fortsatt. Modellstöd i dokumentationen
är inte samma sak som ett fält i vår anslutning eller belägg för bättre dealerfilm.
Exemplets högerhand och grepp i kortsidan är inte Paows förval: hand, grepp och mål ska komma från den faktiska ordern.

| Underlag/problem | Möjligt prov, inte nytt förval | Kontroll före provet |
| --- | --- | --- |
| Landning/släpp på fel plats | Kling 4: start, kontaktbild, slut | API `kling_4` har upp till åtta mellanbilder; vårt MCP `kling-4` exponerar ännu bara start/slut och referenser. Kontaktbilden kräver samma kamera, geometri och korrekt fingergrepp. |
| Onaturlig handbana | Kort verklig giv som rörelsereferens; Kling 4 först mot befintligt recept | Bilden styr identitet/utsnitt, filmen handbana/grepp/tempo. Rätt spelarplats och samma kameraperspektiv; en referens garanterar inte exakt följsamhet. |
| Alternativ rörelsemodell | Seedance 2.5, MCP `seedance-2.5`, API `seedance2_5` | Bild-/videoreferensläge och start/slut-läge är olika kontrakt. Be om exakt längd och en låst tagning. Prova inte genom att bara byta modell-ID i Kling-ordern. |
| Enkel blick/vila | Gen-4.5, MCP `gen-4.5`, API `gen4.5` | Bilden bär utseende och utsnitt; texten rörelsen. Inte belagt bättre på kortgrepp. |

Runways [Seedance-guide](https://runway.com/resources/seedance-2-5-prompt-guide) ger varje referens en uttrycklig roll
och beskriver förloppets ordning. Ta den strukturen, inte dess långa flerscensupplägg, till ett kort dealerprov.
[API-kontraktet](https://docs.dev.runwayml.com/api.md) och [OpenAPI](https://docs.dev.runwayml.com/openapi.json)
styr tillåtna kombinationer; färsk `whoami` och verktygsschemat styr vad vår klient faktiskt kan skicka.
Ändra en sak mot en känd giv. För ett tidsprov jämför kort och lång **helgiv inklusive retur** med samma mål och
underlag. P6/P7 har både godkända och underkända sjusekundersprov: lång tid är en hypotes om extrarörelser, inte en
fastställd ensam orsak. Mät grepp, kantvändning, kontakt, släpp och skarv enligt `film-review.md`.

**Mall 14: dockans film är en grov ledning (2026-11-23, oprövad som text).** Jakob om filmerna från A2.3, som är gjorda
med dockans film som video 1: "lite lite robotliknande och onaturliga", och "filmen ska få rörelserna av vår dealer att
vara naturlig primärt, så var inte extremt nitsk med dockans rörelse" (hela beskedet: `docs/BESKED.md`). Mall 14 är
mall 12 ord för ord utom två meningar i Kort (`SAY.v14` i `src/order-prompts.ts`). Referensfilmens mening
(`SAY.reference`: "she moves like the dealer in video 1, with the same timing") säger i stället att video 1 är en grov
ledning, att händerna går samma väg vid ungefär samma ögonblick och att hon framför allt rör sig naturligt, som en van
dealer med mjuka, avspända armar och händer; den säger fortfarande att video 1 bara visar rörelsen, eftersom dockan är
vit och saknar ansikte. Ingången till 2.3 säger var den andra handen slutar i ankaret som nu är sista bild
(`paow-ankare-2-3-c`): platt på filten framför henne, där mall 12 säger att båda händerna går till skon och att den
andra väntar intill den. Mall 14 är ett val per order (`--mall 14`), inte förvalet, och mall 13:s korta texter ingår
inte. Den prövas först på en giv bredvid en godkänd film med mall 12:s text, med samma bilder och samma dockfilm.

**Kort rörelse, stilla slut.** I ett nytt tidsprov kan prompten ange att hela rörelsen inklusive returen når
slutankaret tidigt och därefter håller samma pose. Ändra inte receptet för befintliga order. `film-after.ts` föreslår
en kortning i `after.json.stillAnchorTail` bara om minst 0,4 s i slutet ligger inom två färgsteg per kanal från både
slutankaret och den första stilla rutan. Hela bilden jämförs, så en rörlig fingertopp inte döljs i ett medelvärde.
Förslaget är inte en automatisk klippning: behåll originalet, gör en härledd film med dokumenterad rutmappning,
uppdatera kortspår och domarrutor och granska skarven före införande. Att snabba upp hela filmen kan försämra greppet.

**Kling 3.0 Motion Control** (Runways hjälpsida, V): en karaktärsbild och en rörelsefilm, text valfri; 3–30 s; filmen
ska visa "clear upper body … including all limbs and head", en person, obruten, inte snabb. Vårt verktyg: **ingen sista
bild** (`kling-3-motion-control` står inte bland modellerna som tar `endFrame`). Om ett föremål i handen: "contact
points are difficult" (Hörsägen). Vårt prov b1a (2026-11-11, V): 44 av 100; kortet genomskinligt grönt i ruta 30–84,
skons fönster tomt från ruta 48, kortet landar 73 px fel, 1760 × 1184. **Svar: Pamelas film driver inte Paows ankare via
Motion Control;** den kan driva Paows rörelse som referensfilm i Kling 4 med första och sista bild (3.2). Act-Two (högst
1280 × 720, lägger till "a subtle handheld shake") finns inte i vårt verktyg.

**Jakobs egen hand med telefonen** är bättre när ingen godkänd bankfilm visar rörelsen (vändningen vid platsen, höger
hand, handbyte) och ingen annan dealer ska in i ordern. Så filmas den (S, ur tillverkarnas råd och DRIFT): telefonen på
stativ, låst och liggande där bankens kamera står (rakt framför, något över bordet, bordskanten vågrät); en låda som sko
till höger; ett kort med gul baksida och blå framsida (tejp duger); matt slät duk, jämnt ljus framifrån, lång svart ärm,
inga ringar. Sitt som dealern, andra handen platt. Verkligt tempo: Kling 4 kopierar referensens takt, och ultrarapid som
snabbats upp föll (V). Börja och sluta i ankarets pose, en obruten tagning på 4–8 s, kortet till orderns plats, flera
tagningar; välj en där kortet syns på kant. Risk: Jakobs hand läcker in som Pamelas (S).

### 3.9 Helfigur: hon kommer in och sätter sig, hon reser sig och går
Den enda beskrivningen av hur en helfigursfilm görs (Beställ har inget steg för den). Gjord 2026-11-13 för Paow efter
Pamelas godkända par, 552 krediter (V: `assets/motions/paow-table-arrive-wide-01/generation.json`,
`paow-table-leave-wide-01/generation.json`, liggaren `D:/dealer-scratch/tmp/huvudagent11/helfigur/ledger.md`):
1. Ramen är Pamelas breda: 2088 × 1174 i halv skala, dealerkantens mitt i (1044, 656) (`motion.frame`, SYSTEM).
2. Tre stillbilder placeras utan bildmodell (`helfigur/build-stills.py`): tom ram med en ljusare grön skiva, ankare 1 i
   halv skala utan sko (sittande), och den stående keystonen med ögonen Pamelas stående höjd (165,5 px) över de sittande.
3. Varje film är två delar som möts i den stående bilden: in = går in (tom → stående) + sätter sig (stående →
   sittande); ut = reser sig (sittande → stående) + går ut (stående → tom).
4. Kling 4, 1080p, 16:9, första och sista bild, kort text utan förbud, 3–6 s per del; ljudet tas bort.
5. Texten säger vart hon går och att hon är lika hög hela vägen ("the same height as in the last image the whole way"),
   och skivan som "the flat lighter green rectangle"; skivan målas efteråt i varje rutas bakgrundsgröna.
6. Sätter sig: "brings both hands forward, close to her body" (tagning 1 svängde armarna ut åt sidorna, f44–52).
7. Delarna sätts ihop i den stående bilden; skarven syns inte i utgången (granskaren 4/5).
8. Posten får `motion.frame` med `layer: "BEHIND_TABLE"`, så att bordet skymmer henne tills hon sitter.
9. Utfall: utgången godkänd preliminärt; ingången Variant preliminärt: hon står stilla i drygt 20 rutor innan hon sätter
   sig och bär pumps där keystonen har platta skor (`review.provisional` i `motions/`).
10. Används inte: sätter sig t1 (armarna ut), går in t2 (snabbare gång, lika lång paus), reser sig t2 (sjunker 12 px).

## 4. Felsökning

| Fel | Sett i (V) | Trolig orsak (S) | Ändring |
|---|---|---|---|
| Kortet vänds två gånger, eller tillbaka | `paow-giv-p4` t1 (61–63, 90–93); `p4-07`; `p5-01` | Vändningen i flera led | En mening, "once"; lås med bild eller referens |
| Färgbyte utan kantruta, eller fel färg i slutet | `p1-05` (Jakob: "Här ändrar kortet färg ungefär halvvägs."), `p1-08` t2 retur ("Halvvägs dyker det upp ett gult kort."), `p4-13`, `p4-07` | Kortet visas tidigt och vänds tillbaka, eller vänds utan synlig kant | Referens till samma plats och vändningen vid platsen (`p1-08`) |
| Gult kort kvar, kortet nästan osynligt | `p1-07` t2 (Jakob: "Baksida kan betyda olika saker, som baksidan på ett kort, men det kan också referera till undersidan. Det här kan vara en semantisk felinstruktion.") | Texten säger "back" och "yellow side up" (`SAY.colours`, `SAY.carryBack`) | Mall 6 (2026-11-13): sidorna sägs bara med färg och vilken som är uppåt; prövas i omgång 6 mot mall 5 på samma platser |
| Kortet kapas när det läggs ned | `p1-08` t1 (Jakob: "Kortet kapas när det läggs ner, vilket är mycket konstigt.") | Okänd | Omtagning |
| Tryckt spelkort i stället för enfärgat | `p4-09` (Jakob: "ett blått spelkort"), omgång 3 i 5 av 8, skons kort i `p4-12`, `p3-01`, `p7-03`, `p1-07` t1, `p7-05` (WAN 3 utan referens) | Modellen fyller i en kortframsida | `SAY.colours`; mönstret går inte att laga, spåraren följer det inte |
| Kortet läggs framför henne, handen når inte ytterplatsen | Omgång 3 och 3b: P1, P2, P6, P7 0 av 8 | "to its place" utan plats | Platsen i ord (mall 5): handen nådde platsen i 4 av 5 i omgång 4 |
| Slutbildens kort dyker upp av sig självt | `p1-03` (f206), `p2-02` (f204), `p7-02` (f187) | Handen når inte dit, modellen tonar in sista bilden | Som ovan |
| Kortet tappas eller läggs före platsen och skjuts dit | `paow-giv-p4` t2 (104 px kort), `p1-04` (cirka 790 px), `p2-03` (cirka 725 px), `p4-14` t2 (165 px) | Vändning i luften; referens från en annan startpose (`p2-03`) | Inget fel i sig: Jakob godkände `p1-04` och `p2-03`; ange sträckan |
| Kortet växer eller krymper | `p4-04` +21 %, `p3-02` +47–70 %, `p1-06` +20 %, b17 1,5×; `d-01` krymper till hälften (f144–166) | Kortet lyfts mot kameran | Lågt längs filten; mät ±10 %; inte lagbart |
| Hon lutar sig långt ut | `p1-05` (näsan 245 px), `p1-06` (183 px) | Ytterplatsen långt bort | Oprövat; handbyte från P1–P3 (Beställ föreslår det) |
| Hon är stel | `p4-09` (Jakob: "Hon är väldigt stel"), `p4-12` retur ("hon borde kunna röra sig mer"), `p5-03` ("så sjukt stel i ansiktet") | `SAY.otherRests` håller allt annat stilla (S) | Mall 7:s rörelsemening rörde henne men kostade kortet (15 av 18); tillägget "Her eyes follow the card." rörde blicken utan att hjälpa kortet: öppen fråga (§5) |
| Handen till knytnäve i brösthöjd på returen | `paow-giv-p4` t1 (y 466), `p4-04` (120–128) | Retur i samma film som given | Jakob godkände ändå 16 av 21 returer; ingen ändring krävs |
| Fingertopp på fönstrets ram | Ingång WAN 44–59, 4K 38–55 | Geometrin | Ordet "rim" struket; annars Variant |
| Skon flyttad eller fel sko (stillbild) | Ankare 2.2, tre ordrar: öppen sko kopierad ur posebilden, sedan fönsterskon 81–129 px åt vänster | Bildmodellen ritar om skon med handen | Inte text: skolagningen (ankare 1:s sko och kort) och lokal lagning gav 1 av 6 (`paow-ankare-2-2` t1, 3.7); en ruta ur en film från ankare 2.1 är oprövad |
| Kroppen kapad, skon omritad (stillbild) | 12–40 rader ovanför bordsraden i varje bild (DRIFT till `f6f68ef`) | Bildmodellen | `tools/still-after.ts` (fyll-morkt), `tools/python/skolagning-21.py` (order-clerk §5); `tools/python/forlang-plagg.py` för ett ljust plagg |
| Ett andra kort | Hel runda (b2, b9c), ankare 2.1 t2, `p7-01` (två gula) | Flera kort, bilderna stämmer inte | Ett kort per film; samma kort i första och sista bild |
| Ansiktet mjuknar, tatueringar suddas | Kling 4; 4K-ingången | Modellen | WAN 3 för vila och ingång |
| Grönt glider eller pulserar | WAN cirka 11 nivåer på 6 s; Kling 4 G 206–234 i 30 s | Långa filmer, olika grönt | Kort film; samma grönt i bilderna; `level` |
| Hopp eller scenbyte | Kling 4 i 30 s (b2: 16,3 och 20,2 s) | Klings scenindelning | Kort film, "one continuous shot" |
| Ett grått bord ritas över det gröna under kanten och står kvar till sista rutan (en hand lyfts) | WAN 3, 4 av 10 filmer 2026-11-13 där en hand lyfts (vilor, in- och utgång): `paow-vila-15` från ruta 27, `-18` från ruta 15 (innan händerna rör sig), `-19` från ruta 45, `paow-ingang-2-2-01` t1 från ruta 15; inte i `-12`, `-14`, `-16`, `ingang-2-2-01` t2 eller `paow-utgang-2-2-01` t1–t2; 0 av 4 givar från skon (`2-2-p1-01`, `-p4-01`, `-p6-01`, `-p6-02`). Upp till cirka 398 000 px under rad 836 mot ankarets 9 043. Syns redan i film-afters anteckning: "kropp slutar … sista" 879–899 och "slut" över 7, mot 829–847 och under 5 i de rena | Okänd: inget ord i texten skiljer filmerna med bord från dem utan | Känd risk, ingen lagning; en ny tagning av samma order har varit ren (`ingang-2-2-01` t2). Läs film-afters anteckning och mät under kanten innan en sådan film förs in |
| Den hämtade filmen är en förhandsfil (låg bitrate) | Rapporterat av trailersessionens producent 2026-11-13, inte mätt av oss: för Seedance gav uppgiftens eget svar en förhandsfil på cirka 1 Mbit/s, och den fulla filen (5–6 Mbit/s) kom bara ur listan över senaste generationer; för Kling 4 gav hämtningen den fulla filen (5,8–6,4 Mbit/s). Våra egna hämtningar (`fetched.json`, V): WAN 3 15–19 Mbit/s, Kling 4 5,1–6,6 Mbit/s | Uppgiftens svar pekar för vissa modeller på en förhandsfil (S) | Räkna bitraten efter varje hämtning (`file.bytes` × 8 / sekunder ur `fetched.json`, eller `ffprobe`); ligger den nära 1 Mbit/s, hämta filen ur listan över senaste generationer (`list_recent`) och hämta igen |

## 5. Prov och protokoll

- **En ändring per order** mot en namngiven jämförelse; ordens titel säger vad som ändrades. Samma bilder, samma längd.
- **Antal tagningar:** en per metodprov, två per klipp när metoden är vald. En metod blir regel först efter ytterligare
  fyra tagningar med minst hälften användbara (S; att skilja 25 % från 75 % kräver 6–8 tagningar).
- **En ytterplats före alla platser:** omgång 3 och 3b gick till alla platser från plats 4: 12 av 14 föll, 1 960
  krediter (V). Pröva P1 och P7 innan en metod beställs till alla.
- **En ändring per omgång mot ett recept som har hållit:** omgång 4 ändrade två saker mot Jakobs godkända givar till P4
  på en gång, platsen och vändsättet (`FREE`, planens förval, mot `AT_PLACE` i de godkända) (V, `motion.flipAxis` i
  ordrarna). Fyra av fem fel i omgång 4 gällde kortet i luften; det femte skons kort (`p7-03`) (V). Att den andra
  ändringen orsakade felen är skattat (S).
- **Granskning:** först den automatiska kontrollen (`src/deal-check.ts`, i `after.json` som `dealCheck`): det Jakob fäller på
  synen (färgbyte utan kantläge, vänt tillbaka, på kant en gång till, fel sida upp, lagt gult och vänt efteråt, ett kort långt
  från ett verkligt korts storlek, fel plats, tryck, ett andra kort) fäller tagningen, och den går inte till granskaren; det
  granskaren mäter och han inte fäller på synen (ljus kant, kortet glider utan finger, hopp sist, stilla start) är
  anmärkningar. Sedan oberoende granskare enligt [film-review.md](film-review.md); poäng 0–5 per del (giv, retur) och
  domordet. För en giv alltid: ett kort? vänds det en gång, och var? lämnar kortet filten eller fingrarna före platsen?
  håller storleken ±10 %? enfärgat hela vägen? går handen tillbaka lågt?
- **Jakobs dom** skrivs bara av honom i Granska (`motions/<id>.json`, `review`); citera hans ord, skriv inte om dem.
- **Tabellerna förlängs** av den som provar: en rad per metod, belägget med order och tagning. Ingen dagbok; en ersatt
  rad skrivs om. Order-id förkortas `p4-11` = `paow-giv-2-1-p4-11`.

**Tabellerna över vad som håller, är oavgjort och föll,** med belägg per metod och där granskaren och Jakob dömde
olika, står på protokollsidan [film-prov.md](film-prov.md), först. Metoden som beställs per steg står i
`data/order-methods.json`.

**Regler för en giv med referensfilm, ur givproven 2026-11-17 och 2026-11-18** (raderna ovan; flyttade hit ur
överlämningen, där de stod i lägesrapporter):

1. Väg, takt, kortets storlek i handen och ögonblicket på kant kommer ur referensfilmen; vem hon är, skon och var kortet
   ligger kommer ur bilderna (nio tagningar, 3.2). En referens väljs därför efter vad den visar, inte bara efter Jakobs
   dom, och mäts själv innan den används (`D:/dealer-scratch/tmp/film-standard/referenskontroll.tsv`).
2. Från ankare 2.1 är ordningen: nyp, bär i luften, nyckelvridning mitt på vägen, lägg, skjut sista biten under
   fingertopparna, vila med fingertopparna kvar. Handen vänds en gång, i luften, och aldrig i slutet.
3. Från ankare 2.2 släpas kortet plant, tas i kanten och vänds först nära platsen.
4. Referensfilmen ska sluta som sista bilden (handens sida och fingrarna på kortet), annars hittar Kling på slutet.
5. Blicken måste stå i ankaret och i sista bilden: referensfilmen styr den vilande handen men inte huvudet.
6. Att kortet glider lite efter att fingrarna har släppt är en anmärkning och inget fall (Jakob godtog tagning C); det
   den automatiska kontrollen fäller står i `src/deal-check.ts`.

**Omgångarna och mallarna i detalj** (omgång 5–15, mall 6–9, Jakobs domar per metod 2026-11-13, den öppna frågan om
hur hon rör sig och plats 6) står på en egen sida, [film-prov.md](film-prov.md): sök där på omgångens, mallens eller
orderns namn.

**Oprövat:** referensfilm eller handbyte till plats 6; retur som egen film till ankare 1, 2.1 och 2.2; vändningen som
egen film; ankare 2.2 som ruta ur en film; referensfilm av Jakobs hand; renderat kort i
vändningens rutor.

## 6. Källor

Lästa 2026-11-13 om inget annat sägs.
- Runway, Gen-4 Video Prompting Guide:
  https://help.runwayml.com/hc/en-us/articles/39789879462419-Gen-4-Video-Prompting-Guide (Tillverkare)
- Runway, Image to Video Prompting Guide:
  https://help.runwayml.com/hc/en-us/articles/48324313115155-Image-to-Video-Prompting-Guide (Tillverkare)
- Runway Academy, Prompting Guide: https://academy.runwayml.com/prompt-guide (Tillverkare)
- Runway, Creating with Gen-4.5: https://help.runwayml.com/hc/en-us/articles/46974685288467-Creating-with-Gen-4-5
  (Tillverkare)
- Runway, Creating with Kling 3.0 Motion Control:
  https://help.runwayml.com/hc/en-us/articles/50280558448147-Creating-with-Kling-3-0-Motion-Control (Tillverkare)
- Runway, Performance Capture with Act-Two:
  https://help.runwayml.com/hc/en-us/articles/42311337895827-Performance-Capture-with-Act-Two (Tillverkare)
- Runway, Creating with Seedance 2.5:
  https://help.runwayml.com/hc/en-us/articles/53542207042323-Creating-with-Seedance-2-5 (Tillverkare)
- Runway, API-prislista: https://docs.dev.runwayml.com/guides/pricing/ (Tillverkare)
- Runways verktyg `generate_video` och `generate_image`, schemat i MCP-servern (modelltabell, `endFrame`,
  `referenceVideos`, `ratio`) (Tillverkare)
- Kling, Kling 4.0 User Guide: https://kling.ai/quickstart/kling-4-model-user-guide (Tillverkare)
- Kling, multiple keyframes guide: https://kling.ai/blog/kling-4-multiple-keyframes-guide (Tillverkare)
- Kling, start and end frames: https://kling.ai/quickstart/ai-video-start-end-frames (Tillverkare)
- Kling, Motion Control User Guide: https://kling.ai/quickstart/motion-control-user-guide (Tillverkare)
- Alibaba, Wan 3.0 video generation guide: https://www.alibabacloud.com/help/en/model-studio/wan3-video-generation-guide
  (Tillverkare)
- Alibaba, Video generation prompt guide: https://www.alibabacloud.com/help/en/model-studio/text-to-video-prompt
  (Tillverkare)
- Wan2.1, `prompt_extend.py`: https://raw.githubusercontent.com/Wan-Video/Wan2.1/main/wan/utils/prompt_extend.py
  (Tillverkare)
- Google, Gemini image generation, Best Practices: https://aistudio.google.com/docs/image-generation (Tillverkare)
- Cliprise, Kling 3 Motion Control guide:
  https://www.cliprise.app/learn/guides/model-guides/kling-3-motion-control-complete-guide (Hörsägen, osignerad, inga
  prov)
- Våra: `D:/dealer-scratch/tmp/huvudagent11/recept/RAPPORT.md`; liggare och texter i `D:/dealer-scratch/tmp/paow/`
  (`order/`, `b17/`, `bestallningar-b*.json`, `matt/film/paow-p4-motion-control.summary.json`); kvitton
  `assets/orders/*/receipt.json` (MÄTT- och GRANSKAD-noterna); protokollet `node tools/order-ledger.ts`; Prov
  `paow-plats-4-som-mall`, `paow-kavaj-filmer`, `paow-samma-film`, `hel-runda-i-en-tagning`; Jakobs domar i
  `motions/paow-*.json`; DRIFT, "Lärdomar som gäller" till och med `f6f68ef` (git).
