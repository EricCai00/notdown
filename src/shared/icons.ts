import {
  createIcons,
  createElement,
  CornerUpLeft,
  Video, Music,
  Braces, Replace, Hash,
  Heading4, Heading5, Heading6, Lightbulb, Sigma, Workflow, MessageSquare, ExternalLink, Superscript, Subscript, AlignLeft, Square, ListOrdered, Copy, User, Calendar, Type, Minus, PanelsTopLeft, Bookmark, PanelTop, Navigation, MousePointer2, Mic, Image, Bold, Italic, Underline, Strikethrough, Palette, PaintBucket, Highlighter, Smile,
  Star,
  Trash2,
  Undo2,
  Ellipsis,
  NotebookPen,
  ChevronsUpDown,
  Search,
  LayoutDashboard,
  Waypoints,
  GitBranch,
  Plus,
  ChevronRight,
  ChevronDown,
  FileText,
  Settings2,
  PanelLeft,
  Download,
  SlidersHorizontal,
  Library,
  FilePlus2,
  FolderTree,
  FolderInput,
  FolderOpen,
  Tags,
  PenLine,
  BookOpen,
  ListTree,
  Network,
  Grip,
  CodeXml,
  FileCode2,
  Globe,
  Sparkles,
  Files,
  ArrowUpRight,
  Link2,
  HardDrive,
  LayoutGrid,
  Table2,
  Sprout,
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  GripVertical,
  X,
  CornerDownLeft,
  Heading2,
  Heading1,
  Heading3,
  AtSign,
  List,
  SquareCheck,
  Quote,
  Code,
  Columns2,
  Paperclip,
  CircleAlert,
  CircleCheck,
} from "lucide";

// A reference number in brackets distinguishes footnotes from typographic superscript.
const Footnote: typeof Superscript = [
  ["path", { d: "M6 5H3v14h3M18 5h3v14h-3M10 9l2-2v10M10 17h4" }],
];

export const icons = {
  Video, Music,
  Braces, Replace, Hash,
  Footnote,
  Heading4, Heading5, Heading6, Lightbulb, Sigma, Workflow, MessageSquare, ExternalLink, Superscript, Subscript, AlignLeft, Square, ListOrdered, Copy, User, Calendar, Type, Minus, PanelsTopLeft, Bookmark, PanelTop, Navigation, MousePointer2, Mic, Image, Bold, Italic, Underline, Strikethrough, Palette, PaintBucket, Highlighter, Smile,
  ArrowLeft,
  ArrowRight,
  Star,
  Trash2,
  Undo2,
  Heading1,
  Heading3,
  AtSign,
  Ellipsis,
  NotebookPen,
  ChevronsUpDown,
  Search,
  LayoutDashboard,
  Waypoints,
  GitBranch,
  Plus,
  ChevronRight,
  ChevronDown,
  FileText,
  Settings2,
  PanelLeft,
  Download,
  SlidersHorizontal,
  Library,
  FilePlus2,
  FolderTree,
  FolderInput,
  FolderOpen,
  Tags,
  PenLine,
  BookOpen,
  ListTree,
  Network,
  Grip,
  CodeXml,
  FileCode2,
  Globe,
  Sparkles,
  Files,
  ArrowUpRight,
  Link2,
  HardDrive,
  LayoutGrid,
  Table2,
  Sprout,
  ArrowUp,
  ArrowDown,
  GripVertical,
  X,
  CornerDownLeft,
  Heading2,
  List,
  SquareCheck,
  Quote,
  Code,
  Columns2,
  Paperclip,
  CircleAlert,
  CircleCheck,
};

const renderedIcons = new WeakMap<Element, string>();
const pendingIconAttribute = "data-notdown-pending-icon";

export function refreshIcons() {
  let pending = false;
  for (const element of document.querySelectorAll("[data-lucide]")) {
    const name = element.getAttribute("data-lucide")!;
    if (renderedIcons.get(element) === name) continue;
    element.setAttribute(pendingIconAttribute, name);
    pending = true;
  }
  if (!pending) return;
  // Lucide retains data-lucide on generated SVGs. Select only new or renamed
  // icons so frequent status/navigation refreshes keep existing SVGs intact.
  createIcons({ icons, nameAttr: pendingIconAttribute, attrs: { "stroke-width": 1.65 } });
  for (const element of document.querySelectorAll(`[${pendingIconAttribute}]`)) {
    element.removeAttribute(pendingIconAttribute);
    if (element instanceof SVGElement) renderedIcons.set(element, element.getAttribute("data-lucide")!);
  }
}

export function createBacklinkIcon() {
  return createElement(CornerUpLeft, {
    class: "reference-backlink-icon",
    width: 14,
    height: 14,
    "stroke-width": 1.65,
    "aria-hidden": "true",
    focusable: "false",
  });
}
