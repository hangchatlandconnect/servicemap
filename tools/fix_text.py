"""แก้ข้อความที่ AI สะกดผิดในภาพผัง: ปิดข้อความเดิมด้วยแผ่นสีพื้นใกล้เคียง แล้ววางข้อความใหม่ทับ

สร้าง tools/fix_text.html (ภาพต้นฉบับ + แผ่นข้อความ) → เปิดในเบราว์เซอร์ แล้วจับภาพแต่ละ section (#f1, #f2)
(เรนเดอร์ด้วยเบราว์เซอร์ สระ/วรรณยุกต์ไทยจึงวางถูกที่ ซึ่ง PIL ทำไม่ได้)
    python tools/fix_text.py 1=<ภาพชั้น1> [2=<ภาพชั้น2>]
ภาพชั้น 1 (tools/hc-floor-1-src.png): ผังที่ Likit ส่งมา รุ่น 2 (2026-11-24 มีเส้นทางหนีไฟ) ครอปหัวแดงออก ขยายกว้าง 1200 px → 1200×967
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
        (250, 86, 300, 28, "ที่จอดรถจักรยานยนต์ผู้รับบริการ", 15, "#1b1b1b", "#c4c6c5"),
        (892, 88, 150, 30, "ที่จอดรถผู้พิการ", 15, "#1b1b1b", "#c4c6c5"),
        (350, 186, 156, 26, "คอมพิวเตอร์สืบค้นข้อมูล", 14, "#1b1b1b", "#d9c39a"),
        (642, 190, 140, 38, "จุดติดต่อเจ้าหน้าที่<br>ช่วยเหลือ", 12, "#1b1b1b", "#efe3c4"),
        (784, 196, 150, 34, "จุดบริการน้ำดื่ม<br>กาแฟฟรี", 12, "#1b1b1b", "#efe3c4"),
        (952, 222, 110, 22, "ทางออกหนีไฟ", 14, "#ffffff", "#1f8a3d"),
        (1080, 158, 30, 132, "ทางลาดผู้พิการ", 15, "#1b1b1b", None, 90),
        (362, 286, 176, 24, "คอมพิวเตอร์สืบค้นข้อมูล", 14, "#1b1b1b", None),
        (556, 268, 136, 28, "ตู้กดบัตรคิวอัตโนมัติ", 14, "#1b1b1b", None),
        (616, 396, 158, 24, "ธุรการ รับ-ส่งหนังสือ", 13, "#1b1b1b", None),
        (788, 316, 172, 26, "ห้องการเงินและบัญชี", 15, "#1b1b1b", None),
        (784, 346, 178, 26, "(รับชำระค่าธรรมเนียม)", 14, "#1b1b1b", None),
        (798, 486, 244, 30, "ห้องเจ้าพนักงานที่ดินสาขา", 17, "#1b1b1b", "#c3d2db"),
        (812, 518, 86, 28, "ห้างฉัตร", 17, "#1b1b1b", "#c3d2db"),
        (450, 480, 128, 32, "ฝ่ายทะเบียน", 18, "#1b1b1b", "#dcc196"),
        (614, 480, 150, 32, "ฝ่ายอำนวยการ", 17, "#1b1b1b", "#dcc196"),
        (172, 564, 170, 28, "รับประทานอาหาร", 15, "#1b1b1b", None),
        (200, 594, 140, 30, "ถ่ายเอกสาร", 15, "#1b1b1b", None),
        (176, 856, 272, 30, "ที่จอดรถจักรยานยนต์ผู้รับบริการ", 15, "#1b1b1b", "#b9bbbb"),
        (486, 896, 284, 32, "ที่จอดรถยนต์ผู้รับบริการ", 17, "#1b1b1b", "#b0b2b2"),
        (0, 802, 124, 40, "ห้องน้ำภายนอก<br>ชาย / หญิง", 13, "#ffffff", "#2f5fa8"),
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


def main(args: list[str]) -> None:
    pages = []
    for arg in args:
        fid, src = arg.split("=", 1)
        im = Image.open(src).convert("RGB")
        buf = io.BytesIO()
        im.save(buf, "PNG")
        uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
        divs = []
        for x, y, w, h, t, size, ink, bg, *rot in PATCHES[fid]:
            bg = bg or ring_color(im, x, y, w, h)
            inner = f'<span style="transform:rotate({rot[0]}deg)">{t}</span>' if rot else t
            divs.append(f'<div style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;background:{bg};color:{ink};'
                        f'font-size:{size}px">{inner}</div>')
        pages.append(f'<section id="f{fid}" style="width:{im.width}px;height:{im.height}px;'
                     f'background-image:url({uri})">{"".join(divs)}</section>')
    html = ('<!doctype html><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@600&display=block" rel="stylesheet">'
            '<style>body{margin:0}section{position:relative;background-size:100% 100%}'
            'div{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:4px;text-align:center;'
            'font-family:Sarabun,sans-serif;font-weight:600;white-space:nowrap;line-height:1.15}span{display:block}</style>' + "".join(pages))
    (ROOT / "tools" / "fix_text.html").write_text(html, encoding="utf-8")
    print("ok")


if __name__ == "__main__":
    main(sys.argv[1:])
