// The one page of the studio's online copy that anyone may see: the password field. Plain HTML with its style inline (it
// is answered by the middleware itself, before any file of the site is reached), in the studio's colours and words.

const escape = (text: string) => text.replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]!);

/** Where to go after the login: a path of this site only, never another site ("//x" or "https://x"). */
export function safeNext(value: string | null | undefined): string {
  const next = String(value ?? '');
  return /^\/(?![\\/])[^\s\\]*$/.test(next) && next.length <= 512 && !next.startsWith('/api/') ? next : '/studio/';
}

export type LoginState = {next?: string; error?: 'wrong' | 'many' | 'closed'; wait?: number};

export function loginPage({next = '/studio/', error, wait = 0}: LoginState = {}): string {
  // On the way to the game alone the page says so: the visitor may never have heard of the studio.
  const game = next.startsWith('/game.html'), title = game ? 'Blackjack' : 'Dealer Studio', about = game ? 'Skriv lösenordet för att spela.' : 'En kopia att titta i. Inget här går att ändra.';
  const minutes = Math.max(1, Math.ceil(wait / 60000));
  const message = error === 'wrong' ? 'Fel lösenord. Försök igen.'
    : error === 'many' ? `För många försök. Vänta ${minutes} ${minutes === 1 ? 'minut' : 'minuter'} och försök igen.`
    : error === 'closed' ? 'Kopian är inte öppnad än: lösenordet är inte inställt.' : '';
  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title} · Lösenord</title>
<link rel="icon" href="data:,">
<meta name="referrer" content="same-origin">
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{display:grid;place-items:center;padding:16px;background:#0b0f0d;color:#e8ece9;font:15px/1.5 "Segoe UI Variable","Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
main{width:100%;max-width:360px;padding:32px 28px 28px;border:1px solid #1e2722;border-radius:14px;background:#121815;box-shadow:0 24px 60px rgb(0 0 0/.45)}
.mark{display:block;width:40px;height:40px;margin:0 0 18px;color:#d9b96a}
h1{margin:0 0 4px;font-size:20px;font-weight:600;letter-spacing:-.01em}
p{margin:0 0 22px;color:#8e9a93;font-size:14px}
label{display:block;margin:0 0 6px;color:#8e9a93;font-size:13px}
input{width:100%;height:42px;padding:0 12px;border:1px solid #2d3933;border-radius:8px;background:#0b0f0d;color:#e8ece9;font:inherit;outline:none}
input:focus{border-color:#d9b96a;box-shadow:0 0 0 3px rgb(217 185 106/.18)}
button{width:100%;height:42px;margin-top:14px;border:0;border-radius:8px;background:#d9b96a;color:#17130a;font:inherit;font-weight:600;cursor:pointer}
button:hover{background:#e8cb85}
button:focus-visible{outline:2px solid #e8cb85;outline-offset:2px}
.error{margin:14px 0 0;color:#ef8b8b;font-size:14px}
.foot{margin:18px 0 0;color:#7a867f;font-size:12.5px}
</style>
</head>
<body>
<main>
<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="8.5" y="5.5" width="15" height="21" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.5" transform="rotate(-8 16 16)"/><path d="M16 11.2 19.6 16 16 20.8 12.4 16Z" fill="currentColor" transform="rotate(-8 16 16)"/></svg>
<h1>${title}</h1>
<p>${about}</p>
<form method="post" action="/api/login">
<label for="losen">Lösenord</label>
<input id="losen" name="losen" type="password" autocomplete="current-password" required autofocus>
<input type="hidden" name="next" value="${escape(next)}">
<button type="submit">Öppna</button>
${message ? `<p class="error" role="alert">${escape(message)}</p>` : ''}
</form>
<p class="foot">Inloggningen gäller i 30 dagar i den här webbläsaren.</p>
</main>
</body>
</html>
`;
}
