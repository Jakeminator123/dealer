# Handbok: så komponeras en filmbeställning

En av fyra: [dealer-line.md](dealer-line.md) är ingången (stationerna från en bild till en färdig dealer, alla format och namn), [order-clerk.md](order-clerk.md) säger hur en beställning läggs, [film-review.md](film-review.md) hur filmen granskas, och den här hur beställningen sätts ihop (bilder, referensfilm, text, modell, längd, tagningar) och **vad som har hållit och vad som har fallit** (§5). Skriven 2026-11-13 ur tillverkarnas guider, våra liggare (`D:/dealer-scratch/tmp/paow/`), kvittona `assets/orders/*/receipt.json`, protokollet (`node tools/order-ledger.ts`) och Jakobs domar (`review.userReview` i `motions/paow-*.json`). Underlaget i längre form: `D:/dealer-scratch/tmp/huvudagent11/recept/RAPPORT.md`.

**Märkning.** (V) = verifierat: läst i källan, i liggaren, i kvittot eller sett i rutor. (S) = skattat: egen slutsats, inte prövad. Källtyp: *Tillverkare* (officiell dokumentation), *Praktiker* (namngiven, utan prov), *Hörsägen* (osignerat). Två tagningar bevisar lite; där belägget är en eller två tagningar står det så. **Jakobs dom avgör**; där granskaren dömde annorlunda står båda.

## Slutsats

1. **Bilderna säger vem och var, texten bara rörelsen.** Inget om hennes utseende; platsen sägs i ord utan bildpunkter (mall 5).
2. **En handling per film, ett kort, få led.** Vändningen sägs med en mening, en gång.
3. **Positivt formulerat, inga förbud.** Ingen lista "Nothing of this happens", inga "not/never/without".
4. **En rörelse låses med en bild eller en referensfilm, inte med ord.** Det texten inte kan låsa löses med ett ankare eller en film av rörelsen.
5. **Allt som syns i en bild eller film följer med.** Fel sko, en annan dealers hand, ett föremål: modellen kopierar det.
6. **Två tagningar sållar, de avgör inget.** En metod blir regel först efter fler tagningar (§5).
7. **Jakob dömer kortet, granskaren måtten.** Han har godkänt 5 av 11 givar och 9 av 11 returer, och underkänt för kortets färg och vändning ("fel färg", "två vridningsmoment", "ett blått spelkort") och för stelhet ("Hon är väldigt stel"), inte för handens höjd eller kortets storlek (V, `motions/paow-*.json`). Mönstret är skattat (S).

## 1. Reglerna med belägg

| Regel | Starkaste källa | Vårt eget belägg |
|---|---|---|
| 1 Bilderna bär vem och var | Runway Gen-4: "Focus on describing the motion, rather than the input image … can lead to reduced motion" (Tillverkare, V). Alibaba: "Prompt = Motion + Camera movement" (V). Kling: "Keyframes show the important moments. The prompt explains how the video moves between them" (V) | b6 nyp till P4 (Kling 4, 127 ord, utseendet nämns inte): användbar, händer och kort 5/5 (V). Men Jakobs bästa giv, `paow-giv-2-1-p4-04` (Primär, "Kanske den bästa!"), har mall 3 med utseende och förbudslista, 377 ord (V). Våra domar bekräftar alltså inte regeln; tillverkarnas råd står |
| 2 En handling, få led | Alibaba: "Keep actions simple and short", "One clip = one continuous shot" (V). Runway Gen-4: "Avoid overly complex prompts" (V) | Hela rundan i en tagning: 0 användbara av 7 filmer, cirka 3 500 krediter (V). `paow-giv-p4`: cirka åtta led på 7 s, vändningen i tre; tagning 1 vände kortet två gånger (ruta 61–63 och 90–93) (V). Korta vägar får korta klipp, annars hittar modellen på extra rörelser (DRIFT till `f6f68ef`, V) |
| 3 Inga förbud | Runway Gen-4: "Negative phrasing is not supported and may produce unpredictable or even opposite results" (V). Kling 4: "Negative prompts can increase the likelihood of errors" (V) | `paow-giv-p4`: åtta förbud, minst tre hände ändå (V). Jakobs godkända givar per stil: Utförlig (med förbud) 2 av 4, Kort 2 av 5, Minimal 1 av 2 (V): sambandet syns inte i våra domar |
| 4 Bild eller film låser rörelsen | Kling 4: referensfilm för "moves and … timing in @Video1" (V). Alibaba WAN 3: referens "to replicate … action choreography" (V). Kling 4 kopierar referensens rörelse nästan bildpunkt för bildpunkt (DRIFT till `f6f68ef`) | Nyp-giv med Kling 4 och bankens tur och retur till samma plats höll i b6, b17 (P4), b19 (D) och b20 (P1, 2 av 2) (V). `p1-05` följer referensens väg och takt ut till P1 (mätt, V). Samma referens till fel plats: kortet läggs där referensen lägger det (b19 P7) (V) |
| 5 Bilden följer med | Runway I2V: "Visual artifacts, such as blurry hands or faces, may be intensified" (V) | Ankare 2.2: posebilden visade Pamelas sko med öppen front, båda tagningarna ritade den (0/2) (V). Med Pamelas film som referens tappar Paows givande hand tatueringen i snabb rörelse (Prov `paow-plats-4-som-mall`) (V) |
| 6 Två tagningar sållar | Jakob: två tagningar per klipp, en tredje om båda faller (HANDOFF) | Är två metoder lika bra med 50 % lyckade blir utfallet 2–0 mot 0–2 av slump i ungefär 1 fall av 8 (S) |

**Där källorna säger emot varandra (V):** Klings egna exempel innehåller förbud ("Avoid duplicate limbs …") trots rådet. WAN:s promptomskrivare för första och sista bild säger både "emphasize potential changes … between the two frames" och "reference … clothing, backgrounds" (80–100 ord). Runway Gen-4.5 sägs klara "complex, sequenced instructions", Gen-4 vill ha enkelhet. Google säger för stillbilder "Be Hyper-Specific" och "semantic negative prompts" (beskriv det önskade positivt), så en stillbildstext får vara lång men inte förbjuda. Runways hjälpsida säger att Seedance 2.5 tar nyckelbilder och referenser samtidigt; vårt verktygs schema säger att bara `kling-4` tar första och sista bild tillsammans med referensfilm. Schemat gäller för oss.

## 2. Formeln

En beställning är en ren funktion av valen i Beställ: samma val ger samma bilder, text, modell och kostnad. Texten skrivs aldrig för hand i en order; ändras den, ändras mallen och versionen räknas upp. De exakta orden står i `SAY` i `src/order-prompts.ts` (mall 5, `TEMPLATE_VERSION`; Utförlig = mall 3; en order återges med sin egen version); reglerna och recepten står här. Kort är förvalet, Minimal är Jakobs prov, Utförlig bara för jämförelse. Skiljer orden sig från reglerna här, rättas orden. Format, filer och priser: [dealer-line.md](dealer-line.md), "Format och namn".

| Del | Kommer från valet | Regel |
|---|---|---|
| Första bild | Steget: ankaret det börjar på (1, 2.1 eller 2.2), det som gäller i Material; en retur börjar på landningsbilden | Hel verklig ruta i bankens format, samma grönt, sko och ton som sista bilden |
| Sista bild | Steget: ankaret det slutar på; för en giv samma bild plus kortet där planen säger (`flatQuad`), för en giv "bara dit" landningsbilden | Exakt samma kort som första bilden plus det enda som delas ut |
| Mellanbild | Ingen | Kling 4 via Runway placerar den inte i tiden (räknas som referensbild); b1b och b4 läste extra bilder som start, slut eller följd (V). Gör mellanläget till ett eget ankare i stället |
| Referensfilm | En tagning ur banken (`reference`) | Bara `kling-4`; obruten, 3–30 s, samma kortföljd och samma plats som sista bilden, rakt godkänd av Jakob; meningen `SAY.reference` ("video 1") |
| Text | Steg, hand, sida, vändning, plats, tillägg | Skelettet nedan |
| Modell, längd | Steget har förval; modellen kan väljas | Tabellen nedan |
| Tagningar | 1 per metodprov, 2 per klipp när metoden är vald | En tredje bara om båda faller |

**Textens skelett, i denna ordning (film):** 1 `SAY.camera` ("Locked camera, one continuous shot."). 2 Med referensfilm `SAY.reference`. 3 Handlingen i en mening, handen pekad ut genom var den är (`SAY.handAtShoe`; Runway: "clear positional language"; undviker spegelförväxling, S), med platsen i ord (`whereShort`, "towards its place at the far left of the picture, where the last frame shows it"). 4 Vändningen, bara om kortet landar öppet: exakt en av `turnAtPlace`, `turnOnTheWay`, `rollOnTheWay` (§3.3). 5 Vägen tillbaka, bara i tur och retur (`backPinch`, `backDrag`). 6 Andra handen (`otherRests`). 7 Kortet (`oneCardMoves`). 8 Jakobs tillägg, en positiv mening.

**Står aldrig i en filmtext:** utseende, kläder, hår; förbud eller "not/no/never/without"; bildpunkter; tidsangivelser (WAN läser dem som scenlista, S); en andra handling; "exactly as in the last frame" mer än en gång. Längd: så kort som skelettet tillåter; mall 4 och 5 gav 79–132 ord (protokollet, V).

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

Billig sållning: WAN 3 i 480p kostar 5 krediter per s och visar om modellen gör rörelsen (`data/order-policy.json`, V). Kling 3.0 4K beställs inte längre (`MODELS['kling-3-4k'].off`: ingen skärpevinst, 172 krediter mot 80; Jakob: "det är dumt att ta ett klipp i 4K om övriga klipp inte är i 4K"). Seedance 2.5 i 1080p kostar 68 per s plus 34 per s referensfilm (Runway, V): en 7 s giv går över taket 400.

## 3. Recept per steg

Orden står i `SAY`; här står vad som har hållit och varför.

### 3.1 Ingång: ankare 1 → 2.1 och → 2.2
- Orden: `SAY.reach['2.1']` eller `['2.2']`, `SAY.eyes`, `SAY.otherRests`. WAN 3, 1080p, 4 s, två tagningar. Blicken är med för att Jakob sade om `paow-ingang-2-1-01`: "En bra variant! Men hon rör inte blicken filket är tråkigt" (V).
- Har hållit: `paow-ingang-2-1-01` (WAN): granskaren 3,5/5 (HANDOFF), Jakob Variant; `-02` (Kling 3.0 4K, 172 krediter): 3/5, Jakob Godkänd, "bra men tråkig" (V, en tagning var). Kavajomgången: 1 → 2.2 gav en huvudtagning av två (V).
- Har fallit: båda ingångarna rörde fönstrets ram före kortet (WAN ruta 44–59, 4K ruta 38–55) (V). Troligen geometrin: fingret kommer uppifrån och kortets kant sitter bakom ramen (S). Ordet "rim" är struket; att texten flyttar fingret är oprövat.

### 3.2 Giv med nyp från ankare 2.1
- **Med referensfilm (det som har hållit):** Kling 4, 1080p, 7 s, referens = bankens rakt godkända tur och retur **till samma plats**. Höll: b6 P4, b17 P4, b19 D, b20 P1 2 av 2 (V); `paow-giv-2-1-p4-11` given godkänd av Jakob ("Tack!"), granskaren 3/5 (vänd i luften som referensen, lägst hand, lagt utan skjut) (V); `paow-giv-2-1-p1-05` (omgång 4b, P1, Pamelas giv till P1 som referens): given 3,5/5, returen 3/5, användbar; lagt av handen och 1 px från planen, men färgbyte utan kantruta (f35–36) cirka 330 px före platsen, och hon lutar sig 245 px (referensen 273) (V, en tagning, inte dömd av Jakob). Föll: referens till annan plats (b19 P1, P7) (V).
- Risk: referensen är Pamelas, och hennes hand läcker in (tatueringen försvinner i snabb rörelse) (V). Studion stoppar bara hela bilder av en annan dealer; en annan dealers film som referens tillåter Jakob (order-clerk §3; HANDOFF öppen punkt 9 för varianter).
- **Utan referens:** `paow-giv-2-1-p4-04` (mall 3, rullas kring långsidan, Kling 4): Jakobs Primär, "Kanske den bästa!", fast kortet lyfts till brösthöjd och växer cirka 21 % och skjuts 160 px (mätt, inte granskad, V). `paow-giv-p4` (mall 3, Kling 4): tagning 1 underkänd ("just denna omsvängning av kortet sista tredjedelen av videon som förstör.."), tagning 2 godkänd ("Denna är bra"), granskaren 2/5 och 2,5/5 (V).
- Bankens givar vänder kortet i luften, inte vid platsen (V). För Jakobs sex steg finns ingen referens i banken: se 3.3.

### 3.3 Vändningen vid platsen (Jakobs sex steg)
Nyp, Dra, För fram, Vrid, Vänd upp, Lägg: kortet ligger gult upp mot filten hela vägen och vänds först vid platsen. 14 tagningar har beställts så; en vände vid platsen (`paow-giv-2-1-p4-07`, kantruta f70, granskaren 2,5/5), och den underkände Jakob: "Hon landar alltid, men gör två vridningsmoment. När hon vänder upp kortet är det återigen fel färg." (V). Förvalet följer nu planens "Var kortet vänds" (`defaultFlip`), och planen säger "i luften" på alla 16 kort (`placements/default.json`, V). Två vändningar en vänsterhand kan göra (S, inte prövade som bild):

**Vändning A, "tummen lyfter, kortet fälls över" (Jakobs skiss, `SAY.turnAtPlace`).** Kortets långsidor pekar mot spelaren. Vänsterhanden kommer från skon med handflatan ned; tummen ligger vid kortets inre långsida, pek- och långfinger på baksidan. Tummen glider in under den inre långsidan och lyfter den; underarmen roterar utåt (tummen uppåt); den yttre långsidan ligger kvar mot filten som gångjärn. Kortet står på kant med tummen på den blå sidan; tummen fäller kortet över gångjärnet och följer med ned på framsidan. Greppet är inte fast: fingrarna lämnar kortet en stund medan det står på kant.

**Vändning B, "nyckelvridning lågt vid platsen" (närmast bankens).** Tumme och pekfinger håller kortets närmaste kortsida, lyfter det en handsbredd, handleden rullar en gång, och kortet läggs ned med fingertopparna på dess närmaste kant, som Pamelas godkända giv till P4 slutar (V, ruta 76–112).
```
At the place she lifts the card a little by its short end between thumb and forefinger, rolls her wrist once so the card turns over about its long side, and lays it down blue side up under her fingertips.
```
**Vad en bild av varje ögonblick visar (A):** *Före:* kortet gult och plant en kortbredd mot hennes mitt från landningsplatsen, handflatan ned, två fingertoppar på baksidan. *På kant:* kortet upprätt på sin yttre långsida, en smal ljus remsa framifrån; tummen på den blå sidan. *Efter:* kortet blått och plant på planens plats; tumtoppen på framsidan, handen på kant. En platt handrygg över kortet är aldrig slutet på en vändning (Jakob 2026-11-13, om landningsrutan ur `paow-giv-p4` tagning 2).

**Metoder som konkurrerar, i den ordning de prövas:** 1 *Text i en giv "bara dit"* från ankare 2.1 till landningsbilden, WAN 3 och Kling 4, 7 s. 2 *Vändningen som egen film* mellan stillbilderna Före och Efter, 3 s (kräver en ny nod i banken, huvudagentens). 3 *Referensfilm av Jakobs egen hand* (3.8) med Kling 4, om 1 och 2 ger 0 av 4. 4 *Renderat kort*: rätt hand men fel kort ger målat kort (HANDOFF punkt 11); fel hand hjälper inget kort. En metod går vidare om minst 1 av 4 tagningar vänder kortet en gång vid platsen så som en hand kan, med kortet inom ±10 % (film-review §3–4).

### 3.4 Giv med släp från ankare 2.2 (stängt kort)
- Orden: `SAY.slideOut`, `SAY.dragBack`, `SAY.stopClosed`, `SAY.backDrag`. WAN 3, 1080p, 6 s, två tagningar. Höll till P1: cirka 7 verkliga släp av 9 tagningar (b9–b17, V). Föll till P4 (0 av 2) och P7 (0 av 2: kortet går först åt vänster) (V). Pröva P1 först.
- Förutsättning: ett ankare 2.2 som gäller (Paow saknar). Skon i b17 hade öppen front; fönsterskon är oprövad för släp (V).

### 3.5 Retur
- **I samma film som given (tur och retur):** Jakob har godkänt 9 av 11 returer, två som Primär (`paow-giv-2-1-p4-04`: "förmodligen den bästa"; `paow-giv-2-1-p1-01`: "hon går tilbaka från possitionen med handen vilket hon gör bra") och underkänt `p4-09` och `p4-12` (V). Granskaren gav dem 0,5–4/5, ofta för en knytnäve i brösthöjd (V). Hans dom gäller: returen i tur och retur håller.
- **Som egen film** (`RETUR-2.1`, `-2.2`, `-1`): från landningsbilden till ankaret, orden `SAY.liftOff` och `SAY.glideTo`. WAN 3, 1080p, 3 s. Oprövad; behövs för en giv "bara dit". En film som startar på en annan films ruta skiftar cirka 5 nivåer i ton (Paows videoprov, V); därför en stillbild som första bild.

### 3.6 Vila
- Orden: `SAY.rest` plus en liten handling som Jakobs tillägg: `takes one slow, deep breath`, `smiles briefly`, `nods once`, `straightens her back`, `taps her fingers once on the felt`. WAN 3, 1080p, 4–5 s, första och sista bild = ankare 1.
- Jakob godkände alla åtta (`paow-vila-01` rakt; 02–08 som Variant: "Jättebra variant!", "Jättebra.. Hon ler!", "Kanon!", "Toppen!") (V). Granskaren gav 1–3/5, mest för munnen: öppen eller tänder i 4 av 6 granskade (V). Nästa text för munnen (oprövad): "her lips stay together as the corners of her mouth lift a little".
- Jakob om ordet: "Det är fortfarande oklart vad som ska vara en variant och vad som är godkänt." (`paow-vila-08`, V).

### 3.7 Stillbilder: ankare 2.1, 2.2, landningsbild
Nano Banana Pro, 4K, 4:3, `referenceImages` `@anchor` (dealerns egen bild) och `@pose` (bara en utklippt underarm och hand, `tools/order-images.ts`). För stillbilder gäller Googles råd: detaljerat får det vara, men det oönskade sägs positivt ("one card", inte "no second card"). Orden för ankarna: `SAY.still*` och `STANDARD_STILL`.
```
This is an edit of the picture @anchor. Keep everything in @anchor exactly as it is: the framing and camera, the flat chroma-green background and table, the black card shoe at the right with the yellow card in its window, and the woman's face, hair, clothes, build and her hand at the left of the picture. Change only her hand nearest the shoe: it rests at the blue card lying flat on the felt in front of her, the tips of her forefinger and middle finger on the card's edge nearest her, the wrist raised above the knuckles and the thumb free beside the card, placed and shaped as the hand in @pose. @pose is a cut-out on plain green that shows only a forearm and hand; take from it only where the hand is and how the fingers touch the card. [STANDARD_STILL] There is one card on the felt and one in the shoe, each the size and shape of the card in the window.
```
- Exemplet är **landningsbilden** (S, oprövad): `@anchor` = ankare 1 med kortet ritat där planen säger; `@pose` = armen ur Pamelas godkända giv till samma plats, rutan där fingertopparna vilar på kortet. Efteråt ritas kortet om ur planen och skon tas från ankare 1 (`skolagning.py`).
- **Ankare 2.1:** `paow-ankare-2-1` gav 4/5 och 2/5 (dubbla kort); Jakob godkände tagning 1 och underkände tagning 2 (V).
- **Ankare 2.2:** föll i tre ordrar; varje gång flyttade bildmodellen skon, också när ankare 2.1 var `@anchor` (§5, V). Kvar: en ruta ur en film som börjar på ankare 2.1, eftersom filmen behåller skon där första rutan har den (S, oprövat). Ankare 2.2 är inte på vägen till första hela uppsättningen: varje giv börjar på ankare 2.1.
- **Före vändningen** (3.3): ingen pose finns i banken; en ruta ur Jakobs egen film (3.8), utklippt till handen, är förslaget (S).

### 3.8 Referensfilm, Motion Control och Jakobs egen hand
**Kling 3.0 Motion Control** (Runways hjälpsida, V): en karaktärsbild och en rörelsefilm, text valfri; 3–30 s; filmen ska visa "clear upper body … including all limbs and head", en person, obruten, inte snabb. Vårt verktyg: **ingen sista bild** (`kling-3-motion-control` står inte bland modellerna som tar `endFrame`). Om ett föremål i handen: "contact points are difficult" (Hörsägen). Vårt prov b1a (2026-11-11, V): 44 av 100; kortet genomskinligt grönt i ruta 30–84, skons fönster tomt från ruta 48, kortet landar 73 px fel, 1760 × 1184. **Svar: Pamelas film driver inte Paows ankare via Motion Control;** den kan driva Paows rörelse som referensfilm i Kling 4 med första och sista bild (3.2). Act-Two (högst 1280 × 720, lägger till "a subtle handheld shake") finns inte i vårt verktyg.

**Jakobs egen hand med telefonen** är bättre när ingen godkänd bankfilm visar rörelsen (vändningen vid platsen, höger hand, handbyte) och ingen annan dealer ska in i ordern. Så filmas den (S, ur tillverkarnas råd och DRIFT): telefonen på stativ, låst och liggande där bankens kamera står (rakt framför, något över bordet, bordskanten vågrät); en låda som sko till höger; ett kort med gul baksida och blå framsida (tejp duger); matt slät duk, jämnt ljus framifrån, lång svart ärm, inga ringar. Sitt som dealern, andra handen platt. Verkligt tempo: Kling 4 kopierar referensens takt, och ultrarapid som snabbats upp föll (V). Börja och sluta i ankarets pose, en obruten tagning på 4–8 s, kortet till orderns plats, flera tagningar; välj en där kortet syns på kant. Risk: Jakobs hand läcker in som Pamelas (S).

## 4. Felsökning

| Fel | Sett i (V) | Trolig orsak (S) | Ändring |
|---|---|---|---|
| Kortet vänds två gånger, eller tillbaka | `paow-giv-p4` t1 (61–63, 90–93); `p4-07`; `p5-01` | Vändningen i flera led | En mening, "once"; lås med bild eller referens |
| Fel färg i slutet (gult där det ska vara blått) | `p4-13` (Jakob: "vrida upp kortet som har gul färg"), `p4-07` | Kortet visas tidigt och vänds tillbaka | Som ovan; stängd giv utan vändning |
| Tryckt spelkort i stället för enfärgat | `p4-09` (Jakob: "ett blått spelkort"), omgång 3 i 5 av 8, skons kort i `p4-12`, `p3-01`, `p7-03` | Modellen fyller i en kortframsida | `SAY.colours`; mönstret går inte att laga, spåraren följer det inte |
| Kortet läggs framför henne, handen når inte ytterplatsen | Omgång 3 och 3b: P1, P2, P6, P7 0 av 8 | "to its place" utan plats | Platsen i ord (mall 5): handen nådde platsen i 4 av 5 i omgång 4 |
| Slutbildens kort dyker upp av sig självt | `p1-03` (f206), `p2-02` (f204), `p7-02` (f187) | Handen når inte dit, modellen tonar in sista bilden | Som ovan |
| Kortet kastas, släpps före platsen, skjuts dit | `paow-giv-p4` t2 (104 px kort), `p1-04` (skjutet cirka 790 px), `p4-14` t2 (165 px) | Vändning i luften utan referens | Lågt längs filten; referens till samma plats |
| Kortet växer | `p4-04` +21 %, `p3-02` +47–70 %, `p1-06` +20 %, b17 1,5× | Kortet lyfts mot kameran | Lågt längs filten; mät ±10 %; inte lagbart |
| Hon lutar sig långt ut | `p1-05` (näsan 245 px), `p1-06` (183 px) | Ytterplatsen långt bort | Oprövat; handbyte från P1–P3 (Beställ föreslår det) |
| Hon är stel | `p4-09` (Jakob: "Hon är väldigt stel"), `p4-12` retur ("hon borde kunna röra sig mer") | `SAY.otherRests` håller allt annat stilla (S) | Oprövat: ett tillägg om huvud eller blick |
| Handen till knytnäve i brösthöjd på returen | `paow-giv-p4` t1 (y 466), `p4-04` (120–128) | Retur i samma film som given | Jakob godkände ändå 9 av 11 returer; ingen ändring krävs |
| Fingertopp på fönstrets ram | Ingång WAN 44–59, 4K 38–55 | Geometrin | Ordet "rim" struket; annars Variant |
| Skon flyttad eller fel sko (stillbild) | Ankare 2.2, tre ordrar: öppen sko kopierad ur posebilden, sedan fönsterskon 81–129 px åt vänster | Bildmodellen ritar om skon med handen | Inte text; en ruta ur en film från ankare 2.1 (oprövat) |
| Kroppen kapad, skon omritad (stillbild) | 12–40 rader ovanför bordsraden i varje bild (DRIFT till `f6f68ef`) | Bildmodellen | `forlang-plagg.py`, `fyll-morkt.py`, `skolagning.py` (order-clerk §5) |
| Ett andra kort | Hel runda (b2, b9c), ankare 2.1 t2, `p7-01` (två gula) | Flera kort, bilderna stämmer inte | Ett kort per film; samma kort i första och sista bild |
| Ansiktet mjuknar, tatueringar suddas | Kling 4; 4K-ingången | Modellen | WAN 3 för vila och ingång |
| Grönt glider eller pulserar | WAN cirka 11 nivåer på 6 s; Kling 4 G 206–234 i 30 s | Långa filmer, olika grönt | Kort film; samma grönt i bilderna; `level` |
| Hopp eller scenbyte | Kling 4 i 30 s (b2: 16,3 och 20,2 s) | Klings scenindelning | Kort film, "one continuous shot" |

## 5. Prov och protokoll

- **En ändring per order** mot en namngiven jämförelse; ordens titel säger vad som ändrades. Samma bilder, samma längd.
- **Antal tagningar:** en per metodprov, två per klipp när metoden är vald. En metod blir regel först efter ytterligare fyra tagningar med minst hälften användbara (S; att skilja 25 % från 75 % kräver 6–8 tagningar).
- **En ytterplats före alla platser:** omgång 3 och 3b gick till alla platser från plats 4: 12 av 14 föll, 1 960 krediter (V). Pröva P1 och P7 innan en metod beställs till alla.
- **En ändring per omgång mot ett recept som har hållit:** omgång 4 ändrade två saker mot Jakobs godkända givar till P4 på en gång, platsen och vändsättet (`FREE`, planens förval, mot `AT_PLACE` i de godkända) (V, `motion.flipAxis` i ordrarna). Fyra av fem fel i omgång 4 gällde kortet i luften; det femte skons kort (`p7-03`) (V). Att den andra ändringen orsakade felen är skattat (S).
- **Granskning:** oberoende granskare enligt [film-review.md](film-review.md); poäng 0–5 per del (giv, retur) och domordet. För en giv alltid: ett kort? vänds det en gång, och var? lämnar kortet filten eller fingrarna före platsen? håller storleken ±10 %? enfärgat hela vägen? går handen tillbaka lågt?
- **Jakobs dom** skrivs bara av honom i Granska (`motions/<id>.json`, `review`); citera hans ord, skriv inte om dem.
- **Tabellerna förlängs** av den som provar: en rad per metod, belägget med order och tagning. Ingen dagbok; en ersatt rad skrivs om. Order-id förkortas `p4-11` = `paow-giv-2-1-p4-11`.

**Det som håller (2026-11-13)**

| Metod | Belägg (V): granskaren · Jakob | Status |
|---|---|---|
| Nyp-giv med referens till samma plats, Kling 4, 7 s | b6 P4, b17 P4, b19 D, b20 P1 2/2; `p4-11` given 3/5, retur 1/5 · given "Tack!", retur Variant ("Här klappar de ombordet efter"); `p1-05` given 3,5/5, retur 3/5, lagt 1 px från planen (ej dömd) | håller; bäst till ytterplats; Pamelas hand kan läcka in |
| Rullas kring långsidan på vägen, Kling 4, mall 3 (`p4-04`) | mätt: en vändning (43–50), kortet +21 % i brösthöjd, skjutet 160 px · Primär, "Kanske den bästa!"; returen Primär | Jakobs bästa giv (1 tagning) |
| Retur i samma film (tur och retur) | 0,5–4/5 · 9 av 11 godkända, två Primär | håller för Jakob |
| Platsen i ord (mall 5) till ytterplatserna | omgång 4: handen når P1 eller P7 i 4 av 5, två användbara (`p1-05`, `p1-06`), 677 krediter; utan (omgång 3 och 3b): 0 av 8 användbara på P1, P2, P6, P7 | håller för att nå platsen |
| Släp från 2.2, WAN 3, stängt, 6 s | P1 cirka 7/9; P4 0/2; P7 0/2 | håller till P1 |
| Ingång 1 → 2.1, WAN 3, 4 s | 3,5/5 · Variant ("hon rör inte blicken"); kavaj 1/2 | håller; blicken nu i texten |
| Ingång, Kling 3.0 4K | 3/5, ingen skärpevinst · Godkänd, "bra men tråkig" | håller, ingen vinst; beställs inte |
| Vila, WAN 3, 4–5 s | 1–3/5, munnen öppen i 4 av 6 · 8 av 8 godkända, 7 som Variant | håller för Jakob; munnen olöst |
| Ankare 2.1, Nano Banana Pro, posearm ur Pamelas ruta | 4/5 och 2/5 · t1 godkänd (gäller), t2 underkänd | håller (1 av 2) |
| Ansiktsuttryck genom redigerad stillbild i grundrutan | Pamela, `mcp/spegla.sh` (DRIFT till `f6f68ef`) | håller |

**Där granskaren och Jakob dömde olika (hans dom gäller)**

| Tagning | Granskaren | Jakob |
|---|---|---|
| `p4-08` kort text, WAN 3, vänd vid platsen | given 1,5/5: gult blir blått utan kantruta, handflatan platt | "Dena funkar!" |
| `p4-10` minimal text, Kling 4 | given 1/5: snurr på kant, en andra rullning | "Ja, det här var bra." |
| `paow-giv-p4` t2, mall 3, Kling 4 | 2,5/5 möjlig variant | "Denna är bra" |
| `p4-12` stängd giv, WAN 3, kort text | 3/5, bäst i omgång 2: gult, lågt, storleken −2 % | underkänd: "Nej, det här verkar inte fungera. … Dessutom har hon kvar ett gult kort som hon lämnar till spelare fyra." |
| Returerna i tur och retur, vilorna | 0,5–4/5 och 1–3/5 | 9 av 11 och 8 av 8 godkända |

**Oavgjort**

| Metod | Belägg (V) | Status |
|---|---|---|
| Stängd giv utan vändning, WAN 3, kort text | `p4-12` (ovan); omgång 3: `p4-14` t2 3,5/5 (skjutet 165 px), P3 3/5 men skons kort blått, övriga sex föll; Jakob har inte dömt omgång 3 | oavgjort |
| Lång, kort eller minimal text | Jakobs godkända givar: Utförlig 2 av 4, Kort 2 av 5, Minimal 1 av 2 | våra domar skiljer inte; §1 står |
| Öppen giv, Kling 4, utan referens, plats 4 | `paow-giv-p4` t2, `p4-04` (Primär), `p4-10` godkända av Jakob; `p4-07`, `paow-giv-p4` t1 underkända | oavgjort vid P4; föll till ytterplatserna (nedan) |
| Fri vändning på vägen (`FREE`), mall 5, ytterplatserna (omgång 4) | `p1-06` WAN 3: given 3/5, verklig vändning (kantrutor f40–43), +18–30 % i luften; `p1-05` 3,5/5 men färgbyte utan kantruta; `p1-04`, `p7-03`, `p7-04` 1–2,5/5; ingen dömd av Jakob | oprövad som recept för Paow |

**Det som föll**

| Metod | Belägg (V) | Status |
|---|---|---|
| Kort text utan platsen i ord, WAN 3, alla platser (omgång 3 och 3b) | 14 tagningar, 1 960 krediter: 12 föll; ytterplatserna 0 av 8 (kortet framför henne eller tillbaka in i skon, slutbildens kort dyker upp, ofta tryckt) | faller; ersatt av mall 5 |
| Vändning vid platsen (sex steg) i given | 1 av 14 vände vid platsen (`p4-07`) · underkänd, "två vridningsmoment" | faller i given |
| Nyp-giv med referens till annan plats | b19 P1 med anmärkningar, P7 föll | faller |
| Öppen giv, WAN 3, utan referens, vändning i luften | b6 kortet 2× i luften; `p4-09` tryckt spelkort · underkänd; `p7-03` skons kort tryckt från f18 | faller (`p4-08` se olika domar) |
| Stängd giv, Kling 4 | `p4-13` 1/5: blått syns fast stängt, kortet +30 % · underkänd | faller |
| Öppen giv, Kling 4, utan referens, till ytterplatserna | 2 av 2 lyfte kortet 145–171 px: `p1-04` 1,5/5 (genomskinligt kort f46–52, tappat, skjutet cirka 790 px), `p7-04` 2,5/5 (bärs upprätt som en skylt) | faller |
| Handbyte i given, Kling 4, mall 3 (`p1-01`, 550 ord) | 1/5: ingen överlämning, höger drar ett eget kort · underkänd: "Du måste ge AI lite utrymme." | faller (1 tagning) |
| Hela rundan i en tagning | 7 filmer, 0 användbara, cirka 3 500 krediter | faller |
| Mellanbild i Kling 4 | b1b, b4: läses som start, slut eller följd | faller |
| Kling 3.0 Motion Control, Pamelas film | b1a 44/100, kortet genomskinligt | faller (1 film) |
| Aleph, aleph2, Kling 4 edit, WAN video-till-video, `edit_video` med egen nyckelruta | `paow-samma-film`: Pamelas ansikte tillbaka, fönstret töms; DRIFT till `f6f68ef` | faller |
| Ultrarapid som snabbas upp; uttaget baklänges; Seedance 2.5 via MCP (bara en förhandsfil) | DRIFT till `f6f68ef` | faller |
| Hopklippta ankare, platt målad kortyta | Pamela: för litet kort, fingertopp bredvid, påhittad tryckt framsida (DRIFT till `f6f68ef`) | faller |
| Ny person i en annans bankruta (stillbild, b23) | vaxig hud, kroppen 58 rader för kort (`order-b24.json`) | faller; redigera i stället |
| Ankare 2.2 som redigerad stillbild | tre ordrar, sex tagningar, 0 användbara: `paow-ankare-2-2` (Pamelas öppna sko kopierad), `-01` (fönsterskon cirka 100 px åt vänster), `-02` ur ankare 2.1 (104 och 81 px åt vänster) | faller; kvar: en ruta ur en film som börjar på ankare 2.1 |
| 4K-filmmodell för skärpa | `paow-ingang-2-1-02`: ingen skärpevinst i bankens ruta, 172 mot 80 | faller |
| Bildmodellen flyttar kameran (sidovy) | fyra försök, 160 krediter (`D:/dealer-scratch/tmp/dealer-bf/LASMIG.md`) | faller |

**Pågår 2026-11-13: omgång 5** (mall 5 med `AT_PLACE`): `paow-giv-2-1-p1-07` och `-p7-05` WAN 3, två tagningar var; `-p1-08` Kling 4 med `pamela-p1-c1-plan-deal-01`, två tagningar; `-p2-03` Kling 4 med en rakt godkänd giv till samma plats från en annan startpose (`pamela-p2-c1-readyb-deal-01`); `-d-01` WAN 3 till dealerns första kort. Resultaten förs in här.

**Oprövat:** retur som egen film från en landningsbild; vändningen som egen film; landningsbild som stillbild; ankare 2.2 som ruta ur en film; referensfilm av Jakobs hand; renderat kort i vändningens rutor.

## 6. Källor

Lästa 2026-11-13 om inget annat sägs.
- Runway, Gen-4 Video Prompting Guide: https://help.runwayml.com/hc/en-us/articles/39789879462419-Gen-4-Video-Prompting-Guide (Tillverkare)
- Runway, Image to Video Prompting Guide: https://help.runwayml.com/hc/en-us/articles/48324313115155-Image-to-Video-Prompting-Guide (Tillverkare)
- Runway Academy, Prompting Guide: https://academy.runwayml.com/prompt-guide (Tillverkare)
- Runway, Creating with Gen-4.5: https://help.runwayml.com/hc/en-us/articles/46974685288467-Creating-with-Gen-4-5 (Tillverkare)
- Runway, Creating with Kling 3.0 Motion Control: https://help.runwayml.com/hc/en-us/articles/50280558448147-Creating-with-Kling-3-0-Motion-Control (Tillverkare)
- Runway, Performance Capture with Act-Two: https://help.runwayml.com/hc/en-us/articles/42311337895827-Performance-Capture-with-Act-Two (Tillverkare)
- Runway, Creating with Seedance 2.5: https://help.runwayml.com/hc/en-us/articles/53542207042323-Creating-with-Seedance-2-5 (Tillverkare)
- Runway, API-prislista: https://docs.dev.runwayml.com/guides/pricing/ (Tillverkare)
- Runways verktyg `generate_video` och `generate_image`, schemat i MCP-servern (modelltabell, `endFrame`, `referenceVideos`, `ratio`) (Tillverkare)
- Kling, Kling 4.0 User Guide: https://kling.ai/quickstart/kling-4-model-user-guide (Tillverkare)
- Kling, multiple keyframes guide: https://kling.ai/blog/kling-4-multiple-keyframes-guide (Tillverkare)
- Kling, start and end frames: https://kling.ai/quickstart/ai-video-start-end-frames (Tillverkare)
- Kling, Motion Control User Guide: https://kling.ai/quickstart/motion-control-user-guide (Tillverkare)
- Alibaba, Wan 3.0 video generation guide: https://www.alibabacloud.com/help/en/model-studio/wan3-video-generation-guide (Tillverkare)
- Alibaba, Video generation prompt guide: https://www.alibabacloud.com/help/en/model-studio/text-to-video-prompt (Tillverkare)
- Wan2.1, `prompt_extend.py`: https://raw.githubusercontent.com/Wan-Video/Wan2.1/main/wan/utils/prompt_extend.py (Tillverkare)
- Google, Gemini image generation, Best Practices: https://aistudio.google.com/docs/image-generation (Tillverkare)
- Cliprise, Kling 3 Motion Control guide: https://www.cliprise.app/learn/guides/model-guides/kling-3-motion-control-complete-guide (Hörsägen, osignerad, inga prov)
- Våra: `D:/dealer-scratch/tmp/huvudagent11/recept/RAPPORT.md`; liggare och texter i `D:/dealer-scratch/tmp/paow/` (`order/`, `b17/`, `bestallningar-b*.json`, `matt/film/paow-p4-motion-control.summary.json`); kvitton `assets/orders/*/receipt.json` (MÄTT- och GRANSKAD-noterna); protokollet `node tools/order-ledger.ts`; Prov `paow-plats-4-som-mall`, `paow-kavaj-filmer`, `paow-samma-film`, `hel-runda-i-en-tagning`; Jakobs domar i `motions/paow-*.json`; DRIFT, "Lärdomar som gäller" till och med `f6f68ef` (git).
