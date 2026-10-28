const form = document.querySelector('#login-form');
const message = document.querySelector('#message');
const result = document.querySelector('#result');
document.querySelector('#year').textContent = new Date().getFullYear();
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const show = v => esc(v) || '-';

function render(rows) {
  result.innerHTML = rows.map(r => `<div class="result-card"><h3>✓ ลงทะเบียนแล้ว · เลขที่ ${String(r.id).padStart(4, '0')}</h3><dl>
    <dt>ชื่อ-นามสกุล</dt><dd>${show(r.full_name)}</dd>
    <dt>ชื่อเล่น</dt><dd>${show(r.nickname)}</dd>
    <dt>เบอร์โทรศัพท์</dt><dd>${show(r.phone)}</dd>
    <dt>อีเมล</dt><dd>${show(r.email)}</dd>
    <dt>ประเภทผู้ลงทะเบียน</dt><dd>${show(r.attendee_type)}</dd>
    <dt>คณะ</dt><dd>${show(r.faculty)}</dd>
    <dt>สถาบัน</dt><dd>${show(r.institution)}</dd>
    <dt>รหัสนักศึกษา</dt><dd>${show(r.student_id)}</dd>
    <dt>รอบเวลาที่จะเล่น</dt><dd>${show(r.play_round)}</dd>
    <dt>ลงทะเบียนเมื่อ</dt><dd>${show(r.created_at)}</dd></dl></div>`).join('')
    + '<button type="button" class="link-btn" id="logout">ออกจากระบบ</button>';
  result.classList.remove('hidden');
  form.classList.add('hidden');
  document.querySelector('#logout').addEventListener('click', () => {
    result.innerHTML = ''; result.classList.add('hidden'); form.classList.remove('hidden'); form.reset();
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.className = 'message'; message.textContent = '';
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const response = await fetch('/api/registrant/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'เข้าสู่ระบบไม่สำเร็จ');
    render(data.registrations);
  } catch (error) {
    message.className = 'message error'; message.textContent = error.message;
  } finally { button.disabled = false; }
});
