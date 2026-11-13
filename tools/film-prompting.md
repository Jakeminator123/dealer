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
| 6 Två tagningar sållar | Jakob: två tagningar per klipp, en tredje om båda faller (HANDOFF) | Är två metoder lika bra med 50 % lyckade blir utfallet 2–0 mot 0–2 av slump i ungefär 1 fall av 8 (S) |

**Där källorna säger emot varandra (V):** Klings egna exempel innehåller förbud ("Avoid duplicate limbs …") trots rådet.
WAN:s promptomskrivare för första och sista bild säger både "emphasize potential changes … between the two frames" och
"reference … clothing, backgrounds" (80–100 ord). Runway Gen-4.5 sägs klara "complex, sequenced instructions", Gen-4
vill ha enkelhet. Google säger för stillbilder "Be Hyper-Specific" och "semantic negative prompts" (beskriv det önskade
positivt), så en stillbildstext får vara lång men inte förbjuda. Runways hjälpsida säger att Seedance 2.5 tar
nyckelbilder och referenser samtidigt; vårt verktygs schema säger att bara `kling-4` tar första och sista bild
tillsammans med referensfilm. Schemat gäller för oss.

## 2. Formeln

En beställning är en ren funktion av valen i Beställ: samma val ger samma bilder, text, modell och kostnad. Texten
skrivs aldrig för hand i en order; ändras den, ändras mallen och versionen räknas upp. De exakta orden står i `SAY` i
`src/order-prompts.ts` (mall 8, `TEMPLATE_VERSION`; Utförlig = mall 3; en order återges med sin egen version, så mall
6:s ord gäller bara dess egna ordrar); reglerna och recepten står här. Kort är förvalet, Minimal är Jakobs prov,
Utförlig bara för jämförelse. Skiljer orden sig från reglerna här, rättas orden. Format, filer och priser:
[dealer-line.md](dealer-line.md), "Format och namn".

| Del | Kommer från valet | Regel |
|---|---|---|
| Första bild | Steget: ankaret det börjar på (1, 2.1 eller 2.2), det som gäller i Material; en retur börjar på landningsbilden | Hel verklig ruta i bankens format, samma grönt, sko och ton som sista bilden |
| Sista bild | Steget: ankaret det slutar på; för en giv samma bild plus kortet där planen säger (`flatQuad`), för en giv "bara dit" landningsbilden | Exakt samma kort som första bilden plus det enda som delas ut |
| Mellanbild | Ingen | Kling 4 via Runway placerar den inte i tiden (räknas som referensbild); b1b och b4 läste extra bilder som start, slut eller följd (V). Gör mellanläget till ett eget ankare i stället |
| Referensfilm | En tagning ur banken (`reference`) | Bara `kling-4`; obruten, 3–30 s, samma kortföljd och samma plats som sista bilden, rakt godkänd av Jakob; meningen `SAY.reference` ("video 1") |
| Text | Steg, hand, sida, vändning, plats, tillägg | Skelettet nedan |
| Modell, längd | Steget har förval; modellen kan väljas | Tabellen nedan |
| Tagningar | 1 per metodprov, 2 per klipp när metoden är vald | En tredje bara om båda faller |

**Textens skelett, i denna ordning (film):** 1 `SAY.camera` ("Locked camera, one continuous shot."). 2 Med referensfilm
`SAY.reference`. 3 Handlingen i en mening, handen pekad ut genom var den är (`SAY.handAtShoe`; Runway: "clear positional
language"; undviker spegelförväxling, S), med platsen i ord (`whereShort`, "towards its place at the far left of the
picture, where the last frame shows it"). 4 Vändningen, bara om kortet landar öppet: exakt en av `turnAtPlace`,
`turnOnTheWay`, `rollOnTheWay` (§3.3). 5 Vägen tillbaka, bara i tur och retur (`backPinch`, `backDrag`). 6 Andra handen
(`otherRests`). 7 Kortet (`oneCardMoves`). 8 Jakobs tillägg, en positiv mening.

**Står aldrig i en filmtext:** utseende, kläder, hår; förbud eller "not/no/never/without"; bildpunkter; tidsangivelser
(WAN läser dem som scenlista, S); en andra handling; "exactly as in the last frame" mer än en gång. Längd: så kort som
skelettet tillåter; mall 4 och 5 gav 79–132 ord (protokollet, V).

| Steg | Modell först | s | Varför |
|---|---|---|---|
| Ingång 1 → 2.1, 1 → 2.2 | WAN 3, 1080p | 4 | Ger bankens ruta direkt; 4K gav ingen skärpa (V) |
| Giv nyp från 2.1, med referens | Kling 4, 1080p | 7 | Det giv-recept som har hållit flest gånger (V) |
| Giv nyp från 2.1, utan referens | Prov: Kling 4 mot WAN 3 | 7 | Oavgjort (§5) |
| Släp från 2.2, stängt | WAN 3, 1080p | 6 | Höll till P1 (V) |
| Vändningen som egen film | Prov: WAN 3 och Kling 4 | 3 | Oprövat |
| Retur som egen film | WAN 3, 1080p | 3 | Oprövat; kort väg, kort film |
| Vila | WAN 3, 1080p | 4–5 | Samma bild först och sist |
| Stillbild (ankare, landning) | Nano Banana Pro, 4K, 4:3 | – | Redigerar dealerns egen bild med `@anchor` och `@pose` |

Billig sållning: WAN 3 i 480p kostar 5 krediter per s och visar om modellen gör rörelsen (`data/order-policy.json`, V).
Kling 3.0 4K beställs inte längre (`MODELS['kling-3-4k'].off`: ingen skärpevinst, 172 krediter mot 80; Jakob: "det är
dumt att ta ett klipp i 4K om övriga klipp inte är i 4K"). Seedance 2.5 i 1080p kostar 68 per s plus 34 per s
referensfilm (Runway, V): en 7 s giv går över taket 400.

## 3. Recept per steg

Orden står i `SAY`; här står vad som har hållit och varför.

### 3.1 Ingång: ankare 1 → 2.1 och → 2.2
- Orden: `SAY.reach['2.1']` eller `['2.2']`, `SAY.eyes`, `SAY.otherRests`. WAN 3, 1080p, 4 s, två tagningar. Blicken är
  med för att Jakob sade om `paow-ingang-2-1-01`: "En bra variant! Men hon rör inte blicken filket är tråkigt" (V).
- Har hållit: `paow-ingang-2-1-01` (WAN): granskaren 3,5/5 (HANDOFF), Jakob Variant; `-02` (Kling 3.0 4K, 172 krediter):
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
- Risk: referensen är Pamelas, och hennes hand läcker in (tatueringen försvinner i snabb rörelse) (V). Studion stoppar
  bara hela bilder av en annan dealer; en annan dealers film som referens tillåter Jakob (order-clerk §3; HANDOFF öppen
  punkt 9 för varianter).
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
referens, WAN 3 i omgång 5: 1 av 5 (P7 0 av 2; till D.C1 vändes kortet i luften). Metodregistret beställer givar från
2.1 med vändning vid platsen och referens till samma plats (`data/order-methods.json`, status `prov`); planen säger "i
luften" på alla 16 kort, så förvalet i Beställ (`defaultFlip`) är fri vändning (V). Två vändningar en vänsterhand kan
göra (S, inte prövade som bild):

**Vändning A, "tummen lyfter, kortet fälls över" (Jakobs skiss, `SAY.turnAtPlace`).** Kortets långsidor pekar mot
spelaren. Vänsterhanden kommer från skon med handflatan ned; tummen ligger vid kortets inre långsida, pek- och
långfinger på baksidan. Tummen glider in under den inre långsidan och lyfter den; underarmen roterar utåt (tummen
uppåt); den yttre långsidan ligger kvar mot filten som gångjärn. Kortet står på kant med tummen på den blå sidan; tummen
fäller kortet över gångjärnet och följer med ned på framsidan. Greppet är inte fast: fingrarna lämnar kortet en stund
medan det står på kant.

**Vändning B, "nyckelvridning lågt vid platsen" (närmast bankens).** Tumme och pekfinger håller kortets närmaste
kortsida, lyfter det en handsbredd, handleden rullar en gång, och kortet läggs ned med fingertopparna på dess närmaste
kant, som Pamelas godkända giv till P4 slutar (V, ruta 76–112).
```
At the place she lifts the card a little by its short end between thumb and forefinger, rolls her wrist once so the card turns over about its long side, and lays it down blue side up under her fingertips.
```
**Vad en bild av varje ögonblick visar (A):** *Före:* kortet gult och plant en kortbredd mot hennes mitt från
landningsplatsen, handflatan ned, två fingertoppar på baksidan. *På kant:* kortet upprätt på sin yttre långsida, en smal
ljus remsa framifrån; tummen på den blå sidan. *Efter:* kortet blått och plant på planens plats; tumtoppen på framsidan,
handen på kant. En platt handrygg över kortet är aldrig slutet på en vändning (Jakob 2026-11-13, om landningsrutan ur
`paow-giv-p4` tagning 2).

**Metoder som konkurrerar, i den ordning de prövas:** 0 *Referensfilm till samma plats och vändningen vid platsen i
texten* (Kling 4): 2 av 2 i `p1-08`, ledande. 1 *Text i en giv "bara dit"* från ankare 2.1 till landningsbilden, WAN 3
och Kling 4, 7 s. 2 *Vändningen som egen film* mellan stillbilderna Före och Efter, 3 s (kräver en ny nod i banken,
huvudagentens). 3 *Referensfilm av Jakobs egen hand* (3.8) med Kling 4, om 1 och 2 ger 0 av 4. 4 *Renderat kort*: rätt
hand men fel kort ger målat kort (HANDOFF punkt 11); fel hand hjälper inget kort. En metod går vidare om minst 1 av 4
tagningar vänder kortet en gång vid platsen så som en hand kan, med kortet inom ±10 % (film-review §3–4).

### 3.4 Giv med släp från ankare 2.2 (stängt kort)
- Orden: `SAY.slideOut`, `SAY.dragBack`, `SAY.stopClosed`, `SAY.backDrag`. WAN 3, 1080p, 6 s, två tagningar. Höll till
  P1: cirka 7 verkliga släp av 9 tagningar (b9–b17, V). Föll till P4 (0 av 2) och P7 (0 av 2: kortet går först åt
  vänster) (V). Pröva P1 först.
- Förutsättning: ett ankare 2.2 som gäller; Paows gäller sedan 2026-11-13 (`paow-ankare-2-2-t1`, 3.7). Skon i b17 hade
  öppen front (V). Med fönsterskon, kortet öppet och vänt vid platsen: P1 0 av 1, P4 och P6 Variant för Jakob men med
  tryckt kort, och P6 med enfärgat kort när tillägget om enfärgat kort står i ordern (§5, omgång 12–15).

### 3.5 Retur
- **I samma film som given (tur och retur):** Jakob har godkänt 16 av 21 returer, två som Primär (`paow-giv-2-1-p4-04`:
  "förmodligen den bästa"; `paow-giv-2-1-p1-01`: "hon går tilbaka från possitionen med handen vilket hon gör bra"), och
  underkänt fem: för kortet (`p1-08` t2: "Halvvägs dyker det upp ett gult kort."; `p3-01`, `p4-12`: tryckt kort; `p4-09`
  utan egna ord) och för gult (`p4-14` t2: "Eftersom det är gult, underkänner jag.") (V). Granskaren gav dem 0,5–4/5,
  ofta för en knytnäve i brösthöjd (V). Hans dom gäller: returen i tur och retur håller.
- **Som egen film** (`RETUR-2.1`, `-2.2`, `-1`): från landningsbilden till ankaret, orden `SAY.liftOff` och
  `SAY.glideTo`. WAN 3, 1080p, 3 s. Oprövad; behövs för en giv "bara dit". En film som startar på en annan films ruta
  skiftar cirka 5 nivåer i ton (Paows videoprov, V); därför en stillbild som första bild.

### 3.6 Vila
- Orden: `SAY.rest` plus en liten handling som Jakobs tillägg: `takes one slow, deep breath`, `smiles briefly`,
  `nods once`, `straightens her back`, `taps her fingers once on the felt`. WAN 3, 1080p, 4–5 s, första och sista bild =
  ankare 1.
- Jakob godkände alla åtta (`paow-vila-01` rakt; 02–08 som Variant: "Jättebra variant!", "Jättebra.. Hon ler!",
  "Kanon!", "Toppen!") (V). Granskaren gav 1–3/5, mest för munnen: öppen eller tänder i 4 av 6 granskade (V). Nästa text
  för munnen: "her lips stay together as the corners of her mouth lift a little"; prövad i omgång 12 (`paow-vila-10`):
  leendet kom med stängda läppar i båda tagningarna, men andetaget i `paow-vila-11` togs ändå med öppen mun (§5, V).
- Jakob om ordet: "Det är fortfarande oklart vad som ska vara en variant och vad som är godkänt." (`paow-vila-08`, V).

### 3.7 Stillbilder: ankare 2.1, 2.2, landningsbild
Nano Banana Pro, 4K, 4:3, `referenceImages` `@anchor` (dealerns egen bild) och `@pose` (bara en utklippt underarm och
hand, `tools/order-images.ts`). För stillbilder gäller Googles råd: detaljerat får det vara, men det oönskade sägs
positivt ("one card", inte "no second card"). Orden för ankarna: `SAY.still*` och `STANDARD_STILL`.
```
This is an edit of the picture @anchor. Keep everything in @anchor exactly as it is: the framing and camera, the flat chroma-green background and table, the black card shoe at the right with the yellow card in its window, and the woman's face, hair, clothes, build and her hand at the left of the picture. Change only her hand nearest the shoe: it rests at the blue card lying flat on the felt in front of her, the tips of her forefinger and middle finger on the card's edge nearest her, the wrist raised above the knuckles and the thumb free beside the card, placed and shaped as the hand in @pose. @pose is a cut-out on plain green that shows only a forearm and hand; take from it only where the hand is and how the fingers touch the card. [STANDARD_STILL] There is one card on the felt and one in the shoe, each the size and shape of the card in the window.
```
- Exemplet är **landningsbilden** (S, oprövad): `@anchor` = ankare 1 med kortet ritat där planen säger; `@pose` = armen
  ur Pamelas godkända giv till samma plats, rutan där fingertopparna vilar på kortet. Efteråt ritas kortet om ur planen
  och skon tas från ankare 1 (`tools/python/skolagning-21.py`, order-clerk §5).
- **Ankare 2.1:** `paow-ankare-2-1` gav 4/5 och 2/5 (dubbla kort); Jakob godkände tagning 1 och underkände tagning 2
  (V).
- **Ankare 2.2:** 1 av 6 tagningar i tre ordrar, och bara efter lagning; varje gång ritade bildmodellen om skon, också
  när ankare 2.1 var `@anchor` (§5, V). `paow-ankare-2-2` tagning 1 (Pamelas öppna sko ritad) gäller sedan skolagningen
  satt ankare 1:s sko och kort i fönstret, ett förpass med `fillDark` vid snitt 828 fått kroppen att sluta på rad 831
  och tre lokala lagningar gjorts (kavajens hörnsteg 24 × 10 px, glipan vid pekfingret, manschettskarven): granskaren
  3/5 för provfilmer, Jakob: gäller (besked 15:47; `paow-ankare-2-2-t1`) (V, kvittot och Material). Oprövat: en ruta ur
  en film som börjar på ankare 2.1, eftersom filmen behåller skon där första rutan har den (S). En runda kan dela en
  plats från ankare 2.2 (`SEAT_HUB`, SYSTEM), i dag Paows plats 6, när ingången, given, returen och utgången är dömda.
- **Före vändningen** (3.3): ingen pose finns i banken; en ruta ur Jakobs egen film (3.8), utklippt till handen, är
  förslaget (S).

### 3.8 Referensfilm, Motion Control och Jakobs egen hand
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
- **Granskning:** oberoende granskare enligt [film-review.md](film-review.md); poäng 0–5 per del (giv, retur) och
  domordet. För en giv alltid: ett kort? vänds det en gång, och var? lämnar kortet filten eller fingrarna före platsen?
  håller storleken ±10 %? enfärgat hela vägen? går handen tillbaka lågt?
- **Jakobs dom** skrivs bara av honom i Granska (`motions/<id>.json`, `review`); citera hans ord, skriv inte om dem.
- **Tabellerna förlängs** av den som provar: en rad per metod, belägget med order och tagning. Ingen dagbok; en ersatt
  rad skrivs om. Order-id förkortas `p4-11` = `paow-giv-2-1-p4-11`.

**Det som håller (2026-11-13).** Metoden som beställs per steg står i `data/order-methods.json`; tabellerna här är
belägget.

| Metod | Belägg (V): granskaren · Jakob | Status |
|---|---|---|
| Nyp-giv med referens till samma plats, Kling 4, 7 s | b6 P4, b17 P4, b19 D, b20 P1 2/2; `p4-11` given 3/5 · "Tack!"; `p1-08` (vändning vid platsen i texten): 2 av 2 vände vid platsen, lagt 2–3 px från planen (granskning pågår) · t2 godkänd, t1 underkänd ("Kortet kapas"); `p1-05` (fri vändning) 3,5/5 · underkänd (färgbyte halvvägs) | håller; det enda som har vänt vid platsen två gånger av två; Pamelas hand kan läcka in |
| Fri vändning på vägen (`FREE`), mall 5, P1 (omgång 4) | `p1-06` WAN 3: 3/5, kantrutor f40–43, +18–30 % i luften · Primär, "Mycket bra, kan konkurrera om att bli den primära."; `p1-04` Kling 4: 1,5/5 · godkänd; `p1-05` · underkänd | håller för Jakob vid P1 (2 av 3); P7 inte dömd |
| Rullas kring långsidan på vägen, Kling 4, mall 3 (`p4-04`) | mätt: en vändning (43–50), kortet +21 % i brösthöjd, skjutet 160 px · Primär, "Kanske den bästa!"; returen Primär | Jakobs bästa giv till P4 (1 tagning) |
| Retur i samma film (tur och retur) | 0,5–4/5 · 16 av 21 godkända, två Primär | håller för Jakob |
| Platsen i ord (mall 5) till ytterplatserna | omgång 4: handen når P1 eller P7 i 4 av 5, 677 krediter; omgång 5: P1 och P2 nås i alla tagningar, P7 0 av 2; utan (omgång 3 och 3b): 0 av 8 användbara | håller för att nå platsen, inte P7 med WAN 3 |
| Släp från 2.2, WAN 3, stängt, 6 s | P1 cirka 7/9; P4 0/2; P7 0/2 | håller till P1 |
| Ingång 1 → 2.1, WAN 3, 4 s | 3,5/5 · Variant ("hon rör inte blicken"); kavaj 1/2 | håller; blicken nu i texten |
| Ingång, Kling 3.0 4K | 3/5, ingen skärpevinst · Godkänd, "bra men tråkig" | håller, ingen vinst; beställs inte |
| Vila, WAN 3, 4–5 s | 1–3/5, munnen öppen i 4 av 6 · 8 av 8 godkända, 7 som Variant | håller för Jakob; munnen olöst |
| Ankare 2.1, Nano Banana Pro, posearm ur Pamelas ruta | 4/5 och 2/5 · t1 godkänd (gäller), t2 underkänd | håller (1 av 2) |
| Ansiktsuttryck genom redigerad stillbild i grundrutan | Pamela, `mcp/spegla.sh` (DRIFT till `f6f68ef`) | håller |

**Där granskaren och Jakob dömde olika (hans dom gäller)**

| Tagning | Granskaren (eller beställarens mått) | Jakob |
|---|---|---|
| `p1-04` Kling 4, P1, fri vändning | given 1,5/5: tappat framför skon, skjutet cirka 790 px | "Jag tycker att den här är riktigt bra, givet att den är gjord på ett bra sätt." |
| `p1-05` Kling 4 med referens, P1 | 3,5/5, bäst i omgång 4 | underkänd: "Här ändrar kortet färg ungefär halvvägs." |
| `p2-03` Kling 4, referens från ankare 2.2 | mätt: lagt framför skon, skjutet cirka 725 px, vänt i luften (granskning pågår) | "Kortet läggs upp, det är kanske aningen litet, men det håller helt klart." |
| `p4-08` kort text, WAN 3, P4 | given 1,5/5: gult blir blått utan kantruta, handflatan platt | "Dena funkar!" |
| `p4-10` minimal text, Kling 4 | given 1/5: snurr på kant, en andra rullning | "Ja, det här var bra." |
| `paow-giv-p4` t2, mall 3, Kling 4 | 2,5/5 möjlig variant | "Denna är bra" |
| `p4-12` stängd giv, WAN 3 | 3/5, bäst i omgång 2 | underkänd: "… Dessutom har hon kvar ett gult kort som hon lämnar till spelare fyra." |
| `p4-14` t2 stängd giv, WAN 3 | 3,5/5, användbar med anmärkning | underkänd: "… endast om det är gjort med avsikten att hon ska hålla kortet stängt så att det blir gult till gult. Jag tror dock inte att det är så." |
| `2-2-p6-01` släp från ankare 2.2 till P6, WAN 3 (omgång 13) | beställarens mått: faller (tryckt kort på båda sidor; kortspåraren tappar det efter vändningen) | given Variant: "Tryck på båda sidorna, men hon trycker eller pressar ner kortet som man gör med en blackjack-sko. En eller ett par sånna kan vara roliga och bra att ha i alal fall"; returen underkänd: "Tråkigt! och med tryck på kortet" |
| Returerna i tur och retur, vilorna | 0,5–4/5 och 1–3/5 | 16 av 21 och 8 av 8 godkända |

**Oavgjort**

| Metod | Belägg (V) | Status |
|---|---|---|
| Lång, kort eller minimal text | Jakobs godkända givar: Utförlig 2 av 4, Kort 8 av 16, Minimal 1 av 2 | våra domar skiljer inte; §1 står |
| Öppen giv, Kling 4, utan referens | P4: `paow-giv-p4` t2, `p4-04` (Primär), `p4-10` godkända, `p4-07`, `paow-giv-p4` t1 underkända; P1: `p1-04` godkänd (skjutet 790 px); P7: `p7-04` lyft 171 px, ej dömd | oavgjort |
| Vändning vid platsen utan referens, WAN 3 | `p4-08` godkänd (bytet vid platsen utan kantruta); `p3-02` (3b) Variant: "Riktigt rolig variant … fungerar utmärkt som en godkänd eller primär"; `p1-07` t2 vände vid platsen · underkänd; P7 0 av 2 | oavgjort |
| Dealerns första kort, WAN 3 (`d-01`) | mätt: lagt i skokortets storlek, vänt i luften, krymper till hälften och skjuts 63 px; ej dömd | oavgjort |

**Det som föll**

| Metod | Belägg (V) | Status |
|---|---|---|
| Stängd giv till en spelarplats | Jakob godkände 1 av 5 (`p5-01` som Variant: "Jag kommer att gå emot mina egna regler här …"); `p4-14` t2 retur: "Eftersom det är gult, underkänner jag."; planens spelarkort landar öppna (`placements/default.json`) | faller; stängt bara för hålkortet |
| Kort text utan platsen i ord, WAN 3, alla platser (omgång 3 och 3b) | 14 tagningar, 1 960 krediter: 12 föll; ytterplatserna 0 av 8 (kortet framför henne eller tillbaka in i skon, slutbildens kort dyker upp, ofta tryckt) | faller; ersatt av mall 5 |
| WAN 3 till P7 (omgång 4 och 5) | 0 av 3: skons kort tryckt (`p7-03`), kortet framför henne och tillbaka i skon (`p7-05` t1), ett andra blått kort (`p7-05` t2) | faller |
| Nyp-giv med referens till annan plats | b19 P1 med anmärkningar, P7 föll | faller |
| Öppen giv, WAN 3, utan referens, vändning i luften | b6 kortet 2× i luften; `p4-09` tryckt spelkort · underkänd | faller (`p4-08`, `p1-06` se ovan) |
| Handbyte i given, Kling 4, mall 3 (`p1-01`, 550 ord) | 1/5: ingen överlämning, höger drar ett eget kort · underkänd: "Du måste ge AI lite utrymme." | faller (1 tagning) |
| Hela rundan i en tagning | 7 filmer, 0 användbara, cirka 3 500 krediter | faller |
| Mellanbild i Kling 4 | b1b, b4: läses som start, slut eller följd | faller |
| Kling 3.0 Motion Control, Pamelas film | b1a 44/100, kortet genomskinligt | faller (1 film) |
| Aleph, aleph2, Kling 4 edit, WAN video-till-video, `edit_video` med egen nyckelruta | `paow-samma-film`: Pamelas ansikte tillbaka, fönstret töms; DRIFT till `f6f68ef` | faller |
| Ultrarapid som snabbas upp; uttaget baklänges; Seedance 2.5 via MCP (bara en förhandsfil) | DRIFT till `f6f68ef`; för Seedance kom den fulla filen ur listan över senaste generationer, rapporterat av trailersessionens producent 2026-11-13, inte mätt av oss (§4) | faller; för Seedance var felet kanske hämtningen (S) |
| Hopklippta ankare, platt målad kortyta | Pamela: för litet kort, fingertopp bredvid, påhittad tryckt framsida (DRIFT till `f6f68ef`) | faller |
| Ny person i en annans bankruta (stillbild, b23) | vaxig hud, kroppen 58 rader för kort (`order-b24.json`) | faller; redigera i stället |
| Ankare 2.2 som redigerad stillbild | tre ordrar, sex tagningar, 1 användbar efter lagning: `paow-ankare-2-2` (Pamelas öppna sko kopierad i båda; t1 gäller efter skolagning, förpass och tre lokala lagningar, granskaren 3/5 för provfilmer, Jakob: gäller, 3.7; t2 två skofronter och två kort), `-01` (fönsterskon cirka 100 px åt vänster), `-02` ur ankare 2.1 (104 och 81 px åt vänster) | 1 av 6, och bara med lagning; oprövat: en ruta ur en film som börjar på ankare 2.1 |
| 4K-filmmodell för skärpa | `paow-ingang-2-1-02`: ingen skärpevinst i bankens ruta, 172 mot 80 | faller |
| Bildmodellen flyttar kameran (sidovy) | fyra försök, 160 krediter (`D:/dealer-scratch/tmp/dealer-bf/LASMIG.md`) | faller |

**Omgång 5, granskad och dömd 2026-11-13 (V, kvittona och `motions/`).** Granskaren (giv/retur): `p1-08` t1 4/3,5 och t2
4/0,5 (ett andra gult kort stoppas in i skon i returen), `p2-03` 3,5/3,5 möjlig variant, `p1-07` t2 2/3 (kortet
kakigrönt), `d-01` 1/3 (kortet halveras i längd). Jakob: `p1-08` t1 underkänd ("Kortet kapas när det läggs ner"), t2
godkänd; `p2-03` godkänd; `p1-07` t2 underkänd; `d-01` godkänd ("Den är mycket bra."); `p7-04` godkänd ("gjord med
mycket finess"); `p7-03` underkänd (kortet blev blått utan att vändas).

**Jakobs domar per metod (2026-11-13 klockan 07:50; räknas om med `node tools/verdicts-per-method.ts paow`).** Givar:
Kling 4 utan referens, öppet, 6 av 11; med platsen i ord och fri vändning (mall 5–6) 3 av 5 (`p1-04`, `p5-03` som
Variant, `p7-04`; underkända `p6-03` och `p6-04`). WAN 3 öppet 4 av 7 (med vändning vid platsen 3 av 5). Kling 4 med
referens till samma plats 2 av 4. Kling 4 med referens från en annan startpose 1 av 1 (`p2-03`). Stängt till en
spelarplats 0 av 5: `p5-01` först som Variant, sedan "Nej fasen det är ju stängt - gul till gult - kan inte godkänna";
spelarnas kort ligger öppna, och stängt beställs bara för hålkortet. Sammanlagt 13 av 28 givar och 22 av 28 returer i
samma film. Metoden väljs efter de här domarna, inte efter granskarens poäng.

**Mall 6 och 7 (2026-11-13).** Mall 6 sade kortets sidor bara med färg och vilken som är uppåt ("yellow side up", "blue
side up"), efter Jakobs ord: "Baksida kan betyda olika saker, som baksidan på ett kort, men det kan också referera till
undersidan." Omgång 6 ställde mall 5 mot mall 6 i två par, samma platser och modell: båda tagningarna på mall 6 gick fel
vid vändningen, båda på mall 5 vände kortet synligt (`72e4f08`). Jakob underkände båda på P6 (`p6-03`: "funskar med
kortsidan"; `p6-04`: "som förra också - sladdrigt kort och fuskar med kortsidan") och tog `p5-03` som Variant ("Men
handrörelsen är skitbra!"). Två par bevisar lite, men mall 7 säger åter "its back is yellow and its face is blue"
(`SAY.colours`); frågan om ordet "back" står öppen. Mall 7 lägger också till (`152fffd`, `72e4f08`): hon rör sig lite
medan hon delar ut (`SAY.moveOwn`, `SAY.moveBoth`; Jakob: "jag vill i allmänhet att paow rör sin kropp och huvud och SIN
högerarm aningen mer"); efter ett handbyte går den arm som är ute tillbaka (`SAY.backPass`); en stängd giv från nypet
läggs plant framför skon och skjuts (`SAY.layAndSlide`, eftersom omgång 6:s stängda tagningar bar kortet lutat så att
blått syntes och bytte storlek); hålkortets vändning har bara hålkortet på sina bilder (med båda korten lyfte hon båda,
`paow-halkort-01`).

**Omgång 7–10 (2026-11-13, 31 tagningar på de 6 000 krediter Jakob lade till; V: kvittona och `motions/`).**
- Mall 7 (hon rör sig medan hon delar ut) i 18 tagningar: hon rör sig (huvudet cirka tre gånger så långt), men kortet
  gick fel i 15 (färgbyte utan kantruta, kortet långt i handen och kort när det läggs, en vickning mot kant), och i 3
  delade hennes andra hand (`c81c548`). Mall 8 tar bort meningen; givar slutar åter på "The other hand rests on the felt."
- Tillägget "Her eyes follow the card." (orderns `extra`) i två tagningar till plats 6: blicken följer kortet hela given
  (huvudet 20–39 px mot 11–12), men kortet blev inte bättre.
- Av mall 7:s och 8:s givar spelas bara `p7-06` tagning 1 (preliminärt godkänd: en verklig vändning, kantruta f37).
- Hålkortet stängt med orden "lägg plant och skjut": 1 av 3 håller, `paow-giv-2-1-d-c2-03` tagning 1 (inget blått i
  någon ruta; storleksbytet döljs under handflatan). Hålkortets vändning med bara hålkortet på bilderna: 2 av 4 användbara,
  `paow-halkort-04` tagning 2 (Kling 4, den beställda handen, en ren kantruta i luften) och `paow-halkort-02` (WAN 3, en
  mörk suddig rand där kanten skulle synas, Variant). Utgången: `paow-utgang-01` håller (blicken går ned till skon och
  upp igen), 1 av 2. Alla dessa är preliminära domar, dömda åt Jakob, och väntar inte i hans kö.

**Öppen fråga: hur hon rör sig utan att det kostar kortet.** Jakob vill att hon rör kropp, huvud och högerarm mer.
Rörelsemeningen i mall 7 gjorde det och förstörde kortet i 15 av 18 tagningar; blicken ensam (tillägget ovan, 2 tagningar)
gav rörelse i huvudet men inget bättre kort. Prövat i omgång 12–15 (nedan): rörelsen i egna vilofilmer före eller efter
given; av vilorna med blick, leende eller andetag fann granskaren 5 av 6 användbara, och Jakob godkände de två han själv
har dömt. Oprövat: en referensfilm där en hand rör sig medan den andra delar ut.

**Plats 6 är det enda steg som saknas för en runda** (`node tools/produce.ts paow`). Fjorton tagningar
(`paow-giv-2-1-p6-01`–`-10`) har fallit, för Jakob, för granskaren eller på ett mätt fel, med samma mönster: vägen från
skon till plats 6 är kort, och kortet vänds i ett sudd, är mjukt eller byter sida utan kantruta. Prövat: Kling 4 med fri
vändning på mall 5, 6, 7 och 8, och vändning vid platsen med WAN 3 (två tagningar) och Kling 4 (två, omgång 11: mjukt
kort och en suddig blandruta i vändningen). Inte prövat: en referensfilm (Pamelas giv till plats 6 är bara godkänd som
variant, och hans regel tillåter bara rakt godkända som referens) och handbyte; platsen kan också flyttas en bit från
skon i planen. I spelet läggs plats 6:s kort utan hand. Från ankare 2.2 har plats 6 sin första användbara giv
(`2-2-p6-02`, omgång 14: given Variant och returen godkänd, dömda åt honom); i spelet ändras inget förrän ingången till
och utgången från 2.2 är dömda (omgång 15, nedan).

**Omgång 12–15 (2026-11-13, 22 tagningar av filmproducenten åt huvudagenten; V: kvittona och `motions/`).** Order-id
förkortas `vila-09` = `paow-vila-09` och `2-2-p6-02` = `paow-giv-2-2-p6-02`. Domar som huvudagenten och en oberoende
granskare gav på Jakobs mandat står som dömda åt honom; hans egna står med hans ord.
- Vilor med en handling i orderns tillägg, WAN 3, 5 s (`vila-09`–`-11`, två tagningar var): 5 av 6 användbara för
  granskaren (4, 4, 4, 4, 3 och 2/5). Blicken till spelarna åt båda håll och tillbaka håller (`vila-09`), men hon
  blinkar tre gånger där en beställdes. Blick ned och leende med stängda läppar (`vila-10`): leendet som beställt, men
  huvudet lutar 16° och 10° i stället för lite och tillbaka, och i tagning 1 sluts båda ögonen samtidigt (ingen enögd
  blinkning). Andetaget (`vila-11`) tas med öppen mun i båda (8–13 px), och i tagning 2 går blicken aldrig ned till
  skon. Jakob: `vila-09` t2 Variant ("Ja, den är okej och kan användas ibland."), `vila-10` t2 godkänd ("Bra, hon har
  rört på sig i alla fall."); `vila-09` t1, `vila-10` t1 och `vila-11` t1 Variant och `vila-11` t2 underkänd, dömda åt
  honom.
- Ett större steg var femte ruta (1,4–2,2 gånger, granskarens mått) i alla åtta granskade tagningar i omgång 12; det
  syns som ett ryck i vridningar och armar. Oprövat: att jämna ut det i efterarbetet.
- Kaffet ur Scout Gaming-koppen, 8 s, en tagning per modell: WAN 3 (`vila-12`) 3/5: koppen kommer upp under
  bordskanten och går ned igen, "Scout Gaming" läsligt i cirka 40 av 79 rutor och förvrängt i ruta 89–97, 132 och
  136–147; den andra handen är borta från filten i fem sekunder, och hon böjer sig långt (näsan 250 px); Variant, dömd
  åt honom. Kling 4 (`vila-13`) föll på beställarens mått: "Gaming" blir "Oaming" i varje ruta, och hon är 4,7 nivåer
  mörk. Tryck på en rekvisita håller delvis, bättre med WAN 3 (en tagning var).
- Vinkningen till någon snett bakom kameran, WAN 3, 6 s: `vila-14` 3/5: fem vinkningar i stället för två, till tittaren
  och inte snett bakom kameran (huvudet 10–15° åt sidan, ögonen nära kameran), ingen blinkning på 5,9 s, och kroppen
  glider 2–3 px fram till ruta 174; Variant, dömd åt honom. Omtagningen `vila-19` (huvudet åt hennes höger, två
  vinkningar) föll på ritat bord (§4), och huvudet vreds åt fel håll.
- Knäcka fingrarna, WAN 3, 6 s: 0 av 3 knäck. `vila-15` (händerna lågt över filten) och `vila-18` (armarna rakt fram)
  föll på ritat bord (§4) fast rörelsen var den beställda; `vila-16` (händerna framför bröstet) knäppte händerna utan
  knäck, granskaren 3/5, Jakob Variant ("Ja, det här är en udda variant. Den knäcker inte fingrarna, utan hon gör någon
  slags bön. Men den här kan man ha att köra ibland. Det kommer säkert till användning.").
- Givar från ankare 2.2 med släp, WAN 3, 6 s, öppet och vänt vid platsen (omgång 13, en tagning per plats): alla tre
  kort tryckta. P1 (`2-2-p1-01`) föll på beställarens mått: kortet vändes i luften till ett tryckt spelkort, slutbildens
  kort dök upp av sig självt, och hon bar det tryckta kortet tillbaka till skon. P4 (`2-2-p4-01`): granskaren 2,5/5 för
  given och 4/5 för returen, vänt i luften cirka 190 px före platsen, vilar inom 1 px av planen; Jakob: given Variant
  ("Den här är bra, men kortbaksidan har ett tryck på sig. Annars är den lite rolig."), returen godkänd ("Observera 2.2
  och inte 2.1"). P6 (`2-2-p6-01`): den första vändningen med kantläge till plats 6 (kring långsidan cirka 85 px före
  platsen), men tryckt kort; Jakobs domar står i tabellen ovan.
- Tillägget om enfärgat kort, en ändring mot `2-2-p6-01` (omgång 14): "The card is plain, one flat solid yellow from
  edge to edge on its back and one flat solid blue from edge to edge on its face, and the next card in the window is the
  same plain solid yellow." Med WAN 3 (`2-2-p6-02`): kortet och skons kort enfärgade hela filmen, kortet vilar 1,5 px
  från planen (+0,4 och +3,7 %), vänt i luften cirka 91 px före platsen och 17 % för långt i handen. Granskaren 3/5 för
  given (en vit kant på cirka 4 px på den gula sidan) och 4/5 för returen; given Variant och returen godkänd, dömda åt
  honom. Den första given till plats 6 som kan spelas med ritat kort, när kortspåret har rättats (ruta 51–81 och
  97–102). Samma text med Kling 4 (`2-2-p6-03`): 1/5 (kortet byter sida utan kantruta, 2,2 gånger för stort i handen,
  vit kant, 5,5 nivåer mörk), underkänd, dömd åt honom.
- Ankare 2.2 gäller (`paow-ankare-2-2-t1`): 1 av 6 tagningar, och bara efter lagning (3.7).
- In och ut ur ankare 2.2, WAN 3, 4 s, två tagningar var (omgång 15; Beställ har steget `UTGANG-2.2`), med en mening om
  enfärgat kort i fönstret: ingången (`paow-ingang-2-2-01`) 1 av 2 ren, tagning 1 föll på ritat bord från ruta 15;
  utgången (`paow-utgang-2-2-01`) 2 av 2 med rena skarvar. I de tre rena: starten 2,98–3,10 mot ankaret (tonlyftet),
  slutet 6,4–6,5 mot 6,13 i den godkända 2.1-ingången (`paow-ingang-2-1-01`); handen i sista rutan utan förskjutning mot
  ankaret; kortet i fönstret enfärgat (sett) och stilla (mitten inom 1 px av ankare 1:s när det syns). Ansiktet är
  mjukare än ankaret vid skarven (skillnad 10–11 mot 8 i 2.1-ingången). Utgången tagning 1: handen går högt och doppar
  fram förbi bordskanten (ruta 50–80); tagning 2: den vilande handen glider fram mot kameran (ruta 50–100) och tillbaka.
  Granskning pågår.

**Oprövat:** referensfilm eller handbyte till plats 6; retur som egen film från en landningsbild; vändningen som egen
film; landningsbild som stillbild; ankare 2.2 som ruta ur en film; referensfilm av Jakobs hand; renderat kort i
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
