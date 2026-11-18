# Lokal evidens

`npm test`, testdelen av `npm run check` och pre-push skriver automatiskt små körkvitton. Node rapporterar godkänt, underkänt,
överhoppat, TODO och avbrutet var för sig; inga konsolloggar behöver tolkas. Ändras indata under testningen blir
kvittot ogiltigt och körningen röd. En riktad `node --test` samlar bara kvitto om samma reporter väljs uttryckligen.

`studio-from-commit` journalför varje påbörjat studiobygge. Ett godkänt kvitto kräver oförändrad full commit-SHA
och verifierad byggstämpel efter att resultatet kopierats. Ett provbygge till annan mapp anger inte en ny visad studioversion.

| Kommando | Resultat |
| --- | --- |
| node tools/evidence.ts status | Antal länkar och körningar, senaste körkvitton och metadata som inte gick att läsa |
| node tools/evidence.ts trace <id> | Ursprung för en order eller ett material-ID, med källsökväg per uppgift |
| node tools/evidence.ts reindex | Bygger om sökindexet och visar hur mycket metadata som kunde läsas |

Ny kördata skrivs av writeRunReceipt till .runtime/evidence/runs som JSON. Kvittot sparar status, fullständiga Git-hashar för kod och eventuellt studiobygge samt indata med SHA-256. Tester räknas separat som godkända, underkända, överhoppade, todo och avbrutna. Eventuella noter är korta koder och loggen en relativ sökväg. Spara kvittona om lokal körhistorik ska bevaras.

Testkvittot anger ändrade filer och hashar ett litet namngivet urval av register. Kortplanen anges som den version i HEAD
som sviten använder. Ett testkvitto är kodbevis; visuell kvalitet, mediefiler och rendering behöver sina egna kontroller.
En smutsig arbetsyta markeras uttryckligen och är inte en reproducerbar commit enbart genom sin HEAD-hash.
Även tester i ett länkat rent arbetsträd skriver kvittot i huvudcheckoutens journal, så historiken inte försvinner
när en tillfällig arbetsyta tas bort. Koden och indata i kvittot kommer fortfarande från trädet som faktiskt testades.

Varje sökning uppdaterar .runtime/evidence/index.sqlite från kvittona och från befintlig order-, rörelse-, material- och evidensmetadata. Vid versionsskillnad visas den inspelade orderhashen och att motsvarande version saknas. Historiska omnämnanden visar var ett ID eller en filväg står. En träff bekräftar materialets ursprung bara när den anger en sådan relation. För tillgång, längd och innehåll behövs en pilotkontroll mot mediafilerna.

Granskarens rapport och bevisbilder binds med `node tools/order-put.ts review <order> <tagning> --note "…" --evidence <json>`.
JSON anger `film: {path, sha256}` och `files: [{path, sha256}]`, 1–32 unika bevisfiler under tagningens egen
`assets/orders/<order>/take-<n>/`. Skrivaren verifierar verkliga filer och hashar innan kvittot ersätts. `trace` visar sedan
`reviewed-film` och `review-artifact` utan att öppna media. Hasharna anger den granskade versionen vid skrivningen;
sökningen intygar varken dagens filinnehåll eller Jakobs dom. En ny granskningsnot utan paket ärver inte ett gammalt paket.
