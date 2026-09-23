import { workbookSyntax } from "./catalog-syntax";
import { pandocSyntax } from "./catalog-pandoc-syntax";
import { canonicalExtensionId, type Dialect } from "./markdown-engine/config";
import { syntaxFindings } from "./catalog-syntax-findings";

export const syntaxGuides = [...workbookSyntax, ...pandocSyntax].map(s => ({
  ...s,
  limitation: [s.limitation, ...s.extensions.map(id => syntaxFindings[id])].filter(Boolean).join(" ") || undefined,
}));
export const syntaxForObject = (id: string) => syntaxGuides.filter(s => s.objects.includes(id));
export const syntaxForExtension = (id: string) => syntaxGuides.filter(s => s.extensions.includes(canonicalExtensionId(id)));
export const syntaxForVariant = (id: Dialect) => syntaxGuides.filter(s => s.variants.includes(id));
export const syntaxSearchText = (guides: typeof syntaxGuides) => guides.map(s => [s.title, s.source, s.locator, s.origin, s.note, s.correction, s.limitation].filter(Boolean).join(" ")).join(" ");
