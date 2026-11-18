# Dealers MuseTalk-körare

Källpaketet sparar den lokala köraren för MuseTalk 1.5 och pinnen till upstream.
Ursprungsfiler, SHA-256 och attribution finns i [provenance.json](provenance.json) och [LICENSER.md](LICENSER.md).

## Kör lokalt

Kör från den här mappen med Docker och GPU-stöd. Sätt tre kataloger för vikter, egna indata och arbetsfiler.
Hämta modellfilerna till viktkatalogen enligt relativa namn, URL:er och SHA-256 i [kod/vikter.json](kod/vikter.json).
Montera vikter och indata skrivskyddat. Tjänsten är avsedd för lokal användning och publiceras på värdens loopback.

```sh
docker build -f docker/Dockerfile -t dealer-mouth-runner .
docker run --rm --gpus all -p 127.0.0.1:8791:8791 \
  --mount "type=bind,src=$MODELLER_DIR,dst=/modeller,readonly" \
  --mount "type=bind,src=$IN_DIR,dst=/in,readonly" \
  --mount "type=bind,src=$ARBETE_DIR,dst=/arbete" \
  dealer-mouth-runner tjanst --port 8791 --verifiera
```

Använd `GET /halsa` för förvalet och `POST /rita` för en replik. Fälten står överst i [kod/tjanst.py](kod/tjanst.py).
Ange sökvägar inom `/in` för klipp och ljud och inom `/arbete` för valfri filmutmatning. `POST /stang` stänger tjänsten.

Tjänstens profil [paow-realtid-mun-6@1](kod/profiler/paow-realtid-mun-6@1.json) använder receptet från Paows godkända munprov.
Ett objekt i `recept` skriver över valda fält. Exempelvis stänger `{"recept":{"opening":null}}` av regleringen av öppningen
för frågan. Hälsokontrollen och renderingskvittot anger profil-id, det effektiva receptet, SHA-256 för dess UTF-8-JSON
med sorterade nycklar utan blanktecken och om frågan skickade ett eget recept. Profilen laddas när tjänsten startar.

Prova profilkoden med Pythons standardbibliotek.

```sh
python -B -m unittest discover -s tests -v
```
