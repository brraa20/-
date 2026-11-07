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
    if (!canAccessPanel(panelName)) return;
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
    return profile.permissions.includes(permission);
}

function canAccessPanel(panelName) {
    const permission = panelPermissions[panelName];
    if (!permission) return false;
    return permission === 'owner' ? profile.role === 'owner' : can(permission);
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
    document.querySelector('#tested-count').textContent =
        filtered.length ? `${filtered.length} طالب/ة` : 'لا توجد نتائج';
    document.querySelector('#student-report-list').innerHTML = filtered.length
        ? filtered.map((report) => `
            <tr>
                <td>${escapeHtml(report.student_name)}</td><td>${escapeHtml(report.grade)}</td>
                <td>${report.attempts}</td><td>${report.percent}%</td>
                <td>${escapeHtml(report.progress)}</td><td>${escapeHtml(report.date)}</td>
                <td class="report-actions-cell">
                    <button type="button" class="secondary-button" data-preview-report="${escapeHtml(report.id)}">معاينة وطباعة</button>
                    <button type="button" class="danger-button" data-delete-report="${escapeHtml(report.id)}">حذف النتائج</button>
                </td>
            </tr>`).join('')
        : '<tr><td colspan="7" class="empty-state">لا توجد نتائج مطابقة.</td></tr>';
}

function renderAnalytics(summary = null) {
    const studentCount = summary?.student_count ?? reports.length;
    const average = summary?.average_percent ?? (reports.length
        ? Math.round(reports.reduce((sum, report) => sum + report.percent, 0) / reports.length)
        : 0);
    const diagnosticAverage = summary?.diagnostic_average ?? (reports.length
        ? Math.round(reports.reduce((sum, report) => sum + report.diagnostic_percent, 0) / reports.length)
        : 0);
    const highest = summary?.highest_percent ?? (reports.length ? Math.max(...reports.map((report) => report.percent)) : 0);
    const totalAttempts = summary?.total_attempts
        ?? reports.reduce((sum, report) => sum + report.attempts, 0);
    document.querySelector('#analytics-metrics').innerHTML = `
        <article class="metric-card"><strong>${studentCount}</strong><span>عدد المختبرين</span></article>
        <article class="metric-card"><strong>${average}%</strong><span>المتوسط العام</span></article>
        <article class="metric-card"><strong>${highest}%</strong><span>أعلى مستوى إتقان</span></article>
        <article class="metric-card"><strong>${totalAttempts}</strong><span>إجمالي المحاولات</span></article>`;
    document.querySelector('#progress-chart').innerHTML = studentCount
        ? chartMarkup([['التشخيصي', diagnosticAverage], ['الشامل', average]], '%')
        : '<p class="empty-state">ستظهر المقارنة بعد إكمال أول اختبار.</p>';
    const weakSkills = summary?.weak_skills
        ? summary.weak_skills.map(({ skill, count }) => [skill, count])
        : (() => {
            const frequency = {};
            reports.forEach((report) => report.weak_skills.forEach((skill) => {
                frequency[skill] = (frequency[skill] || 0) + 1;
            }));
            return Object.entries(frequency);
        })();
    document.querySelector('#skills-chart').innerHTML = weakSkills.length
        ? chartMarkup(weakSkills, ' طالب/ة')
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
            <div class="meta-row"><span class="meta-tag">${
                !teacher.invitation_accepted ? 'بانتظار قبول الدعوة'
                    : teacher.active ? 'نشط' : 'غير نشط'
            }</span>
            ${teacher.permissions.map((permission) => `<span class="meta-tag">${escapeHtml(permission)}</span>`).join('')}</div>
            <button type="button" class="secondary-button" data-toggle-teacher="${teacher.id}" data-active="${teacher.active}" ${teacher.invitation_accepted ? '' : 'disabled'}>
                ${!teacher.invitation_accepted ? 'بانتظار قبول الدعوة' : teacher.active ? 'إيقاف الحساب' : 'تفعيل الحساب'}
            </button>
            ${teacher.invitation_accepted ? `<button type="button" class="secondary-button" data-reset-teacher-password="${teacher.id}">إرسال رابط إعادة تعيين كلمة المرور</button>` : ''}
            </article>`).join('')
        : '<p class="empty-state">لا توجد حسابات معلمين.</p>';
}

async function initialize() {
    if (!backend.isConfigured) {
        showStatus(backend.configurationMessage, true);
        return;
    }

    try {
        profile = await backend.getProfile();
    } catch (error) {
        console.error('Unable to verify the teacher profile.', error);
        showStatus(`تعذر التحقق من صلاحيات الحساب: ${error.message}`, true);
        const { error: signOutError } = await backend.requireClient().auth.signOut();
        if (signOutError) console.error('Unable to sign out an unverified account.', signOutError);
        window.location.replace('teacher-login.html');
        return;
    }

    const isOwner = profile?.role === 'owner';
    const teacherHasPermission = Array.isArray(profile?.permissions)
        && ['reports', 'analytics', 'questions', 'interventions', 'support']
            .some((permission) => profile.permissions.includes(permission));
    const allowed = !!profile
        && profile.active === true
        && ['owner', 'teacher'].includes(profile.role)
        && (isOwner || profile.invitation_accepted === true)
        && (isOwner || teacherHasPermission);
    if (!allowed) {
        const { error: signOutError } = await backend.requireClient().auth.signOut();
        if (signOutError) console.error('Unable to sign out an unauthorized account.', signOutError);
        window.location.replace('teacher-login.html');
        return;
    }

    document.querySelector('#dashboard-account').textContent =
        `مرحبًا ${profile.display_name || profile.email}`;
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
        renderReports();
        if (can('analytics')) renderAnalytics();
    } else if (can('analytics')) {
        renderAnalytics(await backend.loadAnalyticsSummary());
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
    const button = event.target.closest('[data-preview-report]');
    const report = reports.find((item) => item.id === button?.dataset.previewReport);
    if (!report) return;

    const diagnosticPercent = Math.min(100, Math.max(0, Number(report.diagnostic_percent) || 0));
    const finalPercent = Math.min(100, Math.max(0, Number(report.percent) || 0));
    const weakSkills = Array.isArray(report.weak_skills) ? report.weak_skills : [];
    const steps = processStepsSummary(Array.isArray(report.process_steps) ? report.process_steps : []);
    document.querySelector('#report-preview-content').innerHTML = `
        <header class="report-preview__identity">
            <p class="report-preview__eyebrow">منصة طلاقة • تقرير القراءة</p>
            <h3>${escapeHtml(report.student_name)}</h3>
            <p>${escapeHtml(report.grade)} <span aria-hidden="true">•</span> تاريخ آخر محاولة: ${escapeHtml(report.date)}</p>
        </header>
        <section class="report-preview__metrics" aria-label="ملخص النتيجة">
            <article><span>عدد المحاولات</span><strong>${Number(report.attempts) || 0}</strong></article>
            <article><span>النتيجة النهائية</span><strong>${finalPercent}%</strong></article>
            <article><span>مستوى التقدم</span><strong>${escapeHtml(report.progress)}</strong></article>
        </section>
        <section class="report-preview__chart" aria-labelledby="report-chart-title">
            <h4 id="report-chart-title">مقارنة نتيجة التشخيص والاختبار الشامل</h4>
            <div class="report-score">
                <div><span>التشخيص</span><strong>${diagnosticPercent}%</strong></div>
                <div class="report-score__track" role="img" aria-label="نتيجة التشخيص ${diagnosticPercent}%"><i style="width:${diagnosticPercent}%"></i></div>
            </div>
            <div class="report-score">
                <div><span>الاختبار الشامل</span><strong>${finalPercent}%</strong></div>
                <div class="report-score__track" role="img" aria-label="نتيجة الاختبار الشامل ${finalPercent}%"><i style="width:${finalPercent}%"></i></div>
            </div>
        </section>
        <section class="report-preview__skills">
            <h4>مهارات تحتاج إلى تعزيز</h4>
            <p>${weakSkills.length ? weakSkills.map(escapeHtml).join('، ') : 'لا توجد مهارات مسجلة تحتاج إلى تعزيز.'}</p>
        </section>
        <section class="report-preview__steps">
            <h4>خطوات التعلّم في آخر محاولة</h4>
            <pre>${escapeHtml(steps || 'لا تتوفر تفاصيل الخطوات.')}</pre>
        </section>`;
    document.querySelector('#student-report-dialog').showModal();
});
document.querySelector('#student-report-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delete-report]');
    const report = reports.find((item) => item.id === button?.dataset.deleteReport);
    if (!report || !confirm(`سيؤدي ذلك إلى حذف جميع نتائج ${report.student_name} في ${report.grade}. هل تريد المتابعة؟`)) return;
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
        showStatus('حُذفت جميع نتائج الطالب/ة من قاعدة البيانات.');
    } catch (error) {
        showStatus(`تعذر حذف النتائج: ${error.message}`, true);
    }
});

document.querySelectorAll('[data-close-report]').forEach((button) => {
    button.addEventListener('click', () => document.querySelector('#student-report-dialog').close());
});
document.querySelector('#print-student-report').addEventListener('click', () => {
    const printRoot = document.querySelector('#student-report-print-root');
    printRoot.replaceChildren(document.querySelector('#report-preview-content').cloneNode(true));
    printRoot.hidden = false;
    document.body.classList.add('printing-student-report');
    window.print();
});
window.addEventListener('afterprint', () => {
    document.body.classList.remove('printing-student-report');
    const printRoot = document.querySelector('#student-report-print-root');
    printRoot.hidden = true;
    printRoot.replaceChildren();
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
        const invitation = await backend.inviteTeacher({
            email: document.querySelector('#teacher-email').value.trim(),
            displayName: document.querySelector('#teacher-name').value.trim(),
            permissions,
            redirectTo: new URL('create-password.html', window.location.href).toString()
        });
        teachers = await backend.loadTeachers();
        renderTeachers();
        event.target.reset();
        showStatus(`أُرسلت دعوة المعلم إلى بريده الإلكتروني. سيُنشئ كلمة مروره عبر صفحة القبول: ${invitation.redirectTo}`);
    } catch (error) {
        showStatus(`تعذر دعوة المعلم: ${error.message}`, true);
    }
});

document.querySelector('#teacher-list').addEventListener('click', async (event) => {
    const resetButton = event.target.closest('[data-reset-teacher-password]');
    if (resetButton) {
        const teacher = teachers.find((item) => item.id === resetButton.dataset.resetTeacherPassword);
        if (!teacher) return;
        resetButton.disabled = true;
        try {
            const redirectTo = new URL('update-password.html', window.location.href).toString();
            const { error } = await backend.requireClient().auth.resetPasswordForEmail(teacher.email, { redirectTo });
            if (error) throw error;
            showStatus(`تم إرسال رابط إعادة تعيين كلمة المرور إلى ${teacher.email}.`);
        } catch (error) {
            showStatus(`تعذر إرسال رابط إعادة تعيين كلمة المرور: ${error.message}`, true);
        } finally {
            resetButton.disabled = false;
        }
        return;
    }

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
