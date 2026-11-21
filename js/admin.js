// หน้าผู้ดูแล: ลากบนผัง = วาดจุดใหม่ · ลากจุด = ย้าย · ลากมุมทอง = ปรับขนาด · แก้ทุกอย่างในเครื่องก่อน แล้วกด "บันทึก" ครั้งเดียว
const TOKEN_KEY = 'bm_token';
const MIN = 0.8; // กรอบเล็กกว่านี้ (% ของผัง) ถือว่าเป็นการคลิก ไม่ใช่การวาด
let D, floor = null, sel = null, dirty = false, drag = null;

const token = {
  get: () => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } },
  set: v => { try { v ? sessionStorage.setItem(TOKEN_KEY, v) : sessionStorage.removeItem(TOKEN_KEY); } catch {} }
};

(function start() {
  $('#demo').hidden = !DEMO;
  if (DEMO || token.get()) return openEditor();
  $('#login').hidden = false;
  $('#lu').focus();
})();

$('#login').onsubmit = async e => {
  e.preventDefault();
  $('#lbtn').disabled = true;
  $('#lmsg').textContent = '';
  try {
    token.set((await post({ action: 'login', user: $('#lu').value, pass: $('#lp').value })).token);
    $('#lp').value = '';
    $('#login').hidden = true;
    if (D) toast('เข้าสู่ระบบแล้ว — กด "บันทึก" อีกครั้ง'); // หลุดระหว่างแก้: เก็บงานที่ค้างไว้ ไม่โหลดใหม่
    else openEditor();
  } catch (err) {
    $('#lmsg').textContent = err.message;
  } finally {
    $('#lbtn').disabled = false;
  }
};

$('#logout').onclick = () => {
  if (dirty && !confirm('ยังมีการแก้ไขที่ไม่ได้บันทึก ออกจากระบบเลยไหม?')) return;
  token.set('');
  dirty = false;
  location.reload();
};

async function openEditor() {
  $('#editor').hidden = false;
  $('#logout').hidden = DEMO;
  try {
    D = await loadData();
  } catch (e) {
    $('#plan').innerHTML = `<p class="msg">โหลดข้อมูลไม่สำเร็จ<br>${esc(e.message)}</p>`;
    return;
  }
  $('#tTitle').value = D.title || '';
  $('#tSub').value = D.subtitle || '';
  $('#tQr').value = D.qr.map(q => `${q.label}|${q.image}`).join('\n');
  if (!D.floors.length) D.floors.push({ id: '1', name: 'ชั้น 1', image: '', steps: [] });
  renderTabs();
  showFloor(D.floors[0].id);
}

// ---------- ชั้น ----------
function renderTabs() {
  $('#floors').innerHTML = D.floors.map(f =>
    `<button role="tab" data-f="${esc(f.id)}" aria-selected="${f.id === floor}">${esc(f.name || '(ไม่มีชื่อ)')}</button>`).join('');
}
$('#floors').onclick = e => { const b = e.target.closest('button'); if (b) showFloor(b.dataset.f); };

function showFloor(id) {
  floor = id;
  sel = null;
  const f = D.floors.find(x => x.id === id);
  renderTabs();
  $('#fName').value = f.name;
  $('#fImg').value = f.image;
  $('#fSteps').value = f.steps.join('\n');
  $('#plan').innerHTML = f.image
    ? `<img src="${esc(f.image)}" alt="" draggable="false"><div class="layer" id="layer"></div>`
    : '<p class="msg">ชั้นนี้ยังไม่มีภาพผัง — ใส่ลิงก์ภาพใน "ตั้งค่าชั้นนี้"</p>';
  const img = $('#plan img');
  if (img) img.onerror = () => $('#plan').innerHTML = '<p class="msg">เปิดภาพผังไม่ได้ — ตรวจลิงก์ภาพใน "ตั้งค่าชั้นนี้"</p>';
  drawSpots();
}

$('#fName').oninput = e => { floorObj().name = e.target.value; renderTabs(); changed(); };
$('#fImg').onchange = e => { floorObj().image = driveImg(e.target.value); showFloor(floor); changed(); };
$('#fAdd').onclick = () => {
  const id = 'f' + Date.now().toString(36);
  D.floors.push({ id, name: `ชั้น ${D.floors.length + 1}`, image: '', steps: [] });
  showFloor(id);
  changed();
  $('#fName').focus();
};
$('#fDel').onclick = () => {
  const n = D.spots.filter(s => s.floor === floor).length;
  if (D.floors.length === 1) return toast('ต้องมีอย่างน้อย 1 ชั้น', true);
  if (!confirm(`ลบ "${floorObj().name}"${n ? ` พร้อมจุดบริการ ${n} จุด` : ''}?`)) return;
  D.spots = D.spots.filter(s => s.floor !== floor);
  D.floors = D.floors.filter(f => f.id !== floor);
  showFloor(D.floors[0].id);
  changed();
};
$('#tTitle').oninput = e => { D.title = e.target.value; changed(); };
$('#tSub').oninput = e => { D.subtitle = e.target.value; changed(); };
$('#fSteps').oninput = e => { floorObj().steps = e.target.value.split('\n').map(x => x.trim()).filter(Boolean); changed(); };
$('#tQr').oninput = e => {
  D.qr = e.target.value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const i = l.indexOf('|');
    return i < 0 ? { label: '', image: driveImg(l) } : { label: l.slice(0, i).trim(), image: driveImg(l.slice(i + 1).trim()) };
  });
  changed();
};
const floorObj = () => D.floors.find(f => f.id === floor);

// ---------- จุด ----------
function drawSpots() {
  const here = D.spots.filter(s => s.floor === floor);
  if ($('#layer')) $('#layer').innerHTML = here.map(s =>
    `<div class="spot${s.id === sel ? ' sel' : ''}${s.nav ? '' : ' nonav'}" data-id="${esc(s.id)}"
       style="left:${s.left}%;top:${s.top}%;width:${s.width}%;height:${s.height}%">
       <span class="lbl">${s.no ? esc(s.no) + ' · ' : ''}${esc(s.name || '(ไม่มีชื่อ)')}</span>${s.id === sel ? '<span class="handle"></span>' : ''}</div>`).join('');
  $('#spotCount').textContent = `(${here.length})`;
  $('#spotList').innerHTML = here.map(s =>
    `<li><button data-id="${esc(s.id)}" class="${s.id === sel ? 'on' : ''}"><span class="dot"></span>${esc(s.name || '(ไม่มีชื่อ)')}</button></li>`).join('')
    || '<li class="none">ยังไม่มีจุด — ลากบนผังเพื่อวาด</li>';
  fillForm();
}
$('#spotList').onclick = e => { const b = e.target.closest('button[data-id]'); if (b) { sel = b.dataset.id; drawSpots(); } };

const spot = () => D.spots.find(s => s.id === sel);
const FIELDS = { sName: 'name', sNo: 'no', sDesc: 'description', sLeft: 'left', sTop: 'top', sWidth: 'width', sHeight: 'height' };

let formFor = null; // จุดที่ฟอร์มแสดงอยู่ — เปลี่ยนจุดเมื่อไร เติมทุกช่องใหม่ แม้ช่องนั้นจะโฟกัสอยู่
function fillForm() {
  const s = spot();
  $('#spotForm').hidden = !s;
  $('#noSel').hidden = !!s;
  if (!s) return (formFor = null);
  const fresh = formFor !== s.id;
  formFor = s.id;
  const keep = el => !fresh && document.activeElement === el; // ไม่เขียนทับช่องที่กำลังพิมพ์อยู่
  for (const [id, k] of Object.entries(FIELDS)) if (!keep($('#' + id))) $('#' + id).value = s[k];
  if (!keep($('#sImgs'))) $('#sImgs').value = s.images.join('\n');
  $('#sNav').checked = s.nav;
}

for (const [el, k] of Object.entries(FIELDS)) $('#' + el).oninput = e => {
  const s = spot();
  if (!s) return;
  s[k] = e.target.type === 'number' ? clamp(+e.target.value || 0, 0, 100) : e.target.value;
  drawSpots();
  changed();
};
$('#sImgs').oninput = e => { spot().images = e.target.value.split('\n').map(x => x.trim()).filter(Boolean); changed(); };
$('#sImgs').onchange = e => { const s = spot(); s.images = s.images.map(driveImg); e.target.value = s.images.join('\n'); };
$('#sNav').onchange = e => { spot().nav = e.target.checked; drawSpots(); changed(); };
$('#sDel').onclick = () => {
  if (!confirm(`ลบ "${spot().name || 'จุดนี้'}"?`)) return;
  D.spots = D.spots.filter(s => s.id !== sel);
  sel = null;
  drawSpots();
  changed();
};

// ---------- ลากบนผัง ----------
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = v => Math.round(v * 100) / 100;
function at(e) {
  const r = $('#layer').getBoundingClientRect();
  return { x: clamp((e.clientX - r.left) / r.width * 100, 0, 100), y: clamp((e.clientY - r.top) / r.height * 100, 0, 100) };
}

$('#plan').addEventListener('pointerdown', e => {
  if (!e.target.closest('#layer') || e.button !== 0) return;
  e.preventDefault();
  const p = at(e), el = e.target.closest('.spot');
  if (e.target.classList.contains('handle')) {
    drag = { mode: 'size', s: spot() };
  } else if (el) {
    sel = el.dataset.id;
    const s = spot();
    drag = { mode: 'move', s, dx: p.x - s.left, dy: p.y - s.top, moved: false };
    drawSpots();
  } else {
    drag = { mode: 'draw', x: p.x, y: p.y };
    $('#layer').insertAdjacentHTML('beforeend', '<div class="draft" id="draft"></div>');
  }
  $('#layer').setPointerCapture(e.pointerId);
});

$('#plan').addEventListener('pointermove', e => {
  if (!drag) return;
  const p = at(e), s = drag.s;
  if (drag.mode === 'move') {
    s.left = round(clamp(p.x - drag.dx, 0, 100 - s.width));
    s.top = round(clamp(p.y - drag.dy, 0, 100 - s.height));
    drag.moved = true;
  } else if (drag.mode === 'size') {
    s.width = round(clamp(p.x - s.left, MIN, 100 - s.left));
    s.height = round(clamp(p.y - s.top, MIN, 100 - s.top));
  } else {
    Object.assign($('#draft').style, box(drag, p, '%'));
    return;
  }
  const div = document.querySelector(`.spot[data-id="${CSS.escape(s.id)}"]`);
  Object.assign(div.style, { left: s.left + '%', top: s.top + '%', width: s.width + '%', height: s.height + '%' });
  fillForm();
});

$('#plan').addEventListener('pointerup', e => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.mode === 'draw') {
    const b = box(d, at(e));
    if (b.width < MIN || b.height < MIN) { sel = null; drawSpots(); return; }
    const s = { id: 's' + Date.now().toString(36), floor, no: '', name: '', description: '', images: [], nav: true,
                left: round(b.left), top: round(b.top), width: round(b.width), height: round(b.height) };
    D.spots.push(s);
    sel = s.id;
    drawSpots();
    changed();
    $('#sName').focus();
  } else if (d.mode === 'size' || d.moved) {
    drawSpots();
    changed();
  }
});

function box(a, p, unit) {
  const b = { left: Math.min(a.x, p.x), top: Math.min(a.y, p.y), width: Math.abs(p.x - a.x), height: Math.abs(p.y - a.y) };
  if (unit) for (const k in b) b[k] += unit;
  return b;
}

// ---------- บันทึก ----------
function changed() {
  dirty = true;
  $('#state').textContent = 'มีการแก้ไขที่ยังไม่บันทึก';
  $('#state').className = 'state dirty';
}
addEventListener('beforeunload', e => { if (dirty) e.preventDefault(); });

$('#save').onclick = async () => {
  const unnamed = D.spots.filter(s => !s.name.trim()).length;
  if (unnamed && !confirm(`มี ${unnamed} จุดที่ยังไม่มีชื่อ บันทึกต่อไหม?`)) return;
  const data = { title: D.title, subtitle: D.subtitle, qr: D.qr, floors: D.floors, spots: D.spots };
  if (DEMO) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    a.download = 'sample.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('ดาวน์โหลด sample.json แล้ว — วางทับ data/sample.json เพื่อใช้ในโหมดตัวอย่าง');
    return saved();
  }
  $('#save').disabled = true;
  try {
    await post({ action: 'save', token: token.get(), data });
    saved();
    toast('บันทึกลง Google Sheet แล้ว');
  } catch (err) {
    toast('บันทึกไม่สำเร็จ: ' + err.message, true);
    if (/เข้าสู่ระบบ/.test(err.message)) { token.set(''); $('#login').hidden = false; }
  } finally {
    $('#save').disabled = false;
  }
};

function saved() {
  dirty = false;
  $('#state').textContent = 'บันทึกแล้ว ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  $('#state').className = 'state';
}
