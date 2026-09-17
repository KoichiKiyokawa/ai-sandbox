package main

import (
	"context"
	"database/sql"
	"errors"
)

type mysqlStore struct{ db *sql.DB }

func (s *mysqlStore) Ping(ctx context.Context) error { return s.db.PingContext(ctx) }
func (s *mysqlStore) List(ctx context.Context, query string) ([]Note, error) {
	statement := "SELECT id, body, created_at FROM notes ORDER BY id DESC LIMIT 100"
	args := []any{}
	if query != "" {
		statement = "SELECT id, body, created_at FROM notes WHERE INSTR(body, ?) > 0 ORDER BY id DESC LIMIT 100"
		args = append(args, query)
	}
	rows, err := s.db.QueryContext(ctx, statement, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	notes := []Note{}
	for rows.Next() {
		var n Note
		if err := rows.Scan(&n.ID, &n.Body, &n.CreatedAt); err != nil {
			return nil, err
		}
		notes = append(notes, n)
	}
	return notes, rows.Err()
}
func (s *mysqlStore) Create(ctx context.Context, body string) (Note, error) {
	result, err := s.db.ExecContext(ctx, "INSERT INTO notes (body) VALUES (?)", body)
	if err != nil {
		return Note{}, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return Note{}, err
	}
	var n Note
	err = s.db.QueryRowContext(ctx, "SELECT id, body, created_at FROM notes WHERE id = ?", id).Scan(&n.ID, &n.Body, &n.CreatedAt)
	return n, err
}

func (s *mysqlStore) Delete(ctx context.Context, id int64) (bool, error) {
	result, err := s.db.ExecContext(ctx, "DELETE FROM notes WHERE id = ?", id)
	if err != nil {
		return false, err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	return rows > 0, nil
}

func (s *mysqlStore) Update(ctx context.Context, id int64, body string) (Note, error) {
	if _, err := s.db.ExecContext(ctx, "UPDATE notes SET body = ? WHERE id = ?", body, id); err != nil {
		return Note{}, err
	}
	var n Note
	err := s.db.QueryRowContext(ctx, "SELECT id, body, created_at FROM notes WHERE id = ?", id).Scan(&n.ID, &n.Body, &n.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Note{}, errNoteNotFound
	}
	return n, err
}
