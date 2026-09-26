import { test, expect, type Page } from "@playwright/test";
import { openBlockProperties } from "./block-properties-helper";

function wav() {
  const data = Buffer.alloc(44 + 16000);
  data.write("RIFF"); data.writeUInt32LE(data.length - 8, 4); data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(8000, 24); data.writeUInt32LE(16000, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write("data", 36); data.writeUInt32LE(16000, 40);
  return data;
}

function pdf() {
  const stream = "BT /F1 24 Tf 50 150 Td (PDF preview) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 220] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(source.length); source += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = source.length;
  source += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(source);
}

async function videoFixture(page: Page) {
  const bytes = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 180;
    canvas.style.cssText = "position:fixed;top:0;left:0;z-index:99999"; document.body.append(canvas);
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#d8eee7"; context.fillRect(0, 0, 320, 180);
    const stream = canvas.captureStream(10), recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    const chunks: Blob[] = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
    const started = new Promise<void>(resolve => { recorder.onstart = () => resolve(); });
    recorder.start(100); await started;
    for (let frame = 0; frame < 10; frame++) {
      context.fillStyle = "#d8eee7"; context.fillRect(0, 0, 320, 180);
      context.fillStyle = "#315a4c"; context.font = "24px sans-serif"; context.fillText(`Video ${frame + 1}`, 100, 95);
      (stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack).requestFrame();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop()); canvas.remove();
    return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
  }));
  expect(bytes.length).toBeGreaterThan(200);
  return bytes;
}

async function upload(page: Page, kind: string, name: string, mimeType: string, buffer: Buffer) {
  const tail = page.locator(".pm-document > p").last();
  await tail.click(); await page.keyboard.press("End"); await page.keyboard.type(" /" + kind);
  const chooser = page.waitForEvent("filechooser");
  await page.locator(`[data-insert="${kind}"]`).click();
  const input = await chooser;
  expect(await input.element().evaluate(el => el.isConnected && document.activeElement === el)).toBe(true);
  expect(await input.element().getAttribute("accept")).toEqual(kind === "file" ? "" : expect.stringContaining(kind === "pdf" ? "application/pdf" : kind + "/"));
  await input.setFiles({ name, mimeType, buffer });
}

test("File stays a card for audio and PDF; typed media uploads persist and audio plays", async ({ page, request }) => {
  test.setTimeout(60_000);
  const note = await (await request.post("/api/pages", { data: { title: "Separate media", body: "Tail", syntax: { version: 1, variant: "notdown", extensions: {} } } })).json();
  await page.goto(`/#page/${note.id}`);
  await upload(page, "file", "Recording.wav", "audio/wav", wav());
  const card = page.locator('.pm-file-card[href$=".wav"]');
  await expect(card).toContainText("Recording.wav");
  await expect(card.locator(".pm-file-size")).toHaveText("15.7 KiB");
  await expect(card.locator("svg")).toBeVisible();
  await expect(page.locator(".pm-document audio")).toHaveCount(0);

  await upload(page, "audio", "Recording.wav", "audio/wav", wav());
  const audio = page.locator(".pm-document audio");
  await expect(audio).toBeVisible();
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.readyState)).toBeGreaterThanOrEqual(1);
  await audio.evaluate(async (el: HTMLAudioElement) => { await el.play(); });
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0);
  await audio.evaluate((el: HTMLAudioElement) => el.pause());
  await upload(page, "video", "Movie.webm", "video/webm", await videoFixture(page));
  await expect(page.locator(".pm-document video[controls]")).toBeVisible();
  await expect.poll(() => page.locator(".pm-document video").evaluate((el: HTMLVideoElement) => el.error?.message || (el.readyState >= 1 ? "loaded" : "loading"))).toBe("loaded");
  await page.locator(".pm-document video").evaluate(async (el: HTMLVideoElement) => { await el.play(); });
  await expect.poll(() => page.locator(".pm-document video").evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0);
  await page.locator(".pm-document video").evaluate((el: HTMLVideoElement) => el.pause());
  await upload(page, "pdf", "Document.pdf", "application/pdf", pdf());
  await expect(page.locator('.pm-document object[type="application/pdf"]')).toBeVisible();
  await upload(page, "file", "Attachment.pdf", "application/pdf", pdf());
  await expect(page.locator(".pm-file-card")).toHaveCount(2);
  await expect(page.locator(".pm-document object")).toHaveCount(1);
  await upload(page, "image", "Picture.png", "image/png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1cAAAAASUVORK5CYII=", "base64"));
  await expect(page.locator('.pm-document img[alt="Picture.png"]')).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("![Picture.png]");
  const body = (await (await request.get(`/api/pages/${note.id}`)).json()).body;
  expect(body).toMatch(/<file[^>]+>Recording.wav<\/file>/);
  expect(body).toMatch(/<audio[^>]+>Recording.wav<\/audio>/);
  expect(body).not.toContain("15.7 KiB");
  await page.reload();
  await expect(card.locator(".pm-file-size")).toHaveText("15.7 KiB");
  await expect(page.locator(".pm-document audio")).toHaveCount(1);
  const properties = await openBlockProperties(page, page.locator(".pm-file-block").filter({ has: card }));
  await expect(properties.getByLabel("File name", { exact: true })).toHaveValue("Recording.wav");
  await properties.getByLabel("File name", { exact: true }).fill("Renamed.wav");
  await properties.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card).toContainText("Renamed.wav");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await (await request.get(`/api/pages/${note.id}`)).json()).body).toContain("Renamed.wav");
  await page.screenshot({ path: "test-results/media-types.png" });
});

test("media chooser takes focus from typing and restores it after cancel or failure", async ({ page, request }) => {
  const note = await (await request.post("/api/pages", { data: { title: "Media picker focus", body: "Before after", syntax: { version: 1, variant: "notdown", extensions: {} } } })).json();
  await page.goto(`/#page/${note.id}`);
  const editor = page.locator(".pm-document");
  await editor.locator("p").first().click();
  await page.keyboard.press("Home");
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.type("/attachment");
  await expect(page.locator('[data-insert="file"]')).toHaveAttribute("aria-selected", "true");
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  const input = (await chooser).element();
  expect(await input.evaluate(el => el.isConnected && document.activeElement === el)).toBe(true);
  // Playwright intercepts native dialogs; exercise the browser's cancel event.
  await input.dispatchEvent("cancel");
  await expect(page.getByLabel("Choose media file", { exact: true })).toHaveCount(0);
  await expect(editor).toBeFocused();
  await page.keyboard.type("here ");
  await expect(editor).toHaveText("Before here after");

  await upload(page, "audio", "Wrong.txt", "text/plain", Buffer.from("not audio"));
  await expect(page.locator("body")).toContainText("Choose an audio file.");
  await expect(page.getByLabel("Choose media file", { exact: true })).toHaveCount(0);
  await expect(editor).toBeFocused();

  await page.route("**/api/assets", route => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Upload failed for test" }) }));
  await upload(page, "file", "Sample.txt", "text/plain", Buffer.from("test"));
  await expect(page.locator("body")).toContainText("Upload failed for test");
  await expect(page.getByLabel("Choose media file", { exact: true })).toHaveCount(0);
  await expect(editor).toBeFocused();
  await expect(page.locator(".pm-file-card")).toHaveCount(0);
});

test("separate slash entries have icons; invalid media and cancelled uploads do not insert", async ({ page, request }) => {
  const note = await (await request.post("/api/pages", { data: { title: "Media validation", body: "", syntax: { version: 1, variant: "notion-markdown", extensions: {} } } })).json();
  await page.goto(`/#page/${note.id}`);
  await page.locator(".pm-document").click(); await page.keyboard.type("/");
  for (const kind of ["image", "video", "audio", "pdf", "file"]) {
    await expect(page.locator(`[data-insert="${kind}"]`)).toHaveCount(1);
    await expect(page.locator(`[data-insert="${kind}"] svg`)).toHaveCount(1);
  }
  const cancelled = page.waitForEvent("filechooser");
  await page.locator('[data-insert="file"]').click();
  await (await cancelled).setFiles([]);
  await expect(page.locator(".pm-media-block")).toHaveCount(0);
  await upload(page, "audio", "Wrong.txt", "text/plain", Buffer.from("not audio"));
  await expect(page.locator(".pm-media-block")).toHaveCount(0);
  await expect(page.locator("body")).toContainText("Choose an audio file.");
});
