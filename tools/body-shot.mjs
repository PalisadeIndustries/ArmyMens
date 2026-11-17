// Screenshot helper via CDP (page.screenshot waits on web fonts that can't load offline; canvas.toDataURL crashes
// SwiftShader on big frames). Renders one frame first so it works with a stopped animation loop.
import { writeFileSync } from 'fs';
export async function canvasShot(page, path) {
  await page.evaluate(() => { const g = window.__game; g.renderer.render(g.scene, g.camera); });
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await cdp.detach();
  writeFileSync(path, Buffer.from(data, 'base64'));
}
