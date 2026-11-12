import type { Metadata } from "next";
import { Shell } from "../components/shell/Shell";
import "./globals.css";

// The tab's icon: the rail's brass card, inline (no file to hand out, and no request for /favicon.ico).
const icon =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#121815"/>' +
      '<g transform="rotate(-8 16 16)" fill="none" stroke="#D9B96A" stroke-width="2"><rect x="8.5" y="5.5" width="15" height="21" rx="2.5"/></g>' +
      '<path d="M16 11.2 19.6 16 16 20.8 12.4 16Z" fill="#D9B96A" transform="rotate(-8 16 16)"/></svg>',
  );

export const metadata: Metadata = {
  title: "Dealer · Studio",
  description: "Dealerns studio: filmer, nodkarta, granskning och scen.",
  icons: { icon },
};

// The 3D scene is the lab's own modules, read from the lab server as they are (src/scene3d-*.ts, see lib/lab.ts). Two
// things in the page's head make them behave here as on the lab's own pages: addresses without a leading slash resolve
// against the server's root, not against /studio/, and "three" is the one copy the lab server hands out. The scopes
// are scene3d.html's: the card and chip studies get the scene's three.js instead of a second copy.
const importMap = {
  imports: { three: "/vendor/three.module.js", "three/addons/": "/vendor/" },
  scopes: {
    "/materials/source/src/card-material-study.js?scene3d": {
      "/materials/source/references/card-materials/vendor/three.module.js": "/vendor/three.module.js",
    },
    "/materials/source/src/chip-material-study.js": {
      "/materials/source/references/card-materials/vendor/three.module.js": "/vendor/three.module.js",
    },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sv" className="h-full antialiased">
      <head>
        <base href="/" />
        <script type="importmap" dangerouslySetInnerHTML={{ __html: JSON.stringify(importMap) }} />
      </head>
      <body className="h-full overflow-hidden">
        {/* The rail and every view (components/shell): one bank, one tooltip and one toast provider for all of them. */}
        <Shell>{children}</Shell>
        {/* The lab's one tab (src/preview-ui.ts): the studio is a lab page like the others, and its open stream keeps the lab server up. */}
        <script type="module" src="/preview-ui.js" />
      </body>
    </html>
  );
}
