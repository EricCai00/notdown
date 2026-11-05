import { execFile } from "node:child_process";

// No input is interpolated into PowerShell code. Only the folder dialog is visible.
const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
public static class NotdownFolderPicker {
  [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileDialog {
    [PreserveSig] int Show(IntPtr owner);
    void SetFileTypes(uint count, IntPtr types);
    void SetFileTypeIndex(uint index);
    void GetFileTypeIndex(out uint index);
    void Advise(IntPtr events, out uint cookie);
    void Unadvise(uint cookie);
    void SetOptions(uint options);
    void GetOptions(out uint options);
    void SetDefaultFolder(IShellItem folder);
    void SetFolder(IShellItem folder);
    void GetFolder(out IShellItem folder);
    void GetCurrentSelection(out IShellItem item);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetFileName(out IntPtr name);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void GetResult(out IShellItem item);
  }
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(IntPtr context, ref Guid handler, ref Guid iid, out IntPtr result);
    void GetParent(out IShellItem parent);
    void GetDisplayName(uint kind, out IntPtr name);
    void GetAttributes(uint mask, out uint attributes);
    void Compare(IShellItem item, uint hint, out int order);
  }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string path, IntPtr context, ref Guid iid, out IShellItem item);
  public static string Pick(string initialPath) {
    var picker = (IFileDialog)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")));
    IShellItem initial = null, selected = null;
    IntPtr name = IntPtr.Zero;
    try {
      uint options; picker.GetOptions(out options);
      // FOS_PICKFOLDERS | FORCEFILESYSTEM | PATHMUSTEXIST | NOCHANGEDIR.
      picker.SetOptions(options | 0x20u | 0x40u | 0x800u | 0x8u);
      if (!String.IsNullOrWhiteSpace(initialPath) && Directory.Exists(initialPath)) {
        var iid = typeof(IShellItem).GUID;
        SHCreateItemFromParsingName(initialPath, IntPtr.Zero, ref iid, out initial);
        picker.SetFolder(initial);
      }
      int result = picker.Show(IntPtr.Zero);
      if (result == unchecked((int)0x800704C7)) return null;
      Marshal.ThrowExceptionForHR(result);
      picker.GetResult(out selected);
      selected.GetDisplayName(0x80058000, out name); // SIGDN_FILESYSPATH
      return Marshal.PtrToStringUni(name);
    } finally {
      if (name != IntPtr.Zero) Marshal.FreeCoTaskMem(name);
      if (selected != null) Marshal.ReleaseComObject(selected);
      if (initial != null) Marshal.ReleaseComObject(initial);
      Marshal.ReleaseComObject(picker);
    }
  }
}
'@
$selected = [NotdownFolderPicker]::Pick($env:NOTDOWN_BROWSE_PATH)
if ($null -ne $selected) { [Console]::Write([string]$selected) }
`;
let active: Promise<string | null> | undefined;
export function browseFolder(input: unknown): Promise<string | null> {
  if (typeof input !== "string" || input.length > 32768 || /[\x00-\x1f]/.test(input)) return Promise.reject(new Error("Invalid folder path."));
  if (process.platform !== "win32") return Promise.reject(new Error("Folder browsing is available on Windows. Enter the folder path to continue."));
  if (active) return Promise.reject(new Error("A folder picker is already open."));
  const request = new Promise<string | null>((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-STA", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
      { windowsHide: true, encoding: "utf8", env: { ...process.env, NOTDOWN_BROWSE_PATH: input } },
      (error, stdout) => error ? reject(new Error("Could not open the folder picker.")) : resolve(stdout.trim() || null));
  });
  active = request;
  void request.finally(() => { active = undefined; }).catch(() => {});
  return request;
}
