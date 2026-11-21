"""แก้ข้อความที่ AI สะกดผิดในภาพผัง: ปิดข้อความเดิมด้วยแผ่นสีพื้นใกล้เคียง แล้ววางข้อความใหม่ทับ

สร้าง tools/fix_text.html (ภาพต้นฉบับ + แผ่นข้อความ) → เปิดในเบราว์เซอร์ที่ขนาด 1200×896 แล้วจับภาพ
(เรนเดอร์ด้วยเบราว์เซอร์ สระ/วรรณยุกต์ไทยจึงวางถูกที่ ซึ่ง PIL ทำไม่ได้)
    python tools/fix_text.py <ภาพชั้น1> <ภาพชั้น2>
"""
import base64
import io
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

# (x, y, w, h, ข้อความใหม่, ขนาดตัวอักษร px, สีตัวอักษร, สีพื้น หรือ None = สุ่มจากขอบรอบกล่อง)
PATCHES = {
    "1": [
        (291, 89, 194, 27, "คอมพิวเตอร์สืบค้นข้อมูล", 19, "#1b1b1b", "#d4bd93"),
        (548, 196, 172, 42, "ตู้กดบัตรคิวอัตโนมัติ", 21, "#1b1b1b", None),
        (306, 219, 212, 22, "ส่วนบริการประชาสัมพันธ์และลงทะเบียน", 14, "#1b1b1b", None),
        (100, 612, 140, 32, "ถ่ายเอกสาร", 22, "#1b1b1b", None),
    ],
    "2": [
        (226, 334, 80, 28, "ทางหนีไฟ", 16, "#ffffff", "#c8202a"),
        (328, 449, 50, 19, "ทางหนีไฟ", 11, "#ffffff", "#1f8a3d"),
    ],
}


def ring_color(im: Image.Image, x, y, w, h, pad=4) -> str:
    """สีเฉลี่ยของแถบรอบกล่อง (พื้นหลังรอบข้อความเดิม)"""
    px = []
    for xx in range(x - pad, x + w + pad):
        for yy in (y - pad, y + h + pad):
            px.append(im.getpixel((xx, yy)))
    for yy in range(y - pad, y + h + pad):
        for xx in (x - pad, x + w + pad):
            px.append(im.getpixel((xx, yy)))
    r, g, b = (sorted(c[i] for c in px)[len(px) // 2] for i in range(3))  # median กันจุดสีแปลก
    return f"#{r:02x}{g:02x}{b:02x}"


def main(src1: str, src2: str) -> None:
    pages = []
    for fid, src in (("1", src1), ("2", src2)):
        im = Image.open(src).convert("RGB")
        buf = io.BytesIO()
        im.save(buf, "PNG")
        uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
        divs = []
        for x, y, w, h, t, size, ink, bg in PATCHES[fid]:
            bg = bg or ring_color(im, x, y, w, h)
            divs.append(f'<div style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;background:{bg};color:{ink};'
                        f'font-size:{size}px">{t}</div>')
        pages.append(f'<section id="f{fid}" style="background-image:url({uri})">{"".join(divs)}</section>')
    html = ('<!doctype html><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@600&display=block" rel="stylesheet">'
            '<style>body{margin:0}section{position:relative;width:1200px;height:896px;background-size:1200px 896px}'
            'div{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:4px;'
            'font-family:Sarabun,sans-serif;font-weight:600;white-space:nowrap;line-height:1}</style>' + "".join(pages))
    (ROOT / "tools" / "fix_text.html").write_text(html, encoding="utf-8")
    print("ok")


if __name__ == "__main__":
    main(*sys.argv[1:3])
