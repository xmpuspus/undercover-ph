"""Print visible text lines from a saved HTML page that match a pattern. Usage: python -I html_text.py HTML REGEX"""
import re
import sys
from html.parser import HTMLParser


class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self.skip += 1
        if tag in ("p", "br", "li", "h1", "h2", "h3", "h4", "div", "tr"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


p = Text()
p.feed(open(sys.argv[1], encoding="utf-8", errors="replace").read())
pat = re.compile(sys.argv[2], re.I)
lines = [re.sub(r"\s+", " ", x).strip() for x in "".join(p.parts).split("\n")]
for i, line in enumerate(lines):
    if line and pat.search(line):
        print(i, line[:400])
