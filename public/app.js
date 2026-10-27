const grid = document.querySelector('#event-grid');
const dialog = document.querySelector('#dialog');
const content = document.querySelector('#dialog-content');
const toast = document.querySelector('#toast');
let allEvents = [];
let activeFilter = 'all';
let toastTimer;
const symbols = ['✳', '◒', '↗', '✦', '⌁', '✺'];

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
function notify(message) { toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 3000); }
function datePart(value) { const d = new Date(value); return { day: d.toLocaleDateString(undefined, { day: '2-digit' }), month: d.toLocaleDateString(undefined, { month: 'short' }), full: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) }; }
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
async function loadEvents() {
  grid.innerHTML = '<div class="loading">Gathering the good stuff…</div>';
  try { allEvents = await api('/api/events'); render(); }
  catch (error) { grid.innerHTML = `<div class="loading">${escapeHTML(error.message)} Make sure MongoDB is running, then refresh.</div>`; }
}
function render() {
  const query = document.querySelector('#search').value.trim().toLowerCase();
  const filtered = allEvents.filter(event => {
    const matchesText = event.title.toLowerCase().includes(query);
    const matchesFilter = activeFilter === 'all' || (activeFilter === 'open' ? event.seatsLeft > 0 : event.seatsLeft === 0);
    return matchesText && matchesFilter;
  });
  document.querySelector('#event-count').textContent = `${allEvents.length} ${allEvents.length === 1 ? 'event' : 'events'} on the calendar`;
  document.querySelector('#empty').classList.toggle('hidden', filtered.length > 0);
  grid.innerHTML = filtered.map((event, index) => {
    const date = datePart(event.date);
    const full = event.seatsLeft < 1;
    return `<article class="event-card"><div class="card-top"><div class="date-chip"><b>${date.day}</b><small>${date.month}</small></div><div class="event-symbol">${symbols[index % symbols.length]}</div></div><div class="card-body"><div class="card-meta"><span class="card-time">${date.full} &nbsp;·&nbsp; ${date.time}</span><span class="seats ${full ? 'full' : ''}">${full ? 'FULLY BOOKED' : `${event.seatsLeft} SPOT${event.seatsLeft === 1 ? '' : 'S'} LEFT`}</span></div><h3>${escapeHTML(event.title)}</h3><p>Come along, meet good people, and make this one count.</p><div class="card-foot"><span class="capacity">${event.registered || 0} / ${event.capacity} joined</span><div class="card-actions"><button class="manage-btn" data-edit="${event._id}">Edit</button><button class="register-btn" data-register="${event._id}" ${full ? 'disabled' : ''}>${full ? 'Full' : 'Save my spot'}</button></div></div></div></article>`;
  }).join('');
  grid.querySelectorAll('[data-register]').forEach(button => button.addEventListener('click', () => showRegister(button.dataset.register)));
  grid.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => showEdit(button.dataset.edit)));
}
function openModal(html) { content.innerHTML = html; dialog.showModal(); }
document.querySelector('#add-event').addEventListener('click', () => showEventForm());
function showEventForm(event = null) {
  const value = event ? new Date(event.date) : new Date(Date.now() + 86400000);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  openModal(`<div class="modal-eyebrow">MAKE IT HAPPEN</div><h2 class="modal-title">${event ? 'Edit your event' : 'Host an event'}</h2><div class="field"><label for="event-title">EVENT NAME</label><input id="event-title" maxlength="120" required placeholder="e.g. The little campus book swap" value="${event ? escapeHTML(event.title) : ''}"></div><div class="field"><label for="event-date">DATE & TIME</label><input id="event-date" type="datetime-local" required value="${local}"></div><div class="field"><label for="event-capacity">HOW MANY SPOTS?</label><input id="event-capacity" type="number" min="1" max="100000" required value="${event ? event.capacity : 30}"></div><button class="modal-submit" id="save-event">${event ? 'Save changes' : 'Add to the calendar'}</button>${event ? '<button class="modal-submit cancel-btn" style="margin-top:8px" id="delete-event">Delete event</button>' : ''}`);
  document.querySelector('#save-event').addEventListener('click', async () => {
    const title = document.querySelector('#event-title').value;
    const date = document.querySelector('#event-date').value;
    const capacity = Number(document.querySelector('#event-capacity').value);
    try { await api(event ? `/api/events/${event._id}` : '/api/events', { method: event ? 'PUT' : 'POST', body: JSON.stringify({ title, date, capacity }) }); dialog.close(); notify(event ? 'Event updated!' : 'Your event is on the calendar!'); await loadEvents(); }
    catch (error) { notify(error.message); }
  });
  if (event) document.querySelector('#delete-event').addEventListener('click', async () => {
    if (!confirm('Delete this event?')) return;
    try { await api(`/api/events/${event._id}`, { method: 'DELETE' }); dialog.close(); notify('Event deleted.'); await loadEvents(); }
    catch (error) { notify(error.message); }
  });
}
function showEdit(id) { const event = allEvents.find(item => item._id === id); if (event) showEventForm(event); }
function showRegister(id) {
  const event = allEvents.find(item => item._id === id);
  openModal(`<div class="modal-eyebrow">SAVE YOUR SPOT</div><h2 class="modal-title">You're almost there.</h2><p class="modal-help">${escapeHTML(event.title)} · ${datePart(event.date).full} at ${datePart(event.date).time}<br>Enter your student USN to register. One spot per student.</p><div class="field"><label for="student-usn">STUDENT USN</label><input id="student-usn" maxlength="30" required placeholder="e.g. 1AB23CS001" autocomplete="off"></div><button class="modal-submit" id="confirm-register">Count me in →</button>`);
  document.querySelector('#confirm-register').addEventListener('click', async () => {
    const usn = document.querySelector('#student-usn').value;
    try { await api('/api/registrations', { method: 'POST', body: JSON.stringify({ eventId: id, usn }) }); dialog.close(); notify("You're on the list. See you there!"); await loadEvents(); }
    catch (error) { notify(error.message); }
  });
}
document.querySelector('#my-events').addEventListener('click', () => {
  openModal('<div class="modal-eyebrow">YOUR CAMPUS PLANS</div><h2 class="modal-title">My registrations</h2><div class="field"><label for="lookup-usn">STUDENT USN</label><input id="lookup-usn" maxlength="30" placeholder="Enter your USN"></div><button class="modal-submit" id="lookup">Show my events</button><div id="registration-results"></div>');
  document.querySelector('#lookup').addEventListener('click', async () => {
    const usn = document.querySelector('#lookup-usn').value.trim(); const results = document.querySelector('#registration-results');
    try {
      const items = await api(`/api/registrations?usn=${encodeURIComponent(usn)}`);
      results.innerHTML = items.length ? items.map(item => `<div class="registration-row"><div><b>${escapeHTML(item.event.title)}</b><small>${datePart(item.event.date).full} · ${datePart(item.event.date).time}</small></div><button class="cancel-btn" data-cancel="${item.event._id}">Cancel</button></div>`).join('') : '<p class="modal-help" style="margin-top:16px">No upcoming registrations found for this USN.</p>';
      results.querySelectorAll('[data-cancel]').forEach(button => button.addEventListener('click', async () => {
        try { await api('/api/registrations', { method: 'DELETE', body: JSON.stringify({ eventId: button.dataset.cancel, usn }) }); notify('Registration cancelled.'); await loadEvents(); document.querySelector('#lookup').click(); }
        catch (error) { notify(error.message); }
      }));
    } catch (error) { notify(error.message); }
  });
});
document.querySelector('#search').addEventListener('input', render);
document.querySelector('#filters').addEventListener('click', event => { const button = event.target.closest('[data-filter]'); if (!button) return; activeFilter = button.dataset.filter; document.querySelectorAll('.filter').forEach(item => item.classList.toggle('active', item === button)); render(); });
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
loadEvents();
