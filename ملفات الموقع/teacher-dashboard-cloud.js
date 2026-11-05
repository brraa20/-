const data = window.TalalaAssessmentData;
const backend = window.TalalaBackend;
const statusMessage = document.createElement('p');
statusMessage.id = 'dashboard-status';
statusMessage.setAttribute('role', 'status');
document.querySelector('.dashboard-top').after(statusMessage);

const panelPermissions = {
    reports: 'reports',
    analytics: 'analytics',
    questions: 'questions',
    interventions: 'interventions',
    support: 'support',
    permissions: 'owner',
    settings: 'owner',
    account: 'owner'
};

let profile;
let questions = structuredClone(data.questions);
let interventions = data.skills.map((skill) => ({
    skill: skill.id,
    title: skill.name,
    content: `تدريب مقترح على مهارة ${skill.name}: اقرأ النص بتمعن، وحدد الأدلة، ودوّن المعنى قبل اختيار الإجابة.`,
    source: 'منصة طلاقة'
}));
let reports = [];
let tickets = [];
let teachers = [];
let settings = { name: 'منصة طلاقة', school: '', format: 'pdf', language: 'ar', showDetails: true, allowSupport: true };
let editingQuestion = null;

function showStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.className = isError ? 'error' : '';
}

function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = value ?? '';
    return element.innerHTML;
}

function processStepsSummary(steps = []) {
    return steps.map((step) => {
        const results = Array.isArray(step.results)
            ? step.results.map((result) => `${result.name}: ${result.percent}%`).join('، ')
            : '';
        const skills = Array.isArray(step.skills)
            ? step.skills.map((skill) => typeof skill === 'string' ? skill : skill.name).join('، ')
            : '';
        const details = results || skills;
        return `- ${step.step}${step.round ? ` (الجولة ${step.round})` : ''}${details ? `: ${details}` : ''}`;
    }).join('\n');
}

function setPanel(panelName) {
    document.querySelectorAll('.dashboard-tab').forEach((button) => {
        const active = button.dataset.panel === panelName;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('.dashboard-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === `panel-${panelName}`);
    });
}

function can(permission) {
    if (profile.role === 'owner') return true;
    if (permission === 'analytics') {
        return profile.permissions.includes('analytics') && profile.permissions.includes('reports');
    }
    return profile.permissions.includes(permission);
}

async function loadContentOrDefault(key, fallback) {
    const saved = await backend.loadContent(key);
    if (saved) return saved;
    if (profile.role === 'owner') await backend.saveContent(key, fallback);
    return fallback;
}

function renderReports() {
    const query = document.querySelector('#student-search').value.trim();
    const grade = document.querySelector('#grade-filter').value;
    const filtered = reports.filter((report) =>
        (!query || report.student_name.includes(query))
        && (!grade || report.grade === grade));
    document.querySelector('#tested-count').textContent = `${filtered.length} طالبًا/طالبة`;
    document.querySelector('#student-report-list').innerHTML = filtered.length
        ? filtered.map((report) => `
            <tr>
                <td>${escapeHtml(report.student_name)}</td><td>${escapeHtml(report.grade)}</td>
                <td>${report.attempts}</td><td>${report.percent}%</td>
                <td>${escapeHtml(report.progress)}</td><td>${escapeHtml(report.date)}</td>
                <td><button type="button" class="secondary-button" data-report="${escapeHtml(report.id)}">عرض التقرير</button>
                ${profile.role === 'owner' ? `<button type="button" class="danger-button" data-delete-report="${escapeHtml(report.id)}">حذف</button>` : ''}</td>
            </tr>`).join('')
        : '<tr><td colspan="7" class="empty-state">لا توجد نتائج مطابقة.</td></tr>';
}

function renderAnalytics() {
    const average = reports.length
        ? Math.round(reports.reduce((sum, report) => sum + report.percent, 0) / reports.length)
        : 0;
    const diagnosticAverage = reports.length
        ? Math.round(reports.reduce((sum, report) => sum + report.diagnostic_percent, 0) / reports.length)
        : 0;
    const highest = reports.length ? Math.max(...reports.map((report) => report.percent)) : 0;
    document.querySelector('#analytics-metrics').innerHTML = `
        <article class="metric-card"><strong>${reports.length}</strong><span>عدد المختبرين</span></article>
        <article class="metric-card"><strong>${average}%</strong><span>المتوسط العام</span></article>
        <article class="metric-card"><strong>${highest}%</strong><span>أعلى مستوى إتقان</span></article>
        <article class="metric-card"><strong>${reports.reduce((sum, report) => sum + report.attempts, 0)}</strong><span>إجمالي المحاولات</span></article>`;
    document.querySelector('#progress-chart').innerHTML = reports.length
        ? chartMarkup([['التشخيصي', diagnosticAverage], ['الشامل', average]], '%')
        : '<p class="empty-state">ستظهر المقارنة بعد إكمال أول اختبار.</p>';
    const frequency = {};
    reports.forEach((report) => report.weak_skills.forEach((skill) => {
        frequency[skill] = (frequency[skill] || 0) + 1;
    }));
    document.querySelector('#skills-chart').innerHTML = Object.keys(frequency).length
        ? chartMarkup(Object.entries(frequency), ' طالب/ة')
        : '<p class="empty-state">لا توجد مهارات تحتاج إلى دعم مسجلة بعد.</p>';
}

function chartMarkup(items, suffix) {
    const maxValue = Math.max(1, ...items.map(([, value]) => value));
    return items.map(([label, value]) => `
        <div class="bar-column"><strong>${value}${suffix}</strong>
        <i style="height:${Math.max(4, (value / maxValue) * 100)}%"></i>
        <span>${escapeHtml(label)}</span></div>`).join('');
}

function renderQuestions() {
    const stage = document.querySelector('#question-stage').value;
    const query = document.querySelector('#question-search').value.trim();
    const visible = questions[stage].filter((question) => question.text.includes(query));
    const list = document.querySelector('#question-list');
    list.innerHTML = visible.length ? visible.map((question) => {
        const index = questions[stage].indexOf(question);
        const skill = data.skills.find((item) => item.id === question.skill);
        return `<article class="data-card"><div class="card-title-row"><div>
            <strong>${escapeHtml(question.text)}</strong>
            <div class="meta-row"><span class="meta-tag">${escapeHtml(skill?.name || question.skill)}</span>
            <span class="meta-tag">${escapeHtml(question.creator || 'الأسئلة الأساسية')}</span></div>
            </div><div class="card-actions">
            <button type="button" class="secondary-button" data-edit-question="${index}">تعديل</button>
            <button type="button" class="danger-button" data-delete-question="${index}">حذف</button>
            </div></div><ol>${question.choices.map((choice, number) => `
                <li>${number === question.answer ? '<strong>الإجابة الصحيحة: ' : ''}${escapeHtml(choice)}${number === question.answer ? '</strong>' : ''}</li>`).join('')}
            </ol></article>`;
    }).join('') : '<p class="empty-state">لا توجد أسئلة مطابقة.</p>';
}

function openQuestionEditor(index = null) {
    editingQuestion = index;
    const skillSelect = document.querySelector('#question-skill');
    const question = index === null
        ? { text: '', choices: ['', '', '', ''], skill: skillSelect.value, difficulty: 2, answer: 0, explanation: '', passage: '' }
        : questions[document.querySelector('#question-stage').value][index];
    document.querySelector('#question-text').value = question.text;
    [0, 1, 2, 3].forEach((number) => {
        document.querySelector(`#choice-${number}`).value = question.choices[number] || '';
    });
    skillSelect.value = question.skill;
    document.querySelector('#question-difficulty').value = question.difficulty || 2;
    document.querySelector('#answer-index').value = question.answer;
    document.querySelector('#question-explanation').value = question.explanation || '';
    document.querySelector('#question-passage').value = question.passage || '';
    document.querySelector('#question-editor').classList.add('open');
    document.querySelector('#question-text').focus();
}

async function saveQuestions() {
    await backend.saveContent('questions', questions);
    renderQuestions();
    showStatus('تم حفظ بنك الأسئلة المشترك.');
}

function renderInterventions() {
    document.querySelector('#intervention-list').innerHTML = interventions.map((item, index) => `
        <article class="data-card"><strong>${escapeHtml(item.title)}</strong>
        <textarea class="reply-area" data-intervention-content="${index}">${escapeHtml(item.content)}</textarea>
        </article>`).join('');
}

function renderSupport() {
    document.querySelector('#support-tickets').innerHTML = tickets.length ? tickets.map((ticket) => `
        <article class="data-card" data-ticket="${ticket.ticket_code}">
            <div class="card-title-row"><div><strong>${escapeHtml(ticket.full_name)}</strong>
                <div class="meta-row"><span class="meta-tag">${escapeHtml(ticket.request_type)}</span>
                <span class="meta-tag">TL-${escapeHtml(ticket.ticket_code)}</span></div></div>
                <select class="status-select" data-support-status>
                    ${['بانتظار الرد', 'قيد المعالجة', 'تم الرد'].map((status) =>
                        `<option${ticket.status === status ? ' selected' : ''}>${status}</option>`).join('')}
                </select>
            </div>
            <p><strong>${escapeHtml(ticket.subject)}</strong></p><p>${escapeHtml(ticket.details)}</p>
            <textarea class="reply-area" data-support-reply placeholder="رد الدعم">${escapeHtml(ticket.reply)}</textarea>
            <div class="card-actions"><button type="button" class="primary-button" data-save-support>حفظ الرد</button>
            <button type="button" class="danger-button" data-delete-support>حذف</button></div>
        </article>`).join('') : '<p class="empty-state">لا توجد طلبات دعم.</p>';
}

function renderTeachers() {
    document.querySelector('#teacher-list').innerHTML = teachers.length ? teachers
        .filter((teacher) => teacher.role === 'teacher')
        .map((teacher) => `<article class="data-card">
            <strong>${escapeHtml(teacher.display_name || 'معلم/ة')}</strong>
            <p>${escapeHtml(teacher.email)}</p>
            <div class="meta-row"><span class="meta-tag">${teacher.active ? 'نشط' : 'غير نشط'}</span>
            ${teacher.permissions.map((permission) => `<span class="meta-tag">${escapeHtml(permission)}</span>`).join('')}</div>
            <button type="button" class="secondary-button" data-toggle-teacher="${teacher.id}" data-active="${teacher.active}">
                ${teacher.active ? 'إيقاف الحساب' : 'تفعيل الحساب'}
            </button></article>`).join('')
        : '<p class="empty-state">لا توجد حسابات معلمين.</p>';
}

async function initialize() {
    if (!backend.isConfigured) {
        showStatus(backend.configurationMessage, true);
        return;
    }

    profile = await backend.getProfile();
    if (!profile || !profile.active) {
        await backend.requireClient().auth.signOut();
        window.location.replace('teacher-login.html');
        return;
    }

    profile.permissions = profile.permissions || [];
    document.querySelector('#dashboard-account').textContent =
        `مرحبًا ${profile.display_name || profile.email} • إدارة التعلم والتدخل وفق نتائج القراءة`;
    document.querySelector('#account-name').value = profile.display_name || '';
    document.querySelector('#account-username').value = profile.email;
    document.querySelector('#account-email').value = profile.email;

    document.querySelectorAll('.dashboard-tab').forEach((button) => {
        const permission = panelPermissions[button.dataset.panel];
        button.hidden = permission === 'owner' ? profile.role !== 'owner' : !can(permission);
        button.addEventListener('click', () => setPanel(button.dataset.panel));
    });
    const firstTab = document.querySelector('.dashboard-tab:not([hidden])');
    if (firstTab) setPanel(firstTab.dataset.panel);

    questions = await loadContentOrDefault('questions', data.questions);
    if (can('interventions')) {
        interventions = await loadContentOrDefault('interventions', interventions);
    }
    if (profile.role === 'owner') {
        settings = await loadContentOrDefault('settings', settings);
    }
    document.querySelector('#platform-name').value = settings.name;
    document.querySelector('#school-name').value = settings.school;
    document.querySelector('#report-format').value = settings.format;
    document.querySelector('#language-setting').value = settings.language;
    document.querySelector('#show-student-details').checked = settings.showDetails;
    document.querySelector('#allow-support').checked = settings.allowSupport;

    const skillSelect = document.querySelector('#question-skill');
    data.skills.forEach((skill) => skillSelect.add(new Option(`${skill.name} — ${skill.domain}`, skill.id)));
    renderQuestions();
    renderInterventions();

    if (can('reports')) {
        const attempts = await backend.loadAttempts();
        const grouped = new Map();
        attempts.forEach((attempt) => {
            const key = `${attempt.student_name}\u0000${attempt.grade}`;
            if (!grouped.has(key)) {
                grouped.set(key, {
                    id: attempt.id,
                    student_name: attempt.student_name,
                    grade: attempt.grade,
                    attempts: 0,
                    percent: attempt.percent,
                    diagnostic_percent: attempt.diagnostic_percent,
                    progress: attempt.progress,
                    weak_skills: attempt.weak_skills,
                    process_steps: attempt.process_steps || [],
                    date: attempt.created_at.slice(0, 10)
                });
            }
            grouped.get(key).attempts += 1;
        });
        reports = [...grouped.values()];
        const grades = [...new Set(reports.map((report) => report.grade))];
        const gradeFilter = document.querySelector('#grade-filter');
        grades.forEach((grade) => gradeFilter.add(new Option(grade, grade)));
        if (can('reports')) renderReports();
        if (can('analytics')) renderAnalytics();
    }

    if (can('support')) {
        tickets = await backend.loadTickets();
        renderSupport();
    }
    if (profile.role === 'owner') {
        teachers = await backend.loadTeachers();
        renderTeachers();
    }
}

document.querySelector('#logout').addEventListener('click', async () => {
    try {
        const { error } = await backend.requireClient().auth.signOut();
        if (error) throw error;
        window.location.href = 'teacher-login.html';
    } catch (error) {
        showStatus(`تعذر تسجيل الخروج: ${error.message}`, true);
    }
});

document.querySelector('#student-search').addEventListener('input', renderReports);
document.querySelector('#grade-filter').addEventListener('change', renderReports);
document.querySelector('#student-report-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-report]');
    const report = reports.find((item) => item.id === button?.dataset.report);
    if (report) {
        const steps = processStepsSummary(report.process_steps);
        alert(`تقرير ${report.student_name}\nالصف: ${report.grade}\nالمحاولات: ${report.attempts}\nالنسبة: ${report.percent}%\nالتقدم: ${report.progress}\nمهارات تحتاج مراجعة: ${report.weak_skills.join('، ') || 'لا توجد'}\n\nخطوات آخر محاولة:\n${steps || 'لا تتوفر تفاصيل الخطوات.'}`);
    }
});
document.querySelector('#student-report-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delete-report]');
    const report = reports.find((item) => item.id === button?.dataset.deleteReport);
    if (!report || profile.role !== 'owner' || !confirm(`حذف جميع محاولات ${report.student_name} من قاعدة البيانات؟`)) return;
    try {
        await backend.deleteStudentAttempts(report.student_name, report.grade);
        const attempts = await backend.loadAttempts();
        const grouped = new Map();
        attempts.forEach((attempt) => {
            const key = `${attempt.student_name}\u0000${attempt.grade}`;
            if (!grouped.has(key)) {
                grouped.set(key, {
                    id: attempt.id,
                    student_name: attempt.student_name,
                    grade: attempt.grade,
                    attempts: 0,
                    percent: attempt.percent,
                    diagnostic_percent: attempt.diagnostic_percent,
                    progress: attempt.progress,
                    weak_skills: attempt.weak_skills,
                    process_steps: attempt.process_steps || [],
                    date: attempt.created_at.slice(0, 10)
                });
            }
            grouped.get(key).attempts += 1;
        });
        reports = [...grouped.values()];
        renderReports();
        renderAnalytics();
        showStatus('حُذفت محاولات الطالب من قاعدة البيانات.');
    } catch (error) {
        showStatus(`تعذر حذف النتائج: ${error.message}`, true);
    }
});

document.querySelector('#platform-settings').addEventListener('submit', async (event) => {
    event.preventDefault();
    settings = {
        name: document.querySelector('#platform-name').value.trim(),
        school: document.querySelector('#school-name').value.trim(),
        format: document.querySelector('#report-format').value,
        language: document.querySelector('#language-setting').value,
        showDetails: document.querySelector('#show-student-details').checked,
        allowSupport: document.querySelector('#allow-support').checked
    };
    try {
        await backend.saveContent('settings', settings);
        showStatus(`تم حفظ إعدادات ${settings.name}.`);
    } catch (error) {
        showStatus(`تعذر حفظ الإعدادات: ${error.message}`, true);
    }
});

document.querySelector('#account-editor').addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.querySelector('#account-message');
    try {
        await backend.updateDisplayName(document.querySelector('#account-name').value.trim());
        profile.display_name = document.querySelector('#account-name').value.trim();
        document.querySelector('#dashboard-account').textContent = `مرحبًا ${profile.display_name}`;
        message.textContent = 'تم تحديث الاسم الظاهر.';
    } catch (error) {
        message.textContent = `تعذر تحديث الحساب: ${error.message}`;
    }
});

document.querySelector('#question-search').addEventListener('input', renderQuestions);
document.querySelector('#question-stage').addEventListener('change', () => {
    document.querySelector('#question-editor').classList.remove('open');
    editingQuestion = null;
    renderQuestions();
});
document.querySelector('#add-question').addEventListener('click', () => openQuestionEditor());
document.querySelector('#cancel-question').addEventListener('click', () => {
    document.querySelector('#question-editor').classList.remove('open');
    editingQuestion = null;
});
document.querySelector('#question-editor').addEventListener('submit', async (event) => {
    event.preventDefault();
    const answer = Number(document.querySelector('#answer-index').value);
    const choices = [0, 1, 2, 3].map((number) => document.querySelector(`#choice-${number}`).value.trim());
    const skill = document.querySelector('#question-skill').value;
    const text = document.querySelector('#question-text').value.trim();
    if (!text || !choices.every(Boolean) || !Number.isInteger(answer) || answer < 0 || answer > 3) {
        showStatus('أكمل نص السؤال والخيارات وحدد رقم الإجابة من 0 إلى 3.', true);
        return;
    }
    const stage = document.querySelector('#question-stage').value;
    const question = {
        text,
        choices,
        skill,
        difficulty: Number(document.querySelector('#question-difficulty').value),
        answer,
        explanation: document.querySelector('#question-explanation').value.trim(),
        passage: document.querySelector('#question-passage').value.trim(),
        creator: profile.display_name || profile.email
    };
    if (editingQuestion === null) questions[stage].push(question);
    else questions[stage][editingQuestion] = question;
    try {
        await saveQuestions();
        document.querySelector('#question-editor').classList.remove('open');
        editingQuestion = null;
    } catch (error) {
        showStatus(`تعذر حفظ السؤال: ${error.message}`, true);
    }
});
document.querySelector('#question-list').addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit-question]');
    const remove = event.target.closest('[data-delete-question]');
    if (edit) openQuestionEditor(Number(edit.dataset.editQuestion));
    if (remove && confirm('حذف السؤال نهائيًا؟')) {
        const stage = document.querySelector('#question-stage').value;
        questions[stage].splice(Number(remove.dataset.deleteQuestion), 1);
        try {
            await saveQuestions();
        } catch (error) {
            showStatus(`تعذر حذف السؤال: ${error.message}`, true);
        }
    }
});

document.querySelector('#intervention-list').addEventListener('change', async (event) => {
    const field = event.target.closest('[data-intervention-content]');
    if (!field) return;
    interventions[Number(field.dataset.interventionContent)].content = field.value;
    try {
        await backend.saveContent('interventions', interventions);
        showStatus('تم حفظ التدخل التعليمي.');
    } catch (error) {
        showStatus(`تعذر حفظ التدخل: ${error.message}`, true);
    }
});

document.querySelector('#support-tickets').addEventListener('click', async (event) => {
    const card = event.target.closest('[data-ticket]');
    if (!card) return;
    const ticketCode = card.dataset.ticket;
    try {
        if (event.target.closest('[data-save-support]')) {
            await backend.updateTicket(
                ticketCode,
                card.querySelector('[data-support-status]').value,
                card.querySelector('[data-support-reply]').value.trim()
            );
            tickets = await backend.loadTickets();
            renderSupport();
            showStatus('تم حفظ رد الدعم.');
        } else if (event.target.closest('[data-delete-support]') && confirm('حذف تذكرة الدعم نهائيًا؟')) {
            await backend.deleteTicket(ticketCode);
            tickets = await backend.loadTickets();
            renderSupport();
            showStatus('تم حذف التذكرة.');
        }
    } catch (error) {
        showStatus(`تعذر تحديث التذكرة: ${error.message}`, true);
    }
});

document.querySelector('#teacher-editor').addEventListener('submit', async (event) => {
    event.preventDefault();
    const permissions = [...document.querySelectorAll('input[name="permission"]:checked')]
        .map((field) => field.value);
    try {
        await backend.inviteTeacher({
            email: document.querySelector('#teacher-email').value.trim(),
            displayName: document.querySelector('#teacher-name').value.trim(),
            permissions
        });
        teachers = await backend.loadTeachers();
        renderTeachers();
        event.target.reset();
        showStatus('أُرسلت دعوة المعلم إلى بريده الإلكتروني.');
    } catch (error) {
        showStatus(`تعذر دعوة المعلم: ${error.message}`, true);
    }
});

document.querySelector('#teacher-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-toggle-teacher]');
    if (!button) return;
    const teacher = teachers.find((item) => item.id === button.dataset.toggleTeacher);
    if (!teacher) return;
    try {
        const { error } = await backend.requireClient().from('profiles')
            .update({ active: !teacher.active })
            .eq('id', teacher.id);
        if (error) throw error;
        teachers = await backend.loadTeachers();
        renderTeachers();
        showStatus('تم تحديث حالة حساب المعلم.');
    } catch (error) {
        showStatus(`تعذر تحديث حساب المعلم: ${error.message}`, true);
    }
});

void initialize().catch((error) => {
    console.error('Unable to initialize the teacher dashboard.', error);
    showStatus(`تعذر تحميل لوحة المعلم: ${error.message}`, true);
});
