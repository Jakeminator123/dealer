import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dealer · Studio",
  description: "Dealerns studio: filmer, nodkarta, granskning och scen.",
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
      <body className="min-h-full">
        {children}
        {/* The lab's one tab (src/preview-ui.ts): the studio is a lab page like the others, and its open stream keeps the lab server up. */}
        <script type="module" src="/preview-ui.js" />
      </body>
    </html>
  );
}
