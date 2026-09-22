"""Makes the PDF a legal document is published as, out of its Markdown source.

The backend accepts a document version only as application/pdf: a PDF reads
without the network and cannot change under the people who accepted it.

    pip install fpdf2
    python content/legal/build-pdf.py

Fonts come from the app so the document looks like the app it belongs to;
point --fonts elsewhere if the mobile repo is not checked out beside this one.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from fpdf import FPDF

HERE = Path(__file__).resolve().parent
DEFAULT_FONTS = HERE.parents[2] / "vitago-rn-app" / "src" / "assets" / "fonts"

PAGE_MARGIN_MM = 20
BODY_SIZE = 10.5
LINE_HEIGHT = 5.2


def strip_inline(text: str) -> str:
    """Markdown emphasis carries nothing here: the document is read as prose."""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"`(.+?)`", r"\1", text)
    # A placeholder wrapped over a line break keeps one stray backtick, and
    # the document is read line by line.
    return text.replace("`", "").strip()


class Document(FPDF):
    def __init__(self, fonts: Path) -> None:
        super().__init__(format="A4", unit="mm")
        self.set_margins(PAGE_MARGIN_MM, PAGE_MARGIN_MM, PAGE_MARGIN_MM)
        self.set_auto_page_break(auto=True, margin=PAGE_MARGIN_MM)
        self.add_font("Inter", "", str(fonts / "Inter-Regular.ttf"))
        self.add_font("Inter", "B", str(fonts / "Inter-Bold.ttf"))
        self.add_page()

    def heading(self, text: str, size: float, space_before: float) -> None:
        if self.get_y() > PAGE_MARGIN_MM:
            self.ln(space_before)
        self.set_font("Inter", "B", size)
        self.multi_cell(0, size * 0.55, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(1.5)

    def paragraph(self, text: str) -> None:
        self.set_font("Inter", "", BODY_SIZE)
        self.multi_cell(0, LINE_HEIGHT, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(1.5)

    def bullet(self, text: str) -> None:
        self.set_font("Inter", "", BODY_SIZE)
        self.set_x(PAGE_MARGIN_MM + 5)
        self.multi_cell(0, LINE_HEIGHT, f"•  {text}", new_x="LMARGIN", new_y="NEXT")

    def table_row(self, cells: list[str], header: bool) -> None:
        self.set_font("Inter", "B" if header else "", BODY_SIZE)
        width = (self.w - 2 * PAGE_MARGIN_MM) / max(1, len(cells))
        height = LINE_HEIGHT * max(
            1,
            max(len(self.multi_cell(width, LINE_HEIGHT, cell, dry_run=True, output="LINES")) for cell in cells),
        )
        top = self.get_y()
        for index, cell in enumerate(cells):
            self.set_xy(PAGE_MARGIN_MM + index * width, top)
            self.multi_cell(width, LINE_HEIGHT, cell, border=1, new_x="RIGHT", new_y="TOP", max_line_height=LINE_HEIGHT)
        self.set_xy(PAGE_MARGIN_MM, top + height)


def render(source: Path, target: Path, fonts: Path) -> None:
    pdf = Document(fonts)
    for raw in source.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        if not line:
            continue
        if line.startswith("# "):
            pdf.heading(strip_inline(line[2:]), 17, 0)
        elif line.startswith("## "):
            pdf.heading(strip_inline(line[3:]), 12.5, 4)
        elif line.startswith("|"):
            cells = [strip_inline(cell) for cell in line.strip("|").split("|")]
            # The dashed line under a table header carries no text of its own.
            if all(set(cell) <= {"-", ":", " "} for cell in cells):
                continue
            pdf.table_row(cells, header=pdf.font_style == "B")
        elif line.startswith("- "):
            pdf.bullet(strip_inline(line[2:]))
        else:
            pdf.paragraph(strip_inline(line))
    target.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(target))
    print(f"{target.relative_to(HERE.parents[1])}  {target.stat().st_size // 1024} KB")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fonts", type=Path, default=DEFAULT_FONTS)
    parser.add_argument("--out", type=Path, default=HERE)
    arguments = parser.parse_args()

    if not (arguments.fonts / "Inter-Regular.ttf").exists():
        print(f"No Inter fonts in {arguments.fonts}; pass --fonts", file=sys.stderr)
        return 2

    for name in ("terms", "privacy"):
        render(HERE / f"{name}.md", arguments.out / f"{name}.pdf", arguments.fonts)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
