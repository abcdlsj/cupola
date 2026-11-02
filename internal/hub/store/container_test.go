package store

import (
	"context"
	"testing"

	"github.com/abcdlsj/cupola/internal/model"
)

func containerSnapshot(nodeID string, ts int64, cpu float64, mem uint64) *model.Snapshot {
	snap := testSnapshot(nodeID, ts)
	snap.Containers = []model.Container{
		{ID: "c11a9d3e8f21", Name: "jellyfin", Image: "jellyfin/jellyfin:10.10.3", State: "running", CPUPercent: cpu, MemBytes: mem, MemLimit: 8 << 30},
		{ID: "c92b1f7a3d40", Name: "ollama", Image: "ollama/ollama:0.5.4", State: "running", CPUPercent: cpu / 2, MemBytes: mem / 2},
	}
	return snap
}

func TestContainerHistoryBucketsByMinute(t *testing.T) {
	ctx := context.Background()
	st := openTest(t)
	base := int64(1793600000000)
	// Two polls in the same minute: only the first is stored.
	if err := st.SaveSnapshot(ctx, containerSnapshot("beelink", base, 10, 100<<20), nil); err != nil {
		t.Fatal(err)
	}
	if err := st.SaveSnapshot(ctx, containerSnapshot("beelink", base+20_000, 90, 900<<20), nil); err != nil {
		t.Fatal(err)
	}
	// The next minute is stored.
	if err := st.SaveSnapshot(ctx, containerSnapshot("beelink", base+60_000, 30, 300<<20), nil); err != nil {
		t.Fatal(err)
	}

	series, err := st.ContainerHistory(ctx, "beelink", nil, base-1000, base+120_000, 60)
	if err != nil {
		t.Fatal(err)
	}
	if len(series) != 2 {
		t.Fatalf("got %d containers, want 2", len(series))
	}
	jellyfin := series[0]
	if jellyfin.ID != "c11a9d3e8f21" || jellyfin.Name != "jellyfin" {
		t.Fatalf("first series = %+v", jellyfin)
	}
	if len(jellyfin.Points) != 2 {
		t.Fatalf("jellyfin points = %d, want 2 (one per minute)", len(jellyfin.Points))
	}
	if jellyfin.Points[0].CPU != 10 {
		t.Fatalf("first cpu = %v, want 10: the later poll in the same minute must not overwrite it", jellyfin.Points[0].CPU)
	}
	if jellyfin.Points[1].CPU != 30 || jellyfin.Points[1].Mem != 300<<20 {
		t.Fatalf("second bucket = %+v", jellyfin.Points[1])
	}
	// Sorted by peak CPU: jellyfin peaks at 30, ollama at 15.
	if series[1].Name != "ollama" {
		t.Fatalf("second container = %q", series[1].Name)
	}
}

func TestContainerHistoryFiltersByID(t *testing.T) {
	ctx := context.Background()
	st := openTest(t)
	base := int64(1793600000000)
	if err := st.SaveSnapshot(ctx, containerSnapshot("beelink", base, 10, 100<<20), nil); err != nil {
		t.Fatal(err)
	}
	series, err := st.ContainerHistory(ctx, "beelink", []string{"c92b1f7a3d40"}, base-1000, base+60_000, 60)
	if err != nil {
		t.Fatal(err)
	}
	if len(series) != 1 || series[0].Name != "ollama" {
		t.Fatalf("series = %+v", series)
	}
}

func TestContainerHistoryAveragesWithinABucket(t *testing.T) {
	ctx := context.Background()
	st := openTest(t)
	// Buckets are aligned to epoch multiples of the step, so start on one.
	base := (int64(1793600000000) / 300_000) * 300_000
	for i, cpu := range []float64{10, 30, 50} {
		ts := base + int64(i)*60_000
		if err := st.SaveSnapshot(ctx, containerSnapshot("beelink", ts, cpu, 100<<20), nil); err != nil {
			t.Fatal(err)
		}
	}
	// A 5-minute step folds the three minutes together.
	series, err := st.ContainerHistory(ctx, "beelink", []string{"c11a9d3e8f21"}, base-1000, base+180_000, 300)
	if err != nil {
		t.Fatal(err)
	}
	if len(series) != 1 || len(series[0].Points) != 1 {
		t.Fatalf("series = %+v", series)
	}
	if got := series[0].Points[0].CPU; got != 30 {
		t.Fatalf("avg cpu = %v, want 30", got)
	}
}
