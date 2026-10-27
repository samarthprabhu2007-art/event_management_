# Gather: Campus Event Registration Board

A small event board for campus communities. Browse and search events, publish events, reserve a place with a student USN, see your registrations, and cancel a reservation. The server enforces one registration per student per event and prevents overbooking.

## Run it

1. Install Node.js and MongoDB Community Server.
2. Start MongoDB locally on `mongodb://127.0.0.1:27017`.
3. Run `npm install` once, then `npm start`.
4. Open [http://127.0.0.1:3000/](http://127.0.0.1:3000/).

The app uses the `Hack_EventBoard` database. Events and registrations remain in MongoDB after a server restart. No sample events are inserted automatically; create one with **Host an event**.

## API

All request and response bodies use JSON. Errors have the form `{ "error": "..." }`.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/events` | List events with registration count and seats left |
| `POST` | `/api/events` | Create an event (`title`, `date` as ISO local datetime string, `capacity`) |
| `PUT` | `/api/events/:id` | Edit an event; capacity cannot go below current registrations |
| `DELETE` | `/api/events/:id` | Delete an event with no active registrations |
| `POST` | `/api/registrations` | Register with `{ "eventId": "...", "usn": "..." }` |
| `GET` | `/api/registrations?usn=...` | List one student's registrations |
| `DELETE` | `/api/registrations` | Cancel with `{ "eventId": "...", "usn": "..." }` |

Validation errors return `400`, missing records `404`, and duplicates, full events, or capacity conflicts `409`. MongoDB creates a unique index on `(eventId, usn)` so duplicate registrations are rejected even when requests arrive together. Event seats are reserved with an atomic conditional update.
