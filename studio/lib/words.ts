// The studio's words, gathered in one table (Jakob 2026-11-12: "gather all the systems' words and different names into one
// common one"; 2026-11-17: the glossary must follow how he uses the words). Each entry is one thing: the one Swedish word the
// studio uses for it (his most settled word where he has one), one line of what it is and where he sees it, the other words
// he himself uses for the same thing (sager, shown as "Säger också"), and the names it has in code, files and documents
// (aven, "Kallas också"). Every name leads to one entry only (studio/tests/words.test.ts). The anchors' settled words come
// from docs/BESKED.md "Dealern och ankarna" and docs/SYSTEM.md "Ordlista och gräns mot Scout"; the rest is checked against the code and
// registers it names. The rail's "Ordlista" shows the table (components/shell/Glossary.tsx) and the bot reads it through
// lib/guide.ts, so no text here may carry a machine path, a lab address or a name the copy blocks. Data and one search, no DOM.

export type WordGroup = "Ankare och platser" | "Steg och filmer" | "Kortet" | "Bilder" | "Efter filmen" | "Tal och läppar" | "Omdömen" | "Labbet och vyerna";
export const WORD_GROUPS: readonly WordGroup[] = ["Ankare och platser", "Steg och filmer", "Kortet", "Bilder", "Efter filmen", "Tal och läppar", "Omdömen", "Labbet och vyerna"];

export type Word = {
  /** The one word a person sees in the studio. */
  ord: string;
  /** What it is, and where he sees it, in one line. */
  betyder: string;
  /** Jakob's own other words for the same thing ("Säger också"), so that he finds it whichever word he looks for. */
  sager: readonly string[];
  /** Other names for the same thing in code, files, documents and earlier talk ("Kallas också"). */
  aven: readonly string[];
  grupp: WordGroup;
};

/**
 * The anchors as the studio's views write them today: the code inside a step ("A2.1 → P4C1") and the name on its own
 * (lib/names.ts takes both from here). Anchor 2.2's entry below leads with his word "släp" and lists this name, "A2.2
 * hand över", among its other names; the views and names.ts's reader are renamed together, not here alone.
 */
export const ANCHOR_WORDS = {
  IDLE: { code: "A1", name: "A1 vila" },
  READY: { code: "A2.1", name: "A2.1 nyp" },
  "READY-B": { code: "A2.2", name: "A2.2 hand över" },
  "READY-C": { code: "A2.3", name: "A2.3 två händer" },
  AWAY: { code: "Borta", name: "Borta" },
  "REVEAL(D.C2)": { code: "DC2 upp", name: "DC2 upp" },
} as const;

export const WORDS: readonly Word[] = [
  // ── Anchors and places ──
  { grupp: "Ankare och platser", ord: "A1 vila", betyder: "Ankare 1: hon sitter med båda händerna på filten. Varje runda börjar och slutar här.", sager: ["ankare 1"], aven: ["IDLE", "VILA", "Keystone 1 (gammalt namn)", "IDLE-B (vila med den öppna skon)"] },
  { grupp: "Ankare och platser", ord: "A2.1 nyp", betyder: "Ankare 2.1: hennes vänstra hand nyper det gula kortet i skons fönster mellan tumme och pekfinger, på kortet och inte på skons kant.", sager: ["ankare 2.1", "nyper", "nypet"], aven: ["READY", "REDO", "Keystone 2 (gammalt namn)", "variant A", "PINCH"] },
  { grupp: "Ankare och platser", ord: "A2.2 släp", betyder: "Ankare 2.2: hennes vänstra hand ligger platt över det gula kortet i skon, redo att släpa ut det längs filten.", sager: ["ankare 2.2", "släpar", "släpet"], aven: ["A2.2 hand över", "READY-B", "REDO B", "variant B", "DRAG"] },
  { grupp: "Ankare och platser", ord: "A2.3 två händer", betyder: "Ankare 2.3: båda händerna vid skon precis före draget. Vänster hand stryker ut kortet och för det plant på filten till höger hand, som vänder det och lägger det.", sager: ["ankare 2.3"], aven: ["READY-C", "TWO_HANDS"] },
  { grupp: "Ankare och platser", ord: "Borta", betyder: "Bordet utan dealern: innan hon har kommit och sedan hon har gått.", sager: [], aven: ["AWAY", "tomt bord"] },
  { grupp: "Ankare och platser", ord: "DC2 upp", betyder: "Dealerns hålkort (DC2) vänt med framsidan upp medan hon vilar; rundan går vidare som från A1.", sager: [], aven: ["REVEAL(D.C2)", "hålkortet vänt"] },
  { grupp: "Ankare och platser", ord: "Plats och kort", betyder: "P1–P7 är spelarnas platser från kamerans vänster, C1 och C2 deras två kort: P4C1 är plats 4, första kortet.", sager: [], aven: ["P4.C1", "box 3 i Scout (box = plats − 1)", "kortplats", "placeringsnyckel"] },
  { grupp: "Ankare och platser", ord: "Dealerns kort", betyder: "DC1 (öppet), DC2 (hålkortet, stängt tills det vänds) och DC3, ett tredje kort som en runda kan ha.", sager: ["hålkortet"], aven: ["D.C1", "D.C2", "D.C3"] },
  { grupp: "Ankare och platser", ord: "Skon", betyder: "Den svarta lådan med korten, till höger i bilden; kortet syns i ett fönster snett framtill. En sko per dealer, samma i alla ankare.", sager: [], aven: ["SHOE", "skobild"] },
  // ── Steps and films ──
  { grupp: "Steg och filmer", ord: "Steg", betyder: "En rörelse mellan två lägen, och filmen som gör den: steget A2.1 → P4C1. En linje på Kartan.", sager: [], aven: ["kant", "edge", "READY>P4.C1"] },
  { grupp: "Steg och filmer", ord: "Tagning", betyder: "En filmad version av ett steg. Ett steg kan ha många tagningar; en av dem spelas.", sager: [], aven: ["take", "jobb", "job"] },
  { grupp: "Steg och filmer", ord: "Film", betyder: "En videofil. Oftast en tagning, men ur en film kan flera tagningar klippas (given och returen ur samma film).", sager: ["klipp", "video"], aven: [] },
  { grupp: "Steg och filmer", ord: "Banken", betyder: "Alla tagningar en dealer har, ordnade per steg: det en runda väljer bland. Kartan visar den.", sager: [], aven: ["klippbank", "clip-jobs.json"] },
  { grupp: "Steg och filmer", ord: "54 och 33", betyder: "Modellen har 54 steg: giv, retur till A2.1 och retur till A1 för vart och ett av 16 kort, och sex till (ingång, utgång, vilan, hon kommer, hon går, hålkortets vändning). En dealer behöver 33 filmer: en plats andra kort spelar första kortets, utom hålkortet.", sager: [], aven: ["modellens 54", "en film per plats"] },
  { grupp: "Steg och filmer", ord: "Ingång", betyder: "Filmen från vilan till skon: A1 → A2.1 eller A1 → A2.2.", sager: [], aven: ["ENTRY", "IDLE>READY", "INGANG-2.1"] },
  { grupp: "Steg och filmer", ord: "Giv", betyder: "Filmen där kortet går från skon ut till sin plats: A2.1 → P4C1 med nyp, A2.2 → P4C1 med släp. Beställs tur och retur eller bara dit.", sager: ["utgiven", "dela ut"], aven: ["DEAL", "utdelning", "GIV-2.1"] },
  { grupp: "Steg och filmer", ord: "Tur och retur", betyder: "En giv där handen kommer tillbaka i samma film, skriven A2.2 → P3C2 → A2.2. I banken blir filmen två tagningar: given och returen.", sager: [], aven: ["ROUND_TRIP"] },
  { grupp: "Steg och filmer", ord: "Bara dit", betyder: "En giv som slutar när kortet ligger, på platsens egen slutbild: platsens landningsbild, annars snittrutan ur bankens egen film dit. Så beställs en giv enligt receptet.", sager: [], aven: ["ONE_WAY"] },
  { grupp: "Steg och filmer", ord: "Retur", betyder: "Filmen där handen går tillbaka från kortet på bordet: till nypet (A2.1), över skon (A2.2) eller till vila (A1).", sager: ["tillbakagången", "retreat"], aven: ["RETURN", "P4.C1>READY", "RETUR-2.1"] },
  { grupp: "Steg och filmer", ord: "Utgång", betyder: "Filmen från skon tillbaka till vilan, utan kort: A2.1 → A1 eller A2.2 → A1.", sager: [], aven: ["exit", "READY>IDLE", "UTGANG-2.2"] },
  { grupp: "Steg och filmer", ord: "Vilan", betyder: "Filmerna A1 → A1 där hon vilar: lugna klipp är grunden, och gesterna (hosta, sträcka på sig, le, dricka …) slumpas in emellan.", sager: ["grundloopen"], aven: ["IDLE>IDLE", "idle-loopen", "gester"] },
  { grupp: "Steg och filmer", ord: "Hålkortets vändning", betyder: "Filmen där hon vänder upp hålkortet från vila och handen går tillbaka till vila: A1 → DC2 upp.", sager: [], aven: ["HALKORT", "IDLE>REVEAL(D.C2)"] },
  { grupp: "Steg och filmer", ord: "Hon kommer", betyder: "Filmen där hon kommer in och sätter sig: Borta → A1.", sager: [], aven: ["AWAY>IDLE", "ARRIVE"] },
  { grupp: "Steg och filmer", ord: "Hon går", betyder: "Filmen där hon reser sig och går från bordet: A1 → Borta.", sager: [], aven: ["IDLE>AWAY", "LEAVE"] },
  { grupp: "Steg och filmer", ord: "Runda", betyder: "En väg genom stegen, skriven med streck: A1 - A2.1 - P4C1 - A2.1 - A1. I Scen väljer eller skriver man en under fliken Runda.", sager: [], aven: ["round", "sekvens", "kedja"] },
  { grupp: "Steg och filmer", ord: "Huvudtagning", betyder: "Tagningen som spelas i ett steg: Primär om en finns, annars en rakt godkänd, annars en ogranskad.", sager: [], aven: ["edge.main", "Spelas nu"] },
  { grupp: "Steg och filmer", ord: "Utsnitt", betyder: "En tagning som är rutor ur en längre film, till exempel given och returen ur samma tur och retur-film.", sager: [], aven: ["derived", "segment", "härledd tagning"] },
  { grupp: "Steg och filmer", ord: "Rättad kopia", betyder: "En tagning som är en befintlig film rättad med en video-till-video-modell.", sager: [], aven: ["edit", "editOf", "Aleph"] },
  { grupp: "Steg och filmer", ord: "Experiment", betyder: "Steg utanför modellens 54, till exempel via kortet utdraget plant (DRAWN). Ligger i Kartans experimentlåda.", sager: [], aven: ["experimentkant", "DRAWN", "utanför modellen"] },
  // ── The card ──
  { grupp: "Kortet", ord: "Gult och blått kort", betyder: "Filmens eget kort: gul baksida (stängt) och blå framsida (öppet), utan valör. Den blå sidan bär ett litet rosa kryss och en liten röd cirkel i ett hörn, så att rätt sida syns i filmen. Spelet ritar det riktiga kortet ovanpå.", sager: ["gult till blått"], aven: ["BACK", "FRONT", "stängt", "öppet", "slätt kort", "kryss", "märke"] },
  { grupp: "Kortet", ord: "Vändning", betyder: "Kortet vänds en gång, från gult till blått, så att rätt sida kommer upp mot spelaren. Tre sätt i Beställ; båda sätten på vägen gäller.", sager: ["vända kortet"], aven: ["TURN", "flipAxis", "Var kortet vänds"] },
  { grupp: "Kortet", ord: "Handleden vänder kortet", betyder: "Vändning på vägen, förvalet: handleden vrids över en gång och kortet följer med, blått upp. Handen är kvar vriden tills kortet ligger.", sager: ["vrida över handleden"], aven: ["FREE", "I luften"] },
  { grupp: "Kortet", ord: "Som en nyckel", betyder: "Vändning på vägen, som Pamela gör: hand och kort vrids ihop kring kortets långsida. Handen är kvar vriden tills kortet ligger.", sager: ["vrida som en nyckel"], aven: ["LONG_EDGE", "Rullas kring långsidan på vägen"] },
  { grupp: "Kortet", ord: "Vänd vid platsen", betyder: "Kortet förs fram stängt, lågt längs filten, och vänds först vid platsen: nyp, dra, för fram, vrid, vänd upp, lägg.", sager: [], aven: ["AT_PLACE", "PLACE", "givens sex steg"] },
  { grupp: "Kortet", ord: "Handbyte", betyder: "Vänster hand tar kortet ur skon och ger det till höger lågt framför kroppen; höger lägger det.", sager: [], aven: ["PASS"] },
  { grupp: "Kortet", ord: "Riktning, lutning, perspektiv", betyder: "Kortets tre mått på bordet: vart kortsidan pekar, hur mycket kortet reser sig (0° = plant) och hur mycket smalare den bortre kanten är. Placering, fliken Plats.", sager: ["vinkel"], aven: ["angle", "taper", "Bortre kant"] },
  { grupp: "Kortet", ord: "Verkligt perspektiv", betyder: "Kortplanens kort ritade som verkliga kort (63 × 88 mm) genom samma kamera som dealern: större närmare henne, och den bortre kanten nästan lika bred som den närmre. Storleken följer av platsen; hur stort spelet ritar sina kort ställs i Efterarbete.", sager: ["plant bord"], aven: ["table-lens", "TABLE_LENS"] },
  { grupp: "Kortet", ord: "Bordets perspektiv", betyder: "Ett reglage för hela kortplanen (Kortplan, Kortets mått): hur smal kortets bortre kant ritas, mätt vid plats 4, från ett verkligt korts 96 % ner till 80 %. Bara formen ändras: varje kort har kvar sin verkliga storlek och plats. Din plan (87 %) är förval. Sparas med Spara i kortplanen.", sager: ["djup", "djupet i bordet"], aven: ["tableProjection.perspective", "lensForTaper"] },
  { grupp: "Kortet", ord: "Kortbana", betyder: "Kortplanens skiss av kortets väg: från skon till platsen och handen tillbaka, med Spela kortbanan. En skiss, inte filmen; den skickas aldrig till Runway.", sager: [], aven: ["Kortbanan"] },
  { grupp: "Kortet", ord: "Rörelse", betyder: "Fliken i Placering för hur kortet tas, vänds och läggs: teknik, hand, grepp vid skon, sidor, handbyte, var det vänds och kortbanan. Beställ utgår från den.", sager: [], aven: ["intent", "Teknik"] },
  { grupp: "Kortet", ord: "Landningsbild", betyder: "Stillbilden med handen vid kortet på sin plats, en per plats och hand (A3P4C1 i Material; från 2.3 lägger höger hand). En giv bara dit slutar på den för handen som lägger, annars på snittrutan ur bankens film dit. En kandidat blir sista bild bara som undantag. Rollen Landningar i Material.", sager: ["A3", "ankare 3"], aven: ["LAND(P4.C1)", "landningsankare", "3.1–3.7 (en per plats)"] },
  { grupp: "Kortet", ord: "Landningsruta", betyder: "Rutan i en giv där kortet just har landat och returen tar vid. Märkt Landning under filmen i Granska och Jämför.", sager: [], aven: ["landingFrame", "startsOn"] },
  { grupp: "Kortet", ord: "Släpp", betyder: "När handen släpper kortet på platsen. Placering visar vilken hand som släpper (Hand vid släpp).", sager: [], aven: ["RELEASE"] },
  // ── Pictures ──
  { grupp: "Bilder", ord: "Ingångsbild", betyder: "Bilden en ny dealer börjar från: vilken bild som helst av personen. Rollen Ingångsbild i Material.", sager: [], aven: ["startbild", "referensbild"] },
  { grupp: "Bilder", ord: "Keystone", betyder: "Förlagan i hög upplösning på vitt, stående och sittande. Spelas aldrig. Ankaret görs ur den, ur en video eller som redigerad stillbild; vilken väg som gäller är inte avgjort.", sager: ["keystonebild"], aven: ["stående keystone", "sittande keystone"] },
  { grupp: "Bilder", ord: "Ankare", betyder: "Rutan i bankens format (1764 × 1174, grönt, bankens sko) som filmer börjar och slutar på: A1, A2.1 och A2.2.", sager: [], aven: ["anchor", "anchor.png", "ankarbild"] },
  { grupp: "Bilder", ord: "Rollblad", betyder: "Bilden av dealern i fem vyer (två bakifrån, profil, trekvart, framifrån) som trailerns tagningar görs ur. Ligger i Prov.", sager: ["5-faldiga bilder"], aven: ["character sheet"] },
  { grupp: "Bilder", ord: "Dealerns bild", betyder: "Dealerns eget ankare, den bild en beställning skickas med; i Ny beställning valet bredvid Siluett.", sager: [], aven: [] },
  { grupp: "Bilder", ord: "Siluett", betyder: "Den grå figuren på studions bord: visar var händerna ligger, utan någon riktig dealer. Bakgrunden i Bordets Kortplan och i Ny beställning; det som skickas är dealerns egen bild.", sager: ["avatar"], aven: ["Neutral · studions bord", "neutral bakgrund"] },
  { grupp: "Bilder", ord: "V6", betyder: "Jakobs visuella referens: den äldre hela rundan, som återskapas byte för byte. Finns bland referensfilmerna i Scen och Råfilm, inte under korten i Kortplan.", sager: [], aven: ["V6-bild", "visuell referens"] },
  { grupp: "Bilder", ord: "Referensfilm", betyder: "En film ur banken som skickas med en beställning som förlaga för rörelsen: en rakt godkänd giv till samma plats.", sager: [], aven: ["reference"] },
  // ── After the film ──
  { grupp: "Efter filmen", ord: "Råmaterial", betyder: "Filmerna som de är filmade: grönt bakom henne, gult och blått kort, ingen valör och ingen ritad mun. Det som beställs och döms; Bordets Råfilm visar det.", sager: [], aven: ["source.mp4"] },
  { grupp: "Efter filmen", ord: "Efterarbetad", betyder: "Tagningens läge i Beställ när den levererade filmen är förd till bankens format: rätt storlek, de mörka sista rutorna bort, det gröna jämnat, inget ljud.", sager: [], aven: ["after.mp4", "film-after"] },
  { grupp: "Efter filmen", ord: "Efterbehandling", betyder: "Det spelet lägger på en film medan den spelas: det ritade kortet med tryck, glans och böjning, munnen och senare en logga. Hålls för sig, efter filmerna.", sager: ["post", "efterlaborering", "efter konstruktion"], aven: [] },
  { grupp: "Efter filmen", ord: "Färdigt material", betyder: "Det spelaren ser: råmaterialet i 3D-scenen med efterbehandlingen ovanpå.", sager: [], aven: [] },
  { grupp: "Efter filmen", ord: "Ritat kort", betyder: "Spelkortet som spelet ritar över filmens gula och blå kort, hela vägen och också i hennes hand. Brytaren Ritade kort i spelets Miljö.", sager: ["överlägg", "overlay"], aven: ["Renderade kort", "kort=hand"] },
  { grupp: "Efter filmen", ord: "Underlägg", betyder: "Filmens eget kort färgas om bredvid det ritade kortet (baksidan mörk, framsidan papper), så att inget gult eller blått syns. På från början.", sager: [], aven: ["UNDER"] },
  { grupp: "Efter filmen", ord: "Pålägg", betyder: "Filmens eget kort färgat om i filmens bildpunkter, utan ritat kort: gult blir mörk baksida, blått blir papper. Ett prov i labbet, inte i spelet.", sager: [], aven: ["cardBack=dark", "cardFace=paper"] },
  { grupp: "Efter filmen", ord: "Kortets utseende", betyder: "Det ritade kortets tryck (valör och färg), böjning och glans: i Placering under fliken Material och i Scen under Kort och marker.", sager: ["tryck"], aven: ["kortmaterial", "böjning", "glans"] },
  // ── Speech and lips ──
  { grupp: "Tal och läppar", ord: "Lipsync", betyder: "Munnen ritad efter rösten. Vyn Lipsync samlar grundbilderna, kedjan med format och skalor, inställningarna, var det körs och proven.", sager: ["lipsynk", "läppsynk"], aven: ["MuseTalk"] },
  { grupp: "Tal och läppar", ord: "Grundbild", betyder: "Det läppsynkmodellen utgår från för hennes mun: vilofilmens rutor, eller den film en munlapp läggs på. Under Grundbilder i Lipsync.", sager: ["baslinje", "baseline"], aven: ["baseImages"] },
  { grupp: "Tal och läppar", ord: "Replik", betyder: "En fast mening hon säger, i ett språk och en röst: de tio en runda behöver och chattens femton svar.", sager: [], aven: ["line", "SpeakLine"] },
  { grupp: "Tal och läppar", ord: "Talfilm", betyder: "En vilofilm med ljud där munnen är ritad efter rösten; spelas när repliken sägs.", sager: ["replikklipp"], aven: ["onRequest"] },
  { grupp: "Tal och läppar", ord: "Munlapp", betyder: "Munnen för en replik, gjord i förväg över exakt den film den sägs i och lagd på filmen när den spelas, så att hon kan tala under en giv.", sager: [], aven: ["munlagret", "patch"] },
  { grupp: "Tal och läppar", ord: "Realtidslipsynk", betyder: "Målet för läpparna: munnen ritad direkt efter vilket ljud som helst medan spelet går, på Jakobs egen RunPod.", sager: ["realtidstala"], aven: ["strömmande läppsynk"] },
  // ── Verdicts ──
  { grupp: "Omdömen", ord: "Primär ★", betyder: "Tagningen som spelas först i sitt steg. Bara Jakob väljer den.", sager: ["primär tagning"], aven: ["MAIN", "acceptedAs MAIN", "explicitMain"] },
  { grupp: "Omdömen", ord: "Godkänd ✓", betyder: "Godkänd rakt av: kan spelas, och bara sådana tagningar blir underlag till nya filmer.", sager: [], aven: ["ACCEPTED", "rakt godkänd", "userAccepted"] },
  { grupp: "Omdömen", ord: "Variant ◆", betyder: "Godkänd som omväxling: visas bredvid och spelas när en runda väljer den eller inget annat finns. Inte underlag till nya filmer.", sager: [], aven: ["VARIANT", "acceptedAs VARIANT"] },
  { grupp: "Omdömen", ord: "Väntar ○", betyder: "Ingen dom än: tagningen är ogranskad eller inte klar.", sager: [], aven: ["PENDING", "ogranskad", "ej dömd"] },
  { grupp: "Omdömen", ord: "Underkänd ✕", betyder: "Tagningen spelas aldrig.", sager: [], aven: ["REJECTED", "avvisad"] },
  { grupp: "Omdömen", ord: "Sekundär", betyder: "Ett sämre alternativ: spelas bara när inget bättre finns. Chippet visar Underkänd med ordet sekundär.", sager: [], aven: ["SECONDARY", "sekundärt alternativ"] },
  { grupp: "Omdömen", ord: "Granskare", betyder: "En dom som en agent har satt, inte Jakob: chippet är streckat.", sager: [], aven: ["av granskare", "review.decision utan userAccepted"] },
  { grupp: "Omdömen", ord: "Dömd åt dig", betyder: "En dom som huvudagenten och en granskare satt åt Jakob på hans uppdrag: streckad, med åt dig. Väntar inte på honom; hans beslut ersätter den.", sager: [], aven: ["provisional", "review-put", "Dömda åt dig"] },
  { grupp: "Omdömen", ord: "Arkiverad", betyder: "Lagd undan för hand av Jakob: ur spel och ur listorna, inte raderad, och domen står kvar. Ett klipp arkiveras och tas tillbaka i stegets panel på Kartan (Arkiverade), en bild i Material.", sager: ["arkivera"], aven: ["review.archived", "Arkiverade", "Ta tillbaka"] },
  // ── The lab and its views ──
  { grupp: "Labbet och vyerna", ord: "Labbet", betyder: "Studion på Jakobs dator, med alla vyer i menyn till vänster. Startas med START.cmd.", sager: ["nya labbet", "studion"], aven: ["Dealer Studio", "labbservern"] },
  { grupp: "Labbet och vyerna", ord: "3D-sidan", betyder: "Utvecklarens sida för 3D-scenen med alla reglage (scene3d.html), öppnad med knappen 3D-sidan i Scen med samma look. Bredvid den ligger sidorna Ljud (marker, kort, rum och musik) och Modeller (Meshy-modellerna), längst ner i menyn; de blir delar av en senare vy.", sager: [], aven: ["scene3d.html", "3D-labbet", "Ljud", "Modeller"] },
  { grupp: "Labbet och vyerna", ord: "Kopian", betyder: "Den låsta studion på nätet: samma vyer och spelet, men inget går att ändra, och Bordets Beställ, Lipsync och Beslut finns inte där.", sager: ["sajten"], aven: ["snapshot", "den låsta kopian", "Vercel"] },
  { grupp: "Labbet och vyerna", ord: "Boten", betyder: "Den som svarar i Fråga på kopian: svarar om dealerprojektet med källa, och kan göra ett svar till ett önskemål till Jakob.", sager: [], aven: ["Fråga"] },
  { grupp: "Labbet och vyerna", ord: "Önskemål", betyder: "På kopian: önskemål, frågor och felrapporter till Jakob, med status och hans svar.", sager: [], aven: [] },
  { grupp: "Labbet och vyerna", ord: "Scen", betyder: "Bordets del där en runda spelas i 3D-scenen och scenen ändras: rundorna och alla scenens reglage (rum, ljus, kort, kamera …) i kolumnen till höger.", sager: [], aven: [] },
  { grupp: "Labbet och vyerna", ord: "Förval", betyder: "En sparad look för 3D-scenen: Basgrund, Levande, Rumsstudien och egna, i raden Förval överst i Bordets Scen. I Beställ betyder förval det som är valt från början.", sager: ["profilval"], aven: ["preset", "forval="] },
  { grupp: "Labbet och vyerna", ord: "Basgrund", betyder: "Förvalet med det spelet visar i dag: Las Vegas, hela bordet, kvarliggande spelkort och filmens eget kort i handen. Scen märker det som skiljer sig från det.", sager: [], aven: [] },
  { grupp: "Labbet och vyerna", ord: "Levande", betyder: "Ett förval: Basgrund med kameran som lutar, skärpan som följer kortet, damm och klocka.", sager: [], aven: [] },
  { grupp: "Labbet och vyerna", ord: "3D", betyder: "Filmen spelad i 3D-scenen: keyad och lagd vid ett bord i ett rum, med ljus och kamera: Bordets Scen och Efterarbete.", sager: [], aven: ["scene3d", "3D-scenen"] },
  { grupp: "Labbet och vyerna", ord: "Råfilm", betyder: "Filmen som den är filmad, på sin gröna bakgrund och utan rum: Bordets del Råfilm.", sager: ["Inte 3D", "råfilmen"], aven: ["platt", "flat"] },
  { grupp: "Labbet och vyerna", ord: "Bordet", betyder: "Labbets vy av bordet, med delarna Kortplan, Beställ, Scen, Råfilm och Efterarbete i samma ram och allt som ändras i kolumnen till höger.", sager: [], aven: [] },
  { grupp: "Labbet och vyerna", ord: "Kortplan", betyder: "Bordets del där kortplanen ändras på bilden: var kortet landar och hur det kommer dit, och kortbanan.", sager: [], aven: [] },
  { grupp: "Labbet och vyerna", ord: "Efterarbete", betyder: "Bordets del där det som läggs över råfilmen ändras (korten och markerna, se Efterbehandling); det skickas aldrig till filmmodellen.", sager: [], aven: [] },
  { grupp: "Labbet och vyerna", ord: "Karta", betyder: "Nodkartan: ankarna vid skon, platserna i en båge och dealern överst. Varje linje är ett steg och visar tagningen som spelas.", sager: [], aven: ["nodkartan", "nodträdet"] },
  { grupp: "Labbet och vyerna", ord: "Primära", betyder: "I Karta: för varje steg tagningen som spelas nu (Primär) bredvid den bästa rakt godkända, och skarven mellan giv och retur.", sager: [], aven: [] },
  { grupp: "Labbet och vyerna", ord: "Granska", betyder: "Där tagningarna får Jakobs dom, en i taget och stort. Alla listar varje tagning, också de som är dömda åt honom.", sager: [], aven: [] },
  { grupp: "Labbet och vyerna", ord: "Jämför", betyder: "Två tagningar av samma steg sida vid sida, oftast en kandidat mot primären. Öppnas från en tagning.", sager: [], aven: [] },
  { grupp: "Labbet och vyerna", ord: "Prov", betyder: "Granskas del Prov: provmappar från arbetet, nyast först. En tagning bär granskaragentens omdöme eller Väntar på granskaragenten; underlag bär inget. Bra, Inte bra och Kommentera under film, bild och prov är din åsikt, ingen uppgift; huvudagenten svarar under.", sager: ["inte granskad"], aven: ["proof", "kontaktark", "provmapp"] },
  { grupp: "Labbet och vyerna", ord: "Placering", betyder: "Var korten och skon ligger på bordet, och hur kortet tas, vänds och läggs: Bordets Kortplan. Sparas i placeringsplanen, som Beställ läser.", sager: [], aven: ["placeringsplanen", "placements/default.json"] },
  { grupp: "Labbet och vyerna", ord: "Material", betyder: "Per dealer: varje bild och film med sin roll (ingångsbild, keystone, ankare, landningar, filmer, referenser …) och om den gäller.", sager: [], aven: ["media-roles.json", "roll"] },
  { grupp: "Labbet och vyerna", ord: "Gäller", betyder: "En bild i Material som gäller för sin roll: den nya beställningar använder. Kandidat: föreslagen. Ersatt: gällde förut.", sager: [], aven: ["kandidat", "ersatt"] },
  { grupp: "Labbet och vyerna", ord: "Beställ", betyder: "Bordets del där en film eller bild beställs: filmerna med det som skickas, Ny beställning, Det här skickas och kön till Runway. Bara i labbet.", sager: [], aven: [] },
  { grupp: "Labbet och vyerna", ord: "Beställning", betyder: "En order på en film eller bild: steg, bilder, text, modell och antal tagningar. När den är godkänd ändras den aldrig.", sager: ["order"], aven: ["utkast"] },
  { grupp: "Labbet och vyerna", ord: "Metod", betyder: "Hur ett steg beställs (modell, text, längd, tagningar) och om sättet gäller, prövas eller saknas, per steg och slags plats.", sager: ["beställningsmetod"], aven: ["order-methods.json"] },
  { grupp: "Labbet och vyerna", ord: "Protokoll", betyder: "Varje tagning ur varje beställning: vad som skickades, hur det gick, granskarens poäng och Jakobs dom. Länken finns i Beställ.", sager: [], aven: ["ledger"] },
  { grupp: "Labbet och vyerna", ord: "Casino", betyder: "Spelet: blackjack med spelmotorn, marker och reglage, i valt förval.", sager: ["spelet", "blackjacken"], aven: ["game.html"] },
  { grupp: "Labbet och vyerna", ord: "Beslut", betyder: "Det som väntar på Jakobs svar: ett kort per sak med en bild; han svarar med en knapp och en anteckning. Bara i labbet.", sager: [], aven: ["decisions.json"] },
];

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * The words a search finds, best first: the entry one of whose names is exactly what was typed ("lipsynk" is Lipsync, not
 * Realtidslipsynk), then the word itself, then one of Jakob's own other words, then a name in code and documents, then the
 * meaning; all for an empty search. Marks and case do not count ("platt" finds "plätt").
 */
export function findWords(query: string, words: readonly Word[] = WORDS): Word[] {
  const q = fold(query.trim());
  if (!q) return [...words];
  const has = (names: readonly string[]) => names.some((a) => fold(a).includes(q));
  const exact = (w: Word) => [w.ord, ...w.sager, ...w.aven].some((a) => fold(a) === q);
  const score = (w: Word) => (exact(w) ? 0 : fold(w.ord).includes(q) ? 1 : has(w.sager) ? 2 : has(w.aven) ? 3 : fold(w.betyder).includes(q) ? 4 : 5);
  return words.filter((w) => score(w) < 5).sort((a, b) => score(a) - score(b));
}
