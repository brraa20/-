const form = document.querySelector('#support-form');
const ticketResult = document.querySelector('#ticket-result');
const trackResult = document.querySelector('#track-result');
const ticketsKey = 'talalaSupportTickets';

function loadTickets() {
    return JSON.parse(localStorage.getItem(ticketsKey) || '[]');
}

function saveTickets(tickets) {
    localStorage.setItem(ticketsKey, JSON.stringify(tickets));
}

function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = value;
    return element.innerHTML;
}

function createTicketNumber() {
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const serial = String(Math.floor(1000 + Math.random() * 9000));
    return `TL-${stamp}-${serial}`;
}

function findTicket(number) {
    return loadTickets().find((ticket) => ticket.number === number.trim().toUpperCase());
}

function renderTicket(ticket) {
    trackResult.innerHTML = `
        <p><strong>رقم التذكرة:</strong> ${escapeHtml(ticket.number)}</p>
        <p><strong>الحالة:</strong> ${escapeHtml(ticket.status)}</p>
        ${ticket.reply ? `<div class="reply-box"><strong>رد مالك المنصة:</strong><br>${escapeHtml(ticket.reply)}</div>` : '<p>لم يتم الرد بعد. ستظهر الردود هنا عند مراجعة الطلب.</p>'}`;
}

form.addEventListener('submit', (event) => {
    event.preventDefault();

    const selectedType = form.querySelector('input[name="requestType"]:checked');
    const fullName = document.querySelector('#full-name').value.trim();
    const subject = document.querySelector('#subject').value.trim();
    const details = document.querySelector('#details').value.trim();
    if (!selectedType || !fullName || !subject || !details) return;

    const ticket = {
        number: createTicketNumber(),
        type: selectedType.value,
        fullName,
        subject,
        details,
        status: 'بانتظار الرد',
        reply: '',
        createdAt: new Date().toISOString()
    };

    const tickets = loadTickets();
    tickets.unshift(ticket);
    saveTickets(tickets);

    ticketResult.classList.remove('hidden');
    ticketResult.innerHTML = `تم إرسال طلبك بنجاح.<br>رقم متابعتك هو <span class="ticket-number">${escapeHtml(ticket.number)}</span><br>احتفظ بهذا الرقم لمتابعة حالة الرد.`;
    document.querySelector('#ticket-input').value = ticket.number;
    form.reset();
    renderTicket(ticket);
});

document.querySelector('#track-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const number = document.querySelector('#ticket-input').value.trim();
    const ticket = findTicket(number);
    if (ticket) {
        renderTicket(ticket);
        return;
    }
    trackResult.textContent = number
        ? 'لم يتم العثور على تذكرة بهذا الرقم في هذا المتصفح.'
        : 'أدخل رقم التذكرة للبحث عن حالتها.';
});
