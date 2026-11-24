/**
 * แผนผังอาคาร — ส่วนหลังบ้านบน Google Sheet (วางทั้งไฟล์นี้ใน Apps Script ของชีต)
 *
 *   GET  <exec URL>                          → ข้อมูลทั้งหมดเป็น JSON (ใครก็อ่านได้ หน้าแผนผังใช้)
 *   POST {action:'login', user, pass}        → {token}  ใช้ได้ 6 ชม.
 *   POST {action:'save', token, data}        → เขียนทับชีต ชั้น / จุดบริการ / ตั้งค่า
 *
 * รหัสผ่านผู้ดูแลไม่อยู่ในโค้ดหรือหน้าเว็บ — เก็บเฉพาะ hash ใน Script Properties (ตั้งด้วย setPassword)
 * ครั้งแรก: รัน setup() → รัน setPassword() → Deploy เป็น Web app (Execute as: Me, Who has access: Anyone)
 */

const SHEET_SETTINGS = 'ตั้งค่า';
const SHEET_FLOORS = 'ชั้น';
const SHEET_SPOTS = 'จุดบริการ';
const FLOOR_COLS = ['id', 'name', 'image', 'steps'];
const SPOT_COLS = ['id', 'floor', 'no', 'name', 'description', 'images', 'left', 'top', 'width', 'height', 'nav'];
const NUM_COLS = ['left', 'top', 'width', 'height'];
const SESSION_SECONDS = 6 * 60 * 60;
const MAX_FAILS = 5; // ผิดเกิน 5 ครั้งใน 15 นาที → ล็อก

// ---------- อ่าน ----------
function doGet() {
  return json_(readAll_());
}

function readAll_() {
  const ss = SpreadsheetApp.getActive();
  const settings = {};
  rows_(ss.getSheetByName(SHEET_SETTINGS)).forEach(r => { if (r[0]) settings[r[0]] = String(r[1]); });
  const floors = rows_(ss.getSheetByName(SHEET_FLOORS)).filter(r => r[0] !== '')
    .map(r => { const f = obj_(FLOOR_COLS, r); f.steps = lines_(f.steps); return f; });
  const spots = rows_(ss.getSheetByName(SHEET_SPOTS)).filter(r => r[0] !== '')
    .map(r => {
      const s = obj_(SPOT_COLS, r);
      s.images = lines_(s.images);
      s.no = String(s.no);
      NUM_COLS.forEach(k => s[k] = Number(s[k]) || 0);
      s.nav = !(s.nav === false || String(s.nav).toUpperCase() === 'FALSE');
      return s;
    });
  // QR: บรรทัดละ "ชื่อ|ลิงก์ภาพ"
  const qr = lines_(settings.qr).map(l => {
    const i = l.indexOf('|');
    return i < 0 ? { label: '', image: l } : { label: l.slice(0, i).trim(), image: l.slice(i + 1).trim() };
  })
    .filter(q => q.image);
  return { title: settings.title || '', subtitle: settings.subtitle || '', qr: qr, floors: floors, spots: spots };
}

function lines_(v) {
  return String(v || '').split(/\n+/).map(x => x.trim()).filter(String);
}

function rows_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
}

function obj_(cols, r) {
  const o = {};
  cols.forEach((c, i) => o[c] = r[i] instanceof Date ? r[i].toISOString() : (r[i] === undefined ? '' : r[i]));
  o.id = String(o.id);
  if ('floor' in o) o.floor = String(o.floor);
  return o;
}

// ---------- เขียน ----------
function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.action === 'login') return json_({ token: login_(b.user, b.pass) });
    if (b.action === 'save') {
      if (!validToken_(b.token)) throw new Error('หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่');
      writeAll_(b.data);
      return json_({ ok: true });
    }
    throw new Error('ไม่รู้จักคำสั่ง');
  } catch (err) {
    return json_({ error: err.message });
  }
}

function writeAll_(d) {
  if (!d || !Array.isArray(d.floors) || !Array.isArray(d.spots)) throw new Error('ข้อมูลไม่ครบ');
  if (d.floors.length > 50 || d.spots.length > 2000) throw new Error('ข้อมูลมากเกินกำหนด');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActive();
    fill_(ss.getSheetByName(SHEET_SETTINGS), ['key', 'value'],
      [['title', text_(d.title, 200)], ['subtitle', text_(d.subtitle, 200)],
       ['qr', text_((Array.isArray(d.qr) ? d.qr : []).map(q => `${q.label}|${q.image}`).join('\n'), 3000)]]);
    fill_(ss.getSheetByName(SHEET_FLOORS), FLOOR_COLS,
      d.floors.map(f => [text_(f.id, 40), text_(f.name, 100), text_(f.image, 1000),
        text_((Array.isArray(f.steps) ? f.steps : []).join('\n'), 3000)]));
    ss.getSheetByName(SHEET_SPOTS).getRange('C:C').setNumberFormat('@'); // เลขขั้นตอน "3,6" ต้องเป็นข้อความ ไม่ใช่ตัวเลข 36
    fill_(ss.getSheetByName(SHEET_SPOTS), SPOT_COLS, d.spots.map(s => [
      text_(s.id, 40), text_(s.floor, 40), text_(s.no, 20), text_(s.name, 200), text_(s.description, 5000),
      text_((Array.isArray(s.images) ? s.images : []).join('\n'), 5000),
      pct_(s.left), pct_(s.top), pct_(s.width), pct_(s.height), s.nav !== false
    ]));
  } finally {
    lock.releaseLock();
  }
}

function fill_(sh, header, rows) {
  sh.clearContents();
  sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
}

// ข้อความที่ขึ้นต้นด้วย = + - @ จะกลายเป็นสูตรในชีต → ใส่ ' นำหน้า
function text_(v, max) {
  const s = String(v == null ? '' : v).slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function pct_(v) {
  const n = Number(v);
  return isFinite(n) ? Math.round(Math.min(100, Math.max(0, n)) * 100) / 100 : 0;
}

// ---------- ล็อกอิน ----------
function login_(user, pass) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('login_fails') || 0);
  if (fails >= MAX_FAILS) throw new Error('ใส่รหัสผิดหลายครั้ง กรุณารอ 15 นาที');
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('ADMIN_HASH')) throw new Error('ยังไม่ได้ตั้งรหัสผ่าน — รัน setPassword() ใน Apps Script ก่อน');
  const ok = String(user || '').trim() === p.getProperty('ADMIN_USER') &&
    sha256_(p.getProperty('ADMIN_SALT') + String(pass || '')) === p.getProperty('ADMIN_HASH');
  if (!ok) {
    cache.put('login_fails', String(fails + 1), 15 * 60);
    Utilities.sleep(800);
    throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('tok_' + token, '1', SESSION_SECONDS);
  return token;
}

function validToken_(t) {
  return !!t && CacheService.getScriptCache().get('tok_' + t) === '1';
}

function sha256_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- รันเองใน Apps Script ----------

/** ตั้งชื่อผู้ใช้/รหัสผ่านผู้ดูแล: ใส่ค่าสองบรรทัดนี้ → กด Run → แล้วลบรหัสออกจากโค้ดทันที */
function setPassword() {
  const USER = 'admin';
  const NEW_PASSWORD = '';
  if (!NEW_PASSWORD) throw new Error('ใส่รหัสผ่านใหม่ใน NEW_PASSWORD ก่อนรัน แล้วลบออกหลังรันเสร็จ');
  const salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  PropertiesService.getScriptProperties().setProperties({
    ADMIN_USER: USER, ADMIN_SALT: salt, ADMIN_HASH: sha256_(salt + NEW_PASSWORD)
  });
  Logger.log('ตั้งค่าแล้ว: ผู้ใช้ ' + USER + ' — อย่าลืมลบรหัสผ่านออกจากโค้ด');
}

/** สร้าง 3 ชีตพร้อมข้อมูลตัวอย่าง (รันครั้งเดียวตอนเริ่ม — ถ้ามีชีตอยู่แล้วจะไม่เขียนทับ) */
function setup() {
  const ss = SpreadsheetApp.getActive();
  const made = [SHEET_SETTINGS, SHEET_FLOORS, SHEET_SPOTS].filter(n => !ss.getSheetByName(n));
  made.forEach(n => ss.insertSheet(n));
  if (made.length < 3) { Logger.log('มีชีตอยู่แล้ว — ไม่เขียนตัวอย่างทับ'); return; }
  writeAll_(SAMPLE);
  Logger.log('สร้างชีตและข้อมูลตัวอย่างแล้ว');
}

const SAMPLE = {"title": "แผนผังจุดบริการอิเล็กทรอนิกส์", "subtitle": "สำนักงานที่ดินจังหวัดลำปาง สาขาอำเภอห้างฉัตร", "qr": [{"label": "Let's Start!", "image": "assets/qr-start.jpg"}, {"label": "ประเมินความพึงพอใจ", "image": "assets/qr-survey.jpg"}], "floors": [{"id": "1", "name": "ชั้น 1", "image": "assets/hc-floor-1.jpg?v=4", "steps": ["กดรับบัตรคิวสำหรับคัดกรองเอกสาร", "คัดกรองเอกสาร/จ่ายคิวบริการ", "รับบริการตามช่องบริการ 1–4", "ชำระค่าธรรมเนียม", "สอบสวนและจดทะเบียนสิทธิและนิติกรรม", "รับเอกสารสิทธิที่ดินและสัญญากลับ", "ปรึกษา ร้องทุกข์", "สแกน QR Code ประเมินความพึงพอใจ"]}, {"id": "2", "name": "ชั้น 2 ฝ่ายอำนวยการ", "image": "assets/hc-floor-2.jpg?v=3", "steps": ["ยื่นเอกสาร/คำขอที่ได้จากฝ่ายทะเบียน", "ชี้ตำแหน่ง/นัดรังวัด", "ชำระค่าธรรมเนียม ห้องการเงินชั้น 1", "รับใบนัดรังวัด", "ช่างรังวัดออกทำการรังวัด", "ส่งเรื่องให้ฝ่ายทะเบียน", "ปรึกษา", "สแกน QR Code ประเมินความพึงพอใจ"]}], "spots": [{"id": "f1-1", "floor": "1", "no": "", "name": "ที่นั่งรอ / ส่วนบริการประชาสัมพันธ์และลงทะเบียน", "description": "นั่งรอเรียกคิวตามหมายเลข", "images": [], "left": 29.83, "top": 28.96, "width": 35.0, "height": 11.89, "nav": true}, {"id": "f1-2", "floor": "1", "no": "1", "name": "ตู้กดบัตรคิวอัตโนมัติ", "description": "กดรับบัตรคิวสำหรับคัดกรองเอกสาร", "images": [], "left": 44.17, "top": 31.85, "width": 3.33, "height": 4.34, "nav": true}, {"id": "f1-3", "floor": "1", "no": "3,6", "name": "ช่องบริการ 1–4", "description": "รับบริการตามช่องบริการ 1–4 และรับเอกสารสิทธิที่ดินและสัญญากลับ", "images": [], "left": 29.17, "top": 41.88, "width": 14.58, "height": 7.45, "nav": true}, {"id": "f1-4", "floor": "1", "no": "2", "name": "จุดคัดกรองเอกสาร / จ่ายคิว", "description": "คัดกรองเอกสารและจ่ายคิวบริการ", "images": [], "left": 43.92, "top": 41.88, "width": 5.83, "height": 7.45, "nav": true}, {"id": "f1-5", "floor": "1", "no": "", "name": "ธุรการ รับ-ส่งหนังสือ", "description": "รับ-ส่งหนังสือราชการ", "images": [], "left": 51.33, "top": 40.85, "width": 12.5, "height": 8.48, "nav": true}, {"id": "f1-6", "floor": "1", "no": "5", "name": "ฝ่ายทะเบียน", "description": "สอบสวนและจดทะเบียนสิทธิและนิติกรรม", "images": [], "left": 29.17, "top": 49.84, "width": 20.42, "height": 13.96, "nav": true}, {"id": "f1-7", "floor": "1", "no": "", "name": "ฝ่ายอำนวยการ", "description": "", "images": [], "left": 50.0, "top": 49.84, "width": 13.75, "height": 13.96, "nav": true}, {"id": "f1-8", "floor": "1", "no": "", "name": "ห้องการเงินและบัญชี", "description": "รับชำระค่าธรรมเนียม", "images": [], "left": 64.17, "top": 24.3, "width": 25.42, "height": 24.82, "nav": true}, {"id": "f1-9", "floor": "1", "no": "4", "name": "จุดชำระค่าธรรมเนียม", "description": "ชำระค่าธรรมเนียมที่เคาน์เตอร์ห้องการเงินและบัญชี", "images": [], "left": 64.47, "top": 38.88, "width": 6.2, "height": 9.19, "nav": true}, {"id": "f1-10", "floor": "1", "no": "7", "name": "ห้องเจ้าพนักงานที่ดินสาขาห้างฉัตร", "description": "ปรึกษา ร้องทุกข์", "images": [], "left": 64.17, "top": 49.64, "width": 25.42, "height": 15.51, "nav": true}, {"id": "f1-11", "floor": "1", "no": "", "name": "คอมพิวเตอร์สืบค้นข้อมูล", "description": "สืบค้นข้อมูลด้วยตนเอง", "images": [], "left": 29.17, "top": 13.44, "width": 13.75, "height": 11.38, "nav": true}, {"id": "f1-12", "floor": "1", "no": "", "name": "จุดติดต่อเจ้าหน้าที่ช่วยเหลือ", "description": "ติดต่อเจ้าหน้าที่เมื่อต้องการความช่วยเหลือ", "images": [], "left": 56.67, "top": 14.48, "width": 8.33, "height": 9.31, "nav": true}, {"id": "f1-13", "floor": "1", "no": "", "name": "จุดบริการน้ำดื่ม / กาแฟฟรี", "description": "", "images": [], "left": 65.17, "top": 13.96, "width": 13.33, "height": 9.82, "nav": true}, {"id": "f1-14", "floor": "1", "no": "", "name": "ทางออกหนีไฟ 1", "description": "ทางออกฉุกเฉิน มุ่งหน้าไปจุดรวมพล", "images": [], "left": 78.33, "top": 13.24, "width": 11.25, "height": 12.2, "nav": true}, {"id": "f1-15", "floor": "1", "no": "", "name": "ทางออกหนีไฟ 2", "description": "ทางออกฉุกเฉิน ออกไปจุดรวมพล", "images": [], "left": 47.67, "top": 13.24, "width": 8.33, "height": 6.2, "nav": true}, {"id": "f1-16", "floor": "1", "no": "", "name": "จุดรวมพล", "description": "จุดรวมพลเมื่อเกิดเหตุฉุกเฉิน", "images": [], "left": 46.25, "top": 0.0, "width": 10.83, "height": 11.38, "nav": true}, {"id": "f1-17", "floor": "1", "no": "", "name": "จุดบริการ Drive Thru", "description": "", "images": [], "left": 57.33, "top": 3.1, "width": 14.58, "height": 7.03, "nav": true}, {"id": "f1-18", "floor": "1", "no": "", "name": "ที่จอดรถผู้พิการ", "description": "", "images": [], "left": 73.33, "top": 1.03, "width": 15.0, "height": 11.38, "nav": true}, {"id": "f1-19", "floor": "1", "no": "", "name": "ทางขึ้นชั้น 2", "description": "ฝ่ายรังวัดอยู่ชั้น 2", "images": [], "left": 10.42, "top": 32.26, "width": 18.33, "height": 13.96, "nav": true}, {"id": "f1-20", "floor": "1", "no": "", "name": "ห้องพัก / ถ่ายเอกสาร", "description": "รับประทานอาหารและถ่ายเอกสาร", "images": [], "left": 10.42, "top": 46.74, "width": 18.33, "height": 18.41, "nav": true}, {"id": "f1-21", "floor": "1", "no": "", "name": "ห้องน้ำหญิง", "description": "", "images": [], "left": 10.17, "top": 66.18, "width": 13.33, "height": 8.79, "nav": true}, {"id": "f1-22", "floor": "1", "no": "", "name": "ห้องน้ำชาย", "description": "", "images": [], "left": 10.17, "top": 75.18, "width": 13.33, "height": 7.76, "nav": true}, {"id": "f1-23", "floor": "1", "no": "", "name": "ห้องน้ำภายนอก ชาย / หญิง", "description": "ห้องน้ำภายนอกอาคาร", "images": [], "left": 0.0, "top": 68.25, "width": 10.33, "height": 18.82, "nav": true}, {"id": "f1-24", "floor": "1", "no": "", "name": "ห้องน้ำผู้พิการ / เพศทางเลือก", "description": "", "images": [], "left": 65.83, "top": 84.28, "width": 9.58, "height": 14.48, "nav": true}, {"id": "f1-25", "floor": "1", "no": "", "name": "ทางลาดผู้พิการ", "description": "", "images": [], "left": 90.42, "top": 57.91, "width": 7.5, "height": 14.99, "nav": true}, {"id": "f1-26", "floor": "1", "no": "", "name": "ที่จอดรถจักรยานยนต์ผู้รับบริการ", "description": "", "images": [], "left": 19.17, "top": 3.1, "width": 27.5, "height": 8.79, "nav": true}, {"id": "f1-27", "floor": "1", "no": "", "name": "ที่จอดรถยนต์ผู้รับบริการ", "description": "", "images": [], "left": 32.08, "top": 92.04, "width": 33.33, "height": 7.96, "nav": true}, {"id": "f1-28", "floor": "1", "no": "", "name": "ห้อง Server", "description": "", "images": [], "left": 10.42, "top": 13.44, "width": 18.33, "height": 18.41, "nav": false}, {"id": "f1-29", "floor": "1", "no": "", "name": "ห้องจัดเก็บสารบบที่ดิน", "description": "", "images": [], "left": 33.33, "top": 66.18, "width": 56.67, "height": 17.58, "nav": false}, {"id": "f1-30", "floor": "1", "no": "", "name": "ที่เก็บหลักเขต", "description": "", "images": [], "left": 75.42, "top": 87.9, "width": 15.0, "height": 10.34, "nav": false}, {"id": "f2-1", "floor": "2", "no": "1,4", "name": "ส่วนบริการประชาชน / ฝ่ายรังวัด", "description": "ยื่นเอกสาร/คำขอที่ได้จากฝ่ายทะเบียน และรับใบนัดรังวัด", "images": [], "left": 38.33, "top": 28.18, "width": 30.83, "height": 33.82, "nav": true}, {"id": "f2-2", "floor": "2", "no": "2,5", "name": "เจ้าหน้าที่รังวัด", "description": "ชี้ตำแหน่ง/นัดรังวัด · ช่างรังวัดออกทำการรังวัด", "images": [], "left": 43.33, "top": 10.71, "width": 24.17, "height": 16.91, "nav": true}, {"id": "f2-3", "floor": "2", "no": "3,6", "name": "บันได (ลงชั้น 1)", "description": "ลงไปชำระค่าธรรมเนียมที่ห้องการเงินชั้น 1 · ส่งเรื่องให้ฝ่ายทะเบียน", "images": [], "left": 8.75, "top": 42.84, "width": 17.92, "height": 19.17, "nav": true}, {"id": "f2-4", "floor": "2", "no": "7", "name": "ห้องหัวหน้าฝ่ายรังวัด", "description": "ปรึกษา", "images": [], "left": 68.33, "top": 2.25, "width": 24.17, "height": 30.44, "nav": true}, {"id": "f2-5", "floor": "2", "no": "", "name": "ห้องประชุม", "description": "", "images": [], "left": 9.17, "top": 2.25, "width": 29.17, "height": 30.44, "nav": true}, {"id": "f2-6", "floor": "2", "no": "", "name": "ทางหนีไฟ", "description": "ทางหนีไฟชั้น 2", "images": [], "left": 26.67, "top": 33.26, "width": 11.25, "height": 28.75, "nav": true}, {"id": "f2-7", "floor": "2", "no": "", "name": "ห้องพัก / ห้องเก็บของฝ่ายรังวัด", "description": "", "images": [], "left": 69.17, "top": 33.26, "width": 26.67, "height": 29.31, "nav": false}, {"id": "f2-8", "floor": "2", "no": "", "name": "ห้องพัสดุฝ่ายอำนวยการ 1", "description": "", "images": [], "left": 4.17, "top": 63.13, "width": 21.25, "height": 36.08, "nav": false}, {"id": "f2-9", "floor": "2", "no": "", "name": "ห้องพัสดุฝ่ายอำนวยการ 2", "description": "", "images": [], "left": 25.42, "top": 63.13, "width": 19.33, "height": 36.08, "nav": false}, {"id": "f2-10", "floor": "2", "no": "", "name": "ห้องเก็บของฝ่ายอำนวยการ", "description": "", "images": [], "left": 45.0, "top": 63.13, "width": 24.67, "height": 36.08, "nav": false}, {"id": "f2-11", "floor": "2", "no": "", "name": "ห้องต้นร่าง", "description": "", "images": [], "left": 70.0, "top": 63.13, "width": 27.5, "height": 36.08, "nav": false}]};
// END SAMPLE (บรรทัดบนสร้างจาก tools/make_sample.py — แก้ที่ไฟล์นั้น)
