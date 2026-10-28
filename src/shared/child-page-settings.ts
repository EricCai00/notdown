export interface ChildPageSettings {
  allowUninserted: boolean;
  autoInsert: boolean;
}

export const defaultChildPageSettings: ChildPageSettings = { allowUninserted: true, autoInsert: false };
export interface ChildPageSettingsSnapshot {
  settings: ChildPageSettings;
  revision: string;
  inserted?: number;
  updatedPages?: number;
}
