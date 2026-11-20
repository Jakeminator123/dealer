# Delar selected.jsonl i två listor (A och B) för var sin etiketterare, i den ordning filmerna är mest värda:
# först de som har dagens spår (jämförelsen), sedan resten blandat (samma blandning varje gång).
#   python -I dela.py
import os, json, random
BASE = r'D:\dealer-scratch\tmp\kort-dataset'
rows = [json.loads(l) for l in open(os.path.join(BASE, 'selected.jsonl'), encoding='utf-8')]
first = [r for r in rows if r.get('clip')]; rest = [r for r in rows if not r.get('clip')]
random.seed(20261120); random.shuffle(rest)
# talfilmerna (skons kort syns, ingen hanterar kort) sist: de ger mest stilla rutor
rest.sort(key=lambda r: '/tmp/tal/' in r['path'])
order = first + rest
for name, part in (('lista-a.jsonl', order[0::2]), ('lista-b.jsonl', order[1::2])):
    with open(os.path.join(BASE, name), 'w', encoding='utf-8') as out:
        for r in part: out.write(json.dumps(r, ensure_ascii=False) + '\n')
    print(name, len(part), 'filmer', sum(r['frames'] for r in part), 'rutor')
