package agent

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/abcdlsj/cupola/internal/model"
)

func cachedAgent() *Agent {
	return &Agent{
		cfg:     &Config{NodeID: "test"},
		token:   "test-token",
		cacheAt: time.Now(),
		cache: &model.Snapshot{
			Ts:        1,
			Node:      model.NodeInfo{ID: "test"},
			Services:  []model.Service{{Name: "jellyfin.service"}},
			Ports:     []model.Port{{Proto: "tcp", Port: 8096}},
			Processes: []model.Process{{PID: 1, Name: "systemd"}},
		},
	}
}

func decodeSnapshot(t *testing.T, agent *Agent, target string) model.Snapshot {
	t.Helper()
	recorder := httptest.NewRecorder()
	agent.handleSnapshot(recorder, httptest.NewRequest("GET", target, nil))
	if recorder.Code != 200 {
		t.Fatalf("status = %d", recorder.Code)
	}
	var snap model.Snapshot
	if err := json.Unmarshal(recorder.Body.Bytes(), &snap); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return snap
}

// Services alone were 84 % of the snapshot; the hub now asks for them on their
// own clock and gets them out of the fast path.
func TestSlimSnapshotDropsServicesAndPorts(t *testing.T) {
	agent := cachedAgent()
	slim := decodeSnapshot(t, agent, "/v1/snapshot?slim=1")
	if len(slim.Services) != 0 || len(slim.Ports) != 0 {
		t.Fatalf("slim snapshot kept services=%d ports=%d", len(slim.Services), len(slim.Ports))
	}
	if len(slim.Processes) != 1 || slim.Node.ID != "test" {
		t.Fatalf("slim snapshot lost the fast sections: %+v", slim)
	}
	if len(agent.cache.Services) != 1 {
		t.Fatal("the slim response mutated the cached snapshot")
	}

	full := decodeSnapshot(t, agent, "/v1/snapshot")
	if len(full.Services) != 1 || len(full.Ports) != 1 {
		t.Fatalf("the default snapshot must keep services and ports: %+v", full)
	}
}
