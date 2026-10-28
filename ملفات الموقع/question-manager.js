if (sessionStorage.getItem('talalaTeacherSession') !== 'authenticated') {
    window.location.replace('teacher-login.html');
}

const originals = JSON.parse(JSON.stringify(window.TalalaAssessmentData));
const key = 'talalaReadingQuestionBank';
const allowedStages = ['diagnostic', 'intervention', 'final'];
const allowedSkills = new Set(window.TalalaAssessmentData.skills.map((skill) => skill.id));

function loadBank() {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    return saved && allowedStages.every((stage) => Array.isArray(saved[stage]))
        ? saved
        : JSON.parse(JSON.stringify(window.TalalaAssessmentData.questions));
}

let bank = loadBank();
let editing = null;

const stageSelect = document.querySelector('#question-stage');
const editor = document.querySelector('#question-editor');
const list = document.querySelector('#question-list');
const skillSelect = document.querySelector('#question-skill');
const fields = {
    text: document.querySelector('#question-text'),
    choices: [0, 1, 2, 3].map((index) => document.querySelector(`#choice-${index}`)),
    answer: document.querySelector('#answer-index'),
    explanation: document.querySelector('#question-explanation'),
    passage: document.querySelector('#question-passage')
};

window.TalalaAssessmentData.skills.forEach((skill) => {
    skillSelect.add(new Option(`${skill.name} — ${skill.domain}`, skill.id));
});

function cleanQuestion(question) {
    if (!allowedSkills.has(question.skill)) throw new Error('المهارة خارج مجال القراءة.');
    if (!question.text.trim() || question.choices.length !== 4 || question.choices.some((choice) => !choice.trim())) throw new Error('يرجى تعبئة السؤال والأربعة خيارات.');
    const answer = Number(question.answer);
    if (!Number.isInteger(answer) || answer < 0 || answer > 3) throw new Error('رقم الإجابة يجب أن يكون من 0 إلى 3.');
    return {
        ...question,
        text: question.text.trim(),
        choices: question.choices.map((choice) => choice.trim()),
        answer,
        explanation: question.explanation.trim(),
        passage: question.passage?.trim() || ''
    };
}

function saveBank() {
    localStorage.setItem(key, JSON.stringify(bank));
}

function render() {
    const stage = stageSelect.value;
    list.innerHTML = bank[stage].length
        ? bank[stage].map((question, index) => `
            <article class="manager-question">
                <div>
                    <strong>${index + 1}. ${escapeHtml(question.text)}</strong>
                    <p>${window.TalalaAssessmentData.skills.find((skill) => skill.id === question.skill)?.name || question.skill}</p>
                </div>
                <div class="manager-actions">
                    <button type="button" class="action-button" data-edit="${index}">تعديل</button>
                    <button type="button" class="danger-button" data-delete="${index}">حذف</button>
                </div>
            </article>`).join('')
        : '<p>لا توجد أسئلة في هذه المرحلة. أضف سؤالًا جديدًا.</p>';

    list.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => openEditor(Number(button.dataset.edit))));
    list.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', () => {
        if (!confirm('هل تريد حذف هذا السؤال؟')) return;
        bank[stage].splice(Number(button.dataset.delete), 1);
        saveBank();
        render();
    }));
}

function openEditor(index = null) {
    editing = index;
    const question = index === null ? { skill: skillSelect.value, text: '', choices: ['', '', '', ''], answer: 0, explanation: '', passage: '' } : bank[stageSelect.value][index];
    fields.text.value = question.text;
    fields.choices.forEach((field, choiceIndex) => field.value = question.choices[choiceIndex] || '');
    fields.answer.value = question.answer;
    fields.explanation.value = question.explanation || '';
    fields.passage.value = question.passage || '';
    skillSelect.value = question.skill;
    editor.classList.add('open');
    fields.text.focus();
}

function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = value;
    return element.innerHTML;
}

document.querySelector('#add-question').addEventListener('click', () => openEditor());
document.querySelector('#save-question').addEventListener('click', () => {
    try {
        const question = cleanQuestion({
            skill: skillSelect.value,
            text: fields.text.value,
            choices: fields.choices.map((field) => field.value),
            answer: Number(fields.answer.value),
            explanation: fields.explanation.value,
            passage: fields.passage.value
        });
        const stage = stageSelect.value;
        if (editing === null) bank[stage].push(question);
        else bank[stage][editing] = question;
        saveBank();
        editor.classList.remove('open');
        editing = null;
        render();
    } catch (error) {
        alert(error.message);
    }
});

document.querySelector('#reset-questions').addEventListener('click', () => {
    if (!confirm('ستُستعاد جميع الأسئلة الأصلية وتُهمل التعديلات؟')) return;
    bank = JSON.parse(JSON.stringify(originals.questions));
    saveBank();
    render();
});

document.querySelector('#logout').addEventListener('click', () => {
    sessionStorage.removeItem('talalaTeacherSession');
    window.location.href = 'teacher-login.html';
});

stageSelect.addEventListener('change', () => {
    editor.classList.remove('open');
    editing = null;
    render();
});

const supportInbox = document.querySelector('#support-inbox');
const supportTickets = document.querySelector('#support-tickets');
const supportKey = 'talalaSupportTickets';

function loadSupportTickets() {
    return JSON.parse(localStorage.getItem(supportKey) || '[]');
}

function saveSupportTickets(tickets) {
    localStorage.setItem(supportKey, JSON.stringify(tickets));
}

function renderSupportTickets() {
    const tickets = loadSupportTickets();
    supportTickets.innerHTML = tickets.length
        ? tickets.map((ticket, index) => `
            <article style="margin-top:14px;padding:14px;border:1px solid #ddd9ca;border-radius:7px;background:#fff">
                <strong>${escapeHtml(ticket.number)} — ${escapeHtml(ticket.type)}</strong>
                <p>${escapeHtml(ticket.fullName)} | ${escapeHtml(ticket.subject)}</p>
                <p>${escapeHtml(ticket.details)}</p>
                <label>حالة الرد</label>
                <select data-status="${index}" style="margin:8px 0;padding:8px;border:1px solid #bdc2b2;border-radius:5px">
                    ${['بانتظار الرد', 'قيد المعالجة', 'تم الرد'].map((status) => `<option${ticket.status === status ? ' selected' : ''}>${status}</option>`).join('')}
                </select>
                <textarea data-reply="${index}" rows="3" style="width:100%;padding:10px;border:1px solid #bdc2b2;border-radius:5px" placeholder="رد مالك المنصة">${escapeHtml(ticket.reply || '')}</textarea>
                <button type="button" class="primary-button" data-save-ticket="${index}" style="margin-top:8px">حفظ الرد</button>
                <button type="button" class="danger-button" data-delete-ticket="${index}">حذف الطلب</button>
            </article>`).join('')
        : '<p>لا توجد طلبات دعم جديدة.</p>';

    supportTickets.querySelectorAll('[data-save-ticket]').forEach((button) => button.addEventListener('click', () => {
        const index = Number(button.dataset.saveTicket);
        const allTickets = loadSupportTickets();
        allTickets[index].status = supportTickets.querySelector(`[data-status="${index}"]`).value;
        allTickets[index].reply = supportTickets.querySelector(`[data-reply="${index}"]`).value.trim();
        allTickets[index].updatedAt = new Date().toISOString();
        saveSupportTickets(allTickets);
        renderSupportTickets();
    }));

    supportTickets.querySelectorAll('[data-delete-ticket]').forEach((button) => button.addEventListener('click', () => {
        if (!confirm('هل تريد حذف تذكرة الدعم نهائيًا؟')) return;
        const allTickets = loadSupportTickets();
        allTickets.splice(Number(button.dataset.deleteTicket), 1);
        saveSupportTickets(allTickets);
        renderSupportTickets();
    }));
}

document.querySelector('#open-support').addEventListener('click', () => {
    supportInbox.hidden = !supportInbox.hidden;
    if (!supportInbox.hidden) renderSupportTickets();
});

render();
