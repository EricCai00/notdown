/** Inline computed styles so a standalone SVG/PNG looks like the visible chart. */
export async function downloadChart(plot: SVGSVGElement, title: string, legend: { label: string; color: string }[], format: "svg" | "png", background: string) {
  const ns = "http://www.w3.org/2000/svg";
  const copy = plot.cloneNode(true) as SVGSVGElement;
  const originals = [plot, ...plot.querySelectorAll("*")];
  const clones = [copy, ...copy.querySelectorAll("*")];
  const properties = ["fill", "stroke", "stroke-width", "stroke-dasharray", "font-family", "font-size", "font-weight", "letter-spacing", "opacity"];
  clones.forEach((element, i) => {
    const style = getComputedStyle(originals[i]);
    for (const property of properties) {
      let value = style.getPropertyValue(property);
      // Computed SVG paint URLs may be absolute; retain local gradient references.
      const reference = originals[i].getAttribute(property);
      if (reference?.startsWith("url(#")) value = reference;
      (element as SVGElement).style.setProperty(property, value);
    }
    element.removeAttribute("tabindex"); element.removeAttribute("role"); element.removeAttribute("class");
  });
  const width = plot.viewBox.baseVal.width, plotHeight = plot.viewBox.baseVal.height;
  const height = plotHeight + 60 + legend.length * 23;
  copy.setAttribute("viewBox", `0 0 ${width} ${height}`);
  copy.setAttribute("width", String(width)); copy.setAttribute("height", String(height));
  copy.removeAttribute("style");
  const group = document.createElementNS(ns, "g"); group.setAttribute("transform", "translate(0 44)");
  group.append(...copy.childNodes); copy.append(group);
  const rect = document.createElementNS(ns, "rect");
  for (const [key, value] of Object.entries({ width: String(width), height: String(height), fill: background })) rect.setAttribute(key, value);
  copy.prepend(rect);
  const addText = (text: string, x: number, y: number, size: number) => {
    const label = document.createElementNS(ns, "text"); label.textContent = text;
    for (const [key, value] of Object.entries({ x, y, fill: getComputedStyle(plot).color, "font-size": size, "font-family": "sans-serif" })) label.setAttribute(key, String(value));
    copy.append(label);
  };
  addText(title, 24, 28, 16);
  legend.forEach((item, i) => {
    const swatch = document.createElementNS(ns, "circle");
    swatch.setAttribute("cx", "28"); swatch.setAttribute("cy", String(plotHeight + 65 + i * 23)); swatch.setAttribute("r", "4"); swatch.setAttribute("fill", item.color); copy.append(swatch);
    addText(item.label, 42, plotHeight + 69 + i * 23, 12);
  });
  let blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml;charset=utf-8" });
  if (format === "png") {
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement("canvas");
      // Bound the bitmap size for unusually wide charts, including 200 categories.
      const scale = Math.min(2, 8192 / width, 8192 / height);
      canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
      const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas unavailable");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("PNG export failed")), "image/png"));
    } finally { URL.revokeObjectURL(url); }
  }
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = `${title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 100) || "Chart"}.${format}`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
