const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MONGO_URL = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = 'Hack_EventBoard';
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

let events;
let registrations;
const fail = (res, status, message) => res.status(status).json({ error: message });
const validId = value => typeof value === 'string' && ObjectId.isValid(value) && String(new ObjectId(value)) === value;
function parseEvent(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const date = typeof body.date === 'string' ? body.date.trim() : '';
  const capacity = Number(body.capacity);
  if (!title || title.length > 120) return { error: 'Title is required (maximum 120 characters).' };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return { error: 'Enter a valid event date and time.' };
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000) return { error: 'Capacity must be a whole number from 1 to 100000.' };
  return { title, date: new Date(date), capacity };
}

app.get('/api/events', async (_req, res) => {
  const list = await events.find().sort({ date: 1 }).toArray();
  res.json(list.map(event => ({ ...event, seatsLeft: event.capacity - (event.registered || 0) })));
});

app.post('/api/events', async (req, res) => {
  const data = parseEvent(req.body || {});
  if (data.error) return fail(res, 400, data.error);
  const result = await events.insertOne({ ...data, registered: 0, createdAt: new Date() });
  res.status(201).json({ _id: result.insertedId, ...data, registered: 0, seatsLeft: data.capacity });
});

app.put('/api/events/:id', async (req, res) => {
  if (!validId(req.params.id)) return fail(res, 400, 'Invalid event id.');
  const data = parseEvent(req.body || {});
  if (data.error) return fail(res, 400, data.error);
  const id = new ObjectId(req.params.id);
  const updated = await events.findOneAndUpdate(
    { _id: id, $expr: { $lte: ['$registered', data.capacity] } },
    { $set: data },
    { returnDocument: 'after' }
  );
  if (!updated) {
    const current = await events.findOne({ _id: id });
    return current
      ? fail(res, 409, 'Capacity cannot be less than the number of registrations.')
      : fail(res, 404, 'Event not found.');
  }
  res.json({ ...updated, seatsLeft: updated.capacity - (updated.registered || 0) });
});

app.delete('/api/events/:id', async (req, res) => {
  if (!validId(req.params.id)) return fail(res, 400, 'Invalid event id.');
  const id = new ObjectId(req.params.id);
  const deleted = await events.deleteOne({ _id: id, registered: 0 });
  if (!deleted.deletedCount) {
    const event = await events.findOne({ _id: id });
    return event
      ? fail(res, 409, 'Cancel all registrations before deleting this event.')
      : fail(res, 404, 'Event not found.');
  }
  res.json({ message: 'Event deleted.' });
});

app.post('/api/registrations', async (req, res) => {
  const { eventId } = req.body || {};
  const usn = typeof req.body?.usn === 'string' ? req.body.usn.trim().toUpperCase() : '';
  if (!validId(eventId)) return fail(res, 400, 'A valid eventId is required.');
  if (!/^[A-Z0-9-]{3,30}$/.test(usn)) return fail(res, 400, 'Enter a valid USN (3–30 letters, numbers or hyphens).');
  const id = new ObjectId(eventId);
  let seatReserved = false;
  try {
    const reserved = await events.updateOne({ _id: id, $expr: { $lt: ['$registered', '$capacity'] } }, { $inc: { registered: 1 } });
    if (!reserved.matchedCount) {
      const event = await events.findOne({ _id: id });
      return event ? fail(res, 409, 'This event is full.') : fail(res, 404, 'Event not found.');
    }
    seatReserved = true;
    const result = await registrations.insertOne({ eventId: id, usn, registeredAt: new Date() });
    return res.status(201).json({ _id: result.insertedId, eventId: id, usn });
  } catch (error) {
    if (seatReserved) await events.updateOne({ _id: id }, { $inc: { registered: -1 } });
    if (error.code === 11000) return fail(res, 409, 'This student is already registered for this event.');
    throw error;
  }
});

app.get('/api/registrations', async (req, res) => {
  const usn = typeof req.query.usn === 'string' ? req.query.usn.trim().toUpperCase() : '';
  if (!/^[A-Z0-9-]{3,30}$/.test(usn)) return fail(res, 400, 'Enter a valid USN query parameter.');
  const rows = await registrations.aggregate([
    { $match: { usn } },
    { $lookup: { from: 'events', localField: 'eventId', foreignField: '_id', as: 'event' } },
    { $unwind: '$event' },
    { $project: { _id: 1, usn: 1, registeredAt: 1, event: { _id: '$event._id', title: '$event.title', date: '$event.date', capacity: '$event.capacity' } } },
    { $sort: { 'event.date': 1 } }
  ]).toArray();
  res.json(rows);
});

app.delete('/api/registrations', async (req, res) => {
  const { eventId } = req.body || {};
  const usn = typeof req.body?.usn === 'string' ? req.body.usn.trim().toUpperCase() : '';
  if (!validId(eventId)) return fail(res, 400, 'A valid eventId is required.');
  if (!/^[A-Z0-9-]{3,30}$/.test(usn)) return fail(res, 400, 'Enter a valid USN.');
  const id = new ObjectId(eventId);
  const deleted = await registrations.deleteOne({ eventId: id, usn });
  if (!deleted.deletedCount) return fail(res, 404, 'Registration not found.');
  await events.updateOne({ _id: id, registered: { $gt: 0 } }, { $inc: { registered: -1 } });
  res.json({ message: 'Registration cancelled.' });
});

app.use('/api', (_req, res) => fail(res, 404, 'API route not found.'));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error instanceof SyntaxError ? 400 : 500).json({ error: error instanceof SyntaxError ? 'Invalid JSON body.' : 'Something went wrong on the server.' });
});

async function start() {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db(DB_NAME);
  events = db.collection('events');
  registrations = db.collection('registrations');
  await registrations.createIndex({ eventId: 1, usn: 1 }, { unique: true });
  await events.createIndex({ date: 1 });
  app.listen(PORT, '127.0.0.1', () => console.log(`Event board running at http://127.0.0.1:${PORT}`));
}
start().catch(error => { console.error('Could not start. Ensure MongoDB is running at mongodb://127.0.0.1:27017.', error); process.exit(1); });
