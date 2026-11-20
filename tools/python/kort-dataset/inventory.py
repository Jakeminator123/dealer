# Steg A: lista alla mp4 under de fem rötterna, med storlek och en snabb nyckel (storlek + sha1 av första 1 MB).
# Läser bara; skriver D:/dealer-scratch/tmp/kort-dataset/inventory.jsonl
#   python -I inventory.py
import os, sys, json, hashlib, time

ROOTS = [r'D:\dealer-archive', r'D:\dealer-scratch', r'D:\dealerlab-archive', r'D:\3d-dealer-kopia',
         os.path.join(os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')), 'assets')]
OUT = r'D:\dealer-scratch\tmp\kort-dataset\inventory.jsonl'
SKIP_DIRS = {'kort-dataset', 'node_modules', '.git'}

def quick_key(p, size):
    h = hashlib.sha1()
    with open(p, 'rb') as f:
        h.update(f.read(1 << 20))
    return f'{size}-{h.hexdigest()[:16]}'

def main():
    t0 = time.time(); n = 0
    with open(OUT, 'w', encoding='utf-8') as out:
        for root in ROOTS:
            for d, dirs, files in os.walk(root):
                dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
                for name in files:
                    if not name.lower().endswith('.mp4'): continue
                    p = os.path.join(d, name)
                    try:
                        size = os.path.getsize(p)
                        if size < 20000: continue
                        out.write(json.dumps({'path': p.replace('\\', '/'), 'size': size, 'key': quick_key(p, size)}, ensure_ascii=False) + '\n'); n += 1
                    except OSError as e:
                        print('fel', p, e, file=sys.stderr)
    print(f'{n} filmer, {time.time() - t0:.0f} s')

if __name__ == '__main__':
    main()
