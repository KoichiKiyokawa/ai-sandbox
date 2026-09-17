package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

type Note struct {
	ID        int64     `json:"id"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
}

type noteStore interface {
	Ping(context.Context) error
	List(context.Context, string) ([]Note, error)
	Create(context.Context, string) (Note, error)
	Delete(context.Context, int64) (bool, error)
	Update(context.Context, int64, string) (Note, error)
}

var errNoteNotFound = errors.New("note not found")

func decodeNoteBody(w http.ResponseWriter, r *http.Request) (string, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	var input struct {
		Body string `json:"body"`
	}
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&input); err != nil {
		jsonResponse(w, 400, map[string]string{"error": "正しいJSONでメモを指定してください。"})
		return "", false
	}
	if err := dec.Decode(new(any)); err != io.EOF {
		jsonResponse(w, 400, map[string]string{"error": "JSONは1件だけ指定してください。"})
		return "", false
	}
	input.Body = strings.TrimSpace(input.Body)
	if n := utf8.RuneCountInString(input.Body); n < 1 || n > 500 {
		jsonResponse(w, 400, map[string]string{"error": "メモは1〜500文字で入力してください。"})
		return "", false
	}
	return input.Body, true
}

func jsonResponse(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("response: %v", err)
	}
}

func newHandler(store noteStore) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := store.Ping(ctx); err != nil {
			log.Printf("health: %v", err)
			jsonResponse(w, 503, map[string]string{"error": "データベースに接続できません。"})
			return
		}
		jsonResponse(w, 200, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/notes", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		query := strings.TrimSpace(r.URL.Query().Get("q"))
		notes, err := store.List(ctx, query)
		if err != nil {
			log.Printf("list: %v", err)
			jsonResponse(w, 500, map[string]string{"error": "メモを取得できませんでした。"})
			return
		}
		if notes == nil {
			notes = []Note{}
		}
		jsonResponse(w, 200, notes)
	})
	mux.HandleFunc("POST /api/notes", func(w http.ResponseWriter, r *http.Request) {
		body, ok := decodeNoteBody(w, r)
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		note, err := store.Create(ctx, body)
		if err != nil {
			log.Printf("create: %v", err)
			jsonResponse(w, 500, map[string]string{"error": "メモを保存できませんでした。"})
			return
		}
		jsonResponse(w, 201, note)
	})
	mux.HandleFunc("DELETE /api/notes/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil || id <= 0 {
			jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "正しいメモIDを指定してください。"})
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		deleted, err := store.Delete(ctx, id)
		if err != nil {
			log.Printf("delete: %v", err)
			jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": "メモを削除できませんでした。"})
			return
		}
		if !deleted {
			jsonResponse(w, http.StatusNotFound, map[string]string{"error": "メモが見つかりません。"})
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("PATCH /api/notes/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil || id < 1 {
			jsonResponse(w, 400, map[string]string{"error": "正しいメモIDを指定してください。"})
			return
		}
		body, ok := decodeNoteBody(w, r)
		if !ok {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		note, err := store.Update(ctx, id, body)
		if errors.Is(err, errNoteNotFound) {
			jsonResponse(w, 404, map[string]string{"error": "メモが見つかりません。"})
			return
		}
		if err != nil {
			log.Printf("update: %v", err)
			jsonResponse(w, 500, map[string]string{"error": "メモを更新できませんでした。"})
			return
		}
		jsonResponse(w, 200, note)
	})
	return mux
}
