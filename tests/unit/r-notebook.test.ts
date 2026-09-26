import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { RNotebook } from "../../server/r-notebook";
import { rMarkdownCapabilities } from "../../server/rmarkdown";

const source = '```{r setup, include=FALSE}\nx <- if (exists("x")) x + 1 else 1\nprint(x)\n```\n\n```{r table}\nknitr::kable(data.frame(value=x))\n```\n\n```{r plot}\nplot(1:3)\n```\n\nValue: `r x + 1`.\n';
test("notebook validates identity and bounds without starting R", async () => {
  const notebook = new RNotebook();
  await assert.rejects(notebook.execute({ source }), /Expected a notebook/);
  await assert.rejects(notebook.execute({ session: randomUUID(), source, mode: "current", variant: "rmarkdown", index: 99 }), /no longer exists/);
});

test("real notebook keeps a window session, runs only requested chunks, renders tables/plots and inline text", { timeout: 60_000 }, async t => {
  if (!(await rMarkdownCapabilities()).available) { t.skip("R is unavailable"); return; }
  const notebook = new RNotebook(); t.after(() => notebook.close());
  const request = { session: randomUUID(), source, variant: "rmarkdown" };
  const first = await notebook.execute({ ...request, mode: "current", index: 0 });
  assert.equal(first.sessionStarted, true);
  assert.equal(first.outputs.length, 1);
  assert.match(first.outputs[0].html || "", /1/);
  assert.doesNotMatch(first.outputs[0].html || "", /x &lt;-/);
  assert.doesNotMatch(first.outputs[0].html || "", /<h1[^>]*>R output/);
  const table = await notebook.execute({ ...request, mode: "current", index: 1 });
  assert.match(table.outputs[0].html || "", /<table/);
  const inline = await notebook.execute({ ...request, mode: "inline", index: 0 });
  assert.equal(inline.outputs[0].text, "[1] 2");
  const plot = await notebook.execute({ ...request, mode: "current", index: 2 });
  assert.match(plot.outputs[0].html || "", /data:image\/png;base64,/);
  await notebook.execute({ ...request, mode: "current", index: 0 });
  assert.equal((await notebook.execute({ ...request, mode: "inline", index: 0 })).outputs[0].text, "[1] 3");
  const other = await notebook.execute({ ...request, session: randomUUID(), mode: "inline", index: 0 });
  assert.match(other.error || "", /x/);
});

test("real notebook above stops on error; cancellation resets the session and frees the worker", { timeout: 60_000 }, async t => {
  if (!(await rMarkdownCapabilities()).available) { t.skip("R is unavailable"); return; }
  const notebook = new RNotebook(); t.after(() => notebook.close());
  const request = { session: randomUUID(), source: '```{r}\nx <- 1\n```\n\n```{r}\nstop("notebook-error")\n```\n\n```{r}\nx <- 99\n```\n\n```{r}\nx\n```\n\n`r x`', variant: "rmarkdown" };
  const above = await notebook.execute({ ...request, mode: "above", index: 3 });
  assert.equal(above.outputs.length, 2);
  assert.match(above.outputs[1].error || "", /notebook-error/);
  assert.equal((await notebook.execute({ ...request, mode: "inline", index: 0 })).outputs[0].text, "[1] 1");
  const continued = await notebook.execute({ ...request, source: '```{r, error=TRUE}\nstop("allowed-error")\nx <- 2\nprint(x)\n```', mode: "current", index: 0 });
  assert.equal(continued.outputs[0].error, undefined);
  assert.match(continued.outputs[0].html || "", /allowed-error/);
  assert.equal((await notebook.execute({ ...request, mode: "inline", index: 0 })).outputs[0].text, "[1] 2");
  const controller = new AbortController();
  const pending = notebook.execute({ ...request, source: '```{r}\nSys.sleep(30)\n```', mode: "current", index: 0 }, controller.signal);
  const timer = setTimeout(() => controller.abort(), 1000);
  try { await assert.rejects(pending, /stopped|cancelled/); } finally { clearTimeout(timer); }
  const fresh = await notebook.execute({ ...request, mode: "inline", index: 0 });
  assert.equal(fresh.sessionStarted, true);
  assert.match(fresh.error || "", /x/);
});
