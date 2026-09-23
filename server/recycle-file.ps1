param([Parameter(Mandatory=$true)][string]$LiteralPath)
$ErrorActionPreference = 'Stop'

# IFileOperation with RECYCLEONDELETE, not DeleteFile/Remove-Item.
# https://learn.microsoft.com/windows/win32/api/shobjidl_core/nf-shobjidl_core-ifileoperation-setoperationflags
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;

namespace Notdown {
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(IntPtr context, ref Guid handler, ref Guid iid, out IntPtr result);
    void GetParent(out IShellItem parent);
    void GetDisplayName(uint kind, out IntPtr name);
    void GetAttributes(uint mask, out uint attributes);
    void Compare(IShellItem item, uint hint, out int order);
  }
  [ComImport, Guid("947AAB5F-0A5C-4C13-B4D6-4BF7836FC9F8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileOperation {
    void Advise(IntPtr sink, out uint cookie);
    void Unadvise(uint cookie);
    void SetOperationFlags(uint flags);
    void SetProgressMessage([MarshalAs(UnmanagedType.LPWStr)] string message);
    void SetProgressDialog(IntPtr dialog);
    void SetProperties(IntPtr properties);
    void SetOwnerWindow(uint window);
    void ApplyPropertiesToItem(IShellItem item);
    void ApplyPropertiesToItems(IntPtr items);
    void RenameItem(IShellItem item, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
    void RenameItems(IntPtr items, [MarshalAs(UnmanagedType.LPWStr)] string name);
    void MoveItem(IShellItem item, IShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
    void MoveItems(IntPtr items, IShellItem destination);
    void CopyItem(IShellItem item, IShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
    void CopyItems(IntPtr items, IShellItem destination);
    void DeleteItem(IShellItem item, IntPtr sink);
    void DeleteItems(IntPtr items);
    void NewItem(IShellItem destination, uint attributes, [MarshalAs(UnmanagedType.LPWStr)] string name, [MarshalAs(UnmanagedType.LPWStr)] string template, IntPtr sink);
    void PerformOperations();
    void GetAnyOperationsAborted([MarshalAs(UnmanagedType.Bool)] out bool aborted);
  }
  public static class Recycle {
    [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=false)]
    static extern void SHCreateItemFromParsingName(string path, IntPtr context, ref Guid iid, out IShellItem item);
    public static void File(string path) {
      var full = Path.GetFullPath(path);
      if (!System.IO.File.Exists(full) || (System.IO.File.GetAttributes(full) & FileAttributes.ReparsePoint) != 0)
        throw new IOException("Only regular files can be recycled.");
      IShellItem item = null;
      IFileOperation operation = null;
      try {
        var iid = typeof(IShellItem).GUID;
        SHCreateItemFromParsingName(full, IntPtr.Zero, ref iid, out item);
        operation = (IFileOperation)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("3AD05575-8857-4850-9277-11B85BDB8E09")));
        // Recycle, add Explorer undo, stop on errors, and suppress shell UI.
        operation.SetOperationFlags(0x00080000 | 0x20000000 | 0x00100000 | 0x0400 | 0x0010 | 0x0004);
        operation.DeleteItem(item, IntPtr.Zero);
        operation.PerformOperations();
        bool aborted;
        operation.GetAnyOperationsAborted(out aborted);
        if (aborted) throw new IOException("Windows canceled moving the file to the Recycle Bin.");
      } finally {
        if (operation != null) Marshal.FinalReleaseComObject(operation);
        if (item != null) Marshal.FinalReleaseComObject(item);
      }
    }
  }
}
'@

[Notdown.Recycle]::File($LiteralPath)
