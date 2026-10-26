package app.notdown.mobile;

import org.junit.*;
import org.junit.rules.TemporaryFolder;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.junit.Assert.*;

public class VaultFileStoreTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();
    private VaultFileStore files;
    private byte[] data(String value) { return value.getBytes(StandardCharsets.UTF_8); }
    @Before public void setup() throws Exception {
        files = new VaultFileStore(temporary.getRoot().toPath());
        files.mkdir("/vaults/main/pages", true);
    }
    @After public void close() throws Exception { files.close(); }
    @Test public void persistsUtf8AndRejectsExclusiveOverwrite() throws Exception {
        files.write("/vaults/main/pages/note.md", data("中文 **note**\r\n"), true);
        assertArrayEquals(data("中文 **note**\r\n"), files.read("/vaults/main/pages/note.md"));
        assertThrows(FileAlreadyExistsException.class, () -> files.write("/vaults/main/pages/note.md", data("lost"), true));
    }
    @Test public void replacementComparesBytesAndKeepsBothOnConflict() throws Exception {
        files.write("/vaults/main/pages/note.md", data("external"), true);
        files.write("/vaults/main/pages/pending.tmp", data("draft"), true);
        assertThrows(VaultFileStore.StorageException.class, () -> files.replace("/vaults/main/pages/pending.tmp", "/vaults/main/pages/note.md", data("old")));
        assertArrayEquals(data("external"), files.read("/vaults/main/pages/note.md"));
        assertArrayEquals(data("draft"), files.read("/vaults/main/pages/pending.tmp"));
        files.replace("/vaults/main/pages/pending.tmp", "/vaults/main/pages/note.md", data("external"));
        assertArrayEquals(data("draft"), files.read("/vaults/main/pages/note.md"));
    }
    @Test public void locksExcludeOtherInstancesAndRelease() throws Exception {
        try (VaultFileStore second = new VaultFileStore(temporary.getRoot().toPath())) {
            String token = files.acquire("/vaults/main");
            assertThrows(VaultFileStore.StorageException.class, () -> second.acquire("/vaults/main"));
            files.release(token);
            second.release(second.acquire("/vaults/main"));
        }
    }
    @Test public void refusesTraversalAndForeignPaths() {
        for (String path : new String[]{"/vaults/../secrets", "/sdcard/test", "/vaults/main/../../test", "/vaults/main\\x"})
            assertThrows(VaultFileStore.StorageException.class, () -> files.resolve(path));
    }
    @Test public void publishDoesNotOverwriteExistingFile() throws Exception {
        files.write("/vaults/main/pages/source.tmp", data("first"), true);
        files.link("/vaults/main/pages/source.tmp", "/vaults/main/pages/note.md");
        files.remove("/vaults/main/pages/source.tmp", false);
        assertArrayEquals(data("first"), files.read("/vaults/main/pages/note.md"));
        files.write("/vaults/main/pages/source.tmp", data("second"), true);
        assertThrows(FileAlreadyExistsException.class, () -> files.link("/vaults/main/pages/source.tmp", "/vaults/main/pages/note.md"));
        assertArrayEquals(data("first"), files.read("/vaults/main/pages/note.md"));
    }
    @Test public void batchPreflightPreservesEveryFileWhenOneOriginalIsStale() throws Exception {
        files.write("/vaults/main/pages/a.md", data("a"), true);
        files.write("/vaults/main/pages/b.md", data("external"), true);
        assertThrows(VaultFileStore.StorageException.class, () -> files.replaceMany(Arrays.asList(
            new VaultFileStore.Replacement("/vaults/main/pages/a.md", data("a"), data("new a")),
            new VaultFileStore.Replacement("/vaults/main/pages/b.md", data("b"), data("new b")))));
        assertArrayEquals(data("a"), files.read("/vaults/main/pages/a.md"));
        assertArrayEquals(data("external"), files.read("/vaults/main/pages/b.md"));
    }
    @Test public void batchReplaysPartialWritesAndKeepsOriginalBytes() throws Exception {
        files.write("/vaults/main/pages/a.md", data("\uFEFF中文\r\n"), true);
        List<VaultFileStore.Replacement> changes = Arrays.asList(
            new VaultFileStore.Replacement("/vaults/main/pages/a.md", null, data("\uFEFF中文\r\n")),
            new VaultFileStore.Replacement("/vaults/main/pages/b.md", null, data("```unknown\r\nkeep\r\n```\r\n")),
            new VaultFileStore.Replacement("/vaults/main/metadata.json", null, data("{\"future\":true}")));
        files.replaceMany(changes); files.replaceMany(changes);
        assertArrayEquals(data("\uFEFF中文\r\n"), files.read("/vaults/main/pages/a.md"));
        assertArrayEquals(data("```unknown\r\nkeep\r\n```\r\n"), files.read("/vaults/main/pages/b.md"));
        assertEquals(2, files.list("/vaults/main/pages").size());
    }
    @Test public void batchRejectsDuplicateOrForeignPathsBeforeWriting() throws Exception {
        VaultFileStore.Replacement valid = new VaultFileStore.Replacement("/vaults/main/pages/a.md", null, data("a"));
        assertThrows(VaultFileStore.StorageException.class, () -> files.replaceMany(Arrays.asList(valid, valid)));
        assertThrows(VaultFileStore.StorageException.class, () -> files.replaceMany(Arrays.asList(valid,
            new VaultFileStore.Replacement("/vaults/../foreign", null, data("b")))));
        assertEquals(0, files.list("/vaults/main/pages").size());
    }
}
