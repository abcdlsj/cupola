// Package store is the hub's SQLite access layer: hand-written SQL, embedded
// migrations, one writer and WAL. Units are the model's units.
package store

import (
	"context"
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"

	"github.com/abcdlsj/cupola/internal/model"
)

//go:embed migrations/*.sql
var migrations embed.FS

type Store struct {
	db   *sql.DB
	path string
}

func Open(ctx context.Context, path string) (*Store, error) {
	dsn := fmt.Sprintf("file:%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_pragma=synchronous(NORMAL)", path)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// One writer: a single connection serialises writes and keeps WAL sane.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, err
	}
	s := &Store{db: db, path: path}
	if err := s.migrate(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) Path() string { return s.path }

func (s *Store) migrate(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`); err != nil {
		return err
	}
	entries, err := migrations.ReadDir("migrations")
	if err != nil {
		return err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		var count int
		if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations WHERE version = ?`, entry.Name()).Scan(&count); err != nil {
			return err
		}
		if count > 0 {
			continue
		}
		body, err := migrations.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return err
		}
		tx, err := s.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, string(body)); err != nil {
			tx.Rollback()
			return fmt.Errorf("migration %s: %w", entry.Name(), err)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)`, entry.Name(), time.Now().UnixMilli()); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

// ---------- nodes ----------

func (s *Store) UpsertNode(ctx context.Context, node model.NodeRecord, tokenEnc, connEnc []byte) error {
	if node.Labels == nil {
		node.Labels = []string{}
	}
	labels, _ := json.Marshal(node.Labels)
	now := time.Now().UnixMilli()
	if node.CreatedAt == 0 {
		node.CreatedAt = now
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO nodes(id, name, labels, transport, url, token_enc, conn_enc, agent_version, os, kernel, arch, created_at, last_seen, status)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name=excluded.name,
			labels=excluded.labels,
			transport=excluded.transport,
			url=excluded.url,
			token_enc=COALESCE(excluded.token_enc, nodes.token_enc),
			conn_enc=COALESCE(excluded.conn_enc, nodes.conn_enc)`,
		node.ID, node.Name, string(labels), node.Transport, node.URL, tokenEnc, connEnc,
		node.AgentVersion, node.OS, node.Kernel, node.Arch, node.CreatedAt, node.LastSeen, node.Status)
	return err
}

func (s *Store) ListNodeRecords(ctx context.Context) ([]model.NodeRecord, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, labels, transport, url, agent_version, os, kernel, arch, created_at, last_seen, status
		FROM nodes ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.NodeRecord
	for rows.Next() {
		node, err := scanNode(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, node)
	}
	return out, rows.Err()
}

func (s *Store) GetNode(ctx context.Context, id string) (model.NodeRecord, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, name, labels, transport, url, agent_version, os, kernel, arch, created_at, last_seen, status
		FROM nodes WHERE id = ?`, id)
	return scanNode(row)
}

type scanner interface {
	Scan(dest ...any) error
}

func scanNode(row scanner) (model.NodeRecord, error) {
	var node model.NodeRecord
	var labels string
	err := row.Scan(&node.ID, &node.Name, &labels, &node.Transport, &node.URL,
		&node.AgentVersion, &node.OS, &node.Kernel, &node.Arch, &node.CreatedAt, &node.LastSeen, &node.Status)
	if err != nil {
		return node, err
	}
	_ = json.Unmarshal([]byte(labels), &node.Labels)
	if node.Labels == nil {
		node.Labels = []string{}
	}
	return node, nil
}

// NodeSecret is what the transport needs; it never leaves the hub process.
type NodeSecret struct {
	Node      model.NodeRecord
	Token     []byte
	Conn      []byte
}

func (s *Store) GetNodeSecret(ctx context.Context, id string) (NodeSecret, error) {
	var out NodeSecret
	var labels string
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, labels, transport, url, agent_version, os, kernel, arch, created_at, last_seen, status, token_enc, conn_enc
		FROM nodes WHERE id = ?`, id).Scan(
		&out.Node.ID, &out.Node.Name, &labels, &out.Node.Transport, &out.Node.URL,
		&out.Node.AgentVersion, &out.Node.OS, &out.Node.Kernel, &out.Node.Arch,
		&out.Node.CreatedAt, &out.Node.LastSeen, &out.Node.Status, &out.Token, &out.Conn)
	if err != nil {
		return out, err
	}
	_ = json.Unmarshal([]byte(labels), &out.Node.Labels)
	return out, nil
}

func (s *Store) UpdateNodeMeta(ctx context.Context, id, agentVersion, osName, kernel, arch string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE nodes SET agent_version=?, os=?, kernel=?, arch=? WHERE id=?`,
		agentVersion, osName, kernel, arch, id)
	return err
}

func (s *Store) SetNodeStatus(ctx context.Context, id, status string, lastSeen int64) error {
	_, err := s.db.ExecContext(ctx, `UPDATE nodes SET status=?, last_seen=? WHERE id=?`, status, lastSeen, id)
	return err
}

func (s *Store) DeleteNode(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	for _, table := range []string{"samples", "samples_1m", "samples_1h", "disk_samples", "net_samples", "process_samples", "node_state", "node_actions", "events", "action_runs", "alert_state"} {
		if _, err := tx.ExecContext(ctx, "DELETE FROM "+table+" WHERE node_id = ?", id); err != nil {
			tx.Rollback()
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM nodes WHERE id = ?`, id); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

// ---------- snapshots ----------

// SaveSnapshot writes one poll: the compact sample, per-disk/net/process rows,
// the full latest snapshot, and the advertised actions. Process rows are kept
// at most once a minute per node.
func (s *Store) SaveSnapshot(ctx context.Context, snap *model.Snapshot, actions []model.Action) error {
	if snap == nil || snap.Node.ID == "" {
		return errors.New("snapshot without node id")
	}
	ts := snap.Ts
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var netRx, netTx, diskR, diskW float64
	for _, iface := range snap.Network {
		if iface.Iface == "lo" {
			continue
		}
		netRx += iface.RxBps
		netTx += iface.TxBps
	}
	for _, disk := range snap.Disks {
		diskR += disk.ReadBps
		diskW += disk.WriteBps
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT OR REPLACE INTO samples(node_id, ts, cpu, mem, mem_used, mem_total, load1, load5, load15, net_rx, net_tx, disk_r, disk_w, procs, uptime, psi_cpu, psi_io, psi_mem)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		snap.Node.ID, ts, snap.CPU.Percent, snap.Memory.UsedPercent, snap.Memory.Used, snap.Memory.Total,
		snap.CPU.Load1, snap.CPU.Load5, snap.CPU.Load15, netRx, netTx, diskR, diskW,
		snap.CPU.Procs, snap.Node.UptimeSec, snap.Pressure.CPU.Some, snap.Pressure.IO.Some, snap.Pressure.Mem.Some); err != nil {
		return err
	}
	for _, disk := range snap.Disks {
		if _, err := tx.ExecContext(ctx, `
			INSERT OR REPLACE INTO disk_samples(node_id, ts, mount, device, fs, used, size, inode_pct, read_bps, write_bps)
			VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			snap.Node.ID, ts, disk.Mount, disk.Device, disk.FsType, disk.Used, disk.Total, disk.InodePct, disk.ReadBps, disk.WriteBps); err != nil {
			return err
		}
	}
	for _, iface := range snap.Network {
		if _, err := tx.ExecContext(ctx, `
			INSERT OR REPLACE INTO net_samples(node_id, ts, iface, rx_bps, tx_bps) VALUES(?, ?, ?, ?, ?)`,
			snap.Node.ID, ts, iface.Iface, iface.RxBps, iface.TxBps); err != nil {
			return err
		}
	}

	var lastProc int64
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(ts), 0) FROM process_samples WHERE node_id = ?`, snap.Node.ID).Scan(&lastProc); err != nil {
		return err
	}
	if ts-lastProc >= 60_000 {
		limit := len(snap.Processes)
		if limit > 15 {
			limit = 15
		}
		for _, proc := range snap.Processes[:limit] {
			if _, err := tx.ExecContext(ctx, `
				INSERT OR REPLACE INTO process_samples(node_id, ts, pid, name, user, cpu, rss, threads, started_at, command)
				VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				snap.Node.ID, ts, proc.PID, proc.Name, proc.User, proc.CPUPercent, proc.RSSBytes, proc.Threads, proc.StartedAt, proc.Command); err != nil {
				return err
			}
		}
	}

	payload, err := json.Marshal(snap)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO node_state(node_id, ts, payload) VALUES(?, ?, ?)
		ON CONFLICT(node_id) DO UPDATE SET ts=excluded.ts, payload=excluded.payload`,
		snap.Node.ID, ts, string(payload)); err != nil {
		return err
	}
	actionPayload, _ := json.Marshal(actions)
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO node_actions(node_id, ts, payload) VALUES(?, ?, ?)
		ON CONFLICT(node_id) DO UPDATE SET ts=excluded.ts, payload=excluded.payload`,
		snap.Node.ID, ts, string(actionPayload)); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) GetState(ctx context.Context, nodeID string) (*model.Snapshot, error) {
	var payload string
	err := s.db.QueryRowContext(ctx, `SELECT payload FROM node_state WHERE node_id = ?`, nodeID).Scan(&payload)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	var snap model.Snapshot
	if err := json.Unmarshal([]byte(payload), &snap); err != nil {
		return nil, err
	}
	return &snap, nil
}

func (s *Store) GetActions(ctx context.Context, nodeID string) ([]model.Action, error) {
	var payload string
	err := s.db.QueryRowContext(ctx, `SELECT payload FROM node_actions WHERE node_id = ?`, nodeID).Scan(&payload)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	var actions []model.Action
	if err := json.Unmarshal([]byte(payload), &actions); err != nil {
		return nil, err
	}
	return actions, nil
}

// ---------- series ----------

type seriesColumns struct {
	table   string
	min, avg, max string
}

var seriesMetrics = map[string]seriesColumns{
	"cpu":    {"samples", "cpu", "cpu", "cpu"},
	"mem":    {"samples", "mem", "mem", "mem"},
	"load":   {"samples", "load1", "load1", "load1"},
	"net_rx": {"samples", "net_rx", "net_rx", "net_rx"},
	"net_tx": {"samples", "net_tx", "net_tx", "net_tx"},
	"disk_r": {"samples", "disk_r", "disk_r", "disk_r"},
	"disk_w": {"samples", "disk_w", "disk_w", "disk_w"},
	"psi_cpu": {"samples", "psi_cpu", "psi_cpu", "psi_cpu"},
	"psi_io":  {"samples", "psi_io", "psi_io", "psi_io"},
	"procs":   {"samples", "procs", "procs", "procs"},
}

func seriesFor(metric string, step int64) (seriesColumns, bool) {
	base, ok := seriesMetrics[metric]
	if !ok {
		return seriesColumns{}, false
	}
	switch {
	case step <= 5:
		return base, true
	case step <= 60:
		return seriesColumns{"samples_1m", minCol(metric), avgCol(metric), maxCol(metric)}, true
	default:
		return seriesColumns{"samples_1h", minCol(metric), avgCol(metric), maxCol(metric)}, true
	}
}

func minCol(metric string) string { return rollupCol(metric, "min") }
func avgCol(metric string) string { return rollupCol(metric, "avg") }
func maxCol(metric string) string { return rollupCol(metric, "max") }

func rollupCol(metric, kind string) string {
	switch metric {
	case "cpu":
		return "cpu_" + kind
	case "mem":
		return "mem_" + kind
	case "load":
		if kind == "avg" {
			return "load_avg"
		}
		if kind == "max" {
			return "load_max"
		}
		return "load_avg"
	case "net_rx":
		return "net_rx_avg"
	case "net_tx":
		return "net_tx_avg"
	case "disk_r":
		return "disk_r_avg"
	case "disk_w":
		return "disk_w_avg"
	case "psi_cpu":
		return "psi_cpu_avg"
	case "psi_io":
		return "psi_io_avg"
	default:
		return "cpu_avg"
	}
}

// Series returns min/avg/max points for the requested window and step.
func (s *Store) Series(ctx context.Context, nodeID, metric string, from, to, step int64) ([]model.SeriesPoint, error) {
	cols, ok := seriesFor(metric, step)
	if !ok {
		return nil, fmt.Errorf("unknown metric %q", metric)
	}
	query := fmt.Sprintf(`SELECT ts, %s, %s, %s FROM %s WHERE node_id = ? AND ts >= ? AND ts <= ? ORDER BY ts`,
		cols.min, cols.avg, cols.max, cols.table)
	rows, err := s.db.QueryContext(ctx, query, nodeID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.SeriesPoint
	for rows.Next() {
		var point model.SeriesPoint
		if err := rows.Scan(&point.Ts, &point.Min, &point.Avg, &point.Max); err != nil {
			return nil, err
		}
		out = append(out, point)
	}
	return out, rows.Err()
}

// DiskHistory returns the last 7 days of root-disk usage for fill prediction.
func (s *Store) DiskHistory(ctx context.Context, nodeID string, mount string, since int64) ([]model.SeriesPoint, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT ts, (CAST(used AS REAL) / NULLIF(size, 0)) * 100
		FROM disk_samples WHERE node_id = ? AND mount = ? AND ts >= ? ORDER BY ts`,
		nodeID, mount, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.SeriesPoint
	for rows.Next() {
		var ts int64
		var pct float64
		if err := rows.Scan(&ts, &pct); err != nil {
			return nil, err
		}
		out = append(out, model.SeriesPoint{Ts: ts, Min: pct, Avg: pct, Max: pct})
	}
	return out, rows.Err()
}

// ---------- events, runs, alerts ----------

func (s *Store) InsertEvent(ctx context.Context, event *model.Event) error {
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO events(node_id, ts, kind, severity, message, meta) VALUES(?, ?, ?, ?, ?, ?)`,
		event.NodeID, event.Ts, event.Kind, event.Severity, event.Message, event.Meta)
	if err != nil {
		return err
	}
	event.ID, _ = res.LastInsertId()
	return nil
}

type EventFilter struct {
	NodeID   string
	Kinds    []string
	Severity string
	Since    int64
	Until    int64
	Limit    int
	Query    string
}

func (s *Store) ListEvents(ctx context.Context, filter EventFilter) ([]model.Event, error) {
	var where []string
	var args []any
	if filter.NodeID != "" {
		where = append(where, "node_id = ?")
		args = append(args, filter.NodeID)
	}
	if filter.Severity != "" {
		where = append(where, "severity = ?")
		args = append(args, filter.Severity)
	}
	if len(filter.Kinds) > 0 {
		placeholders := make([]string, len(filter.Kinds))
		for i, kind := range filter.Kinds {
			placeholders[i] = "?"
			args = append(args, kind)
		}
		where = append(where, "kind IN ("+strings.Join(placeholders, ",")+")")
	}
	if filter.Since > 0 {
		where = append(where, "ts >= ?")
		args = append(args, filter.Since)
	}
	if filter.Until > 0 {
		where = append(where, "ts <= ?")
		args = append(args, filter.Until)
	}
	if filter.Query != "" {
		where = append(where, "message LIKE ?")
		args = append(args, "%"+filter.Query+"%")
	}
	limit := filter.Limit
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	args = append(args, limit)
	query := `SELECT id, node_id, ts, kind, severity, message, meta FROM events`
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	query += " ORDER BY ts DESC LIMIT ?"
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Event
	for rows.Next() {
		var event model.Event
		if err := rows.Scan(&event.ID, &event.NodeID, &event.Ts, &event.Kind, &event.Severity, &event.Message, &event.Meta); err != nil {
			return nil, err
		}
		out = append(out, event)
	}
	return out, rows.Err()
}

func (s *Store) GetEvent(ctx context.Context, id int64) (model.Event, error) {
	var event model.Event
	err := s.db.QueryRowContext(ctx, `SELECT id, node_id, ts, kind, severity, message, meta FROM events WHERE id = ?`, id).
		Scan(&event.ID, &event.NodeID, &event.Ts, &event.Kind, &event.Severity, &event.Message, &event.Meta)
	return event, err
}

func (s *Store) InsertActionRun(ctx context.Context, run model.ActionRun) error {
	truncated := 0
	if run.Truncated {
		truncated = 1
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO action_runs(id, node_id, action_id, action_name, ts, actor, source, ok, exit_code, duration_ms, output, truncated)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		run.ID, run.NodeID, run.ActionID, run.ActionName, run.Ts, run.Actor, run.Source,
		boolInt(run.OK), run.ExitCode, run.DurationMs, run.Output, truncated)
	return err
}

func (s *Store) ListActionRuns(ctx context.Context, nodeID string, limit int) ([]model.ActionRun, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	query := `SELECT id, node_id, action_id, action_name, ts, actor, source, ok, exit_code, duration_ms, output, truncated FROM action_runs`
	var args []any
	if nodeID != "" {
		query += " WHERE node_id = ?"
		args = append(args, nodeID)
	}
	query += " ORDER BY ts DESC LIMIT ?"
	args = append(args, limit)
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.ActionRun
	for rows.Next() {
		var run model.ActionRun
		var ok, truncated int
		if err := rows.Scan(&run.ID, &run.NodeID, &run.ActionID, &run.ActionName, &run.Ts, &run.Actor, &run.Source,
			&ok, &run.ExitCode, &run.DurationMs, &run.Output, &truncated); err != nil {
			return nil, err
		}
		run.OK = ok == 1
		run.Truncated = truncated == 1
		out = append(out, run)
	}
	return out, rows.Err()
}

func (s *Store) InsertAlert(ctx context.Context, alert *model.Alert) error {
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO alerts(rule_id, rule_name, node_id, ts, state, value, message) VALUES(?, ?, ?, ?, ?, ?, ?)`,
		alert.RuleID, alert.RuleName, alert.NodeID, alert.Ts, alert.State, alert.Value, alert.Message)
	if err != nil {
		return err
	}
	alert.ID, _ = res.LastInsertId()
	return nil
}

func (s *Store) ListAlerts(ctx context.Context, firingOnly bool, limit int) ([]model.Alert, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	query := `SELECT id, rule_id, rule_name, node_id, ts, state, value, message FROM alerts`
	if firingOnly {
		query += ` WHERE state = 'firing'`
	}
	query += " ORDER BY ts DESC LIMIT ?"
	rows, err := s.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Alert
	for rows.Next() {
		var alert model.Alert
		if err := rows.Scan(&alert.ID, &alert.RuleID, &alert.RuleName, &alert.NodeID, &alert.Ts, &alert.State, &alert.Value, &alert.Message); err != nil {
			return nil, err
		}
		out = append(out, alert)
	}
	return out, rows.Err()
}

func (s *Store) GetAlertState(ctx context.Context, ruleID, nodeID string) (state string, since int64, value float64, notified int64, err error) {
	err = s.db.QueryRowContext(ctx, `SELECT state, since, value, last_notified FROM alert_state WHERE rule_id = ? AND node_id = ?`, ruleID, nodeID).
		Scan(&state, &since, &value, &notified)
	if errors.Is(err, sql.ErrNoRows) {
		err = nil
	}
	return
}

func (s *Store) SetAlertState(ctx context.Context, ruleID, nodeID, state string, since int64, value float64, notified int64) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO alert_state(rule_id, node_id, state, since, value, last_notified) VALUES(?, ?, ?, ?, ?, ?)
		ON CONFLICT(rule_id, node_id) DO UPDATE SET state=excluded.state, since=excluded.since, value=excluded.value, last_notified=excluded.last_notified`,
		ruleID, nodeID, state, since, value, notified)
	return err
}

func (s *Store) ClearAlertState(ctx context.Context, ruleID, nodeID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM alert_state WHERE rule_id = ? AND node_id = ?`, ruleID, nodeID)
	return err
}

func (s *Store) InsertDelivery(ctx context.Context, delivery *model.Delivery) error {
	res, err := s.db.ExecContext(ctx, `
		INSERT INTO deliveries(alert_id, channel_id, ts, ok, status, attempts, error) VALUES(?, ?, ?, ?, ?, ?, ?)`,
		delivery.AlertID, delivery.ChannelID, delivery.Ts, boolInt(delivery.OK), delivery.Status, delivery.Attempts, delivery.Error)
	if err != nil {
		return err
	}
	delivery.ID, _ = res.LastInsertId()
	return nil
}

func (s *Store) ListDeliveries(ctx context.Context, alertID int64, limit int) ([]model.Delivery, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	query := `SELECT id, alert_id, channel_id, ts, ok, status, attempts, error FROM deliveries`
	var args []any
	if alertID > 0 {
		query += " WHERE alert_id = ?"
		args = append(args, alertID)
	}
	query += " ORDER BY ts DESC LIMIT ?"
	args = append(args, limit)
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Delivery
	for rows.Next() {
		var delivery model.Delivery
		var ok int
		if err := rows.Scan(&delivery.ID, &delivery.AlertID, &delivery.ChannelID, &delivery.Ts, &ok, &delivery.Status, &delivery.Attempts, &delivery.Error); err != nil {
			return nil, err
		}
		delivery.OK = ok == 1
		out = append(out, delivery)
	}
	return out, rows.Err()
}

// ---------- rules ----------

func (s *Store) ListRules(ctx context.Context) ([]model.AlertRule, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, type, metric, comparator, threshold, duration_sec, severity, node_id, kinds, channel_id, enabled, cooldown_sec, created_at
		FROM alert_rules ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.AlertRule
	for rows.Next() {
		rule, err := scanRule(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, rule)
	}
	return out, rows.Err()
}

func (s *Store) GetRule(ctx context.Context, id string) (model.AlertRule, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, name, type, metric, comparator, threshold, duration_sec, severity, node_id, kinds, channel_id, enabled, cooldown_sec, created_at
		FROM alert_rules WHERE id = ?`, id)
	return scanRule(row)
}

func scanRule(row scanner) (model.AlertRule, error) {
	var rule model.AlertRule
	var kinds string
	var enabled int
	err := row.Scan(&rule.ID, &rule.Name, &rule.Type, &rule.Metric, &rule.Comparator, &rule.Threshold,
		&rule.DurationSec, &rule.Severity, &rule.NodeID, &kinds, &rule.ChannelID, &enabled, &rule.CooldownSec, &rule.CreatedAt)
	if err != nil {
		return rule, err
	}
	rule.Enabled = enabled == 1
	_ = json.Unmarshal([]byte(kinds), &rule.Kinds)
	return rule, nil
}

func (s *Store) UpsertRule(ctx context.Context, rule model.AlertRule) error {
	kinds, _ := json.Marshal(rule.Kinds)
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO alert_rules(id, name, type, metric, comparator, threshold, duration_sec, severity, node_id, kinds, channel_id, enabled, cooldown_sec, created_at)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name=excluded.name, type=excluded.type, metric=excluded.metric, comparator=excluded.comparator,
			threshold=excluded.threshold, duration_sec=excluded.duration_sec, severity=excluded.severity,
			node_id=excluded.node_id, kinds=excluded.kinds, channel_id=excluded.channel_id,
			enabled=excluded.enabled, cooldown_sec=excluded.cooldown_sec`,
		rule.ID, rule.Name, rule.Type, rule.Metric, rule.Comparator, rule.Threshold, rule.DurationSec,
		rule.Severity, rule.NodeID, string(kinds), rule.ChannelID, boolInt(rule.Enabled), rule.CooldownSec, rule.CreatedAt)
	return err
}

func (s *Store) DeleteRule(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM alert_rules WHERE id = ?`, id)
	return err
}

// ---------- channels ----------

func (s *Store) ListChannelRecords(ctx context.Context) ([]ChannelRecord, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, kind, config_enc, secret_enc, created_at, verified_at FROM channels ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ChannelRecord
	for rows.Next() {
		var record ChannelRecord
		if err := rows.Scan(&record.ID, &record.Name, &record.Kind, &record.ConfigEnc, &record.SecretEnc, &record.CreatedAt, &record.VerifiedAt); err != nil {
			return nil, err
		}
		out = append(out, record)
	}
	return out, rows.Err()
}

type ChannelRecord struct {
	ID         string
	Name       string
	Kind       string
	ConfigEnc  []byte
	SecretEnc  []byte
	CreatedAt  int64
	VerifiedAt int64
}

func (s *Store) GetChannelRecord(ctx context.Context, id string) (ChannelRecord, error) {
	var record ChannelRecord
	err := s.db.QueryRowContext(ctx, `SELECT id, name, kind, config_enc, secret_enc, created_at, verified_at FROM channels WHERE id = ?`, id).
		Scan(&record.ID, &record.Name, &record.Kind, &record.ConfigEnc, &record.SecretEnc, &record.CreatedAt, &record.VerifiedAt)
	return record, err
}

func (s *Store) UpsertChannel(ctx context.Context, record ChannelRecord) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO channels(id, name, kind, config_enc, secret_enc, created_at, verified_at) VALUES(?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind, config_enc=excluded.config_enc,
			secret_enc=excluded.secret_enc, verified_at=excluded.verified_at`,
		record.ID, record.Name, record.Kind, record.ConfigEnc, record.SecretEnc, record.CreatedAt, record.VerifiedAt)
	return err
}

func (s *Store) DeleteChannel(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM channels WHERE id = ?`, id)
	return err
}

// ---------- tokens ----------

func (s *Store) InsertToken(ctx context.Context, token model.APIToken, hash string) error {
	scopes, _ := json.Marshal(token.Scopes)
	nodes, _ := json.Marshal(token.NodeIDs)
	actions, _ := json.Marshal(token.ActionIDs)
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO api_tokens(id, name, hash, prefix, scopes, node_ids, action_ids, created_at, expires_at, last_used)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		token.ID, token.Name, hash, token.Prefix, string(scopes), string(nodes), string(actions), token.CreatedAt, token.ExpiresAt, token.LastUsed)
	return err
}

func (s *Store) ListTokens(ctx context.Context) ([]model.APIToken, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, prefix, scopes, node_ids, action_ids, created_at, expires_at, last_used FROM api_tokens ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.APIToken
	for rows.Next() {
		token, err := scanToken(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, token)
	}
	return out, rows.Err()
}

func (s *Store) GetToken(ctx context.Context, id string) (model.APIToken, string, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, name, prefix, scopes, node_ids, action_ids, created_at, expires_at, last_used, hash FROM api_tokens WHERE id = ?`, id)
	var token model.APIToken
	var scopes, nodes, actions, hash string
	err := row.Scan(&token.ID, &token.Name, &token.Prefix, &scopes, &nodes, &actions, &token.CreatedAt, &token.ExpiresAt, &token.LastUsed, &hash)
	if err != nil {
		return token, "", err
	}
	_ = json.Unmarshal([]byte(scopes), &token.Scopes)
	_ = json.Unmarshal([]byte(nodes), &token.NodeIDs)
	_ = json.Unmarshal([]byte(actions), &token.ActionIDs)
	return token, hash, nil
}

func scanToken(row scanner) (model.APIToken, error) {
	var token model.APIToken
	var scopes, nodes, actions string
	err := row.Scan(&token.ID, &token.Name, &token.Prefix, &scopes, &nodes, &actions, &token.CreatedAt, &token.ExpiresAt, &token.LastUsed)
	if err != nil {
		return token, err
	}
	_ = json.Unmarshal([]byte(scopes), &token.Scopes)
	_ = json.Unmarshal([]byte(nodes), &token.NodeIDs)
	_ = json.Unmarshal([]byte(actions), &token.ActionIDs)
	return token, nil
}

func (s *Store) TouchToken(ctx context.Context, id string, ts int64) error {
	_, err := s.db.ExecContext(ctx, `UPDATE api_tokens SET last_used = ? WHERE id = ?`, ts, id)
	return err
}

func (s *Store) DeleteToken(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM api_tokens WHERE id = ?`, id)
	return err
}

// ---------- settings ----------

func (s *Store) GetSetting(ctx context.Context, key string) (string, error) {
	var value string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return value, err
}

func (s *Store) SetSetting(ctx context.Context, key, value string) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, key, value)
	return err
}

// ---------- rollups and retention ----------

// Rollup aggregates raw samples into 1m and 1m into 1h, then deletes data past
// its retention. It is idempotent.
func (s *Store) Rollup(ctx context.Context, now int64) error {
	rawCutoff := now - 48*3600*1000
	minuteCutoff := now - 30*24*3600*1000
	hourCutoff := now - 13*30*24*3600*1000

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO samples_1m(node_id, ts, cpu_min, cpu_avg, cpu_max, mem_min, mem_avg, mem_max, load_avg, load_max,
			net_rx_avg, net_tx_avg, disk_r_avg, disk_w_avg, psi_cpu_avg, psi_io_avg, psi_mem_avg)
		SELECT node_id, (ts / 60000) * 60000, MIN(cpu), AVG(cpu), MAX(cpu), MIN(mem), AVG(mem), MAX(mem), AVG(load1), MAX(load1),
			AVG(net_rx), AVG(net_tx), AVG(disk_r), AVG(disk_w), AVG(psi_cpu), AVG(psi_io), AVG(psi_mem)
		FROM samples WHERE ts < ? GROUP BY node_id, ts / 60000
		ON CONFLICT(node_id, ts) DO NOTHING`, rawCutoff); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO samples_1h(node_id, ts, cpu_min, cpu_avg, cpu_max, mem_min, mem_avg, mem_max, load_avg, load_max,
			net_rx_avg, net_tx_avg, disk_r_avg, disk_w_avg, psi_cpu_avg, psi_io_avg, psi_mem_avg)
		SELECT node_id, (ts / 3600000) * 3600000, MIN(cpu_min), AVG(cpu_avg), MAX(cpu_max), MIN(mem_min), AVG(mem_avg), MAX(mem_max),
			AVG(load_avg), MAX(load_max), AVG(net_rx_avg), AVG(net_tx_avg), AVG(disk_r_avg), AVG(disk_w_avg),
			AVG(psi_cpu_avg), AVG(psi_io_avg), AVG(psi_mem_avg)
		FROM samples_1m WHERE ts < ? GROUP BY node_id, ts / 3600000
		ON CONFLICT(node_id, ts) DO NOTHING`, minuteCutoff); err != nil {
		return err
	}
	for _, stmt := range []struct {
		sql  string
		args []any
	}{
		{`DELETE FROM samples WHERE ts < ?`, []any{rawCutoff}},
		{`DELETE FROM samples_1m WHERE ts < ?`, []any{minuteCutoff}},
		{`DELETE FROM samples_1h WHERE ts < ?`, []any{hourCutoff}},
		{`DELETE FROM disk_samples WHERE ts < ?`, []any{rawCutoff}},
		{`DELETE FROM net_samples WHERE ts < ?`, []any{rawCutoff}},
		{`DELETE FROM process_samples WHERE ts < ?`, []any{rawCutoff}},
		{`DELETE FROM events WHERE ts < ?`, []any{now - 90*24*3600*1000}},
		{`DELETE FROM action_runs WHERE ts < ?`, []any{now - 90*24*3600*1000}},
		{`DELETE FROM deliveries WHERE ts < ?`, []any{now - 90*24*3600*1000}},
	} {
		if _, err := tx.ExecContext(ctx, stmt.sql, stmt.args...); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

// ---------- join codes ----------

// CreateJoinCode stores a hashed one-time code for a node that an agent will
// claim. The plaintext never touches the database.
func (s *Store) CreateJoinCode(ctx context.Context, hash, nodeID string, expiresAt int64) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO join_codes(hash, node_id, expires_at) VALUES(?, ?, ?)`, hash, nodeID, expiresAt)
	return err
}

// ConsumeJoinCode atomically checks and burns a code, returning its node.
func (s *Store) ConsumeJoinCode(ctx context.Context, hash string, now int64) (string, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	var nodeID string
	var expiresAt, usedAt int64
	err = tx.QueryRowContext(ctx, `SELECT node_id, expires_at, used_at FROM join_codes WHERE hash = ?`, hash).Scan(&nodeID, &expiresAt, &usedAt)
	if err != nil {
		return "", err
	}
	if usedAt != 0 {
		return "", errors.New("this join code was already used")
	}
	if expiresAt < now {
		return "", errors.New("this join code expired")
	}
	if _, err := tx.ExecContext(ctx, `UPDATE join_codes SET used_at = ? WHERE hash = ?`, now, hash); err != nil {
		return "", err
	}
	return nodeID, tx.Commit()
}

func (s *Store) PruneJoinCodes(ctx context.Context, now int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM join_codes WHERE expires_at < ?`, now-24*3600*1000)
	return err
}
