"""Strip tags from a downloaded HTML page and write plain text next to the output path.

Usage: python3 -I html2txt.py <in_html> <out_txt>
"""

import html
import re
import sys


def main(src, dst):
    t = open(src, encoding="utf-8", errors="replace").read()
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S | re.I)
    t = re.sub(r"<(br|p|li|tr|h[1-6]|div)[^>]*>", "\n", t, flags=re.I)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n\s*\n+", "\n", t)
    open(dst, "w").write(t)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
