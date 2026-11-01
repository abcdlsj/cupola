package store

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/abcdlsj/cupola/internal/model"
)

func openTest(t *testing.T) *Store {
	t.Helper()
	st, err := Open(context.Background(), filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	return st
}

func testSnapshot(nodeID string, ts int64) *model.Snapshot {
	return &model.Snapshot{
		Ts: ts,
		Node: model.NodeInfo{ID: nodeID, Name: nodeID, Platform: "Ubuntu", Kernel: "6.8", Arch: "amd64", UptimeSec: 1000},
		CPU: model.CPUStats{Percent: 42, Load1: 1.2, Load5: 1.1, Load15: 0.9, Procs: 120},
		Memory: model.MemoryStats{Total: 16 << 30, Used: 8 << 30, UsedPercent: 50},
		Pressure: model.PressureStats{CPU: model.PressureStat{Some: 3}, IO: model.PressureStat{Some: 2}, Mem: model.PressureStat{Some: 1}},
		Disks: []model.DiskStats{{Mount: "/", Device: "/dev/vda1", FsType: "ext4", Total: 100 << 30, Used: 90 << 30, UsedPct: 90, InodePct: 10}},
		Network: []model.NetStats{{Iface: "eth0", RxBps: 1000, TxBps: 500}},
		Processes: []model.Process{{PID: 1, Name: "systemd", CPUPercent: 1, RSSBytes: 1024}},
		Agents: []model.AgentSession{{ID: nodeID + "-42", Type: "codex", Label: "Codex", PID: 42}},
	}
}

func TestNodeAndSnapshotRoundTrip(t *testing.T) {
	ctx := context.Background()
	st := openTest(t)
	node := model.NodeRecord{ID: "atlas", Name: "Atlas", Labels: []string{"prod"}, Transport: "direct", URL: "http://127.0.0.1:1"}
	if err := st.UpsertNode(ctx, node, []byte("sealed-token"), nil); err != nil {
		t.Fatal(err)
	}
	got, err := st.GetNode(ctx, "atlas")
	if err != nil || got.Name != "Atlas" || len(got.Labels) != 1 {
		t.Fatalf("node = %+v, %v", got, err)
	}
	secret, err := st.GetNodeSecret(ctx, "atlas")
	if err != nil || string(secret.Token) != "sealed-token" {
		t.Fatalf("secret = %+v, %v", secret, err)
	}

	snap := testSnapshot("atlas", time.Now().UnixMilli())
	if err := st.SaveSnapshot(ctx, snap, []model.Action{{ID: "wake", Name: "Wake", Type: "wol", AllowAPI: true}}); err != nil {
		t.Fatal(err)
	}
	state, err := st.GetState(ctx, "atlas")
	if err != nil || state == nil || state.CPU.Percent != 42 || state.Node.ID != "atlas" {
		t.Fatalf("state = %+v, %v", state, err)
	}
	actions, err := st.GetActions(ctx, "atlas")
	if err != nil || len(actions) != 1 || actions[0].ID != "wake" {
		t.Fatalf("actions = %+v, %v", actions, err)
	}
	from := snap.Ts - 60_000
	points, err := st.Series(ctx, "atlas", "cpu", from, snap.Ts, 5)
	if err != nil || len(points) == 0 {
		t.Fatalf("series = %d, %v", len(points), err)
	}
	if points[0].Avg != 42 {
		t.Fatalf("series avg = %v", points[0].Avg)
	}
}

func TestEventsRulesTokens(t *testing.T) {
	ctx := context.Background()
	st := openTest(t)
	event := model.Event{NodeID: "atlas", Ts: time.Now().UnixMilli(), Kind: "service", Severity: "warning", Message: "Unit failed: nginx.service"}
	if err := st.InsertEvent(ctx, &event); err != nil || event.ID == 0 {
		t.Fatal(err, event.ID)
	}
	events, err := st.ListEvents(ctx, EventFilter{NodeID: "atlas"})
	if err != nil || len(events) != 1 {
		t.Fatalf("events = %+v, %v", events, err)
	}
	if _, err := st.GetEvent(ctx, event.ID); err != nil {
		t.Fatal(err)
	}

	rule := model.AlertRule{ID: "r1", Name: "CPU", Type: "metric", Metric: "cpu", Comparator: "gt", Threshold: 90, Severity: "warning", Enabled: true, CreatedAt: time.Now().UnixMilli()}
	if err := st.UpsertRule(ctx, rule); err != nil {
		t.Fatal(err)
	}
	rules, err := st.ListRules(ctx)
	if err != nil || len(rules) != 1 || rules[0].Metric != "cpu" {
		t.Fatalf("rules = %+v, %v", rules, err)
	}

	token := model.APIToken{ID: "t1", Name: "curl", Prefix: "cupola_t1_abc", Scopes: []string{"read"}, CreatedAt: time.Now().UnixMilli()}
	if err := st.InsertToken(ctx, token, "hash"); err != nil {
		t.Fatal(err)
	}
	got, hash, err := st.GetToken(ctx, "t1")
	if err != nil || hash != "hash" || got.Scopes[0] != "read" {
		t.Fatalf("token = %+v, %v", got, err)
	}
}

func TestRollupMovesOldSamples(t *testing.T) {
	ctx := context.Background()
	st := openTest(t)
	now := time.Now().UnixMilli()
	if err := st.UpsertNode(ctx, model.NodeRecord{ID: "atlas", Name: "Atlas"}, nil, nil); err != nil {
		t.Fatal(err)
	}
	old := now - 49*3600*1000
	for i := 0; i < 3; i++ {
		if err := st.SaveSnapshot(ctx, testSnapshot("atlas", old+int64(i)*5000), nil); err != nil {
			t.Fatal(err)
		}
	}
	if err := st.Rollup(ctx, now); err != nil {
		t.Fatal(err)
	}
	points, err := st.Series(ctx, "atlas", "cpu", old-60_000, old+60_000, 60)
	if err != nil || len(points) == 0 {
		t.Fatalf("rollup points = %d, %v", len(points), err)
	}
	raw, err := st.Series(ctx, "atlas", "cpu", old-60_000, old+60_000, 5)
	if err != nil || len(raw) != 0 {
		t.Fatalf("raw samples kept: %d, %v", len(raw), err)
	}
	// Recent raw data is rolled into 1m buckets so the 6h/24h windows are not
	// empty; a 24h request (step 60) must find points.
	recent := now - 10*60*1000
	for i := 0; i < 3; i++ {
		if err := st.SaveSnapshot(ctx, testSnapshot("atlas", recent+int64(i)*60_000), nil); err != nil {
			t.Fatal(err)
		}
	}
	if err := st.Rollup(ctx, now); err != nil {
		t.Fatal(err)
	}
	minute, err := st.Series(ctx, "atlas", "cpu", recent-60_000, now, 60)
	if err != nil || len(minute) == 0 {
		t.Fatalf("1m rollup missing for a 24h window: %d, %v", len(minute), err)
	}
	if err := st.DeleteNode(ctx, "atlas"); err != nil {
		t.Fatal(err)
	}
	if state, _ := st.GetState(ctx, "atlas"); state != nil {
		t.Fatal("state kept after delete")
	}
}
