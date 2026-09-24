"""JSON batch bridge to the C library, not a replacement Markdown parser."""
import sys, json, os
sys.path.insert(0, os.environ.get('CMARKGFM_PATH', '.run/gfm-renderer'))
from cmarkgfm import github_flavored_markdown_to_html
from cmarkgfm.cmark import Options
items = json.loads(sys.stdin.buffer.read())
out = [github_flavored_markdown_to_html(s, options=Options.CMARK_OPT_UNSAFE) for s in items]
sys.stdout.buffer.write(json.dumps(out, ensure_ascii=False).encode('utf-8'))
