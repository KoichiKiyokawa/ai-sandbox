package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type memoryStore struct {
	notes     []Note
	err       error
	listQuery string
}

func (s *memoryStore) Ping(context.Context) error { return s.err }
func (s *memoryStore) List(_ context.Context, query string) ([]Note, error) {
	s.listQuery = query
	return s.notes, s.err
}
func (s *memoryStore) Create(_ context.Context, body string) (Note, error) {
	if s.err != nil {
		return Note{}, s.err
	}
	n := Note{ID: int64(len(s.notes) + 1), Body: body}
	s.notes = append(s.notes, n)
	return n, nil
}
func (s *memoryStore) Delete(_ context.Context, id int64) (bool, error) {
	if s.err != nil {
		return false, s.err
	}
	for i, note := range s.notes {
		if note.ID == id {
			s.notes = append(s.notes[:i], s.notes[i+1:]...)
			return true, nil
		}
	}
	return false, nil
}

func (s *memoryStore) Update(_ context.Context, id int64, body string) (Note, error) {
	if s.err != nil {
		return Note{}, s.err
	}
	for i := range s.notes {
		if s.notes[i].ID == id {
			s.notes[i].Body = body
			return s.notes[i], nil
		}
	}
	return Note{}, errNoteNotFound
}

func TestRegisterAndList(t *testing.T) {
	h := newHandler(&memoryStore{})
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("POST", "/api/notes", strings.NewReader(`{"body":"  実験メモ  "}`)))
	if w.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", w.Code, w.Body.String())
	}
	var created Note
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.ID != 1 || created.Body != "実験メモ" {
		t.Fatalf("unexpected note: %+v", created)
	}
	w = httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/api/notes", nil))
	var notes []Note
	if err := json.Unmarshal(w.Body.Bytes(), &notes); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || len(notes) != 1 || notes[0].Body != created.Body {
		t.Fatalf("list: %d %s", w.Code, w.Body.String())
	}
}

func TestRejectInvalidNotes(t *testing.T) {
	for _, body := range []string{`{`, `{}`, `{"body":"  "}`, `{"body":1}`, `{"body":"ok","extra":true}`, `{"body":"ok"} {}`, `{"body":"` + strings.Repeat("あ", 501) + `"}`} {
		t.Run(body[:min(len(body), 30)], func(t *testing.T) {
			s := &memoryStore{}
			w := httptest.NewRecorder()
			newHandler(s).ServeHTTP(w, httptest.NewRequest("POST", "/api/notes", strings.NewReader(body)))
			if w.Code != 400 || len(s.notes) != 0 {
				t.Fatalf("status=%d saved=%d", w.Code, len(s.notes))
			}
		})
	}
}

func TestUpdateNote(t *testing.T) {
	createdAt := time.Date(2026, 9, 16, 12, 0, 0, 0, time.UTC)
	s := &memoryStore{notes: []Note{{ID: 1, Body: "更新前", CreatedAt: createdAt}}}
	h := newHandler(s)

	for _, body := range []string{`{"body":"  更新後  "}`, `{"body":"更新後"}`} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("PATCH", "/api/notes/1", strings.NewReader(body)))
		if w.Code != http.StatusOK {
			t.Fatalf("update: %d %s", w.Code, w.Body.String())
		}
		var updated Note
		if err := json.Unmarshal(w.Body.Bytes(), &updated); err != nil {
			t.Fatal(err)
		}
		if updated.ID != 1 || updated.Body != "更新後" || !updated.CreatedAt.Equal(createdAt) {
			t.Fatalf("unexpected note: %+v", updated)
		}
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/api/notes", nil))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"body":"更新後"`) {
		t.Fatalf("list: %d %s", w.Code, w.Body.String())
	}
}

func TestRejectInvalidUpdates(t *testing.T) {
	tests := []struct {
		name string
		path string
		body string
	}{
		{"zero id", "/api/notes/0", `{"body":"ok"}`},
		{"negative id", "/api/notes/-1", `{"body":"ok"}`},
		{"invalid id", "/api/notes/not-a-number", `{"body":"ok"}`},
		{"overflow id", "/api/notes/9223372036854775808", `{"body":"ok"}`},
		{"missing body", "/api/notes/1", `{}`},
		{"invalid json", "/api/notes/1", `{`},
		{"blank body", "/api/notes/1", `{"body":"  "}`},
		{"wrong body type", "/api/notes/1", `{"body":1}`},
		{"unknown field", "/api/notes/1", `{"body":"ok","extra":true}`},
		{"multiple json", "/api/notes/1", `{"body":"ok"} {}`},
		{"too long", "/api/notes/1", `{"body":"` + strings.Repeat("あ", 501) + `"}`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			s := &memoryStore{notes: []Note{{ID: 1, Body: "更新前"}}}
			w := httptest.NewRecorder()
			newHandler(s).ServeHTTP(w, httptest.NewRequest("PATCH", tc.path, strings.NewReader(tc.body)))
			if w.Code != http.StatusBadRequest || s.notes[0].Body != "更新前" {
				t.Fatalf("status=%d note=%q body=%s", w.Code, s.notes[0].Body, w.Body.String())
			}
		})
	}
}

func TestUpdateMissingNote(t *testing.T) {
	w := httptest.NewRecorder()
	newHandler(&memoryStore{}).ServeHTTP(w, httptest.NewRequest("PATCH", "/api/notes/99", strings.NewReader(`{"body":"ok"}`)))
	if w.Code != http.StatusNotFound {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestEmptyListIsArray(t *testing.T) {
	w := httptest.NewRecorder()
	newHandler(&memoryStore{}).ServeHTTP(w, httptest.NewRequest("GET", "/api/notes", nil))
	if strings.TrimSpace(w.Body.String()) != "[]" {
		t.Fatal(w.Body.String())
	}
}

func TestDeleteNote(t *testing.T) {
	s := &memoryStore{notes: []Note{{ID: 1, Body: "残す"}, {ID: 2, Body: "削除する"}}}
	w := httptest.NewRecorder()
	newHandler(s).ServeHTTP(w, httptest.NewRequest("DELETE", "/api/notes/2", nil))

	if w.Code != http.StatusNoContent || w.Body.Len() != 0 {
		t.Fatalf("delete: %d %q", w.Code, w.Body.String())
	}
	if len(s.notes) != 1 || s.notes[0].ID != 1 {
		t.Fatalf("notes after delete: %+v", s.notes)
	}
}

func TestRejectInvalidDeleteIDs(t *testing.T) {
	for _, path := range []string{"/api/notes/0", "/api/notes/-1", "/api/notes/not-a-number", "/api/notes/9223372036854775808"} {
		t.Run(path, func(t *testing.T) {
			s := &memoryStore{notes: []Note{{ID: 1, Body: "残す"}}}
			w := httptest.NewRecorder()
			newHandler(s).ServeHTTP(w, httptest.NewRequest("DELETE", path, nil))
			if w.Code != http.StatusBadRequest || len(s.notes) != 1 {
				t.Fatalf("status=%d notes=%+v", w.Code, s.notes)
			}
		})
	}
}

func TestDeleteMissingNote(t *testing.T) {
	w := httptest.NewRecorder()
	newHandler(&memoryStore{}).ServeHTTP(w, httptest.NewRequest("DELETE", "/api/notes/42", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestListPassesTrimmedSearchQuery(t *testing.T) {
	for _, tc := range []struct {
		name, path, want string
	}{
		{"missing", "/api/notes", ""},
		{"blank", "/api/notes?q=%20%20%20", ""},
		{"special characters", "/api/notes?q=%20%20%E5%AE%9F%E9%A8%93%25_%20%20", "実験%_"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := &memoryStore{}
			w := httptest.NewRecorder()
			newHandler(store).ServeHTTP(w, httptest.NewRequest("GET", tc.path, nil))
			if w.Code != http.StatusOK {
				t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
			}
			if store.listQuery != tc.want {
				t.Fatalf("query=%q, want %q", store.listQuery, tc.want)
			}
		})
	}
}

func TestDatabaseFailures(t *testing.T) {
	for _, tc := range []struct {
		method, path, body string
		status             int
	}{
		{"GET", "/api/health", "", 503}, {"GET", "/api/notes", "", 500}, {"POST", "/api/notes", `{"body":"ok"}`, 500},
		{"DELETE", "/api/notes/1", "", 500},
		{"PATCH", "/api/notes/1", `{"body":"ok"}`, 500},
	} {
		w := httptest.NewRecorder()
		newHandler(&memoryStore{err: errors.New("secret connection detail")}).ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body)))
		if w.Code != tc.status || strings.Contains(w.Body.String(), "secret") {
			t.Fatalf("%s: %d %s", tc.path, w.Code, w.Body.String())
		}
	}
}
