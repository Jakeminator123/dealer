# Dealer – lokal arbetsyta

- Läs README.md och HANDOFF.md. Arbeta endast här; gamla snyggare-dealer och Scoutgaming är läsbara referenser. Scoutgaming är slutmålet.
- V6 är Jakobs valda visuella referens. Bevara assets och original. Ändra inte referenshashar för att dölja en avvikelse.
- Publikt källrepo: Jakeminator123/dealer. Jakobs uppdrag 2026-11-10 godkänner GitHub-upplägg, nödvändig lokal env-återanvändning och D:-slask. Media/hemligheter stannar utanför Git. Deploy, mediauppladdning, databasändring, betald generering och integration i Scout kräver uttryckligt uppdrag.
- En skribent per fil; samordna index/commit. Huvudagenten äger commits, taggar och push; vem det är, och vem som äger vilka filer, står i HANDOFF tillsammans med aktuella blockerare. Inga underagenter utan uttrycklig begäran.
- Ny kod TypeScript. Följ engines/Volta och verifiera node -p process.version. Högst fyra render-/testarbetare. Kör avgränsad verifiering för ändrat beteende.
- Installera lokal pre-push med `npm run hooks:install` per checkout. Avsluta färdigt eget arbete med `npm test`, uttrycklig staging av egna filer, commit, `npm run check`, push och kontroll av fjärr-SHA/CI. Jakobs uppdrag godkänner denna rutin; ingen filbevakare, automatisk commit av utkast, force-push eller `--no-verify`.
- Kör samma kontroll före PR. Röda fynd stoppar. Utred gula fynd innan push/PR, även fel i hook/test; dokumentera kvarvarande verklig begränsning kort i HANDOFF. Ändra inte referenser eller sänk kontroller bara för grönt resultat. Full rendering/deploy kräver separat verifiering.
- Fem styrdokument räcker: README, AGENTS, HANDOFF, docs/SYSTEM och docs/DRIFT. Uppdatera befintliga avsnitt; skapa inte dagbok/plan per körning. Nya beslut måste nå rätt dokument eller befintligt JSON-register. Rensa ersatt status, bevara källbevis.
- Tillfälliga jobb använder processlokal TEMP/TMP på D:/dealer-scratch/tmp. Före nya stora körningar: kontrollera utrymme och befintlig återanvändbar utdata. Radera bara verifierat ersatt slask; bevara original, aktiva referenser och review.
- START.cmd, STOPP.cmd och STATUS.cmd gäller 127.0.0.1:4319. Använd Codex WebView, återanvänd flik/server. Stäng inte gamla labbets eller andra projekts servrar. Stoppa via kontrollkanal; aldrig processnamn/port.
- Materialprov är separata tills faktisk integration verifierats. Märk källhand ur dealerns perspektiv och målplats separat. Inga spelregler/slump/kortvärden flyttas från Scout. Undantag enligt Jakobs uppdrag 2026-11-11: en fristående spelmotor för labbets speloverlay får ligga i en egen avskild mapp, skild från filmkoden; inget ändras i Scout.
- Inga oregistrerade läsningar från gamla labbet, inga junctions eller gamla node_modules-beroenden. assets/, output/, .runtime/, .env* och private/ hålls utanför Git.
- Svara svenska, slutsats först, cirka högst 120 ord. Skilj verifierat och skattat. Avsluta med antal aktiva underagenter. Rapportera kvarvarande arbete och stängningshinder kort.
- Windows rg: välj Get-Command rg.exe -All med Source som matchar *\OpenAI\Codex\bin\*\rg.exe och lägg dess mapp först i processens PATH; annars Select-String. Ändra inte bestående PATH.
