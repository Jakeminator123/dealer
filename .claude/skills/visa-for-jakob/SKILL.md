---
name: visa-for-jakob
description: Använd i dealer-repot när något ska visas för Jakob eller ett svar skrivas till honom - en sida i labbet (studion på 127.0.0.1:4319), ett prov, en film han ska döma, en fråga som väntar på hans svar - eller när studion som han ser ska byggas om. Gäller länkar till labbet, provmappar i assets/proofs/, kort i Beslut (data/decisions.json) och hur svaret till honom skrivs.
---

# Visa Jakob något

Rutinen för labbservern och fliken står i [`docs/DRIFT.md`](../../../docs/DRIFT.md), "Labbservern och fliken"; reglerna
för servern och för svaret i [`AGENTS.md`](../../../AGENTS.md), "Labbservern" och "Svar till Jakob". Här står bara var
det står.

## Reglerna som oftast bryts

1. **En flik, öppnad med `node tools/preview.ts --open "<sida>"`, och `--ensure` före en länk** (AGENTS,
   "Labbservern").
2. **Servern stoppas och startas om bara av den HANDOFF säger, och bara med sitt eget kommando** (AGENTS,
   "Labbservern"; HANDOFF, "Vem äger vad").
3. **Det han ska se ligger i repots media, inte på slaskdisken:** en provmapp `assets/proofs/<namn>/` i Granska, Prov
   (AGENTS, "Det som skyddar Jakob"; SYSTEM, vyn Prov).
4. **En stillbild bredvid varje film han ska döma,** och ett nytt utseende för alla visas i spelets storlek och i
   rörelse och kräver hans ja (BESKED, "Svaren till honom" och "Hans ja före ett byte av läppar").
5. **Ett kort i Beslut bara för ett prov (film, bild) som väntar på hans dom;** teknik och arbetssätt frågas i chatten
   (BESKED, "Labbet och studion"). Läs hans svar där, och i Prov med `node tools/proof-notes.ts`, innan du svarar
   honom (README, Register).
6. **Prov och effekter först i labbet;** spelet får bara det han har godkänt där (BESKED, "Labbet och studion").
7. **Råd: studion han ser byggs ur det incheckade** med `node tools/studio-from-commit.ts` (DRIFT, "Labbservern och
   fliken").
8. **Råd: en headless-titt är inte hans skärm;** ett fel på hans telefon läses med `?diagnos=1` och hans skärmbild
   (DRIFT, "Labbservern och fliken").

## Svaret till honom

Formen står i AGENTS, "Svar till Jakob". Han talar helst med huvudagenten (HANDOFF, "Vem äger vad"): en annan session
som han inte själv skriver i lämnar sitt svar till huvudagenten.
