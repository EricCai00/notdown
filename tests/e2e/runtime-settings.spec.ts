import { test, expect } from "@playwright/test";

test.afterEach(async ({ request }) => {
  const current = await (await request.get("/api/runtimes/settings")).json();
  await request.put("/api/runtimes/settings", { data: { settings: Object.fromEntries(Object.keys(current.settings).map(key => [key, ""])), baseRevision: current.revision } });
});

test("Settings saves paths, tests unsaved values, reopens and restores automatic discovery", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Workspace settings", exact: true }).click();
  const section = page.getByRole("region", { name: "Code execution" });
  await expect(section.getByLabel("Python path", { exact: true })).toBeEnabled();
  await section.getByLabel("Python path", { exact: true }).fill("C:\\Missing Python\\python.exe");
  await section.getByRole("button", { name: "Check Python", exact: true }).click();
  await expect(section).toContainText("Unavailable");
  expect((await (await request.get("/api/runtimes/settings")).json()).settings.python).toBe("");
  await section.getByText("Advanced: Jupyter and Pandoc", { exact: true }).click();
  await section.getByLabel("Julia path", { exact: true }).fill("C:\\Julia\\julia.exe");
  await section.getByLabel("Julia kernel name", { exact: true }).fill("julia-test");
  await section.getByRole("button", { name: "Save interpreter settings" }).click();
  await expect(section).toContainText("Interpreter settings saved");
  await page.reload();
  await page.getByRole("button", { name: "Workspace settings", exact: true }).click();
  await expect(section.getByLabel("Python path", { exact: true })).toHaveValue("C:\\Missing Python\\python.exe");
  await expect(section.getByLabel("Julia path", { exact: true })).toHaveValue("C:\\Julia\\julia.exe");
  await section.getByText("Advanced: Jupyter and Pandoc", { exact: true }).click();
  await expect(section.getByLabel("Julia kernel name", { exact: true })).toHaveValue("julia-test");
  await section.getByLabel("Python path", { exact: true }).fill("");
  await section.getByLabel("Julia path", { exact: true }).fill("");
  await section.getByLabel("Julia kernel name", { exact: true }).fill("");
  await section.getByRole("button", { name: "Save interpreter settings" }).click();
  await expect(section).toContainText("Interpreter settings saved");
  expect((await (await request.get("/api/runtimes/settings")).json()).settings.python).toBe("");
  await section.getByText("Advanced: Jupyter and Pandoc", { exact: true }).click();
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: ".run/logs/runtime-settings.png" });
});

test("saving interpreter settings clears visible output and restarts the actual notebook session", async ({ page, request }) => {
  const capability = await (await request.get("/api/rmarkdown/capabilities")).json();
  test.skip(!capability.available, capability.help);
  const note = await (await request.post("/api/pages", { data: { title: "Runtime restart", body: "```{r}\nruntime_settings_value <- 42\nruntime_settings_value\n```\n\n`r runtime_settings_value`\n", syntax: { version: 1, variant: "rmarkdown", extensions: {} }, bodyFormat: "markdown" } })).json();
  await page.addInitScript(id => localStorage.setItem("notdown-page", id), note.id);
  await page.goto("/");
  await page.getByRole("button", { name: "Run current chunk", exact: true }).click();
  await expect(page.locator(".pm-r-chunk").frameLocator("iframe").locator("body")).toContainText("42", { timeout: 20_000 });
  await page.getByRole("button", { name: "Workspace settings", exact: true }).click();
  const section = page.getByRole("region", { name: "Code execution" });
  await expect(section.getByRole("button", { name: "Save interpreter settings" })).toBeEnabled();
  await section.getByRole("button", { name: "Save interpreter settings" }).click();
  await expect(section).toContainText("Interpreter settings saved");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".pm-r-output:visible")).toHaveCount(0);
  await page.getByRole("button", { name: "Inline R controls", exact: true }).click();
  await page.getByRole("button", { name: "Run inline R", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "Inline R result", exact: true });
  await expect(popup.locator('[role="status"]')).toHaveText("R error", { timeout: 20_000 });
  await expect(popup.locator("pre")).toContainText("runtime_settings_value");
});

test("a stale Settings dialog preserves its draft and cannot overwrite another window", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Workspace settings", exact: true }).click();
  const section = page.getByRole("region", { name: "Code execution" });
  await expect(section.getByLabel("Rscript path", { exact: true })).toBeEnabled();
  const current = await (await request.get("/api/runtimes/settings")).json();
  await request.put("/api/runtimes/settings", { data: { settings: { ...current.settings, rscript: "other-window-Rscript" }, baseRevision: current.revision } });
  await section.getByLabel("Rscript path", { exact: true }).fill("my-draft-Rscript");
  await section.getByRole("button", { name: "Save interpreter settings" }).click();
  await expect(section).toContainText("Both versions were preserved");
  await expect(section.getByLabel("Rscript path", { exact: true })).toHaveValue("my-draft-Rscript");
  expect((await (await request.get("/api/runtimes/settings")).json()).settings.rscript).toBe("other-window-Rscript");
});
