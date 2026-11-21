// ใส่ URL ของ Apps Script web app (ลงท้ายด้วย /exec) — เว้นว่าง = โหมดตัวอย่าง อ่าน data/sample.json
const SCRIPT_URL = '';
const DEMO = !SCRIPT_URL;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function loadData() {
  const r = await fetch(DEMO ? 'data/sample.json' : SCRIPT_URL, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  d.qr = (d.qr || []).map(q => ({ label: q.label || '', image: driveImg(q.image) }));
  d.floors = (d.floors || []).map(f => ({ ...f, id: String(f.id), image: driveImg(f.image), steps: f.steps || [] }));
  d.spots = (d.spots || []).map(s => ({
    ...s, id: String(s.id), floor: String(s.floor), no: String(s.no ?? ''),
    left: +s.left || 0, top: +s.top || 0, width: +s.width || 0, height: +s.height || 0,
    nav: s.nav !== false, images: (s.images || []).map(driveImg)
  }));
  return d;
}

async function post(body) {
  // text/plain ไม่ทำให้เบราว์เซอร์ส่ง preflight ซึ่ง Apps Script ตอบไม่ได้
  const r = await fetch(SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d;
}

// ลิงก์แชร์ไฟล์ Google Drive → ลิงก์ภาพที่ใส่ใน <img> ได้ (ไฟล์ต้องแชร์ "ทุกคนที่มีลิงก์")
function driveImg(u) {
  const m = String(u || '').match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{20,})/);
  return m ? `https://lh3.googleusercontent.com/d/${m[1]}` : String(u || '').trim();
}

// จุดที่เป็นขั้นตอนที่ n: no = "3,6" → ขั้น 3 และ 6
const hasStep = (s, n) => s.no.split(/[,\s]+/).includes(String(n));

function toast(msg, bad) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.className = 'toast', 3500);
}
