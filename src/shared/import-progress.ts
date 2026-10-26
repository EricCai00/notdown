export type ImportProgress = {
  phase: "reading" | "restoring" | "attachments" | "importing" | "finalizing";
  completed: number;
  total?: number;
  currentTitle?: string;
  step?: string;
  requestCount?: number;
  discovered?: number;
};
