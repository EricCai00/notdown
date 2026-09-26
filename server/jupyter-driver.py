"""Private JSON/file bridge. Jupyter owns language evaluation and rich displays."""
import html
import json
import os
import queue
import re
import subprocess
import sys
import time
from jupyter_client import KernelManager
from jupyter_client.kernelspec import KernelSpecManager

language = sys.argv[1]
specs = KernelSpecManager().get_all_specs()
requested = os.environ.get("NOTDOWN_JUPYTER_" + language.upper() + "_KERNEL")
candidates = [key for key, value in specs.items() if value["spec"].get("language", "").lower() == language]
kernel = requested or (sorted(candidates)[-1] if candidates else None)
if not kernel:
    raise RuntimeError("No " + language + " Jupyter kernel. Install ipykernel for Python or IJulia for Julia in this Jupyter environment.")
if kernel not in candidates:
    raise RuntimeError("Selected kernel " + kernel + " is not an installed " + language + " kernel.")
manager = KernelManager(kernel_name=kernel)
# Override only this process's copy; leave installed kernelspecs and their arguments intact.
executable = os.environ.get("NOTDOWN_JULIA") if language == "julia" else (sys.executable if not requested else None)
if executable:
    manager.kernel_spec.argv[0] = executable
manager.start_kernel(stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
client = manager.blocking_client()
client.start_channels()
client.wait_for_ready(timeout=45)
print("NOTDOWN_READY", flush=True)
ansi = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")

def rich(data):
    if "text/html" in data:
        return data["text/html"]
    if "image/png" in data:
        return '<img src="data:image/png;base64,' + data["image/png"] + '">'
    if "image/svg+xml" in data:
        return data["image/svg+xml"]
    return "<pre>" + html.escape(data.get("text/plain", "")) + "</pre>"

def execute(code, index, inline=False):
    message = client.execute(code, store_history=not inline, allow_stdin=False, stop_on_error=True)
    parts, text, error, size = [], [], None, 0
    deadline = time.monotonic() + 55
    while time.monotonic() < deadline:
        try:
            msg = client.get_iopub_msg(timeout=1)
        except queue.Empty:
            continue
        if msg.get("parent_header", {}).get("msg_id") != message:
            continue
        content, kind = msg["content"], msg["msg_type"]
        if kind == "status" and content["execution_state"] == "idle":
            break
        if kind == "stream":
            value = ansi.sub("", content.get("text", ""))
            text.append(value)
            parts.append("<pre>" + html.escape(value) + "</pre>")
        elif kind in ("display_data", "execute_result", "update_display_data"):
            data = content.get("data", {})
            parts.append(rich(data))
            text.append(data.get("text/plain", ""))
        elif kind == "clear_output":
            parts, text = [], []
        elif kind == "error":
            error = ansi.sub("", "\n".join(content.get("traceback", []))) or content.get("evalue", "Kernel error")
        size += len(json.dumps(content))
        if size > 8 * 1024 * 1024:
            raise RuntimeError("Notebook output exceeds 8 MB")
    else:
        raise TimeoutError("Kernel exceeded 55 seconds")
    item = {"index": index, "text": "\n".join(text)} if inline else {"index": index, "html": "\n".join(parts)}
    if error:
        item["error"] = error
    return item

try:
    # IPython kernels do not otherwise select notebook figure rendering.
    if language == "python":
        execute("get_ipython().run_line_magic('matplotlib', 'inline')", -1)
    for line in sys.stdin:
        request = json.loads(line)
        try:
            outputs = []
            for cell in request["cells"]:
                item = execute(cell["code"], cell["index"], request.get("inline", False))
                outputs.append(item)
                if item.get("error") and not cell.get("continueOnError", False):
                    break
            result = {"outputs": outputs}
        except Exception as error:
            result = {"error": str(error), "outputs": []}
        with open("reply-" + str(request["id"]) + ".json", "w", encoding="utf-8") as output:
            json.dump(result, output, ensure_ascii=False)
        print("NOTDOWN_REPLY:" + str(request["id"]), flush=True)
finally:
    client.stop_channels()
    manager.shutdown_kernel(now=True)
