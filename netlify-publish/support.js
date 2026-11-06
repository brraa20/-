const form = document.querySelector('#support-form');
const ticketResult = document.querySelector('#ticket-result');
const trackResult = document.querySelector('#track-result');
const trackForm = document.querySelector('#track-form');

if (!window.TalalaBackend.isConfigured) {
    showSupportMessage(ticketResult, window.TalalaBackend.configurationMessage, true);
    ticketResult.classList.remove('hidden');
    form.querySelector('button[type="submit"]').disabled = true;
    trackForm.querySelector('button[type="submit"]').disabled = true;
}

function showSupportMessage(target, message, isError = false) {
    target.textContent = message;
    target.classList.toggle('error', isError);
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const selectedType = form.querySelector('input[name="requestType"]:checked');
    const ticket = {
        type: selectedType?.value,
        fullName: document.querySelector('#full-name').value.trim(),
        subject: document.querySelector('#subject').value.trim(),
        details: document.querySelector('#details').value.trim()
    };
    if (!ticket.type || !ticket.fullName || !ticket.subject || !ticket.details) return;

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
        const code = await window.TalalaBackend.createTicket(ticket);
        const ticketNumber = `TL-${code}`;
        ticketResult.classList.remove('hidden');
        showSupportMessage(ticketResult, `تم حفظ طلبك في قاعدة البيانات. رقم المتابعة: ${ticketNumber}`);
        document.querySelector('#ticket-input').value = ticketNumber;
        form.reset();
        await trackTicket(ticketNumber);
    } catch (error) {
        showSupportMessage(ticketResult, `تعذر حفظ الطلب: ${error.message}`, true);
        ticketResult.classList.remove('hidden');
    } finally {
        submitButton.disabled = false;
    }
});

async function trackTicket(ticketNumber) {
    const code = ticketNumber.trim().toUpperCase().replace(/^TL-/, '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(code)) {
        showSupportMessage(trackResult, 'أدخل رقم التذكرة كاملًا كما ظهر عند الإرسال.', true);
        return;
    }

    try {
        const ticket = await window.TalalaBackend.trackTicket(code);
        if (!ticket) {
            showSupportMessage(trackResult, 'لم يتم العثور على تذكرة بهذا الرقم.');
            return;
        }
        const reply = ticket.reply ? `\nرد الدعم: ${ticket.reply}` : '\nلم يتم الرد بعد.';
        showSupportMessage(trackResult, `الحالة: ${ticket.status}${reply}`);
    } catch (error) {
        showSupportMessage(trackResult, `تعذر متابعة التذكرة: ${error.message}`, true);
    }
}

trackForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void trackTicket(document.querySelector('#ticket-input').value);
});
