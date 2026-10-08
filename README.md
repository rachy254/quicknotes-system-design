# QuickNotes System Design

QuickNotes is a small browser client that demonstrates loading, creating, and deleting notes through the JSONPlaceholder practice API. The repository also contains a production-oriented REST API contract, relational data model, and scaling architecture for a service intended to support one million registered users.

## Run the API client

1. Clone this repository and open a terminal in the project folder.
2. Start a local static web server:

   ```powershell
   py -m http.server 8000
   ```

3. Open [http://localhost:8000](http://localhost:8000) in your browser.
4. Select **Load notes** to fetch ten sample notes, or use the form to create a note. Each note has a **Delete** button.

The client calls JSONPlaceholder directly; it does not require a local backend or API key. JSONPlaceholder is a practice API: it returns simulated successful create/delete responses but does not persist those changes. The client therefore updates its in-memory list after a successful delete, and reloading the page loads the original server sample data again.

## Design documents

- [REST API design](docs/api-design.md)
- [Data model](docs/data-model.md)
- [Architecture and scaling plan](docs/architecture.md)

## What I learned

- An asynchronous request queue keeps slower, non-critical work out of interactive API requests, but requires retries, idempotency, and monitoring.
- A read replica and cache can scale common reads, but they introduce replication lag and cache invalidation trade-offs that affect freshness.
- A relational join table is a clear way to model many-to-many note/tag relationships while preserving referential integrity.
- Estimating traffic requires assumptions: writing them down makes the calculations reviewable and helps distinguish a planning estimate from production measurements.
