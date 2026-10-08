const API_URL = "https://jsonplaceholder.typicode.com/posts";

const loadButton = document.querySelector("#load-btn");
const noteForm = document.querySelector("#note-form");
const titleInput = document.querySelector("#title-input");
const bodyInput = document.querySelector("#body-input");
const submitButton = document.querySelector("#submit-btn");
const statusMessage = document.querySelector("#status");
const notesList = document.querySelector("#notes-list");

let notes = [];
let busy = false;

async function request(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = new Error(`The server responded with status ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  const data = response.status === 204 ? null : await response.json();
  return { data, status: response.status };
}

function setStatus(message, type = "") {
  statusMessage.textContent = message;
  statusMessage.className = type ? `status ${type}` : "status";
}

function setBusy(isBusy) {
  busy = isBusy;
  loadButton.disabled = isBusy;
  submitButton.disabled = isBusy;
  notesList.querySelectorAll("button").forEach((button) => {
    button.disabled = isBusy;
  });
}

function renderNotes() {
  notesList.replaceChildren();

  if (notes.length === 0) {
    const emptyState = document.createElement("li");
    emptyState.className = "empty-state";
    emptyState.textContent = "No notes to show. Load notes or create your first note.";
    notesList.append(emptyState);
    return;
  }

  for (const note of notes) {
    const item = document.createElement("li");
    item.className = "note";

    const title = document.createElement("h3");
    title.textContent = note.title;

    const body = document.createElement("p");
    body.textContent = note.body || "No additional details.";

    const actions = document.createElement("div");
    actions.className = "note-actions";

    const deleteButton = document.createElement("button");
    deleteButton.className = "button delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteNote(note));

    actions.append(deleteButton);
    item.append(title, body, actions);
    notesList.append(item);
  }
}

async function loadNotes() {
  if (busy) return;

  setBusy(true);
  setStatus("Loading notes...", "loading");

  try {
    const { data } = await request(`${API_URL}?_limit=10`);
    notes = data;
    renderNotes();

    if (notes.length === 0) {
      setStatus("No notes were returned by the server.", "success");
    } else {
      const noun = notes.length === 1 ? "note" : "notes";
      setStatus(`Loaded ${notes.length} ${noun} from the server.`, "success");
    }
  } catch (error) {
    setStatus("We couldn't load your notes. Please try again.", "error");
  } finally {
    setBusy(false);
  }
}

async function deleteNote(note) {
  if (busy) return;

  setBusy(true);
  setStatus("Deleting note...", "loading");

  try {
    const { status } = await request(`${API_URL}/${encodeURIComponent(note.id)}`, {
      method: "DELETE",
    });

    // JSONPlaceholder acknowledges writes but does not persist them, so mirror deletion in this page's local list.
    notes = notes.filter((currentNote) => currentNote.id !== note.id);
    renderNotes();
    setStatus(`Note deleted (status ${status}, id ${note.id}).`, "success");
  } catch (error) {
    setStatus("We couldn't delete your note. Please try again.", "error");
  } finally {
    setBusy(false);
  }
}

async function createNote(event) {
  event.preventDefault();
  if (busy) return;

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (!title) {
    setStatus("Please enter a title for your note.", "error");
    titleInput.focus();
    return;
  }

  if (title.length > 100) {
    setStatus("The title must be 100 characters or fewer.", "error");
    titleInput.focus();
    return;
  }

  setBusy(true);
  setStatus("Creating your note...", "loading");

  try {
    const { data, status } = await request(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ title, body, userId: 1 }),
    });

    notes.unshift(data);
    renderNotes();
    setStatus(`Note created (status ${status}, id ${data.id}).`, "success");
    noteForm.reset();
  } catch (error) {
    setStatus("We couldn't create your note. Please try again.", "error");
  } finally {
    setBusy(false);
  }
}

loadButton.addEventListener("click", loadNotes);
noteForm.addEventListener("submit", createNote);
