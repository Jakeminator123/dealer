# Dealer – lokal arbetsyta

- Läs README.md och HANDOFF.md. Arbeta endast här; gamla snyggare-dealer och Scoutgaming är läsbara referenser. Scoutgaming är slutmålet.
- V6 är Jakobs valda visuella referens. Bevara assets och original. Ändra inte referenshashar för att dölja en avvikelse.
- Allt stannar lokalt. Ingen push, deploy, uppladdning, databasändring, betald generering eller integration i Scout utan nytt uttryckligt uppdrag. Ingen remote är konfigurerad.
- En ägare i taget. TILLBAKA-2 övertar efter TILLBAKA-1. Inga underagenter utan uttrycklig begäran.
- Ny kod TypeScript. Följ engines/Volta och verifiera node -p process.version. Högst fyra render-/testarbetare. Kör avgränsad verifiering för ändrat beteende.
- START.cmd, STOPP.cmd och STATUS.cmd gäller 127.0.0.1:4319. Använd Codex WebView, återanvänd flik/server. Stäng inte gamla labbets eller andra projekts servrar. Stoppa via kontrollkanal; aldrig processnamn/port.
- Materialprov är separata tills faktisk integration verifierats. Märk källhand ur dealerns perspektiv och målplats separat. Inga spelregler/slump/kortvärden flyttas från Scout.
- Inga oregistrerade läsningar från gamla labbet, inga junctions eller gamla node_modules-beroenden. assets/, output/, .runtime/, .env* och private/ hålls utanför Git.
- Svara svenska, slutsats först, cirka högst 120 ord. Skilj verifierat och skattat. Avsluta med antal aktiva underagenter. Rapportera kvarvarande arbete och stängningshinder kort.
- Windows rg: välj Get-Command rg.exe -All med Source som matchar *\OpenAI\Codex\bin\*\rg.exe och lägg dess mapp först i processens PATH; annars Select-String. Ändra inte bestående PATH.
