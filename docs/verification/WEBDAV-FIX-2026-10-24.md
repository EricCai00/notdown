<a id="坚果云连接失败修复验证2026-10-24"></a>

# Nutstore connection failure fix validation (2026-10-24)

**English** · [简体中文](WEBDAV-FIX-2026-10-24.zh-CN.md)

<a id="问题与修复"></a>

## Issues and fixes

The local backend log shows that MKCOL of login detection returns 400, which is subsequently falsely reported as `Local file operation failed` by general exception handling. Reproduce using the application credentials provided by the user, Nut Cloud responds as `sandbox name is too long`: The old detected directory name consists of a long prefix and complete UUID, exceeding the top-level directory name limit.

The real service is also:GET ofETag No double quotation; top-level directories cannot passWebDAV Delete; for existing directoriesMKCOL Still coming back201；PUT Ignore`If-None-Match: *`The first is that the verification of the behavior of the user is not covered by the authentication of the user's own simulation service.

- Change the detection directory to `Notdown-checks/nd-<24 hex>`; keep the empty parent directory and only clean up this random subdirectory.
- Unquoted version tags consisting of restricted characters are allowed, passed in `If-Match` as is; weak ETag is still rejected, and false, valid, and expired versions are validated.
- Explicitly check the directory before creating the vault, and check the existing index before initializing the index to avoid using Nut Cloud's 201 as proof of exclusive creation of the directory.
- The HTTP layer retains the WebDAV error message, status, and current limit recovery time to avoid false reports of local file operation failures.

<a id="验证结果"></a>

## Verification results

| Check | result | local evidence |
| --- | --- | --- |
| `npm test` | 978 items: 973 passed, 5 skipped, 0 failed; contains 12 items WebDAV test | `.run/logs/webdav-fix-unit.log` |
| `npm run test:sync` | TypeScript, independent desktop and mobile construction passed; Supabase, WebDAV two cross-end browser processes passed | `.run/logs/webdav-fix-browser.log` |
| Real nut cloud connection detection | Authentication, read-write, original ETag update passed; error and expired If-Match are returned to 412; subdirectory cleaning returns 204 | `.run/logs/webdav-fix-live-probe.log` |
| Real Nut Cloud temporary vault | Creation, compression submission, index upload and reading, expired version rejection, binary attachment round trip, and existing vault initialization protection all passed; temporary vault cleanup returned 204 | `.run/logs/webdav-fix-live-roundtrip.log` |
| local service | Use the existing startup script to restart the backend. The 4317 page and agent are ready, and the original vault path is retained. | `.run/logs/`Corresponding startup log in |

The browser uses standalone Chrome with a temporary local vault. The real service test only uploads the temporary data generated this time, and does not enable or upload the user's local vault; the credentials are not written into the source code or test logs.

<a id="边界与残留"></a>

## Boundaries and residues

- Real service testing does not represent Android real machine, cross-network or backend synchronization acceptance, nor does it measure service speed.
- The behavior of MKCOL and If-None-Match in Nut Cloud makes concurrent first initialization of the same directory lack the atomic exclusive guarantee. Created for the first time only on one device, other devices subsequently connect to the existing vault. Existing index updates continue to use verified If-Match.
- The two top-level directory detections in the early stages of troubleshooting each left a random test directory starting with `nd-` and `condition.txt`. Nut Cloud refuses WebDAV to delete the top-level directory, which needs to be deleted on the Nut Cloud web page or client. The final repaired detection subdirectory and temporary vault have been cleaned up; the fixed empty `Notdown-checks` parent directory is retained for subsequent detection.

For configuration and troubleshooting, see [ Nut Cloud WebDAV synchronization ](../features/WEBDAV-SYNC.md).
