"""Combine Zola's native light/dark syntax themes for the manual switch."""
from pathlib import Path
import re

public = Path('public')
light = (public / 'giallo-light.css').read_text()
dark = (public / 'giallo-dark.css').read_text()
# Each generated selector is a single class. Scope all dark rules to body.dark.
dark = re.sub(r'(?m)^(\.[\w-]+)(\s*\{)', r'body.dark \1\2', dark)
(public / 'giallo.css').write_text(light + '\n' + dark)
(public / 'giallo-light.css').unlink()
(public / 'giallo-dark.css').unlink()
