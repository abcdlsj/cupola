package hub

import (
	"testing"
	"time"

	"github.com/abcdlsj/cupola/internal/model"
)

func snapWithUnits(states map[string]string) *model.Snapshot {
	snap := &model.Snapshot{}
	for name, state := range states {
		snap.Services = append(snap.Services, model.Service{Name: name, ActiveState: state, SubState: state})
	}
	return snap
}

func failedEvent(name string, at int64) model.Event {
	return model.Event{
		NodeID: "gcp-hk-1", Ts: at, Kind: "service", Severity: "warning",
		Message: "Unit failed: " + name,
		Meta:    metaJSON(map[string]any{"unit": name}),
	}
}

// A oneshot on a five-minute timer restarts into failure all night. The feed
// carries the first one, then nothing until the window reopens.
func TestDampUnitsKeepsOneFailurePerWindow(t *testing.T) {
	p := &poller{units: make(map[string]*unitMemo)}
	snap := snapWithUnits(map[string]string{"instabox-keepalive.service": "failed"})
	now := time.Now().UnixMilli()

	if got := p.dampUnits("gcp-hk-1", snap, []model.Event{failedEvent("instabox-keepalive.service", now)}, now); len(got) != 1 {
		t.Fatalf("first failure: want 1 event, got %d", len(got))
	}
	for minute := int64(5); minute <= 60; minute += 5 {
		at := now + minute*60_000
		if got := p.dampUnits("gcp-hk-1", snap, []model.Event{failedEvent("instabox-keepalive.service", at)}, at); len(got) != 0 {
			t.Fatalf("repeat after %d min: want 0 events, got %d", minute, len(got))
		}
	}
	after := now + unitFailureWindow.Milliseconds() + 60_000
	if got := p.dampUnits("gcp-hk-1", snap, []model.Event{failedEvent("instabox-keepalive.service", after)}, after); len(got) != 1 {
		t.Fatalf("after the window: want 1 event, got %d", len(got))
	}
}

// The other half of the window: a unit that comes back says so once, and the
// memo goes quiet so the next failure is news again.
func TestDampUnitsAnnouncesRecoveryOnce(t *testing.T) {
	p := &poller{units: make(map[string]*unitMemo)}
	failing := snapWithUnits(map[string]string{"restic-backup.service": "failed"})
	healthy := snapWithUnits(map[string]string{"restic-backup.service": "inactive"})
	now := time.Now().UnixMilli()

	p.dampUnits("atlas", failing, []model.Event{failedEvent("restic-backup.service", now)}, now)

	recovered := p.dampUnits("atlas", healthy, nil, now+60_000)
	if len(recovered) != 1 || recovered[0].Message != "Unit recovered: restic-backup.service" {
		t.Fatalf("want one recovery event, got %+v", recovered)
	}
	if recovered[0].Severity != "info" {
		t.Errorf("recovery severity: want info, got %s", recovered[0].Severity)
	}
	if again := p.dampUnits("atlas", healthy, nil, now+120_000); len(again) != 0 {
		t.Fatalf("second pass: want no events, got %d", len(again))
	}
	if next := p.dampUnits("atlas", failing, []model.Event{failedEvent("restic-backup.service", now+180_000)}, now+180_000); len(next) != 1 {
		t.Fatalf("failure after recovery: want 1 event, got %d", len(next))
	}
}

// A unit that leaves the snapshot entirely (uninstalled, node rebuilt) drops
// its memo instead of emitting anything.
func TestDampUnitsForgetsUnitsThatLeave(t *testing.T) {
	p := &poller{units: make(map[string]*unitMemo)}
	failing := snapWithUnits(map[string]string{"weft.service": "failed"})
	now := time.Now().UnixMilli()
	p.dampUnits("hwhk", failing, []model.Event{failedEvent("weft.service", now)}, now)

	empty := snapWithUnits(nil)
	if got := p.dampUnits("hwhk", empty, nil, now+60_000); len(got) != 0 {
		t.Fatalf("want no events for a unit that is gone, got %d", len(got))
	}
	if len(p.units) != 0 {
		t.Fatalf("memo should be dropped, %d left", len(p.units))
	}
}

// Protocol housekeeping rebinds all day; real listeners are still announced.
func TestDiffEventsSkipsChatterPorts(t *testing.T) {
	previous := &model.Snapshot{Node: model.NodeInfo{BootTime: 1}}
	current := &model.Snapshot{
		Node: model.NodeInfo{BootTime: 1},
		Ports: []model.Port{
			{Proto: "udp", Port: 546, Process: "systemd-network"},
			{Proto: "udp", Port: 5353, Process: "avahi-daemon"},
			{Proto: "tcp", Port: 9090, Process: "nexo"},
		},
	}
	events := diffEvents(previous, current, "atlas", time.Now().UnixMilli())
	if len(events) != 1 {
		t.Fatalf("want one port event, got %d: %+v", len(events), events)
	}
	if events[0].Message != "New listening port 9090/tcp (nexo)" {
		t.Errorf("unexpected event: %s", events[0].Message)
	}
}
