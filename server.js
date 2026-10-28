const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// รอบเวลาที่เปิดให้เลือก: แก้ได้ที่ไฟล์ rounds.json (รีสตาร์ตเซิร์ฟเวอร์หลังแก้)
const MAX_PER_ROUND = Math.max(1, parseInt(process.env.MAX_PER_ROUND, 10) || 6); // 1 รอบมีผู้เล่นได้สูงสุด 6 คน ครบแล้วปิดรับรอบนั้นอัตโนมัติ
const ROUNDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'rounds.json'), 'utf8')).map(String).filter(Boolean);

// ประเภทผู้ลงทะเบียน: 0 = ไม่ต้องกรอก, 1 = ไม่บังคับ, 2 = บังคับกรอก
const TYPE_RULES = {
  'นักเรียน':     { faculty: 0, institution: 2, student_id: 1 },
  'นักศึกษา':     { faculty: 2, institution: 2, student_id: 2 },
  'อาจารย์':      { faculty: 2, institution: 2, student_id: 0 },
  'บุคคลภายนอก':  { faculty: 0, institution: 0, student_id: 0 }
};

const app = express();
app.set('trust proxy', 1); // host อยู่หลัง proxy: ให้ rate limit แยกตาม IP ผู้ใช้จริง
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const db = new Database(process.env.DB_PATH || path.join(__dirname, 'registrations.db'));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  attendee_type TEXT NOT NULL DEFAULT '',
  faculty TEXT NOT NULL DEFAULT '',
  institution TEXT NOT NULL DEFAULT '',
  student_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
)`);
// Add fields automatically if an older database from version 1 is reused.
const existingColumns = new Set(db.prepare('PRAGMA table_info(registrations)').all().map(column => column.name));
for (const [name, type] of [['attendee_type', "TEXT NOT NULL DEFAULT ''"], ['faculty', "TEXT NOT NULL DEFAULT ''"], ['institution', "TEXT NOT NULL DEFAULT ''"], ['student_id', "TEXT NOT NULL DEFAULT ''"], ['play_round', "TEXT NOT NULL DEFAULT ''"]]) {
  if (!existingColumns.has(name)) db.exec(`ALTER TABLE registrations ADD COLUMN ${name} ${type}`);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/register', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }));

const insertRegistration = db.prepare(`INSERT INTO registrations (full_name,nickname,phone,email,attendee_type,faculty,institution,student_id,play_round) VALUES (@full_name,@nickname,@phone,@email,@attendee_type,@faculty,@institution,@student_id,@play_round)`);
const countByRound = db.prepare('SELECT COUNT(*) AS n FROM registrations WHERE play_round = ?');
// เช็กจำนวนและบันทึกใน transaction เดียว กันคนกดพร้อมกันจนเกินจำนวนที่รับ
const registerIfAvailable = db.transaction((row) => {
  if (countByRound.get(row.play_round).n >= MAX_PER_ROUND) return { error: 'รอบนี้มีผู้เล่นครบแล้ว กรุณาเลือกรอบอื่น' };
  return { id: insertRegistration.run(row).lastInsertRowid };
});
app.post('/api/register', (req, res) => {
  const data = req.body || {};
  const full_name = String(data.full_name || '').trim();
  const nickname = String(data.nickname || '').trim();
  const phone = String(data.phone || '').trim();
  const email = String(data.email || '').trim().toLowerCase();
  const attendee_type = String(data.attendee_type || '').trim();
  const faculty = String(data.faculty || '').trim();
  const institution = String(data.institution || '').trim();
  const student_id = String(data.student_id || '').trim();
  const play_round = String(data.play_round || '').trim();
  if (full_name.length < 2 || full_name.length > 120) return res.status(400).json({ error: 'กรุณากรอกชื่อ-นามสกุลให้ถูกต้อง' });
  if (nickname.length > 60) return res.status(400).json({ error: 'ชื่อเล่นยาวเกินกำหนด' });
  if (!/^[0-9+()\-\s]{8,20}$/.test(phone)) return res.status(400).json({ error: 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return res.status(400).json({ error: 'กรุณากรอกอีเมลให้ถูกต้อง' });
  const rule = TYPE_RULES[attendee_type];
  if (!rule) return res.status(400).json({ error: 'กรุณาเลือกประเภทผู้ลงทะเบียน' });
  if (rule.faculty === 2 && !faculty) return res.status(400).json({ error: 'กรุณากรอกคณะ' });
  if (rule.institution === 2 && !institution) return res.status(400).json({ error: 'กรุณากรอกสถาบัน' });
  if (rule.student_id === 2 && !student_id) return res.status(400).json({ error: 'กรุณากรอกรหัสนักศึกษา' });
  if (faculty.length > 160 || institution.length > 160 || student_id.length > 60) return res.status(400).json({ error: 'ข้อมูลคณะ สถาบัน หรือรหัสนักศึกษายาวเกินกำหนด' });
  if (!ROUNDS.includes(play_round)) return res.status(400).json({ error: 'กรุณาเลือกรอบเวลาที่จะเล่น' });
  try {
    const result = registerIfAvailable({ full_name, nickname, phone, email, attendee_type, faculty: rule.faculty ? faculty : '', institution: rule.institution ? institution : '', student_id: rule.student_id ? student_id : '', play_round });
    if (result.error) return res.status(409).json({ error: result.error, full: true });
    res.status(201).json({ ok: true, registration_id: result.id, message: 'ลงทะเบียนสำเร็จ' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่' });
  }
});

app.use('/api/registrant/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' } }));
const findByEmail = db.prepare('SELECT id,full_name,nickname,phone,email,attendee_type,faculty,institution,student_id,play_round,created_at FROM registrations WHERE email = ? ORDER BY id DESC');
const digitsOnly = value => String(value || '').replace(/\D/g, '');
// Registrants have no passwords: they sign in with the email + phone they registered with.
app.post('/api/registrant/login', (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const phone = digitsOnly((req.body || {}).phone);
  if (!email || phone.length < 8) return res.status(400).json({ error: 'กรุณากรอกอีเมลและเบอร์โทรศัพท์ให้ครบถ้วน' });
  const matches = findByEmail.all(email).filter(row => digitsOnly(row.phone) === phone);
  if (!matches.length) return res.status(401).json({ error: 'ไม่พบข้อมูลการลงทะเบียน กรุณาตรวจสอบอีเมลและเบอร์โทรศัพท์ที่ใช้ลงทะเบียน' });
  res.json({ ok: true, registrations: matches });
});

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'ยังไม่ได้ตั้งค่า ADMIN_PASSWORD ก่อนเปิดเซิร์ฟเวอร์' });
  const supplied = req.get('x-admin-password') || '';
  if (supplied !== ADMIN_PASSWORD) return res.status(401).json({ error: 'รหัสผู้ดูแลไม่ถูกต้อง' });
  next();
}
const listRegistrations = () => db.prepare('SELECT id,full_name,nickname,phone,email,attendee_type,faculty,institution,student_id,play_round,created_at FROM registrations ORDER BY id DESC').all();
app.get('/api/admin/registrations', requireAdmin, (_req, res) => res.json({ registrations: listRegistrations() }));
// ลบรายชื่อที่เลือก (ส่ง ids เป็น array) — ลบถาวร กู้คืนไม่ได้
const deleteRegistration = db.prepare('DELETE FROM registrations WHERE id = ?');
const deleteMany = db.transaction(ids => ids.reduce((n, id) => n + deleteRegistration.run(id).changes, 0));
app.post('/api/admin/registrations/delete', requireAdmin, (req, res) => {
  const raw = (req.body || {}).ids;
  if (!Array.isArray(raw) || !raw.length) return res.status(400).json({ error: 'กรุณาเลือกรายชื่อที่ต้องการลบ' });
  if (raw.length > 500) return res.status(400).json({ error: 'เลือกได้ครั้งละไม่เกิน 500 รายชื่อ' });
  const ids = [...new Set(raw.map(Number))];
  if (ids.some(id => !Number.isInteger(id) || id < 1)) return res.status(400).json({ error: 'รหัสรายชื่อไม่ถูกต้อง' });
  try {
    res.json({ ok: true, deleted: deleteMany(ids) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ลบข้อมูลไม่สำเร็จ กรุณาลองใหม่' });
  }
});
app.get('/api/admin/export.csv', requireAdmin, (_req, res) => {
  const rows = listRegistrations();
  const columns = ['id','full_name','nickname','phone','email','attendee_type','faculty','institution','student_id','play_round','created_at'];
  const quote = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
  const csv = '\uFEFF' + [columns.join(','), ...rows.map(row => columns.map(key => quote(row[key])).join(','))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sandhaya4thit-registrations.csv"');
  res.send(csv);
});
app.get('/api/rounds', (_req, res) => res.json({ max_per_round: MAX_PER_ROUND, rounds: ROUNDS.map(name => { const taken = countByRound.get(name).n; return { name, taken, remaining: Math.max(0, MAX_PER_ROUND - taken), full: taken >= MAX_PER_ROUND }; }) }));
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log(`สนธยา4ทิศ registration running at http://localhost:${PORT}`));
