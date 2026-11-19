# Lokal arbetsplats och städning

## Arbetsplats

Kod ändras i den projektmapp eller det arbetsträd som IDE:n har öppet. Kontrollera rot och Git-remote först.
Återanvänd ett lämpligt träd. Ett extra rent träd behövs när andra öppna utkast måste hållas utanför en kontroll;
välj eller skapa då trädet genom IDE:n, utan hårdkodat diskval. `push-clean.ts` och `studio-from-commit.ts`
kräver `--trad <absolut mapp>`. Inga nya källkopior eller arbetsmappar skapas automatiskt på D:.

- `assets/`: en kanonisk kopia av material som används eller har en konkret roll; registrera rollen.
- `.runtime/<uppgift>/`: tillfälliga bilder, filmer, byggen och lokala kvitton. Ta bort egna överflödiga kopior
  efter kontroll; flytta det som ska visas till `assets/` och registrera det.
- `evidence/` och registren: små sökvägar, hashvärden, domar och kvitton. Spara inte en ny filmkopia per rapport.
- Släpp egna hjälpprocesser och färdiga arbetsträd efter att deras ändringar och nödvändiga filer säkrats.
  Behåll Jakobs aktiva förhandsvisning. Rör aldrig ett annat projekt som en del av den här städningen.

## Radera oanvänt

`media-audit.ts` visar användning men är inte ensam ett raderingstillstånd: exempelvis en gammal Prov-mapp
kan fortfarande visas och ha anteckningar. Kontrollera spelbank, scen, Material, Prov/Beslut, användardomar,
beställningar, referenser och pågående arbete. V6 och nu använda original skyddas. Spara skälet och exakta sökvägar.
Unikt material som verifierats oanvänt får raderas enligt Jakobs besked 2026-11-19; arkivera inte allt för att det
en gång kostade krediter. Registren ska samtidigt beskriva att materialet tagits bort, så inga aktiva länkar bryts.

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
