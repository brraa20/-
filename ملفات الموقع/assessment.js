const studentName = sessionStorage.getItem('talalaStudentName');
const studentGrade = sessionStorage.getItem('talalaStudentGrade');
const data = window.TalalaAssessmentData;

if (!studentName || !studentGrade || sessionStorage.getItem('talalaAssessmentStarted') !== 'true') {
    window.location.replace(studentName && studentGrade ? 'assessment-instructions.html' : 'index.html');
}

const state = {
    stage: 'diagnostic',
    index: 0,
    answers: [],
    mistakes: [],
    finalAnswers: [],
    finalQuestions: [],
    diagnosticResults: [],
    currentSkillResults: [],
    targetSkillIds: [],
    interventionQuestions: [],
    interventionAnswers: [],
    interventionHistory: [],
    processSteps: []
};

const masteryThreshold = 80;

const titles = {
    diagnostic: 'الاختبار التشخيصي',
    intervention: 'التدخل والعلاج والتنمية',
    reassessment: 'إعادة تقييم المهارات',
    interventionOutcome: 'نتائج إعادة التقييم',
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
    if (state.stage === 'reassessment') return state.interventionQuestions;
    if (state.stage === 'final') return state.finalQuestions;
    return [];
}

function getAnswers() {
    if (state.stage === 'reassessment') return state.interventionAnswers;
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
        : state.stage === 'reassessment'
            ? `إعادة تقييم المهارات — الجولة ${state.interventionHistory.length + 1}`
            : state.stage === 'final' ? 'الاختبار الشامل بعد الإتقان' : 'التدخل المخصص';
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
        ? state.stage === 'diagnostic'
            ? 'تسليم التشخيص'
            : state.stage === 'reassessment' ? 'تسليم إعادة التقييم' : 'تسليم الاختبار الشامل'
        : 'السؤال التالي';
    progress();
}

function calculateResults(questions, answers, skillIds = data.skills.map((skill) => skill.id)) {
    return data.skills.filter((skill) => skillIds.includes(skill.id)).map((skill) => {
        const skillQuestions = questions
            .map((question, index) => ({ question, index }))
            .filter(({ question }) => question.skill === skill.id);
        const correct = skillQuestions.filter(({ question, index }) => answers[index] === question.answer).length;
        const percent = skillQuestions.length ? Math.round((correct / skillQuestions.length) * 100) : 0;
        const mastery = percent >= masteryThreshold ? 'بلغ حد الإتقان' : percent >= 60 ? 'يحتاج إلى تعزيز' : 'يحتاج إلى تدخل مخصص';
        return { ...skill, correct, total: skillQuestions.length, percent, mastery };
    });
}

function recordProcessStep(step, round, details = {}) {
    state.processSteps.push({
        step,
        round,
        recorded_at: new Date().toISOString(),
        ...details
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

async function initializeAssessment() {
    try {
        let interventions;
        if (window.TalalaBackend?.isConfigured) {
            const questions = await window.TalalaBackend.loadContent('questions');
            if (questions && ['diagnostic', 'intervention', 'final'].every((stage) => Array.isArray(questions[stage]))) {
                data.questions = questions;
            }
            interventions = await window.TalalaBackend.loadContent('interventions');
        } else {
            const localQuestions = JSON.parse(localStorage.getItem('talalaReadingQuestionBank') || 'null');
            if (localQuestions && ['diagnostic', 'intervention', 'final'].every((stage) => Array.isArray(localQuestions[stage]))) {
                data.questions = localQuestions;
            }
            interventions = JSON.parse(localStorage.getItem('talalaInterventionBank') || '[]');
        }
        if (Array.isArray(interventions)) {
            interventions.forEach((intervention) => {
                if (skillInterventions[intervention.skill] && intervention.content) {
                    skillInterventions[intervention.skill].action = intervention.content;
                }
            });
        }
    } catch (error) {
        console.error('Unable to load the shared question bank.', error);
        content.innerHTML = `<p class="error" role="alert">تعذر تحميل بنك الأسئلة المشترك: ${escapeHtml(error.message)}</p>`;
        previousButton.hidden = true;
        nextButton.hidden = true;
        return;
    }
    renderQuestion();
}

function renderIntervention() {
    state.stage = 'intervention';
    state.index = 0;
    title.textContent = titles.intervention;
    const round = state.interventionHistory.length + 1;
    progressLabel.textContent = state.interventionHistory.length
        ? `خطة علاج الجولة ${round} للمهارات التي لم تبلغ الإتقان`
        : 'شرح التشخيص وخطة تنمية المهارات';
    progressBar.style.width = '100%';
    stageLabel.textContent = 'التدخل المخصص';
    previousButton.hidden = true;

    const mistakes = state.interventionHistory.length
        ? state.lastInterventionMistakes || []
        : data.questions.diagnostic
            .map((question, index) => ({ question, answer: state.answers[index] }))
            .filter(({ question, answer }) => answer !== question.answer);
    const weakSkills = state.currentSkillResults.filter((skill) => skill.percent < masteryThreshold);
    state.targetSkillIds = weakSkills.map((skill) => skill.id);
    if (weakSkills.length) {
        recordProcessStep('خطة علاج وتنمية المهارات', round, {
            skills: weakSkills.map((skill) => ({
                id: skill.id,
                name: skill.name,
                diagnostic_percent: skill.percent,
                goal: skillInterventions[skill.id].goal,
                activity: skillInterventions[skill.id].action,
                example: skillInterventions[skill.id].example
            }))
        });
    } else {
        recordProcessStep('تحقق حد الإتقان قبل الاختبار الشامل', round - 1, {
            results: state.currentSkillResults,
            threshold: masteryThreshold
        });
    }

    content.innerHTML = `
        <section class="intervention-card">
            <h2>${weakSkills.length ? `خطة العلاج والتنمية — الجولة ${round}` : 'تحقق الإتقان في جميع المهارات'}</h2>
            <p class="learning-path">التشخيص ← شرح الأخطاء ← علاج المهارات الأقل من ${masteryThreshold}% ← إعادة القياس حتى الإتقان ← الاختبار الشامل</p>
            ${weakSkills.length ? `
                <div class="lesson-grid">
                    ${weakSkills.map((skill) => {
                        const guide = skillInterventions[skill.id];
                        return `
                            <article class="lesson-block intervention-plan">
                                <span class="skill-tag">المهارة: ${escapeHtml(skill.name)}</span>
                                <div class="mastery-row"><strong>${skill.percent}%</strong><span>${escapeHtml(skill.mastery)}</span></div>
                                <h2>هدف العلاج</h2><p>${escapeHtml(guide.goal)}</p>
                                <h2>نشاط التنمية والتعزيز</h2><p>${escapeHtml(guide.action)}</p>
                                <h2>مثال تطبيقي</h2><p class="practice-example">${escapeHtml(guide.example)}</p>
                            </article>`;
                    }).join('')}
                </div>` : `<p>بلغت جميع المهارات حد الإتقان (${masteryThreshold}% فأعلى). يمكنك الانتقال إلى الاختبار الشامل.</p>`}
            <h2>مراجعة الإجابات التي تحتاج شرحًا</h2>
            <div class="error-review">
                ${mistakes.length ? mistakes.map(({ question, answer }) => `
                    <article class="error-item">
                        <strong>${escapeHtml(question.text)}</strong>
                        <p class="error-answer">إجابتك: ${escapeHtml(question.choices[answer] ?? 'لم تُجب')}<br>
                        <span class="correct-answer">الإجابة الصحيحة: ${escapeHtml(question.choices[question.answer])}</span></p>
                        <p>${escapeHtml(question.explanation)}</p>
                    </article>
                `).join('') : '<p>لا توجد إجابات خاطئة في هذه الجولة.</p>'}
            </div>
        </section>`;

    nextButton.disabled = false;
    nextButton.textContent = weakSkills.length ? 'ابدأ إعادة تقييم المهارات' : 'ابدأ الاختبار الشامل';
}

function startInterventionAssessment() {
    const round = state.interventionHistory.length + 1;
    const questionPool = [
        ...data.questions.intervention,
        ...data.questions.diagnostic,
        ...data.questions.final
    ];
    const selectedQuestions = state.targetSkillIds.flatMap((skillId) => {
        const seen = new Set();
        return shuffle(questionPool.filter((question) => question.skill === skillId))
            .filter((question) => {
                if (seen.has(question.text)) return false;
                seen.add(question.text);
                return true;
            });
    });

    if (!selectedQuestions.length || state.targetSkillIds.some((skillId) =>
        !selectedQuestions.some((question) => question.skill === skillId))) {
        content.innerHTML = '<p class="error" role="alert">لا تتوفر أسئلة كافية لإعادة تقييم المهارات المستهدفة. يرجى إبلاغ المعلم/ة لمراجعة بنك الأسئلة.</p>';
        previousButton.hidden = true;
        nextButton.hidden = true;
        return;
    }

    state.stage = 'reassessment';
    state.index = 0;
    state.interventionQuestions = selectedQuestions;
    state.interventionAnswers = [];
    title.textContent = titles.reassessment;
    recordProcessStep('بدء إعادة التقييم بعد العلاج', round, {
        skills: state.targetSkillIds,
        question_count: selectedQuestions.length,
        threshold: masteryThreshold
    });
    renderQuestion();
}

function renderInterventionOutcome() {
    const round = state.interventionHistory.length;
    const results = state.interventionHistory[round - 1].results;
    const remainingSkills = state.currentSkillResults.filter((skill) => skill.percent < masteryThreshold);
    const mistakes = state.interventionQuestions
        .map((question, index) => ({ question, answer: state.interventionAnswers[index] }))
        .filter(({ question, answer }) => answer !== question.answer);

    state.stage = 'interventionOutcome';
    state.lastInterventionMistakes = mistakes;
    title.textContent = titles.interventionOutcome;
    progressLabel.textContent = `نتائج إعادة التقييم — الجولة ${round}`;
    progressBar.style.width = '100%';
    stageLabel.textContent = 'قياس أثر العلاج';
    previousButton.hidden = true;
    content.innerHTML = `
        <section class="intervention-card">
            <h2>${remainingSkills.length ? 'تحتاج بعض المهارات إلى علاج إضافي' : 'تحقق الإتقان في جميع المهارات'}</h2>
            <p>حد الإتقان المطلوب هو ${masteryThreshold}% في كل مهارة قبل الانتقال إلى الاختبار الشامل.</p>
            <div class="lesson-grid">
                ${results.map((result) => `
                    <article class="lesson-block">
                        <span class="skill-tag">${escapeHtml(result.name)}</span>
                        <div class="mastery-row"><strong>${result.percent}%</strong><span>${result.correct} من ${result.total} إجابات صحيحة</span></div>
                        <p>${result.percent >= masteryThreshold ? 'بلغت المهارة حد الإتقان.' : 'ستتكرر خطة العلاج وإعادة التقييم لهذه المهارة.'}</p>
                    </article>
                `).join('')}
            </div>
            <h2>شرح إجابات إعادة التقييم</h2>
            <div class="error-review">
                ${mistakes.length ? mistakes.map(({ question, answer }) => `
                    <article class="error-item">
                        <strong>${escapeHtml(question.text)}</strong>
                        <p class="error-answer">إجابتك: ${escapeHtml(question.choices[answer] ?? 'لم تُجب')}<br>
                        <span class="correct-answer">الإجابة الصحيحة: ${escapeHtml(question.choices[question.answer])}</span></p>
                        <p>${escapeHtml(question.explanation)}</p>
                    </article>
                `).join('') : '<p>أُجبت عن جميع أسئلة المهارات المستهدفة إجابة صحيحة.</p>'}
            </div>
        </section>`;
    nextButton.disabled = false;
    nextButton.textContent = remainingSkills.length
        ? 'كرّر العلاج للمهارات غير المتقنة'
        : 'انتقل إلى الاختبار الشامل';
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
    const remainingSkills = state.currentSkillResults.filter((skill) => skill.percent < masteryThreshold);
    if (remainingSkills.length) {
        renderIntervention();
        return;
    }

    state.stage = 'final';
    state.index = 0;
    state.finalAnswers = [];
    title.textContent = titles.final;
    buildFinalQuestions();
    content.textContent = 'جار تحميل الاختبار...';
    renderQuestion();
}

function renderResults() {
    state.stage = 'results';
    title.textContent = titles.results;
    progressLabel.textContent = 'ملخص الإتقان والاتجاه';
    progressBar.style.width = '100%';
    stageLabel.textContent = 'نتائج التعلم';
    previousButton.hidden = true;

    const diagnosticResults = state.diagnosticResults.length
        ? state.diagnosticResults
        : calculateResults(data.questions.diagnostic, state.answers);
    const finalResults = calculateResults(state.finalQuestions, state.finalAnswers);
    recordProcessStep('الاختبار الشامل بعد تحقق الإتقان', state.interventionHistory.length, {
        results: finalResults,
        threshold_before_comprehensive_test: masteryThreshold
    });
    const impactResults = finalResults.map((result, index) => {
        const difference = result.percent - diagnosticResults[index].percent;
        const impact = difference >= 15 ? 'تحسن ملحوظ' : difference >= 5 ? 'تحسن تدريجي' : difference >= -4 ? 'استقرار الإتقان' : 'يحتاج دعمًا إضافيًا';
        return { ...result, difference, impact };
    });
    saveStudentReport(diagnosticResults, finalResults)
        .then(() => {
            document.querySelector('#report-save-status').textContent = 'حُفظت النتيجة في قاعدة بيانات المنصة.';
        })
        .catch((error) => {
            console.error('Unable to save the student assessment result.', error);
            document.querySelector('#report-save-status').textContent = `تعذر حفظ النتيجة؛ لم تصل إلى المعلمين: ${error.message}`;
        });

    content.innerHTML = `
        <section class="results-card">
            <div class="result-header">
                <div><h2>نتائج الطالب/ة</h2><p>${escapeHtml(studentName)} • ${escapeHtml(studentGrade)}</p></div>
            </div>
            <p>جولات العلاج وإعادة التقييم المكتملة قبل الاختبار الشامل: ${state.interventionHistory.length}.</p>
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
            <p class="local-storage-note" id="report-save-status" role="status">جار حفظ النتيجة في قاعدة بيانات المنصة...</p>
            <div class="action-row">
                <button type="button" class="action-button" id="print-results">طباعة التقرير أو حفظه PDF</button>
            </div>
        </section>`;

    nextButton.hidden = true;
    document.querySelector('#print-results').addEventListener('click', () => window.print());
}

async function saveStudentReport(diagnosticResults, finalResults) {
    const diagnosticTotal = diagnosticResults.reduce((total, result) => total + result.total, 0);
    const diagnosticCorrect = diagnosticResults.reduce((total, result) => total + result.correct, 0);
    const finalTotal = finalResults.reduce((total, result) => total + result.total, 0);
    const finalCorrect = finalResults.reduce((total, result) => total + result.correct, 0);
    const diagnosticPercent = diagnosticTotal ? Math.round((diagnosticCorrect / diagnosticTotal) * 100) : 0;
    const percent = finalTotal ? Math.round((finalCorrect / finalTotal) * 100) : 0;
    const weakSkills = finalResults
        .filter((result) => result.percent < 80)
        .map((result) => result.name);
    const report = {
        student_name: studentName,
        grade: studentGrade,
        percent,
        diagnostic_percent: diagnosticPercent,
        progress: percent >= 80 ? 'متقدم' : percent >= 60 ? 'قيد التحسن' : 'يحتاج إلى دعم',
        weak_skills: weakSkills,
        diagnostic_results: diagnosticResults,
        final_results: finalResults,
        process_steps: state.processSteps
    };
    if (window.TalalaBackend?.isConfigured) {
        await window.TalalaBackend.saveAttempt(report);
        return;
    }

    const reportsKey = 'talalaStudentReports';
    const reports = JSON.parse(localStorage.getItem(reportsKey) || '[]');
    const existingIndex = reports.findIndex((item) => item.name === studentName && item.grade === studentGrade);
    const attempts = existingIndex >= 0 ? (Number(reports[existingIndex].attempts) || 0) + 1 : 1;
    const localReport = {
        name: studentName,
        grade: studentGrade,
        attempts,
        percent,
        diagnosticPercent: diagnosticPercent,
        progress: report.progress,
        date: new Date().toISOString().slice(0, 10),
        weakSkills: weakSkills,
        processSteps: state.processSteps
    };
    if (existingIndex >= 0) reports.splice(existingIndex, 1);
    reports.unshift(localReport);
    localStorage.setItem(reportsKey, JSON.stringify(reports));
}

nextButton.addEventListener('click', () => {
    if (state.stage === 'intervention') {
        if (state.targetSkillIds.length) startInterventionAssessment();
        else startFinalTest();
        return;
    }
    if (state.stage === 'interventionOutcome') {
        if (state.currentSkillResults.some((skill) => skill.percent < masteryThreshold)) renderIntervention();
        else startFinalTest();
        return;
    }

    const questions = getQuestions();
    const answers = getAnswers();
    if (answers[state.index] === undefined) return;

    if (state.index < questions.length - 1) {
        state.index += 1;
        renderQuestion();
        return;
    }

    if (state.stage === 'diagnostic') {
        state.diagnosticResults = calculateResults(data.questions.diagnostic, state.answers);
        state.currentSkillResults = state.diagnosticResults.map((result) => ({ ...result }));
        const mistakes = data.questions.diagnostic
            .map((question, index) => ({
                question: question.text,
                answer: question.choices[state.answers[index]] ?? 'لم يُجب',
                correct_answer: question.choices[question.answer],
                explanation: question.explanation,
                skill: skillById(question.skill)?.name || question.skill
            }))
            .filter((item, index) => state.answers[index] !== data.questions.diagnostic[index].answer);
        recordProcessStep('المحاولة التشخيصية', 0, {
            results: state.diagnosticResults,
            threshold: masteryThreshold
        });
        recordProcessStep('شرح الأخطاء والتغذية الراجعة', 0, { mistakes });
        renderIntervention();
    } else if (state.stage === 'reassessment') {
        const round = state.interventionHistory.length + 1;
        const results = calculateResults(
            state.interventionQuestions,
            state.interventionAnswers,
            state.targetSkillIds
        );
        state.interventionHistory.push({
            round,
            target_skill_ids: [...state.targetSkillIds],
            results
        });
        state.currentSkillResults = state.currentSkillResults.map((previous) =>
            results.find((result) => result.id === previous.id) || previous
        );
        const passedSkills = results.filter((result) => result.percent >= masteryThreshold).map((result) => result.id);
        const remainingSkills = state.currentSkillResults.filter((result) => result.percent < masteryThreshold).map((result) => result.id);
        recordProcessStep('نتائج إعادة التقييم بعد العلاج', round, {
            results,
            passed_skills: passedSkills,
            remaining_skills: remainingSkills,
            threshold: masteryThreshold
        });
        renderInterventionOutcome();
    } else {
        renderResults();
    }
});

previousButton.addEventListener('click', () => {
    if (state.index > 0) {
        state.index -= 1;
        renderQuestion();
    }
});

content.textContent = 'جار تحميل الاختبار...';
void initializeAssessment();
