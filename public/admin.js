const loginForm = document.querySelector('#login-form');
const passwordInput = document.querySelector('#password');
const statusBox = document.querySelector('#status');
const dashboard = document.querySelector('#dashboard');
let adminPassword = '';
let loadedRows = [];
const selected = new Set();
const deleteBtn = document.querySelector('#delete-selected');
const selectAll = document.querySelector('#select-all');
function syncSelection() {
  deleteBtn.textContent = `🗑 ลบที่เลือก (${selected.size})`;
  deleteBtn.disabled = !selected.size;
  selectAll.checked = loadedRows.length > 0 && selected.size === loadedRows.length;
  selectAll.indeterminate = selected.size > 0 && selected.size < loadedRows.length;
  document.querySelectorAll('#rows tr').forEach(tr => tr.classList.toggle('picked', selected.has(Number(tr.dataset.id))));
}
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function renderRounds(registrations) {
  const box = document.querySelector('#rounds');
  try {
    const info = await (await fetch('/api/rounds')).json();
    const max = info.max_per_round;
    const perRound = new Map(info.rounds.map(r => [r.name, []]));
    for (const row of [...registrations].reverse()) { // เรียงจากคนที่สมัครก่อน
      if (perRound.has(row.play_round)) perRound.get(row.play_round).push(row);
    }
    box.innerHTML = info.rounds.map(r => {
      const people = perRound.get(r.name);
      const full = people.length >= max;
      return `<div class="round-card ${full ? 'full' : 'open'}"><h3>${escapeHTML(r.name)}</h3>
        <span class="badge ${full ? 'full' : 'open'}">${full ? 'เต็มแล้ว' : `ว่าง · เหลือ ${max - people.length} ที่นั่ง`}</span>
        <div class="num">${people.length} / ${max} คน</div>
        <details class="team ${full ? 'teamfull' : ''}"><summary><span>ดูรายชื่อ</span><span>${people.length} คน</span></summary>
          <ol class="members">${people.map(p => `<li><b>${escapeHTML(p.full_name)}</b>${p.nickname ? ` (${escapeHTML(p.nickname)})` : ''}<br><small>${escapeHTML(p.phone)} · ${[p.attendee_type, p.faculty, p.institution, p.student_id].filter(Boolean).map(escapeHTML).join(' · ')}</small></li>`).join('') || '<li><small>ยังไม่มีผู้ลงทะเบียน</small></li>'}</ol></details></div>`;
    }).join('');
  } catch { box.innerHTML = '<p>โหลดสถานะรอบไม่สำเร็จ</p>'; }
}
async function loadRows() {
  statusBox.className = 'message'; statusBox.textContent = 'กำลังโหลดรายชื่อ...';
  try {
    const response = await fetch('/api/admin/registrations', { headers: { 'x-admin-password': adminPassword } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'ไม่สามารถโหลดข้อมูลได้');
    loadedRows = data.registrations; selected.clear();
    document.querySelector('#rows').innerHTML = data.registrations.map(row => `<tr data-id="${escapeHTML(row.id)}"><td class="sel" data-label="เลือก"><input type="checkbox" class="chk row-chk" aria-label="เลือก ${escapeHTML(row.full_name)}"></td><td data-label="เลขที่">${escapeHTML(row.id)}</td><td data-label="ชื่อ-นามสกุล">${escapeHTML(row.full_name)}</td><td data-label="ชื่อเล่น">${escapeHTML(row.nickname)}</td><td data-label="เบอร์โทรศัพท์">${escapeHTML(row.phone)}</td><td data-label="อีเมล">${escapeHTML(row.email)}</td><td data-label="ประเภท">${escapeHTML(row.attendee_type || '-')}</td><td data-label="คณะ">${escapeHTML(row.faculty || '-')}</td><td data-label="สถาบัน">${escapeHTML(row.institution || '-')}</td><td data-label="รหัสนักศึกษา">${escapeHTML(row.student_id)}</td><td data-label="รอบเวลา">${escapeHTML(row.play_round || '-')}</td><td data-label="วันที่ลงทะเบียน">${escapeHTML(row.created_at)}</td></tr>`).join('');
    syncSelection();
    await renderRounds(data.registrations);
    document.querySelector('#count').textContent = `ผู้ลงทะเบียนทั้งหมด ${data.registrations.length} รายชื่อ`;
    dashboard.classList.remove('hidden'); statusBox.textContent = '';
  } catch (error) { dashboard.classList.add('hidden'); statusBox.className = 'message error'; statusBox.textContent = error.message; }
}
loginForm.addEventListener('submit', async e => { e.preventDefault(); adminPassword = passwordInput.value; await loadRows(); if (!dashboard.classList.contains('hidden')) { loginForm.classList.add('hidden'); passwordInput.value = ''; } else adminPassword = ''; });
document.querySelector('#refresh').addEventListener('click', loadRows);
document.querySelector('#export').addEventListener('click', async () => {
  try { const response = await fetch('/api/admin/export.csv', { headers: { 'x-admin-password': adminPassword } }); if (!response.ok) throw new Error('ดาวน์โหลดไม่สำเร็จ'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'sandhaya4thit-registrations.csv'; a.click(); URL.revokeObjectURL(url); }
  catch (error) { statusBox.className = 'message error'; statusBox.textContent = error.message; }
});

document.querySelector('#rows').addEventListener('change', e => {
  if (!e.target.classList.contains('row-chk')) return;
  const id = Number(e.target.closest('tr').dataset.id);
  e.target.checked ? selected.add(id) : selected.delete(id);
  syncSelection();
});
selectAll.addEventListener('change', () => {
  selected.clear();
  if (selectAll.checked) loadedRows.forEach(r => selected.add(Number(r.id)));
  document.querySelectorAll('.row-chk').forEach(c => { c.checked = selectAll.checked; });
  syncSelection();
});
deleteBtn.addEventListener('click', async () => {
  const people = loadedRows.filter(r => selected.has(Number(r.id)));
  if (!people.length) return;
  const preview = people.slice(0, 10).map(p => `• ${p.full_name}${p.nickname ? ` (${p.nickname})` : ''} — ${p.play_round || '-'}`).join('\n') + (people.length > 10 ? `\n… และอีก ${people.length - 10} คน` : '');
  if (!confirm(`ยืนยันลบ ${people.length} รายชื่อ?\n\n${preview}\n\nการลบเป็นการลบถาวร กู้คืนไม่ได้ (แนะนำให้ดาวน์โหลด CSV สำรองไว้ก่อน)`)) return;
  deleteBtn.disabled = true;
  try {
    const response = await fetch('/api/admin/registrations/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword }, body: JSON.stringify({ ids: [...selected] }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'ลบข้อมูลไม่สำเร็จ');
    await loadRows();
    statusBox.className = 'message success'; statusBox.textContent = `ลบแล้ว ${data.deleted} รายชื่อ`;
  } catch (error) { statusBox.className = 'message error'; statusBox.textContent = error.message; syncSelection(); }
});
