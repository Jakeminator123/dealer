---
name: bredvid-andra-sessioner
description: Använd i dealer-repot när arbetet startar i en session eller underagent medan andra sessioner skriver i samma repo - innan en fil ändras, en gren eller ett arbetsträd görs, en ny modul under src/ importeras, ett meddelande skickas till en annan session, eller headless Chrome, grafikkortet eller många testarbetare används. Gäller varje session som inte är huvudagenten, och huvudagenten när den delar ut arbete.
---

# Arbeta bredvid andra sessioner

Vem som äger vilka filer, och vilken session som är huvudagenten, står på ett ställe:
[`HANDOFF.md`](../../../HANDOFF.md), "Vem äger vad". Reglerna står i [`AGENTS.md`](../../../AGENTS.md), "Git och
samarbete", "Labbservern" och "Kod"; rutinerna i [`docs/DRIFT.md`](../../../docs/DRIFT.md). Här står bara var det står.

## Reglerna som oftast bryts

1. **Läs "Vem äger vad" och din banas lägesfil (`docs/lage/<bana>.md`) först, och säg till huvudagenten vilka filer du
   tar.** En skribent per fil; allt in i repot går genom huvudagenten med en fillista (AGENTS; HANDOFF). Råd: kontrollera
   adressen med ListAgents före ett meddelande.
2. **Arbeta i mappen `dealer` på C:, på `main`;** en gren eller ett extra träd bara när ett uppdrag måste isoleras
   (AGENTS, "Git och samarbete").
3. **Råd: labbservern lämnar ut huvudträdets filer,** så en halvfärdig fil syns genast i Jakobs flik, och en ny modul
   under `src/` skrivs i `SCRIPTS` först (DRIFT, "Labbservern och fliken"; `tools/lab-modules.test.ts`).
4. **Starta ingen egen labbserver och stoppa aldrig en server via processnamn eller port** (AGENTS, "Labbservern").
5. **Headless Chrome och grafikkortet under det delade låset**, en körning i taget (AGENTS, "Labbservern"; DRIFT,
   "Labbservern och fliken").
6. **Högst fyra render- eller testarbetare samtidigt** på hela datorn (AGENTS, "Kod").
7. **Det du gör på Jakobs ord säger du till huvudagenten,** med en fillista: han talar helst med huvudagenten men
   öppnar andra chattar när han vill. Ett prov som väntar på hans dom blir ett kort i Beslut genom huvudagenten.
8. **Betalt utanför Beställ** rapporteras till huvudagenten med belopp (AGENTS, "Det som skyddar Jakob").
9. **Arbetsfiler under `.runtime/<uppgift>/`;** bilder och filmer som kan användas ligger i `assets/` med en roll
   (AGENTS; `tools/local-work.md`).
