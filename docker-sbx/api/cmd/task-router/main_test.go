package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRouteByTaskHost(t *testing.T) {
	for _, task := range []string{"notes", "edit", "delete", "search"} {
		t.Run(task, func(t *testing.T) {
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Host != task+".localhost" {
					t.Errorf("host=%q", r.Host)
				}
				if r.URL.RequestURI() != "/api/notes?q=a%25_" {
					t.Errorf("uri=%q", r.URL.RequestURI())
				}
				if r.Method != "PATCH" {
					t.Errorf("method=%s", r.Method)
				}
				b, _ := io.ReadAll(r.Body)
				w.Header().Set("Content-Type", "application/json")
				w.Write(b)
			}))
			defer upstream.Close()
			handler, err := newRouter(map[string]string{task + ".localhost": upstream.URL})
			if err != nil {
				t.Fatal(err)
			}
			req := httptest.NewRequest("PATCH", "http://"+task+".localhost/api/notes?q=a%25_", strings.NewReader(`{"body":"test"}`))
			res := httptest.NewRecorder()
			handler.ServeHTTP(res, req)
			if res.Code != 200 || res.Body.String() != `{"body":"test"}` {
				t.Fatalf("status=%d body=%s", res.Code, res.Body.String())
			}
			if res.Header().Get("X-Task-Host") != task+".localhost" {
				t.Fatal("task host header missing")
			}
		})
	}
}

func TestUnknownHostDoesNotReachBackend(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { t.Error("unknown host reached backend") }))
	defer upstream.Close()
	handler, err := newRouter(map[string]string{"edit.localhost": upstream.URL})
	if err != nil {
		t.Fatal(err)
	}
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, httptest.NewRequest("GET", "http://unregistered.localhost/", nil))
	if res.Code != 404 {
		t.Fatalf("status=%d", res.Code)
	}
}

func TestUnavailableBackend(t *testing.T) {
	upstream := httptest.NewServer(http.NotFoundHandler())
	upstream.Close()
	handler, err := newRouter(map[string]string{"edit.localhost": upstream.URL})
	if err != nil {
		t.Fatal(err)
	}
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, httptest.NewRequest("GET", "http://edit.localhost/", nil))
	if res.Code != 502 {
		t.Fatalf("status=%d", res.Code)
	}
}

func TestRejectInvalidRoutes(t *testing.T) {
	for _, routes := range []map[string]string{
		{},
		{"example.com": "http://127.0.0.1:5173"},
		{"edit.localhost": "http://example.com:5173"},
		{"edit.localhost": "http://127.0.0.1:5173/path"},
		{"edit.localhost": "https://127.0.0.1:5173"},
		{"edit.localhost": "http://user:pass@127.0.0.1:5173"},
	} {
		if _, err := newRouter(routes); err == nil {
			t.Errorf("accepted invalid routes: %v", routes)
		}
	}
}
