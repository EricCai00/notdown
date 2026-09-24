"""Thin stdin/HTML bridge to GitHub's C implementation via the cmarkgfm binding."""
import sys
from importlib.metadata import version

# Only the server's trusted installation configuration supplies this argument.
if sys.argv[1]:
    sys.path.insert(0, sys.argv[1])
from cmarkgfm import github_flavored_markdown_to_html
from cmarkgfm.cmark import Options

if '--version' in sys.argv:
    print('cmark-gfm (cmarkgfm binding ' + version('cmarkgfm') + ')')
else:
    source = sys.stdin.buffer.read().decode('utf-8')
    html = github_flavored_markdown_to_html(source, options=Options.CMARK_OPT_UNSAFE)
    sys.stdout.buffer.write(html.encode('utf-8'))
