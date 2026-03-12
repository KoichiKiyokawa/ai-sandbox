package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

type app struct {
	db     *sql.DB
	logger *log.Logger
}

type task struct {
	ID            int64      `json:"id"`
	Name          string     `json:"name"`
	Status        string     `json:"status"`
	DurationMS    int        `json:"duration_ms"`
	StartedAt     *time.Time `json:"started_at,omitempty"`
	CompletedAt   *time.Time `json:"completed_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	Worker        string     `json:"worker"`
	ResultMessage string     `json:"result_message,omitempty"`
	ErrorMessage  string     `json:"error_message,omitempty"`
}

type createTaskRequest struct {
	Name       string `json:"name"`
	DurationMS int    `json:"duration_ms"`
}

type runBatchRequest struct {
	Count            int `json:"count"`
	MinDurationMS    int `json:"min_duration_ms"`
	MaxDurationMS    int `json:"max_duration_ms"`
	ConcurrencyLimit int `json:"concurrency_limit"`
}

type runBatchResponse struct {
	TaskIDs          []int64 `json:"task_ids"`
	RequestedCount   int     `json:"requested_count"`
	ConcurrencyLimit int     `json:"concurrency_limit"`
	Message          string  `json:"message"`
}

func main() {
	logger := log.New(os.Stdout, "", log.LstdFlags|log.Lmicroseconds)

	dsn := envOrDefault("MYSQL_DSN", "app:app@tcp(mysql:3306)/sandbox?parseTime=true")
	addr := envOrDefault("APP_ADDR", ":8080")

	db, err := openDB(dsn)
	if err != nil {
		logger.Fatalf("database connection failed: %v", err)
	}
	defer db.Close()

	a := &app{db: db, logger: logger}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", a.handleHealthz)
	mux.HandleFunc("/tasks/run-batch", a.handleRunBatch)
	mux.HandleFunc("/tasks/", a.handleTaskByID)
	mux.HandleFunc("/tasks", a.handleTasks)

	server := &http.Server{
		Addr:              addr,
		Handler:           loggingMiddleware(logger, mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	logger.Printf("server listening on %s", addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Fatalf("server stopped unexpectedly: %v", err)
	}
}

func openDB(dsn string) (*sql.DB, error) {
	var db *sql.DB
	var err error
	for attempt := 1; attempt <= 30; attempt++ {
		db, err = sql.Open("mysql", dsn)
		if err == nil {
			db.SetMaxOpenConns(20)
			db.SetMaxIdleConns(10)
			db.SetConnMaxLifetime(5 * time.Minute)
			pingCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			err = db.PingContext(pingCtx)
			cancel()
		}

		if err == nil {
			return db, nil
		}

		time.Sleep(2 * time.Second)
	}

	return nil, err
}

func (a *app) handleHealthz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := a.db.PingContext(ctx); err != nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *app) handleTasks(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		a.listTasks(w, r)
	case http.MethodPost:
		a.createTask(w, r)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (a *app) handleTaskByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	idStr := strings.TrimPrefix(r.URL.Path, "/tasks/")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid task id")
		return
	}

	task, err := a.fetchTask(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "task not found")
		return
	}
	if err != nil {
		a.logger.Printf("fetch task failed: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to load task")
		return
	}

	writeJSON(w, http.StatusOK, task)
}

func (a *app) handleRunBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req runBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if req.Count <= 0 || req.Count > 50 {
		writeError(w, http.StatusBadRequest, "count must be between 1 and 50")
		return
	}
	if req.MinDurationMS <= 0 {
		req.MinDurationMS = 1000
	}
	if req.MaxDurationMS < req.MinDurationMS {
		req.MaxDurationMS = req.MinDurationMS + 2000
	}
	if req.ConcurrencyLimit <= 0 {
		req.ConcurrencyLimit = req.Count
	}
	if req.ConcurrencyLimit > req.Count {
		req.ConcurrencyLimit = req.Count
	}

	taskIDs := make([]int64, 0, req.Count)
	for i := 0; i < req.Count; i++ {
		duration := req.MinDurationMS
		if req.MaxDurationMS > req.MinDurationMS {
			step := (req.MaxDurationMS - req.MinDurationMS) / max(req.Count-1, 1)
			duration = req.MinDurationMS + (step * i)
		}
		name := fmt.Sprintf("batch-task-%d", time.Now().UnixNano())
		id, err := a.insertTask(r.Context(), name, duration)
		if err != nil {
			a.logger.Printf("create batch task failed: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to create batch tasks")
			return
		}
		taskIDs = append(taskIDs, id)
	}

	go a.runTasksWithLimit(taskIDs, req.ConcurrencyLimit)

	writeJSON(w, http.StatusAccepted, runBatchResponse{
		TaskIDs:          taskIDs,
		RequestedCount:   req.Count,
		ConcurrencyLimit: req.ConcurrencyLimit,
		Message:          "batch accepted and running in background",
	})
}

func (a *app) createTask(w http.ResponseWriter, r *http.Request) {
	var req createTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if req.Name == "" {
		req.Name = fmt.Sprintf("task-%d", time.Now().UnixNano())
	}
	if req.DurationMS <= 0 {
		req.DurationMS = 2000
	}

	id, err := a.insertTask(r.Context(), req.Name, req.DurationMS)
	if err != nil {
		a.logger.Printf("create task failed: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create task")
		return
	}

	go a.runTasksWithLimit([]int64{id}, 1)

	task, err := a.fetchTask(r.Context(), id)
	if err != nil {
		a.logger.Printf("fetch created task failed: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to load task")
		return
	}

	writeJSON(w, http.StatusAccepted, task)
}

func (a *app) listTasks(w http.ResponseWriter, r *http.Request) {
	rows, err := a.db.QueryContext(r.Context(), `
		SELECT id, name, status, duration_ms, started_at, completed_at, created_at, updated_at, worker, result_message, error_message
		FROM tasks
		ORDER BY id DESC
		LIMIT 100
	`)
	if err != nil {
		a.logger.Printf("list tasks failed: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to list tasks")
		return
	}
	defer rows.Close()

	var tasks []task
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			a.logger.Printf("scan task failed: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to load tasks")
			return
		}
		tasks = append(tasks, t)
	}

	writeJSON(w, http.StatusOK, map[string]any{"tasks": tasks})
}

func (a *app) insertTask(ctx context.Context, name string, durationMS int) (int64, error) {
	result, err := a.db.ExecContext(ctx, `
		INSERT INTO tasks (name, status, duration_ms, worker)
		VALUES (?, 'pending', ?, '')
	`, name, durationMS)
	if err != nil {
		return 0, err
	}

	return result.LastInsertId()
}

func (a *app) fetchTask(ctx context.Context, id int64) (task, error) {
	row := a.db.QueryRowContext(ctx, `
		SELECT id, name, status, duration_ms, started_at, completed_at, created_at, updated_at, worker, result_message, error_message
		FROM tasks
		WHERE id = ?
	`, id)

	return scanTask(row)
}

func (a *app) runTasksWithLimit(taskIDs []int64, limit int) {
	sem := make(chan struct{}, limit)
	var wg sync.WaitGroup

	for _, id := range taskIDs {
		wg.Add(1)
		sem <- struct{}{}

		go func(taskID int64) {
			defer wg.Done()
			defer func() { <-sem }()

			if err := a.executeTask(taskID); err != nil {
				a.logger.Printf("task %d failed: %v", taskID, err)
			}
		}(id)
	}

	wg.Wait()
}

func (a *app) executeTask(taskID int64) error {
	ctx := context.Background()
	task, err := a.fetchTask(ctx, taskID)
	if err != nil {
		return err
	}

	workerName := fmt.Sprintf("goroutine-%d", time.Now().UnixNano())
	startedAt := time.Now().UTC()

	if _, err := a.db.ExecContext(ctx, `
		UPDATE tasks
		SET status = 'running', worker = ?, started_at = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, workerName, startedAt, taskID); err != nil {
		return err
	}

	a.logger.Printf("task %d started by %s for %dms", taskID, workerName, task.DurationMS)
	time.Sleep(time.Duration(task.DurationMS) * time.Millisecond)

	completedAt := time.Now().UTC()
	resultMessage := fmt.Sprintf("completed after %dms", task.DurationMS)
	if _, err := a.db.ExecContext(ctx, `
		UPDATE tasks
		SET status = 'completed', completed_at = ?, result_message = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, completedAt, resultMessage, taskID); err != nil {
		if _, updateErr := a.db.ExecContext(ctx, `
			UPDATE tasks
			SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`, err.Error(), taskID); updateErr != nil {
			return fmt.Errorf("task update failed: %v, and status update failed: %v", err, updateErr)
		}
		return err
	}

	a.logger.Printf("task %d completed by %s", taskID, workerName)
	return nil
}

type scanner interface {
	Scan(dest ...any) error
}

func scanTask(s scanner) (task, error) {
	var t task
	var startedAt sql.NullTime
	var completedAt sql.NullTime
	var resultMessage sql.NullString
	var errorMessage sql.NullString

	err := s.Scan(
		&t.ID,
		&t.Name,
		&t.Status,
		&t.DurationMS,
		&startedAt,
		&completedAt,
		&t.CreatedAt,
		&t.UpdatedAt,
		&t.Worker,
		&resultMessage,
		&errorMessage,
	)
	if err != nil {
		return task{}, err
	}

	if startedAt.Valid {
		t.StartedAt = &startedAt.Time
	}
	if completedAt.Valid {
		t.CompletedAt = &completedAt.Time
	}
	if resultMessage.Valid {
		t.ResultMessage = resultMessage.String
	}
	if errorMessage.Valid {
		t.ErrorMessage = errorMessage.String
	}

	return t, nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func loggingMiddleware(logger *log.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		logger.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
