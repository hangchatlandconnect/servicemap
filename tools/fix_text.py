"""แก้ข้อความที่ AI สะกดผิดในภาพผัง: ปิดข้อความเดิมด้วยแผ่นสีพื้นใกล้เคียง แล้ววางข้อความใหม่ทับ

สร้าง tools/fix_text.html (ภาพต้นฉบับ + แผ่นข้อความ) → เปิดในเบราว์เซอร์ แล้วจับภาพแต่ละ section (#f1, #f2)
(เรนเดอร์ด้วยเบราว์เซอร์ สระ/วรรณยุกต์ไทยจึงวางถูกที่ ซึ่ง PIL ทำไม่ได้)
    python tools/fix_text.py 1=<ภาพชั้น1> [2=<ภาพชั้น2>]
ภาพชั้น 1 รุ่น 2026-11-24: ผังที่ Likit ส่งมา (มีรอบอาคาร) ครอปหัวแดงออก ขยายกว้าง 1200 px → 1200×951
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
        (560, 62, 128, 36, "จุดรวมพล", 18, "#1b1b1b", "#e4e4e2"),
        (884, 82, 146, 28, "ที่จอดรถผู้พิการ", 16, "#1b1b1b", None),
        (348, 176, 156, 22, "คอมพิวเตอร์สืบค้นข้อมูล", 14, "#1b1b1b", "#d9c39a"),
        (630, 174, 128, 34, "จุดติดต่อเจ้าหน้าที่<br>ช่วยเหลือ", 12, "#1b1b1b", "#e9dcbc"),
        (760, 186, 164, 28, "จุดบริการน้ำดื่ม/กาแฟฟรี", 13, "#1b1b1b", "#eadfc2"),
        (957, 197, 104, 21, "ทางออกหนีไฟ", 14, "#ffffff", "#1f8a3d"),
        (1066, 148, 26, 140, "ทางลาดผู้พิการ", 15, "#1b1b1b", None, 90),
        (1090, 238, 86, 22, "Drive Thru", 14, "#ffffff", "#c8202a"),
        (362, 274, 172, 20, "ส่วนบริการประชาสัมพันธ์และลงทะเบียน", 11, "#1b1b1b", None),
        (556, 266, 128, 26, "ตู้กดบัตรคิวอัตโนมัติ", 14, "#1b1b1b", None),
        (170, 336, 118, 40, "ทางขึ้นชั้น 2", 19, "#1b1b1b", None),
        (616, 386, 130, 22, "ธุรการ รับ-ส่งหนังสือ", 13, "#1b1b1b", None),
        (772, 315, 150, 22, "ห้องการเงินและบัญชี", 14, "#1b1b1b", None),
        (772, 340, 160, 22, "(รับชำระค่าธรรมเนียม)", 13, "#1b1b1b", None),
        (186, 508, 84, 28, "ห้องพัก", 19, "#1b1b1b", None),
        (170, 536, 146, 30, "รับประทานอาหาร", 15, "#1b1b1b", None),
        (170, 568, 146, 34, "ถ่ายเอกสาร", 15, "#1b1b1b", None),
        (418, 36, 112, 18, "ที่จอดรถจักรยานยนต์", 10, "#1b1b1b", "#ffffff"),
        (4, 758, 150, 40, "ห้องน้ำภายนอก<br>ชาย / หญิง", 13, "#ffffff", "#2f5fa8"),
        (760, 822, 160, 22, "ห้องน้ำผู้พิการ / เพศทางเลือก", 12, "#ffffff", "#1f4fb0"),
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
