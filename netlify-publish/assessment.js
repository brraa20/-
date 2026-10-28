const studentName = sessionStorage.getItem('talalaStudentName');
const studentGrade = sessionStorage.getItem('talalaStudentGrade');
const data = window.TalalaAssessmentData;
const customQuestions = JSON.parse(localStorage.getItem('talalaReadingQuestionBank') || 'null');
if (customQuestions && ['diagnostic', 'intervention', 'final'].every((stage) => Array.isArray(customQuestions[stage]))) {
    data.questions = customQuestions;
}

if (!studentName || !studentGrade || sessionStorage.getItem('talalaAssessmentStarted') !== 'true') {
    window.location.replace(studentName && studentGrade ? 'assessment-instructions.html' : 'index.html');
}

const state = {
    stage: 'diagnostic',
    index: 0,
    answers: [],
    mistakes: [],
    finalAnswers: [],
    finalQuestions: []
};

const titles = {
    diagnostic: 'الاختبار التشخيصي',
    intervention: 'التدخل والعلاج والتنمية',
    final: 'الاختبار الشامل',
    results: 'أثر التعلم والتقدم'
};

const content = document.querySelector('#assessment-content');
const title = document.querySelector('#stage-title');
const studentChip = document.querySelector('#student-chip');
const progressLabel = document.querySelector('#progress-label');
const progressBar = document.querySelector('#progress-bar');
const stageLabel = document.querySelector('#stage-label');
const previousButton = document.querySelector('#previous-question');
const nextButton = document.querySelector('#next-question');

studentChip.textContent = `${studentName} • ${studentGrade}`;

function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = value;
    return element.innerHTML;
}

function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
    }
    return copy;
}

function skillById(id) {
    return data.skills.find((skill) => skill.id === id);
}

function getQuestions() {
    if (state.stage === 'diagnostic') return data.questions.diagnostic;
    if (state.stage === 'final') return state.finalQuestions;
    return data.questions.intervention;
}

function getAnswers() {
    return state.stage === 'final' ? state.finalAnswers : state.answers;
}

function progress() {
    const questions = getQuestions();
    const total = questions.length;
    const current = state.index + 1;
    progressLabel.textContent = `السؤال ${current} من ${total}`;
    const percentage = total ? Math.round((current / total) * 100) : 0;
    progressBar.style.width = `${percentage}%`;
    progressBar.parentElement.setAttribute('aria-valuenow', String(percentage));
    stageLabel.textContent = state.stage === 'diagnostic'
        ? 'تشخيص المهارات'
        : state.stage === 'intervention' ? 'التدخل المخصص' : 'الاختبار الشامل';
}

function renderQuestion() {
    const questions = getQuestions();
    const answers = getAnswers();
    const question = questions[state.index];
    const skill = skillById(question.skill);

    content.innerHTML = `
        <section class="question-card">
            <span class="skill-tag">${escapeHtml(skill.domain)} — ${escapeHtml(skill.name)}</span>
            ${question.passage ? `<p class="passage">${escapeHtml(question.passage)}</p>` : ''}
            <h2 class="question-text">${escapeHtml(question.text)}</h2>
            <div class="answer-grid" role="radiogroup" aria-label="خيارات الإجابة">
                ${question.choices.map((choice, choiceIndex) => `
                    <button
                        type="button"
                        class="answer-option${answers[state.index] === choiceIndex ? ' selected' : ''}"
                        role="radio"
                        aria-checked="${answers[state.index] === choiceIndex}"
                        data-choice="${choiceIndex}">
                        ${escapeHtml(choice)}
                    </button>
                `).join('')}
            </div>
        </section>`;

    content.querySelectorAll('.answer-option').forEach((button) => {
        button.addEventListener('click', () => {
            answers[state.index] = Number(button.dataset.choice);
            renderQuestion();
        });
    });

    previousButton.hidden = state.index === 0;
    nextButton.disabled = answers[state.index] === undefined;
    nextButton.textContent = state.index === questions.length - 1
        ? (state.stage === 'diagnostic' ? 'تسليم التشخيص' : 'تسليم الاختبار الشامل')
        : 'السؤال التالي';
    progress();
}

function calculateResults(questions, answers) {
    return data.skills.map((skill) => {
        const skillQuestions = questions
            .map((question, index) => ({ question, index }))
            .filter(({ question }) => question.skill === skill.id);
        const correct = skillQuestions.filter(({ question, index }) => answers[index] === question.answer).length;
        const percent = skillQuestions.length ? Math.round((correct / skillQuestions.length) * 100) : 0;
        const mastery = percent >= 80 ? 'إتقان مرتفع' : percent >= 60 ? 'إتقان متطور يحتاج دعمًا' : 'يحتاج إلى تدخل مخصص';
        return { ...skill, correct, total: skillQuestions.length, percent, mastery };
    });
}

const skillInterventions = {
    literal: {
        goal: 'تحديد المعلومات الواردة مباشرةً في النص.',
        action: 'اقرأ السطر مرة واحدة، ثم أعد قراءة العبارة الدالة وحدد ما ذُكر دون إضافة تفسير.',
        example: 'في نص القندس: أين يعيش؟ الجواب الوارد حرفيًا هو «قرب الأنهار والبحيرات».'
    },
    inferential: {
        goal: 'ربط الدلائل للوصول إلى استنتاج معقول.',
        action: 'حدّد دليلًا ظاهرًا في النص، اسأل «لماذا؟»، ثم اكتب استنتاجًا يدعمه دليل واحد على الأقل.',
        example: 'إذا حمل سليم مظلته، فدليل الغيوم يدعم استنتاج احتمال المطر.'
    },
    vocab: {
        goal: 'استنتاج معنى المفردة من سياق النص.',
        action: 'غطّ المفردة، اقترح معاني محتملة من الجملة، ثم اختر معنى يناسب التركيب كاملًا.',
        example: 'في «اقتربت السحابة رزانة» يفهم معنى رزانة من ارتباطها بالهدوء والحكمة.'
    },
    structure: {
        goal: 'تمييز بنية النص والعلاقات بين أفكاره.',
        action: 'ارسم جملة الفكرة الرئيسة، ثم ضع أسهمًا تمثل السبب والنتيجة أو المشكلة والحل.',
        example: 'عبارة «لأن» تدل على سبب، أما العبارة التي تليه فتوضح النتيجة.'
    },
    critical: {
        goal: 'تقييم الادعاءات والأدلة منطقياً.',
        action: 'قس الدليل إلى مصدره ومعلوماته، واسأل هل يمكن التحقق منه وماذا تثبت فعليًا؟',
        example: 'الإعلان الذي يقدم بيانات قابلة للتحقق أقوى من عبارة «إنه الأفضل».'
    }
};

function renderIntervention() {
    state.stage = 'intervention';
    state.index = 0;
    title.textContent = titles.intervention;
    progressLabel.textContent = 'شرح المهارات ومراجعة الأخطاء';
    progressBar.style.width = '100%';
    stageLabel.textContent = 'التدخل المخصص';
    previousButton.hidden = true;

    const mistakes = data.questions.diagnostic
        .map((question, index) => ({ question, answer: state.answers[index] }))
        .filter(({ question, answer }) => answer !== question.answer);

    const skillResults = calculateResults(data.questions.diagnostic, state.answers);
    state.diagnosticResults = skillResults;
    const weakSkills = skillResults.filter((skill) => skill.percent < 80);

    content.innerHTML = `
        <section class="intervention-card">
            <h2>${weakSkills.length ? 'خطة التدخل المخصص' : 'مراجعة متوازنة للمهارات'}</h2>
            <p class="learning-path">المهارة ← إتقان التشخيص ← التدخل المقترح ← مثال تطبيقي ← الإتقان اللاحق ← الأثر</p>
            ${weakSkills.length ? `
                <div class="lesson-grid">
                    ${weakSkills.map((skill) => {
                        const guide = skillInterventions[skill.id];
                        return `
                            <article class="lesson-block intervention-plan">
                                <span class="skill-tag">المهارة: ${escapeHtml(skill.name)}</span>
                                <div class="mastery-row"><strong>${skill.percent}%</strong><span>${escapeHtml(skill.mastery)}</span></div>
                                <h2>الهدف التدريبي</h2><p>${escapeHtml(guide.goal)}</p>
                                <h2>التدخل المقترح</h2><p>${escapeHtml(guide.action)}</p>
                                <h2>مثال تطبيقي</h2><p class="practice-example">${escapeHtml(guide.example)}</p>
                            </article>`;
                    }).join('')}
                </div>` : '<p>أظهر التشخيص إتقانًا مرتفعًا في المهارات الخمس، وسننتقل إلى الاختبار الشامل لقياس الأثر.</p>'}
            <h2 style="margin-top:24px">الأسئلة التي أُجبت عليها بشكل خاطئ</h2>
            <div class="error-review">
                ${mistakes.length ? mistakes.map(({ question, answer }) => `
                    <article class="error-item">
                        <strong>${escapeHtml(question.text)}</strong>
                        <p class="error-answer">إجابتك: ${escapeHtml(question.choices[answer] ?? 'لم تُجب')}<br>
                        <span class="correct-answer">الإجابة الصحيحة: ${escapeHtml(question.choices[question.answer])}</span></p>
                        <p>${escapeHtml(question.explanation)}</p>
                    </article>
                `).join('') : '<p>لم تقع أي أخطاء في التشخيص، سننتقل إلى التطبيق الشامل.</p>'}
            </div>
        </section>`;

    nextButton.disabled = false;
    nextButton.textContent = 'ابدأ الاختبار الشامل';
}

function buildFinalQuestions() {
    const usedStorageKey = `talalaUsedFinalQuestions-${encodeURIComponent(studentName)}-${encodeURIComponent(studentGrade)}`;
    const usedIds = JSON.parse(localStorage.getItem(usedStorageKey) || '[]');
    const sourceQuestions = data.questions.final.length >= 20
        ? data.questions.final
        : data.questions.diagnostic;
    const skillQuestions = data.skills.map((skill) => {
        const available = sourceQuestions
            .filter((question) => question.skill === skill.id)
            .filter((question) => !usedIds.includes(`${skill.id}-${question.text}`))
            .map((question, index) => ({ ...question, uid: `${skill.id}-${question.text}`, variant: index + 1 }));
        return available.length ? available : sourceQuestions.filter((question) => question.skill === skill.id).map((question) => ({ ...question, uid: `${skill.id}-${question.text}-repeat`, variant: question.variant || 1 }));
    });

    const questions = skillQuestions.flatMap((list) => shuffle(list).slice(0, 4));
    if (questions.length < 20) {
        const sourcePool = [...sourceQuestions];
        while (questions.length < 20) {
            questions.push({ ...sourcePool[questions.length % sourcePool.length], uid: `${sourcePool[questions.length % sourcePool.length].uid || sourcePool[questions.length % sourcePool.length].text}-repeat-${questions.length}` });
        }
    }
    const selected = shuffle(questions).slice(0, 20);
    localStorage.setItem(usedStorageKey, JSON.stringify([...usedIds, ...selected.map((question) => question.uid)].slice(-240)));
    state.finalQuestions = selected;
}

function startFinalTest() {
    state.stage = 'final';
    state.index = 0;
    state.finalAnswers = [];
    title.textContent = titles.final;
    buildFinalQuestions();
    renderQuestion();
}

function renderResults() {
    state.stage = 'results';
    title.textContent = titles.results;
    progressLabel.textContent = 'ملخص الإتقان والاتجاه';
    progressBar.style.width = '100%';
    stageLabel.textContent = 'نتائج التعلم';
    previousButton.hidden = true;

    const diagnosticResults = state.diagnosticResults || calculateResults(data.questions.diagnostic, state.answers);
    const finalResults = calculateResults(state.finalQuestions, state.finalAnswers);
    const impactResults = finalResults.map((result, index) => {
        const difference = result.percent - diagnosticResults[index].percent;
        const impact = difference >= 15 ? 'تحسن ملحوظ' : difference >= 5 ? 'تحسن تدريجي' : difference >= -4 ? 'استقرار الإتقان' : 'يحتاج دعمًا إضافيًا';
        return { ...result, difference, impact };
    });
    saveStudentReport(diagnosticResults, finalResults);

    content.innerHTML = `
        <section class="results-card">
            <div class="result-header">
                <div><h2>نتائج الطالب/ة</h2><p>${escapeHtml(studentName)} • ${escapeHtml(studentGrade)}</p></div>
            </div>
            <div class="results-grid">
                ${impactResults.map((result) => `
                    <article class="skill-result">
                        <div class="skill-result-row">
                            <div><div class="skill-name">${escapeHtml(result.name)}</div><small>تشخيص ${diagnosticResults.find((item) => item.id === result.id).percent}% ← شامل ${result.percent}%</small></div>
                            <strong>${result.percent}%</strong>
                        </div>
                        <div class="bar-track"><div style="width:${result.percent}%;background:${result.color}"></div></div>
                        <p>${result.correct} من ${result.total} مؤشرات صحيحة • فرق التحسن ${result.difference >= 0 ? '+' : ''}${result.difference}%</p>
                        <p><strong>${escapeHtml(result.impact)}</strong> في مهارة ${escapeHtml(result.name)}</p>
                    </article>
                `).join('')}
                <div class="chart-panel">
                    <h2>مستوى الإتقان النهائي</h2>
                    <div class="chart-bars">
                        ${finalResults.map((result) => `
                            <div class="chart-column">
                                <strong>${result.percent}%</strong>
                                <div class="bar" style="height:${result.percent}%;background:${result.color}" title="${escapeHtml(result.name)}"></div>
                                <span>${escapeHtml(result.name)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <p class="local-storage-note">حُفظ هذا الملخص في هذا المتصفح فقط.</p>
            <div class="action-row">
                <button type="button" class="action-button" id="print-results">طباعة التقرير أو حفظه PDF</button>
            </div>
        </section>`;

    nextButton.hidden = true;
    document.querySelector('#print-results').addEventListener('click', () => window.print());
}

function saveStudentReport(diagnosticResults, finalResults) {
    const reportsKey = 'talalaStudentReports';
    const reports = JSON.parse(localStorage.getItem(reportsKey) || '[]');
    const diagnosticTotal = diagnosticResults.reduce((total, result) => total + result.total, 0);
    const diagnosticCorrect = diagnosticResults.reduce((total, result) => total + result.correct, 0);
    const finalTotal = finalResults.reduce((total, result) => total + result.total, 0);
    const finalCorrect = finalResults.reduce((total, result) => total + result.correct, 0);
    const diagnosticPercent = diagnosticTotal ? Math.round((diagnosticCorrect / diagnosticTotal) * 100) : 0;
    const percent = finalTotal ? Math.round((finalCorrect / finalTotal) * 100) : 0;
    const weakSkills = diagnosticResults
        .filter((result) => result.percent < 80)
        .map((result) => result.name);
    const existingIndex = reports.findIndex((report) => report.name === studentName && report.grade === studentGrade);
    const attempts = existingIndex >= 0 ? (Number(reports[existingIndex].attempts) || 0) + 1 : 1;
    const report = {
        name: studentName,
        grade: studentGrade,
        attempts,
        percent,
        diagnosticPercent,
        progress: percent >= 80 ? 'متقدم' : percent >= 60 ? 'قيد التحسن' : 'يحتاج إلى دعم',
        date: new Date().toISOString().slice(0, 10),
        weakSkills
    };
    if (existingIndex >= 0) reports.splice(existingIndex, 1);
    reports.unshift(report);
    localStorage.setItem(reportsKey, JSON.stringify(reports));
}

nextButton.addEventListener('click', () => {
    const questions = getQuestions();
    const answers = getAnswers();
    if (answers[state.index] === undefined) return;

    if (state.index < questions.length - 1) {
        state.index += 1;
        renderQuestion();
        return;
    }

    if (state.stage === 'diagnostic') renderIntervention();
    else if (state.stage === 'intervention') startFinalTest();
    else renderResults();
});

previousButton.addEventListener('click', () => {
    if (state.index > 0) {
        state.index -= 1;
        renderQuestion();
    }
});

renderQuestion();
