const form = document.querySelector('#registration-form');
const message = document.querySelector('#message');
document.querySelector('#year').textContent = new Date().getFullYear();
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.className = 'message';
  message.textContent = '';
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.querySelector('span:first-child').textContent = 'กำลังบันทึกข้อมูล...';
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    const response = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'ลงทะเบียนไม่สำเร็จ');
    message.className = 'message success';
    message.textContent = `✓ ${result.message} เลขที่ลงทะเบียน ${String(result.registration_id).padStart(4, '0')}`;
    form.reset();
    applyType();
  } catch (error) {
    message.className = 'message error';
    message.textContent = `ไม่สามารถลงทะเบียนได้: ${error.message}`;
  } finally {
    await loadRounds();
    button.disabled = false;
    button.querySelector('span:first-child').textContent = 'ยืนยันการลงทะเบียน';
  }
});

const esc = v => String(v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const select = document.querySelector('#play_round');

// 0 = ซ่อน, 1 = ไม่บังคับ, 2 = บังคับกรอก (ต้องตรงกับ TYPE_RULES ใน server.js)
const TYPE_RULES = {
  'นักเรียน':     { faculty: 0, institution: 2, student_id: 1 },
  'นักศึกษา':     { faculty: 2, institution: 2, student_id: 2 },
  'อาจารย์':      { faculty: 2, institution: 2, student_id: 0 },
  'บุคคลภายนอก':  { faculty: 0, institution: 0, student_id: 0 }
};
const typeSelect = document.querySelector('#attendee_type');
function applyType() {
  const rule = TYPE_RULES[typeSelect.value] || { faculty: 2, institution: 2, student_id: 2 };
  for (const name of Object.keys(rule)) {
    const level = rule[name];
    const wrap = document.querySelector(`#${name}-field`);
    const input = document.querySelector(`#${name}`);
    wrap.hidden = level === 0;
    input.disabled = level === 0;
    input.required = level === 2;
    wrap.querySelector('b').hidden = level !== 2;
    if (level === 0) input.value = '';
  }
  document.querySelector('#org-row').hidden = !rule.faculty && !rule.institution;
}
typeSelect.addEventListener('change', applyType);
applyType();

async function loadRounds() {
  const previous = select.value;
  try {
    const data = await (await fetch('/api/rounds')).json();
    select.innerHTML = '<option value="">เลือกรอบเวลา</option>' + data.rounds.map(r =>
      `<option value="${esc(r.name)}"${r.full ? ' disabled' : ''}>${esc(r.name)} — ${r.full ? 'เต็มแล้ว' : `เหลือ ${r.remaining} ที่นั่ง`}</option>`).join('');
    document.querySelector('#round-hint').textContent = `1 รอบรับผู้เล่นได้สูงสุด ${data.max_per_round} คน`;
    if (previous && data.rounds.some(r => r.name === previous && !r.full)) select.value = previous;
  } catch { select.innerHTML = '<option value="">โหลดรอบเวลาไม่สำเร็จ กรุณารีเฟรชหน้า</option>'; }
}
loadRounds();
