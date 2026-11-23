---
name: visa-for-jakob
description: Använd i dealer-repot när något ska visas för Jakob eller ett svar skrivas till honom - en sida i labbet (studion på 127.0.0.1:4319), ett prov, en film han ska döma, en fråga som väntar på hans svar - eller när studion som han ser ska byggas om. Gäller länkar till labbet, provmappar i assets/proofs/, kort i Beslut (data/decisions.json) och hur svaret till honom skrivs.
---

# Visa Jakob något

Rutinen för labbservern och fliken står i [`docs/DRIFT.md`](../../../docs/DRIFT.md), "Labbservern och fliken"; reglerna
för servern och för svaret i [`AGENTS.md`](../../../AGENTS.md), "Labbservern" och "Svar till Jakob".

## Reglerna som oftast bryts

1. **En flik.** Återanvänd Codex webview; saknas en styrbar labbflik får exakt en öppnas enligt AGENTS, "Labbservern".
   I vanlig webbläsare används `node tools/preview.ts --open "<sida>"`; aldrig `Start-Process` eller `start` (DRIFT).
2. **Före en länk:** `node tools/preview.ts --ensure`. Servern startas, stoppas och startas om bara av den HANDOFF säger
   ("Vem äger vad"), och bara med `STOPP.cmd`, `--stop` eller `--restart`, aldrig via processnamn eller port (AGENTS).
3. **Studion han ser är byggd ur det incheckade:** `node tools/studio-from-commit.ts` bygger en commit i ett rent träd
   och byter in den i huvudträdets `studio/out` först när bygget lyckades. Bygg inte i huvudträdet medan andra skriver
   under `studio/` (DRIFT, "Labbservern och fliken", Studion byggd ur det incheckade).
4. **Det han ska se ligger i repots media, inte på slaskdisken:** en provmapp `assets/proofs/<namn>/` med `proof.json`
   (titel, korta etiketter, omdömen), i Granska, Prov (`/studio/granska/?prov=<mapp>`). Lösa sidor under
   `D:/dealer-scratch` visas inte för honom (SYSTEM, vyn Prov; README, Studion).
5. **En stillbild bredvid varje film han ska döma,** och ett nytt utseende för alla visas i spelets storlek och i
   rörelse innan det gäller (`docs/BESKED.md`, "Arbetet och dokumenten" och "Läpparna och talet").
6. **Ett prov (film, bild) som väntar på hans dom är ett kort i Beslut;** teknik, publicering och arbetssätt frågas i
   chatten, aldrig som kort (`docs/BESKED.md`, "Labbet och studion"). Kortet är en post i `data/decisions.json` med en kort fråga (högst 14 ord) och
   en bild ur ett prov (`proof`, `file`); agenter lägger till och tar bort poster, bara sidan skriver hans svar (README, Register;
   reglerna i huvudet på `tools/decision-register.ts`). Läs hans svar och anteckningar där innan du svarar honom, och ta ut kortet när det är
   utfört. Hans ord i Prov (Bra, Inte bra, kommentarer) läses med `node tools/proof-notes.ts` före svaret och besvaras
   med `--answer` eller markeras med `--read` (README, Register).
7. **Prov och effekter först i labbet;** spelet (`game.html`) får bara det han har godkänt där (`docs/BESKED.md`, "Labbet och
   studion").
8. **En headless-titt är inte hans skärm.** Sidorna ses under det delade låset med `node tools/lab-look.ts`; ett fel på
   hans telefon läses med `/trailer?diagnos=1` och hans skärmbild (DRIFT, "Labbservern och fliken", En titt på labbsidor; "Den
   låsta kopian på nätet").

## Svaret till honom

Svenska, slutsatsen först, så kort som frågan tillåter men varje fråga besvarad; punktform, procent och poäng; det
verifierade skilt från det skattade; vad som återstår; sist antalet aktiva underagenter (AGENTS, "Svar till Jakob").
Han talar helst med huvudagenten (HANDOFF, "Vem äger vad"): en annan session som han inte själv skriver i lämnar
sitt svar till huvudagenten.
