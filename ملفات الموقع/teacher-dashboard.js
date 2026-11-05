if (sessionStorage.getItem('talalaTeacherSession') !== 'authenticated') window.location.replace('teacher-login.html');

const data = window.TalalaAssessmentData;
const keys = {
    questions: 'talalaReadingQuestionBank',
    reports: 'talalaStudentReports',
    interventions: 'talalaInterventionBank',
    support: 'talalaSupportTickets',
    teachers: 'talalaTeacherAccounts',
    settings: 'talalaPlatformSettings',
    ownerAccount: 'talalaTeacherAccount'
};

function read(key, fallback = []) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function escapeHtml(value) { const element = document.createElement('div'); element.textContent = value ?? ''; return element.innerHTML; }

let questions = read(keys.questions, data.questions);
let reports = read(keys.reports);
let interventions = read(keys.interventions, data.skills.map((skill) => ({ skill: skill.id, title: skill.name, content: `تدريب مقترح على مهارة ${skill.name}: اقرأ النص بتمعن، وحدد الأدلة، ودوّن المعنى قبل اختيار الإجابة.`, source: 'منصة طلاقة' })));
let supportTickets = read(keys.support);
let teacherAccounts = read(keys.teachers);
let editingQuestion = null;

const gradeFilter = document.querySelector('#grade-filter');
[...new Set(reports.map((report) => report.grade))].forEach((grade) => gradeFilter.add(new Option(grade, grade)));

function levelLabel(level) { return level === 1 ? 'سهل' : level === 2 ? 'متوسط' : 'صعب'; }
function skillName(id) { return data.skills.find((skill) => skill.id === id)?.name || id; }
function stageLabel(stage) { return stage === 'diagnostic' ? 'تشخيصي' : stage === 'intervention' ? 'تدخل' : 'شامل'; }

function setPanel(panelName) {
    document.querySelectorAll('.dashboard-tab').forEach((button) => {
        const isActive = button.dataset.panel === panelName;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
    document.querySelectorAll('.dashboard-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `panel-${panelName}`));
}

const teacherPermissions = JSON.parse(sessionStorage.getItem('talalaTeacherPermissions') || '[]');
const isOwner = sessionStorage.getItem('talalaTeacherRole') === 'owner';
const panelPermissions = {
    reports: 'reports', analytics: 'analytics', questions: 'questions', interventions: 'interventions', support: 'support', permissions: 'permissions', settings: 'owner', account: 'owner'
};

document.querySelectorAll('.dashboard-tab').forEach((button) => {
    const permission = panelPermissions[button.dataset.panel];
    const allowed = isOwner || teacherPermissions.includes(permission);
    button.hidden = !allowed;
    button.addEventListener('click', () => setPanel(button.dataset.panel));
});

const firstAllowedPanel = document.querySelector('.dashboard-tab:not([hidden])');
if (firstAllowedPanel) setPanel(firstAllowedPanel.dataset.panel);

document.querySelector('#logout').addEventListener('click', () => { ['talalaTeacherSession', 'talalaTeacherPermissions', 'talalaTeacherName', 'talalaTeacherRole'].forEach((name) => sessionStorage.removeItem(name)); window.location.href = 'teacher-login.html'; });

const dashboardName = sessionStorage.getItem('talalaTeacherName') || 'المعلم/ة';
document.querySelector('#dashboard-account').textContent = `مرحبًا ${dashboardName} • إدارة التعلم والتدخل وفق نتائج القراءة`;

const platformSettings = read(keys.settings, {
    name: 'منصة طلاقة', school: '', format: 'pdf', language: 'ar', showDetails: true, allowSupport: true
});
document.querySelector('#platform-name').value = platformSettings.name;
document.querySelector('#school-name').value = platformSettings.school;
document.querySelector('#report-format').value = platformSettings.format;
document.querySelector('#language-setting').value = platformSettings.language;
document.querySelector('#show-student-details').checked = platformSettings.showDetails;
document.querySelector('#allow-support').checked = platformSettings.allowSupport;

document.querySelector('#platform-settings').addEventListener('submit', (event) => {
    event.preventDefault();
    const settings = {
        name: document.querySelector('#platform-name').value.trim(),
        school: document.querySelector('#school-name').value.trim(),
        format: document.querySelector('#report-format').value,
        language: document.querySelector('#language-setting').value,
        showDetails: document.querySelector('#show-student-details').checked,
        allowSupport: document.querySelector('#allow-support').checked
    };
    write(keys.settings, settings);
    document.querySelector('#dashboard-account').textContent = `تم حفظ إعدادات ${settings.name}`;
});

const ownerAccount = read(keys.ownerAccount, { name: 'HANAA', username: 'HANAA', email: 'owner@talala.local', password: '11887799' });
document.querySelector('#account-name').value = ownerAccount.name;
document.querySelector('#account-username').value = 'HANAA';
document.querySelector('#account-email').value = ownerAccount.email;

document.querySelector('#account-editor').addEventListener('submit', (event) => {
    event.preventDefault();
    const message = document.querySelector('#account-message');
    const account = {
        name: document.querySelector('#account-name').value.trim(),
        username: 'HANAA',
        email: document.querySelector('#account-email').value.trim(),
        password: ownerAccount.password
    };
    write(keys.ownerAccount, account);
    sessionStorage.setItem('talalaTeacherName', account.name);
    document.querySelector('#dashboard-account').textContent = `مرحبًا ${account.name} • تم تحديث الحساب`;
    message.textContent = 'تم تحديث اسم الحساب والبريد الإلكتروني.';
    event.target.reset();
    document.querySelector('#account-name').value = account.name;
    document.querySelector('#account-username').value = account.username;
    document.querySelector('#account-email').value = account.email;
});

function renderReports() {
    const query = document.querySelector('#student-search').value.trim();
    const grade = gradeFilter.value;
    const filtered = reports.filter((report) => (!query || report.name.includes(query)) && (!grade || report.grade === grade));
    document.querySelector('#tested-count').textContent = `${filtered.length} طالبًا/طالبة`;
    document.querySelector('#student-report-list').innerHTML = filtered.length ? filtered.map((report) => `
        <tr><td>${escapeHtml(report.name)}</td><td>${escapeHtml(report.grade)}</td><td>${report.attempts}</td><td>${report.percent}%</td><td>${escapeHtml(report.progress)}</td><td>${escapeHtml(report.date)}</td><td><button type="button" class="secondary-button" data-report="${escapeHtml(report.name)}">عرض التقرير</button></td></tr>`).join('') : '<tr><td colspan="7" class="empty-state">لا توجد نتائج مطابقة.</td></tr>';
}

document.querySelector('#student-search').addEventListener('input', renderReports);
gradeFilter.addEventListener('change', renderReports);

document.querySelector('#student-report-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-report]');
    if (!button) return;
    const report = reports.find((item) => item.name === button.dataset.report);
    const steps = (report.processSteps || []).map((step) => {
        const results = Array.isArray(step.results)
            ? step.results.map((result) => `${result.name}: ${result.percent}%`).join('، ')
            : '';
        const skills = Array.isArray(step.skills)
            ? step.skills.map((skill) => typeof skill === 'string' ? skill : skill.name).join('، ')
            : '';
        const details = results || skills;
        return `- ${step.step}${step.round ? ` (الجولة ${step.round})` : ''}${details ? `: ${details}` : ''}`;
    }).join('\n');
    alert(`تقرير ${report.name}\nالصف: ${report.grade}\nالمحاولات: ${report.attempts}\nالنسبة: ${report.percent}%\nالتقدم: ${report.progress}\nأكثر مهارة تحتاج مراجعة: ${(report.weakSkills || []).join('، ') || 'لا توجد'}\n\nخطوات آخر محاولة:\n${steps || 'لا تتوفر تفاصيل الخطوات.'}`);
});

function renderAnalytics() {
    const average = reports.length ? Math.round(reports.reduce((total, report) => total + report.percent, 0) / reports.length) : 0;
    const diagnosticAverage = reports.length
        ? Math.round(reports.reduce((total, report) => total + (report.diagnosticPercent ?? report.percent), 0) / reports.length)
        : 0;
    const highest = reports.length ? Math.max(...reports.map((report) => report.percent)) : 0;
    document.querySelector('#analytics-metrics').innerHTML = `
        <article class="metric-card"><strong>${reports.length}</strong><span>عدد المختبرين</span></article>
        <article class="metric-card"><strong>${average}%</strong><span>المتوسط العام</span></article>
        <article class="metric-card"><strong>${highest}%</strong><span>أعلى مستوى إتقان</span></article>
        <article class="metric-card"><strong>${reports.reduce((sum, report) => sum + report.attempts, 0)}</strong><span>إجمالي المحاولات</span></article>`;
    document.querySelector('#progress-chart').innerHTML = reports.length
        ? chartMarkup([['التشخيصي', diagnosticAverage], ['الشامل', average]], '%')
        : '<p class="empty-state">ستظهر المقارنة بعد إكمال أول اختبار تشخيصي وشامل.</p>';
    const frequency = {};
    reports.forEach((report) => (report.weakSkills || []).forEach((skill) => frequency[skill] = (frequency[skill] || 0) + 1));
    document.querySelector('#skills-chart').innerHTML = Object.keys(frequency).length
        ? chartMarkup(Object.entries(frequency).map(([skill, count]) => [skill, count]), ' طالب/ة')
        : '<p class="empty-state">لا توجد مهارات تحتاج إلى دعم مسجلة بعد.</p>';
}

function chartMarkup(items, suffix) {
    const maxValue = Math.max(1, ...items.map(([, value]) => value));
    return items.map(([label, value]) => `<div class="bar-column"><strong>${value}${suffix}</strong><i style="height:${Math.max(4, (value / maxValue) * 100)}%"></i><span>${escapeHtml(label)}</span></div>`).join('');
}

const questionStage = document.querySelector('#question-stage');
const questionEditor = document.querySelector('#question-editor');
const questionList = document.querySelector('#question-list');
const questionFields = {
    text: document.querySelector('#question-text'), choices: [0,1,2,3].map((number) => document.querySelector(`#choice-${number}`)), skill: document.querySelector('#question-skill'), difficulty: document.querySelector('#question-difficulty'), answer: document.querySelector('#answer-index'), explanation: document.querySelector('#question-explanation'), passage: document.querySelector('#question-passage')
};
data.skills.forEach((skill) => questionFields.skill.add(new Option(`${skill.name} — ${skill.domain}`, skill.id)));

function openQuestionEditor(index = null) {
    editingQuestion = index;
    const question = index === null ? { text: '', choices: ['', '', '', ''], skill: questionFields.skill.value, difficulty: 2, answer: 0, explanation: '', passage: '', creator: 'معلم/ة' } : questions[questionStage.value][index];
    questionFields.text.value = question.text; questionFields.choices.forEach((field, number) => field.value = question.choices[number] || '');
    questionFields.skill.value = question.skill; questionFields.difficulty.value = question.difficulty || 2; questionFields.answer.value = question.answer;
    questionFields.explanation.value = question.explanation || ''; questionFields.passage.value = question.passage || '';
    questionEditor.classList.add('open'); questionFields.text.focus();
}

function renderQuestions() {
    const stage = questionStage.value;
    const query = document.querySelector('#question-search').value.trim();
    const visible = questions[stage].filter((question) => question.text.includes(query));
    questionList.innerHTML = visible.length ? visible.map((question) => {
        const index = questions[stage].indexOf(question);
        return `<article class="data-card"><div class="card-title-row"><div><strong>${escapeHtml(question.text)}</strong><div class="meta-row"><span class="meta-tag">${escapeHtml(skillName(question.skill))}</span><span class="meta-tag">${levelLabel(question.difficulty || 2)}</span><span class="meta-tag">${escapeHtml(question.creator || 'الأسئلة الأساسية')}</span></div></div><div class="card-actions"><button type="button" class="secondary-button" data-edit-question="${index}">تعديل</button><button type="button" class="danger-button" data-delete-question="${index}">حذف</button></div></div><ol>${question.choices.map((choice, number) => `<li>${number === question.answer ? '<strong>الإجابة الصحيحة: ' : ''}${escapeHtml(choice)}${number === question.answer ? '</strong>' : ''}</li>`).join('')}</ol></article>`;
    }).join('') : '<p class="empty-state">لا توجد أسئلة مطابقة.</p>';
}

document.querySelector('#add-question').addEventListener('click', () => openQuestionEditor());
document.querySelector('#cancel-question').addEventListener('click', () => { questionEditor.classList.remove('open'); editingQuestion = null; });
document.querySelector('#question-search').addEventListener('input', renderQuestions);
questionStage.addEventListener('change', () => { questionEditor.classList.remove('open'); editingQuestion = null; renderQuestions(); });
questionEditor.addEventListener('submit', (event) => {
    event.preventDefault();
    const answer = Number(questionFields.answer.value);
    const choices = questionFields.choices.map((field) => field.value.trim());
    if (!choices.every(Boolean) || answer < 0 || answer > 3) { alert('أكمل السؤال والأخيار وارقم الإجابة من 0 إلى 3.'); return; }
    const question = { text: questionFields.text.value.trim(), choices, skill: questionFields.skill.value, difficulty: Number(questionFields.difficulty.value), answer, explanation: questionFields.explanation.value.trim(), passage: questionFields.passage.value.trim(), creator: 'معلم/ة' };
    if (editingQuestion === null) questions[questionStage.value].push(question); else questions[questionStage.value][editingQuestion] = question;
    write(keys.questions, questions); questionEditor.classList.remove('open'); editingQuestion = null; renderQuestions();
});
questionList.addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit-question]');
    const remove = event.target.closest('[data-delete-question]');
    if (edit) openQuestionEditor(Number(edit.dataset.editQuestion));
    if (remove && confirm('حذف السؤال نهائيًا؟')) { questions[questionStage.value].splice(Number(remove.dataset.deleteQuestion), 1); write(keys.questions, questions); renderQuestions(); }
});

function renderInterventions() {
    document.querySelector('#intervention-list').innerHTML = interventions.map((item, index) => `<article class="data-card"><div class="card-title-row"><div><strong>${escapeHtml(item.title)}</strong><div class="meta-row"><span class="meta-tag">${escapeHtml(item.source)}</span></div></div><div class="card-actions"><button type="button" class="secondary-button" data-edit-intervention="${index}">تعديل</button></div></div><textarea class="reply-area" data-intervention-content="${index}" ${item.editable === false ? '' : ''}>${escapeHtml(item.content)}</textarea></article>`).join('');
}
document.querySelector('#intervention-list').addEventListener('change', (event) => { const field = event.target.closest('[data-intervention-content]'); if (!field) return; interventions[Number(field.dataset.interventionContent)].content = field.value; write(keys.interventions, interventions); });

function renderSupport() {
    document.querySelector('#support-tickets').innerHTML = supportTickets.length ? supportTickets.map((ticket, index) => `<article class="data-card"><div class="card-title-row"><div><strong>${escapeHtml(ticket.fullName)}</strong><div class="meta-row"><span class="meta-tag">${escapeHtml(ticket.type)}</span><span class="meta-tag">${escapeHtml(ticket.number)}</span></div></div><select class="status-select" data-support-status="${index}"><option${ticket.status === 'بانتظار الرد' ? ' selected' : ''}>بانتظار الرد</option><option${ticket.status === 'قيد المعالجة' ? ' selected' : ''}>قيد المعالجة</option><option${ticket.status === 'تم الرد' ? ' selected' : ''}>تم الرد</option></select></div><p><strong>${escapeHtml(ticket.subject)}</strong></p><p>${escapeHtml(ticket.details)}</p><textarea class="reply-area" data-support-reply="${index}" placeholder="رد المساندة">${escapeHtml(ticket.reply || '')}</textarea><div class="card-actions"><button type="button" class="primary-button" data-save-support="${index}">حفظ الرد</button></div></article>`).join('') : '<p class="empty-state">لا توجد طلبات دعم جديدة.</p>';
}
document.querySelector('#support-tickets').addEventListener('click', (event) => { const button = event.target.closest('[data-save-support]'); if (!button) return; const index = Number(button.dataset.saveSupport); supportTickets[index].status = document.querySelector(`[data-support-status="${index}"]`).value; supportTickets[index].reply = document.querySelector(`[data-support-reply="${index}"]`).value.trim(); write(keys.support, supportTickets); renderSupport(); });

function renderTeachers() {
    document.querySelector('#teacher-list').innerHTML = teacherAccounts.length ? teacherAccounts.map((teacher, index) => `<article class="data-card"><div class="card-title-row"><div><strong>${escapeHtml(teacher.name)}</strong><p>${escapeHtml(teacher.username)} • ${escapeHtml(teacher.email)}</p><div class="meta-row">${teacher.permissions.map((permission) => `<span class="meta-tag">${escapeHtml(permission)}</span>`).join('')}</div></div><div class="card-actions"><button type="button" class="danger-button" data-delete-teacher="${index}">حذف</button></div></div></article>`).join('') : '<p class="empty-state">لم تتم إضافة معلمين ومعلمات إضافيين بعد.</p>';
}
document.querySelector('#teacher-editor').addEventListener('submit', (event) => {
    event.preventDefault();
    const permissions = [...document.querySelectorAll('input[name="permission"]:checked')].map((field) => field.value);
    teacherAccounts.push({ name: document.querySelector('#teacher-name').value.trim(), username: document.querySelector('#teacher-username').value.trim(), password: document.querySelector('#teacher-password').value, email: document.querySelector('#teacher-email').value.trim(), permissions, authorized: true });
    write(keys.teachers, teacherAccounts); event.target.reset(); renderTeachers();
});
document.querySelector('#teacher-list').addEventListener('click', (event) => { const button = event.target.closest('[data-delete-teacher]'); if (button && confirm('حذف حساب المعلم/ة؟')) { teacherAccounts.splice(Number(button.dataset.deleteTeacher), 1); write(keys.teachers, teacherAccounts); renderTeachers(); } });

renderReports(); renderAnalytics(); renderQuestions(); renderInterventions(); renderSupport(); renderTeachers();
