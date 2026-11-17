// Canvas-only screenshot helper (avoids page.screenshot waiting on web fonts that can't load offline).
import { writeFileSync } from 'fs';
export async function canvasShot(page, path) {
  const data = await page.evaluate(() => { const g = window.__game; g.renderer.render(g.scene, g.camera); return g.renderer.domElement.toDataURL('image/png'); });
  writeFileSync(path, Buffer.from(data.split(',')[1], 'base64'));
}
