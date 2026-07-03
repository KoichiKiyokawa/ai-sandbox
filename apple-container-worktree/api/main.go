// Package main is a tiny zero-dependency HTTP API used to demonstrate
// apple/container DNS-based service discovery across git worktrees.
//
// It reports liveness of its postgres and redis dependencies, reached via
// the hostnames injected by scripts/up.sh (e.g. db.local, feat-x.db.local).
package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

type componentStatus struct {
	Host  string `json:"host"`
	Port  string `json:"port"`
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

type status struct {
	Worktree string             `json:"worktree"`
	Postgres componentStatus    `json:"postgres"`
	Redis    componentStatus    `json:"redis"`
	Hosts    map[string]string  `json:"hosts"`
	Time     string             `json:"time"`
}

func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func main() {
	wt := env("WORKTREE", "main")
	pgHost := env("POSTGRES_HOST", "db.local")
	pgPort := env("POSTGRES_PORT", "5432")
	rdHost := env("REDIS_HOST", "redis.local")
	rdPort := env("REDIS_PORT", "6379")
	addr := env("ADDR", ":8080")

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		s := status{
			Worktree: wt,
			Hosts: map[string]string{
				"postgres": net.JoinHostPort(pgHost, pgPort),
				"redis":    net.JoinHostPort(rdHost, rdPort),
			},
			Time: time.Now().UTC().Format(time.RFC3339),
		}
		s.Postgres = checkPostgres(pgHost, pgPort)
		s.Redis = checkRedis(rdHost, rdPort)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(s)
	})
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		pg := checkPostgres(pgHost, pgPort)
		rd := checkRedis(rdHost, rdPort)
		if pg.OK && rd.OK {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("ok\n"))
			return
		}
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = fmt.Fprintf(w, "postgres=%v redis=%v\n", pg.OK, rd.OK)
	})

	fmt.Printf("api listening on %s (worktree=%s pg=%s:%s redis=%s:%s)\n",
		addr, wt, pgHost, pgPort, rdHost, rdPort)
	if err := http.ListenAndServe(addr, mux); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// checkPostgres does a TCP liveness check to the postgres port.
// A successful dial means postgres is accepting connections.
func checkPostgres(host, port string) componentStatus {
	st := componentStatus{Host: host, Port: port}
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, port), 3*time.Second)
	if err != nil {
		st.Error = err.Error()
		return st
	}
	_ = conn.Close()
	st.OK = true
	return st
}

// checkRedis does a real RESP PING and expects +PONG.
func checkRedis(host, port string) componentStatus {
	st := componentStatus{Host: host, Port: port}
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, port), 3*time.Second)
	if err != nil {
		st.Error = err.Error()
		return st
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(3 * time.Second))
	if _, err := conn.Write([]byte("*1\r\n$4\r\nPING\r\n")); err != nil {
		st.Error = err.Error()
		return st
	}
	buf := make([]byte, 64)
	n, err := conn.Read(buf)
	if err != nil {
		st.Error = err.Error()
		return st
	}
	if strings.Contains(string(buf[:n]), "PONG") {
		st.OK = true
		return st
	}
	st.Error = "unexpected response: " + strings.TrimSpace(string(buf[:n]))
	return st
}
