// หน้าแผนผัง: เลือกชั้น · คลิกจุดบนผัง หรือเลือกจากรายการ → ปักหมุด + เปิดรายละเอียด · ลิงก์ #spot=<id> แชร์ได้
const PIN = '<svg viewBox="0 0 40 52" aria-hidden="true"><path d="M20 0C9 0 0 9 0 20c0 15 20 32 20 32s20-17 20-32C40 9 31 0 20 0z" fill="#7a2e1f"/><circle cx="20" cy="20" r="7" fill="#fff"/></svg>';
let D, floor = null, current = null, imgs = [], imgAt = 0;

(async function init() {
  $('#demo').hidden = !DEMO;
  try {
    D = await loadData();
  } catch (e) {
    $('#plan').innerHTML = `<p class="msg">โหลดข้อมูลไม่สำเร็จ<br>${esc(e.message)}</p>`;
    return;
  }
  if (D.title) { $('#title').textContent = D.title; document.title = D.title; }
  $('#subtitle').textContent = D.subtitle || '';
  if (!D.floors.length) { $('#plan').innerHTML = '<p class="msg">ยังไม่มีแผนผัง</p>'; return; }
  $('#floors').innerHTML = D.floors.map(f =>
    `<button role="tab" data-f="${esc(f.id)}" aria-selected="false">${esc(f.name)}</button>`).join('');
  $('#floors').onclick = e => { const b = e.target.closest('button'); if (b) showFloor(b.dataset.f); };
  $('#q').oninput = renderList;
  $('#qr').innerHTML = D.qr.map(q => `<figure><img src="${esc(q.image)}" alt="QR Code ${esc(q.label)}"><figcaption>${esc(q.label)}</figcaption></figure>`).join('');
  $('#steps').onclick = e => {
    const b = e.target.closest('button[data-id]');
    if (b) select(D.spots.find(s => s.id === b.dataset.id), false);
  };
  const shared = D.spots.find(s => s.id === new URLSearchParams(location.hash.slice(1)).get('spot'));
  showFloor(shared ? shared.floor : D.floors[0].id);
  if (shared) select(shared, false);
  renderList();
})();

function showFloor(id) {
  if (floor === id) return;
  floor = id;
  const f = D.floors.find(x => x.id === id);
  document.querySelectorAll('#floors button').forEach(b => b.setAttribute('aria-selected', b.dataset.f === id));
  $('#plan').innerHTML = `<img src="${esc(f.image)}" alt="แผนผัง${esc(f.name)}"><div class="layer" id="layer"></div>`;
  $('#plan img').onerror = () => $('#plan').innerHTML = `<p class="msg">เปิดภาพผัง${esc(f.name)}ไม่ได้ — ตรวจลิงก์ภาพในชีต</p>`;
  $('#layer').innerHTML = D.spots.filter(s => s.floor === id).map(s =>
    `<button class="spot" data-id="${esc(s.id)}" aria-label="${esc(s.name)}"
       style="left:${s.left}%;top:${s.top}%;width:${s.width}%;height:${s.height}%"><span class="lbl">${esc(s.name)}</span></button>`).join('');
  $('#layer').onclick = e => { const b = e.target.closest('.spot'); if (b) select(D.spots.find(s => s.id === b.dataset.id), true); };
  if (current && current.floor !== id) current = null;
  drawPin();
  renderSteps();
}

function renderList() {
  const q = $('#q').value.trim().toLowerCase();
  const hit = s => s.nav && s.name && (!q || (s.name + ' ' + (s.description || '')).toLowerCase().includes(q));
  const html = D.floors.map(f => {
    const items = D.spots.filter(s => s.floor === f.id && hit(s));
    return items.length ? `<li class="fl">${esc(f.name)}</li>` + items.map(s =>
      `<li><button data-id="${esc(s.id)}" class="${current && current.id === s.id ? 'on' : ''}">${s.no ? `<span class="num">${esc(s.no)}</span>` : '<span class="dot"></span>'}${esc(s.name)}</button></li>`).join('') : '';
  }).join('');
  $('#list').innerHTML = html || `<li class="none">${q ? 'ไม่พบจุดบริการที่ตรงกับคำค้น' : 'ยังไม่มีจุดบริการ'}</li>`;
  $('#list').onclick = e => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    const s = D.spots.find(x => x.id === b.dataset.id);
    showFloor(s.floor);
    select(s, false);
    if (matchMedia('(max-width: 860px)').matches) $('#plan').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
}

function select(s, openDetail) {
  current = s;
  history.replaceState(null, '', '#spot=' + encodeURIComponent(s.id));
  drawPin();
  renderList();
  renderSteps();
  if (openDetail) showDetail(s);
}

// ขั้นตอนของชั้นนี้ — ขั้นไหนมีจุดบนผัง (เลขตรงกับช่อง "เลขขั้นตอน" ของจุด) กดแล้วปักหมุดที่จุดนั้น
function renderSteps() {
  const f = D.floors.find(x => x.id === floor);
  $('#stepBox').hidden = !f.steps.length && !D.qr.length;
  $('#stepFloor').textContent = f.name;
  $('#steps').innerHTML = f.steps.map((t, i) => {
    const s = D.spots.find(x => x.floor === floor && hasStep(x, i + 1));
    const inner = `<span class="num">${i + 1}</span><span>${esc(t)}</span>`;
    return `<li>${s ? `<button data-id="${esc(s.id)}" class="${current && current.id === s.id ? 'on' : ''}">${inner}</button>` : `<div>${inner}</div>`}</li>`;
  }).join('');
}

function drawPin() {
  document.querySelectorAll('.spot').forEach(b => b.classList.toggle('on', !!current && b.dataset.id === current.id));
  document.querySelector('.pin')?.remove();
  if (!current || current.floor !== floor || !$('#layer')) return;
  $('#layer').insertAdjacentHTML('beforeend',
    `<div class="pin" style="left:${current.left + current.width / 2}%;top:${current.top + current.height / 2}%"><span>${esc(current.name)}</span>${PIN}</div>`);
}

function showDetail(s) {
  $('#dTitle').textContent = s.name;
  $('#dFloor').textContent = D.floors.find(f => f.id === s.floor)?.name || '';
  $('#dBody').innerHTML = s.description ? esc(s.description) : '<span class="muted">ยังไม่มีรายละเอียด</span>';
  imgs = s.images; imgAt = 0;
  $('#gallery').hidden = !imgs.length;
  showImg();
  $('#detail').showModal();
}

function showImg() {
  if (!imgs.length) return;
  $('#gImg').src = imgs[imgAt];
  $('#gImg').alt = `${$('#dTitle').textContent} ภาพที่ ${imgAt + 1}`;
  $('#gCount').textContent = `${imgAt + 1} / ${imgs.length}`;
  $('#gPrev').hidden = $('#gNext').hidden = imgs.length < 2;
}
$('#gPrev').onclick = () => { imgAt = (imgAt - 1 + imgs.length) % imgs.length; showImg(); };
$('#gNext').onclick = () => { imgAt = (imgAt + 1) % imgs.length; showImg(); };
$('#dClose').onclick = () => $('#detail').close();
$('#detail').onclick = e => { if (e.target === $('#detail')) $('#detail').close(); };
