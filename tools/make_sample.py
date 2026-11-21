"""วาดผังชั้น 1–2 (assets/hc-floor-*.svg) และสร้างจุดบริการจากรายการห้องชุดเดียวกัน → พิกัดตรงกันเสมอ
สำนักงานที่ดินจังหวัดลำปาง สาขาอำเภอห้างฉัตร — อ้างอิงผังจากภาพเดิมของสำนักงาน

ออก: assets/hc-floor-1.svg, assets/hc-floor-2.svg, data/sample.json, SAMPLE ใน apps-script/Code.gs
    python tools/make_sample.py
เลขขั้นตอนไม่ได้วาดลงภาพ — หน้าเว็บแสดงจากช่อง "เลขขั้นตอน" ของจุด จึงแก้ได้ในหน้าผู้ดูแล
"""
import json
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
W, H = 1600, 1000
VX, VY, VW, VH = -60, -90, 1720, 1160  # viewBox: เผื่อขอบรอบอาคาร
FONT = "Sarabun, 'Leelawadee UI', 'Noto Sans Thai', Tahoma, sans-serif"

# สีพื้นตามประเภทห้อง
FILL = {"service": "#eef5f0", "office": "#ffffff", "money": "#fbf3e2", "chief": "#eaf1f8", "util": "#f1f2f1",
        "wc": "#e9f2f7", "store": "#f4f1ec", "stairs": "#e7ebe8", "meet": "#f7efe9", "rest": "#f1edf6"}
INK, WALL, MUTED = "#18211c", "#2f3a34", "#5b6861"


# ---------- เครื่องมือวาด ----------
def text(x, y, s, size=30, weight=600, fill=INK, anchor="middle"):
    return (f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" '
            f'text-anchor="{anchor}">{escape(s)}</text>')


def label(x, y, w, h, lines, size=30, dy=0):
    """ชื่อห้องกึ่งกลางกล่อง (หลายบรรทัดได้)"""
    n = len(lines)
    y0 = y + h / 2 - (n - 1) * size * 0.65 + size * 0.35 + dy
    return "".join(text(x + w / 2, y0 + i * size * 1.3, s, size if i == 0 else size * 0.75,
                        600 if i == 0 else 400, INK if i == 0 else MUTED) for i, s in enumerate(lines))


def seats(x, y, cols, rows, gap=34):
    return "".join(f'<rect x="{x + c * gap}" y="{y + r * 44}" width="24" height="24" rx="6" fill="#9fb8a8"/>'
                   for r in range(rows) for c in range(cols))


def desk(x, y, w=70, h=34, chair="below"):
    cy = y + h + 6 if chair == "below" else y - 24
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3" fill="#d9c7a8" stroke="#a88f68" stroke-width="2"/>'
            f'<circle cx="{x + w / 2}" cy="{cy + 9}" r="10" fill="#6d7d74"/>')


def stairs(x, y, w, h, steps=9):
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#dfe5e1"/>']
    out += [f'<line x1="{x}" y1="{y + i * h / steps}" x2="{x + w}" y2="{y + i * h / steps}" stroke="#9aa7a0" stroke-width="3"/>'
            for i in range(1, steps)]
    out.append(f'<path d="M{x + w / 2} {y + h - 14} V{y + 18} m-14 16 l14 -16 l14 16" stroke="{WALL}" stroke-width="4" fill="none"/>')
    return "".join(out)


def table(x, y, w, h, chairs=4):
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="#c9b48f" stroke="#a88f68" stroke-width="2"/>']
    for i in range(chairs):
        cx = x + (i + 0.5) * w / chairs
        out += [f'<circle cx="{cx}" cy="{y - 14}" r="10" fill="#6d7d74"/>', f'<circle cx="{cx}" cy="{y + h + 14}" r="10" fill="#6d7d74"/>']
    return "".join(out)


def shelves(x, y, w, h, n=3):
    return "".join(f'<rect x="{x}" y="{y + i * (h / n)}" width="{w}" height="{h / n - 12}" fill="#cdbfa6" stroke="#a88f68" stroke-width="2"/>'
                   for i in range(n))


def arrow(x, y, d, s="", color="#c79a2b"):
    """ลูกศรทางเข้า/ออก d = up/down/left/right"""
    vec = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}[d]
    x2, y2 = x + vec[0] * 60, y + vec[1] * 60
    px, py = -vec[1] * 14, vec[0] * 14
    head = f"M{x2 - vec[0] * 18 + px} {y2 - vec[1] * 18 + py} L{x2} {y2} L{x2 - vec[0] * 18 - px} {y2 - vec[1] * 18 - py}"
    out = f'<path d="M{x} {y} L{x2} {y2} {head}" stroke="{color}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
    return out + (text(x + vec[0] * 30, y + (vec[1] * 30) + (40 if d in ("up", "left", "right") else -16), s, 22, 600, "#7a5a10") if s else "")


def exit_sign(x, y, s="ทางหนีไฟ"):
    return (f'<rect x="{x}" y="{y}" width="150" height="40" rx="4" fill="#1e7b45"/>'
            + text(x + 75, y + 28, "➜ " + s, 21, 600, "#fff"))


# ---------- ชั้น ----------
# ห้อง: (ประเภท, [ชื่อ, บรรทัดรอง...], x, y, w, h, จุด) — จุด = (เลขขั้นตอน, ชื่อจุด, คำอธิบาย, แสดงในรายการ) หรือ None
# พื้นที่ย่อย (ไม่วาดผนัง แค่เป็นจุดบนผัง): ("zone", ...)
FLOORS = {
    "1": {
        "name": "ชั้น 1",
        "steps": ["กดรับบัตรคิวสำหรับคัดกรองเอกสาร", "คัดกรองเอกสาร/จ่ายคิวบริการ", "รับบริการตามช่องบริการ 1–4",
                  "ชำระค่าธรรมเนียม", "สอบสวนและจดทะเบียนสิทธิและนิติกรรม", "รับเอกสารสิทธิที่ดินและสัญญากลับ",
                  "ปรึกษา ร้องทุกข์", "สแกน QR Code ประเมินความพึงพอใจ"],
        "rooms": [
            ("util", ["ห้อง Server"], 60, 60, 300, 200, ("", "ห้อง Server", "", False)),
            ("stairs", ["ทางขึ้นชั้น 2"], 60, 260, 300, 170, ("", "ทางขึ้นชั้น 2", "ฝ่ายรังวัดอยู่ชั้น 2", True)),
            ("rest", ["ห้องพัก", "รับประทานอาหาร · ถ่ายเอกสาร"], 60, 430, 300, 220,
             ("", "ห้องพัก / ถ่ายเอกสาร", "รับประทานอาหารและถ่ายเอกสาร", True)),
            ("wc", ["ห้องน้ำหญิง"], 60, 650, 150, 290, ("", "ห้องน้ำหญิง", "", True)),
            ("wc", ["ห้องน้ำชาย"], 210, 650, 150, 290, ("", "ห้องน้ำชาย", "", True)),
            ("service", [], 360, 60, 740, 640, None),
            ("service", ["น้ำดื่ม / กาแฟฟรี"], 1100, 60, 440, 140, ("", "จุดบริการน้ำดื่ม / กาแฟฟรี", "", True)),
            ("money", ["ห้องการเงินและบัญชี", "รับชำระค่าธรรมเนียม"], 1100, 200, 440, 250,
             ("4", "ห้องการเงินและบัญชี", "ชำระค่าธรรมเนียม", True)),
            ("chief", ["ห้องเจ้าพนักงานที่ดิน", "สาขาห้างฉัตร"], 1100, 450, 440, 250,
             ("7", "ห้องเจ้าพนักงานที่ดินสาขาห้างฉัตร", "ปรึกษา ร้องทุกข์", True)),
            ("store", ["ห้องจัดเก็บสารบบที่ดิน"], 360, 700, 1180, 240, ("", "ห้องจัดเก็บสารบบที่ดิน", "", False)),
            ("zone", [], 400, 92, 150, 110, ("1", "ตู้กดบัตรคิวอัตโนมัติ", "กดรับบัตรคิวสำหรับคัดกรองเอกสาร", True)),
            ("zone", [], 820, 360, 240, 110, ("2", "จุดคัดกรองเอกสาร / จ่ายคิว", "คัดกรองเอกสารและจ่ายคิวบริการ", True)),
            ("zone", [], 390, 360, 410, 110, ("3,6", "ช่องบริการ 1–4 ฝ่ายทะเบียน",
                                              "รับบริการตามช่องบริการ 1–4 และรับเอกสารสิทธิที่ดินและสัญญากลับ", True)),
            ("zone", [], 390, 500, 410, 180, ("5", "ฝ่ายทะเบียน", "สอบสวนและจดทะเบียนสิทธิและนิติกรรม", True)),
            ("zone", [], 820, 500, 260, 180, ("", "ฝ่ายอำนวยการ / ธุรการ รับ-ส่งหนังสือ", "รับ-ส่งหนังสือราชการ", True)),
            ("zone", [], 580, 92, 500, 250, ("", "ที่นั่งรอรับบริการ", "รอเรียกคิวตามหมายเลขบนจอ", True)),
        ],
        "extra": lambda: "".join([
            # ตู้คิว
            '<rect x="440" y="110" width="70" height="80" rx="8" fill="#1a7547"/><rect x="452" y="122" width="46" height="30" rx="3" fill="#cfe0d5"/>',
            text(475, 230 - 22, "ตู้กดบัตรคิว", 20, 500, MUTED),
            # ที่นั่งรอ
            seats(600, 120, 14, 4, 33),
            text(830, 330, "ที่นั่งรอรับบริการ", 22, 500, MUTED),
            # ช่องบริการ 1–4
            "".join(desk(400 + i * 100, 380, 84, 36, "below") + text(442 + i * 100, 405, str(i + 1), 22, 700, "#5a430c")
                    for i in range(4)),
            text(595, 460, "ช่องบริการ 1–4", 22, 600, INK),
            # คัดกรอง
            desk(880, 380, 120, 36, "below"), text(940, 460, "คัดกรองเอกสาร / จ่ายคิว", 21, 600, INK),
            # ฝ่ายทะเบียน
            "".join(desk(410 + c * 130, 520 + r * 80, 90, 32) for r in range(2) for c in range(3)),
            text(595, 690, "ฝ่ายทะเบียน", 24, 600, INK),
            # ฝ่ายอำนวยการ
            "".join(desk(840 + c * 115, 520 + r * 80, 85, 32) for r in range(2) for c in range(2)),
            text(950, 690, "ฝ่ายอำนวยการ · ธุรการ", 22, 600, INK),
            # ห้องอื่น
            stairs(90, 335, 240, 85, 5),
            table(110, 575, 200, 44, 4),
            desk(1180, 300, 90, 36), desk(1320, 300, 90, 36), '<rect x="1180" y="390" width="260" height="30" rx="3" fill="#d9c7a8"/>',
            table(1250, 600, 160, 56, 2),
            shelves(400, 790, 1100, 140, 3),
            '<rect x="1140" y="150" width="230" height="28" rx="4" fill="#d9c7a8"/><circle cx="1420" cy="164" r="16" fill="#9fb8a8"/>',
            '<rect x="80" y="130" width="55" height="110" rx="4" fill="#cfd6d2" stroke="#9aa7a0" stroke-width="2"/>',
            # ประตู ทางเข้าออก
        ]),
        "doors": [(1100, 120, 60, "v"), (1100, 300, 80, "v"), (1100, 560, 80, "v"),
                  (360, 320, 70, "v"), (360, 520, 80, "v"), (100, 650, 70, "h"), (250, 650, 70, "h"), (900, 700, 120, "h")],
        "entrances": [(500, 60, "down", "ทางเข้า"), (1540, 120, "right", "ทางออก")],
    },
    "2": {
        "name": "ชั้น 2 ฝ่ายรังวัด",
        "steps": ["ยื่นเอกสาร/คำขอที่ได้จากฝ่ายทะเบียน", "ชี้ตำแหน่ง/นัดรังวัด", "ชำระค่าธรรมเนียม ห้องการเงินชั้น 1",
                  "รับใบนัดรังวัด", "ช่างรังวัดออกทำการรังวัด", "ส่งเรื่องให้ฝ่ายทะเบียน", "ปรึกษา",
                  "สแกน QR Code ประเมินความพึงพอใจ"],
        "rooms": [
            ("meet", ["ห้องประชุม"], 60, 60, 500, 330, ("", "ห้องประชุม", "", True)),
            ("stairs", ["บันได"], 60, 390, 500, 250, ("3,6", "บันได (ลงชั้น 1)",
                                                      "ลงไปชำระค่าธรรมเนียมที่ห้องการเงินชั้น 1 · ส่งเรื่องให้ฝ่ายทะเบียน", True)),
            ("service", [], 560, 60, 520, 580, None),
            ("chief", ["ห้องหัวหน้าฝ่ายรังวัด"], 1080, 60, 460, 330, ("7", "ห้องหัวหน้าฝ่ายรังวัด", "ปรึกษา", True)),
            ("rest", ["ห้องพัก", "รับประทานอาหาร"], 1080, 390, 460, 250, ("", "ห้องพัก", "รับประทานอาหาร", False)),
            ("store", ["ห้องพัสดุ"], 60, 640, 350, 300, ("", "ห้องพัสดุ 1", "", False)),
            ("store", ["ห้องพัสดุ"], 410, 640, 350, 300, ("", "ห้องพัสดุ 2", "", False)),
            ("store", ["ห้องเก็บของ"], 760, 640, 380, 300, ("", "ห้องเก็บของ", "", False)),
            ("util", ["ห้องต้นร่าง"], 1140, 640, 400, 300, ("", "ห้องต้นร่าง", "", False)),
            ("zone", [], 590, 90, 460, 200, ("2,5", "เจ้าหน้าที่รังวัด", "ชี้ตำแหน่ง/นัดรังวัด · ช่างรังวัดออกทำการรังวัด", True)),
            ("zone", [], 590, 330, 460, 290, ("1,4", "ส่วนบริการประชาชน / ฝ่ายรังวัด",
                                              "ยื่นเอกสาร/คำขอที่ได้จากฝ่ายทะเบียน และรับใบนัดรังวัด", True)),
        ],
        "extra": lambda: "".join([
            "".join(desk(640 + c * 140, 130, 100, 40) for c in range(3)),
            text(820, 250, "เจ้าหน้าที่รังวัด", 24, 600, INK),
            '<rect x="680" y="430" width="280" height="44" rx="4" fill="#d9c7a8" stroke="#a88f68" stroke-width="2"/>',
            "".join(f'<circle cx="{720 + i * 100}" cy="{500}" r="11" fill="#9fb8a8"/>' for i in range(3)),
            text(820, 400, "ส่วนบริการประชาชน / ฝ่ายรังวัด", 26, 600, "#12603a"),
            text(820, 560, "ยื่นคำขอ · รับใบนัดรังวัด", 22, 500, MUTED),
            table(170, 170, 280, 70, 5),
            stairs(380, 420, 150, 200, 9), exit_sign(100, 560, "ทางหนีไฟ"),
            desk(1230, 170, 160, 50, "below"), '<rect x="1460" y="200" width="50" height="150" rx="4" fill="#cfd6d2"/>',
            '<rect x="1410" y="420" width="100" height="120" rx="4" fill="#cfd6d2"/>', table(1150, 520, 160, 50, 2),
            shelves(90, 740, 290, 180, 3), shelves(440, 740, 290, 180, 3), shelves(790, 740, 320, 180, 3),
            '<rect x="1170" y="740" width="340" height="170" rx="4" fill="#e6e9e7" stroke="#9aa7a0" stroke-width="2"/>',
            text(1340, 835, "โต๊ะเขียนแบบ", 22, 500, MUTED),
        ]),
        "doors": [(560, 160, 80, "v"), (560, 470, 80, "v"), (1080, 160, 80, "v"), (1080, 470, 80, "v"),
                  (180, 640, 90, "h"), (530, 640, 90, "h"), (900, 640, 90, "h"), (1290, 640, 90, "h")],
        "entrances": [],
    },
}

QR = [  # ครอปจากภาพผังเดิม — ความละเอียดต่ำ ควรแทนด้วยภาพ QR ต้นฉบับ
    {"label": "Let's Start!", "image": "assets/qr-start.jpg"},
    {"label": "ประเมินความพึงพอใจ", "image": "assets/qr-survey.jpg"},
]


def draw(fid: str, f: dict) -> str:
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VX} {VY} {VW} {VH}" font-family="{FONT}">',
           f'<rect x="{VX}" y="{VY}" width="{VW}" height="{VH}" fill="#f5f7f5"/>']
    for kind, lines, x, y, w, h, _ in f["rooms"]:
        if kind == "zone":
            continue
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{FILL[kind]}" stroke="{WALL}" stroke-width="6"/>')
    out.append(f["extra"]())
    for kind, lines, x, y, w, h, _ in f["rooms"]:
        if kind != "zone" and lines:
            big = kind not in ("wc",) and w > 200
            dy = -h / 2 + 50 if kind in ("stairs", "rest", "meet", "store", "money", "chief", "util") and h > 160 else 0
            if kind == "stairs" and fid == "2":
                dy, x, w = -h / 2 + 60, x, 280  # ป้ายชิดซ้าย ไม่ทับขั้นบันได
            if kind == "wc":
                dy = -60
            out.append(label(x, y, w, h, lines, 30 if big else 26, dy))
    # ประตู = ช่องเปิดผนังสีพื้น
    for x, y, l, o in f["doors"]:
        out.append(f'<rect x="{x}" y="{y - 5}" width="{l}" height="10" fill="#fff"/>' if o == "h"
                   else f'<rect x="{x - 5}" y="{y}" width="10" height="{l}" fill="#fff"/>')
    out.append(f'<rect x="60" y="60" width="1480" height="880" fill="none" stroke="{WALL}" stroke-width="12"/>')
    for x, y, d, s in f["entrances"]:
        if d == "down":  # ประตูบนผนังด้านบน ลูกศรชี้เข้าอาคาร ป้ายอยู่นอกอาคาร
            out.append(f'<rect x="{x}" y="{y - 8}" width="120" height="16" fill="#f5f7f5"/>')
            out.append(arrow(x + 60, y - 70, "down") + text(x + 60, y - 78, s, 24, 700, "#7a5a10"))
        else:  # ประตูบนผนังด้านขวา
            out.append(f'<rect x="{x - 8}" y="{y}" width="16" height="80" fill="#f5f7f5"/>')
            out.append(arrow(x + 14, y + 40, "right") + text(x + 60, y + 105, s, 24, 700, "#7a5a10"))
    out.append(text(800, H + 50, f"แผนผัง{f['name']} · สำนักงานที่ดินจังหวัดลำปาง สาขาอำเภอห้างฉัตร", 22, 500, MUTED))
    out.append("</svg>")
    return "\n".join(out)


def main() -> None:
    data = {"title": "แผนผังจุดบริการอิเล็กทรอนิกส์",
            "subtitle": "สำนักงานที่ดินจังหวัดลำปาง สาขาอำเภอห้างฉัตร", "qr": QR, "floors": [], "spots": []}
    for fid, f in FLOORS.items():
        img = f"assets/hc-floor-{fid}.svg"
        (ROOT / img).write_text(draw(fid, f), encoding="utf-8")
        data["floors"].append({"id": fid, "name": f["name"], "image": img, "steps": f["steps"]})
        n = 0
        for kind, lines, x, y, w, h, spot in f["rooms"]:
            if not spot:
                continue
            n += 1
            no, name, desc, nav = spot
            data["spots"].append({"id": f"f{fid}-{n}", "floor": fid, "no": no, "name": name, "description": desc,
                                  "images": [], "left": round((x - VX) / VW * 100, 2), "top": round((y - VY) / VH * 100, 2),
                                  "width": round(w / VW * 100, 2), "height": round(h / VH * 100, 2), "nav": nav})
    (ROOT / "data" / "sample.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    gs = ROOT / "apps-script" / "Code.gs"
    src = gs.read_text(encoding="utf-8")
    start, end = src.index("const SAMPLE = "), src.index("// END SAMPLE")
    gs.write_text(src[:start] + "const SAMPLE = " + json.dumps(data, ensure_ascii=False) + ";\n" + src[end:], encoding="utf-8")
    print("ok:", len(data["floors"]), "floors,", len(data["spots"]), "spots")


if __name__ == "__main__":
    main()
