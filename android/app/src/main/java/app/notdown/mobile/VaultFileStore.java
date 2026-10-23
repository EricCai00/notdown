package app.notdown.mobile;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.file.*;
import java.util.*;

/** Restricted private files, fsync, atomic replacement and OS-owned locks. No editor logic. */
public final class VaultFileStore implements AutoCloseable {
    public static final class StorageException extends IOException {
        public final String code;
        StorageException(String code, String message) { super(message); this.code = code; }
    }
    private static final class Lease {
        final FileChannel channel;
        final FileLock lock;
        Lease(FileChannel channel, FileLock lock) { this.channel = channel; this.lock = lock; }
        void close() throws IOException { try { lock.release(); } finally { channel.close(); } }
    }
    private final Path root;
    private final Path locks;
    private final Map<String, Lease> leases = new HashMap<>();
    public VaultFileStore(Path applicationFiles) throws IOException {
        root = applicationFiles.resolve("notdown-vaults").toAbsolutePath().normalize();
        locks = applicationFiles.resolve("notdown-locks").toAbsolutePath().normalize();
        Files.createDirectories(root); Files.createDirectories(locks);
    }
    public Path resolve(String virtual) throws IOException {
        if (virtual == null || !(virtual.equals("/vaults") || virtual.startsWith("/vaults/")) || virtual.indexOf('\\') >= 0 || virtual.indexOf('\0') >= 0)
            throw new StorageException("EACCES", "Path must be inside a private Notdown vault");
        String relative = virtual.equals("/vaults") ? "" : virtual.substring(8);
        for (String part : relative.split("/")) if (part.equals("..") || part.equals(".")) throw new StorageException("EACCES", "Traversal is not allowed");
        Path result = root.resolve(relative).normalize();
        if (!result.startsWith(root)) throw new StorageException("EACCES", "Path escapes the vault");
        Path cursor = root;
        if (Files.isSymbolicLink(cursor)) throw new StorageException("EACCES", "Symbolic links are not allowed");
        for (Path part : root.relativize(result)) {
            cursor = cursor.resolve(part);
            if (Files.isSymbolicLink(cursor)) throw new StorageException("EACCES", "Symbolic links are not allowed");
        }
        return result;
    }
    public String kind(String virtual) throws IOException {
        Path file = resolve(virtual);
        if (!Files.exists(file, LinkOption.NOFOLLOW_LINKS)) throw new NoSuchFileException(virtual);
        if (Files.isDirectory(file, LinkOption.NOFOLLOW_LINKS)) return "directory";
        if (Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) return "file";
        throw new StorageException("EACCES", "Unsupported file type");
    }
    public List<String> list(String virtual) throws IOException {
        List<String> result = new ArrayList<>();
        try (DirectoryStream<Path> directory = Files.newDirectoryStream(resolve(virtual))) {
            for (Path entry : directory) result.add(entry.getFileName().toString());
        }
        Collections.sort(result); return result;
    }
    public byte[] read(String virtual) throws IOException {
        Path file = resolve(virtual);
        if (Files.size(file) > 128L * 1024 * 1024) throw new StorageException("EFBIG", "File exceeds 128 MB");
        return Files.readAllBytes(file);
    }
    public void mkdir(String virtual, boolean recursive) throws IOException {
        Path directory = resolve(virtual);
        if (recursive) Files.createDirectories(directory); else Files.createDirectory(directory);
    }
    public void write(String virtual, byte[] data, boolean exclusive) throws IOException {
        Path file = resolve(virtual);
        Set<StandardOpenOption> options = EnumSet.of(StandardOpenOption.WRITE,
            exclusive ? StandardOpenOption.CREATE_NEW : StandardOpenOption.CREATE);
        if (!exclusive) options.add(StandardOpenOption.TRUNCATE_EXISTING);
        try (FileChannel output = FileChannel.open(file, options)) {
            ByteBuffer bytes = ByteBuffer.wrap(data);
            while (bytes.hasRemaining()) output.write(bytes);
            output.force(true);
        }
    }
    public void remove(String virtual, boolean force) throws IOException {
        Path file = resolve(virtual);
        if (file.equals(root)) throw new StorageException("EACCES", "Cannot delete vault storage root");
        if (force) Files.deleteIfExists(file); else Files.delete(file);
    }
    public void move(String from, String to) throws IOException {
        Files.move(resolve(from), resolve(to), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    }
    public void link(String from, String to) throws IOException { Files.createLink(resolve(to), resolve(from)); }
    public void replace(String from, String to, byte[] expected) throws IOException {
        Path destination = resolve(to);
        byte[] current = Files.exists(destination, LinkOption.NOFOLLOW_LINKS) ? read(to) : null;
        if (!Arrays.equals(expected, current)) throw new StorageException("ESTALE", "File changed during save; recovery content was preserved");
        move(from, to);
    }
    public synchronized String acquire(String virtual) throws IOException {
        if (virtual == null || !virtual.matches("/vaults/[a-zA-Z0-9-]{1,64}")) throw new StorageException("EACCES", "Invalid vault lock identity");
        resolve(virtual);
        Path filename = locks.resolve(virtual.substring(8) + ".lock");
        FileChannel channel = FileChannel.open(filename, StandardOpenOption.CREATE, StandardOpenOption.WRITE);
        try {
            FileLock lock = channel.tryLock();
            if (lock == null) throw new StorageException("ELOCKED", "Vault is busy; draft remains saved locally");
            String token = UUID.randomUUID().toString(); leases.put(token, new Lease(channel, lock)); return token;
        } catch (OverlappingFileLockException exception) {
            channel.close(); throw new StorageException("ELOCKED", "Vault is busy; draft remains saved locally");
        } catch (IOException | RuntimeException exception) { channel.close(); throw exception; }
    }
    public synchronized void release(String token) throws IOException {
        Lease lease = leases.remove(token);
        if (lease == null) throw new StorageException("EINVAL", "Unknown vault lock");
        lease.close();
    }
    @Override public synchronized void close() throws IOException {
        IOException failure = null;
        for (Lease lease : leases.values()) try { lease.close(); } catch (IOException exception) { failure = exception; }
        leases.clear(); if (failure != null) throw failure;
    }
}
