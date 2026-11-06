// Command demoagent serves one fictional node for the UI fixtures and the
// Playwright end-to-end environment. It is not part of the Cupola binary and it
// never touches a real host: every figure is invented (docs/reports/M5.md).
package main

import (
	"crypto/subtle"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/abcdlsj/cupola/internal/model"
)

type demo struct {
	node    string
	token   string
	bootAt  int64
	mu      sync.Mutex
	trigged bool
	runs    map[string]model.ActionResult
}

func main() {
	node := flag.String("node", "atlas", "atlas, beelink or studio")
	listen := flag.String("listen", "127.0.0.1:9801", "listen address")
	token := flag.String("token", "demo-token", "bearer token")
	flag.Parse()

	d := &demo{node: *node, token: *token, bootAt: time.Now().UnixMilli() - 3_564_000_000, runs: map[string]model.ActionResult{}}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { write(w, 200, map[string]any{"ok": true}) })
	mux.Handle("GET /v1/snapshot", d.auth(d.snapshot))
	mux.Handle("GET /v1/agents", d.auth(func(w http.ResponseWriter, r *http.Request) {
	}))
	mux.Handle("GET /v1/actions", d.auth(d.actions))
	mux.Handle("POST /v1/actions/{id}/run", d.auth(d.run))
	mux.Handle("POST /demo/trigger", d.auth(func(w http.ResponseWriter, r *http.Request) {
		d.mu.Lock()
		d.trigged = true
		d.mu.Unlock()
		write(w, 200, map[string]any{"ok": true})
	}))
	mux.HandleFunc("GET /v1/events", func(w http.ResponseWriter, r *http.Request) { write(w, 200, map[string]any{"events": []any{}}) })
	log.Printf("demo agent %s on %s", *node, *listen)
	log.Fatal(http.ListenAndServe(*listen, mux))
}

func (d *demo) auth(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if subtle.ConstantTimeCompare([]byte(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")), []byte(d.token)) != 1 {
			write(w, 401, map[string]any{"error": map[string]string{"code": "unauthorized", "message": "token"}})
			return
		}
		next(w, r)
	})
}

func (d *demo) snapshot(w http.ResponseWriter, r *http.Request) {
	write(w, 200, d.build())
}

func (d *demo) actions(w http.ResponseWriter, r *http.Request) {
	write(w, 200, map[string]any{"actions": d.actionList()})
}

func (d *demo) actionList() []model.Action {
	now := time.Now().UnixMilli()
	d.mu.Lock()
	defer d.mu.Unlock()
	out := []model.Action{}
	lastOK := func(id string) *bool {
		if result, ok := d.runs[id]; ok {
			value := result.OK
			return &value
		}
		return nil
	}
	switch d.node {
	case "beelink":
		out = append(out,
			model.Action{ID: "wake-desk", Name: "Wake desk", Description: "Send a Wake-on-LAN packet to the studio workstation", Icon: "wake", Type: "wol", AllowAPI: true},
			model.Action{ID: "restart-jellyfin", Name: "Restart Jellyfin", Description: "Restart the media server container", Icon: "restart", Type: "script", AllowAPI: true},
		)
	case "studio":
		out = append(out,
			model.Action{ID: "backup-now", Name: "Backup now", Description: "Run the nightly restic job to the NAS", Icon: "backup", Type: "script", AllowAPI: true},
			model.Action{ID: "sync-photos", Name: "Sync photos", Description: "Copy camera imports to the NAS and verify checksums", Icon: "disk", Type: "script"},
		)
	default:
		out = append(out,
			model.Action{ID: "update-packages", Name: "Update packages", Description: "Apply pending unattended upgrades and reboot if the kernel changed", Icon: "update", Type: "script", Danger: true},
			model.Action{ID: "restart-relay", Name: "Restart relay", Description: "Restart the Bolthole relay unit and wait for its health check", Icon: "network", Type: "script", Danger: true, AllowAPI: true},
		)
	}
	for i := range out {
		if result, ok := d.runs[out[i].ID]; ok {
			out[i].LastRunAt = result.StartedAt
			out[i].LastOK = lastOK(out[i].ID)
		} else if out[i].ID == "backup-now" {
			out[i].LastRunAt = now - 2*3600*1000
			ok := true
			out[i].LastOK = &ok
		} else if out[i].ID == "restart-jellyfin" {
			out[i].LastRunAt = now - 2*3600*1000
			failed := false
			out[i].LastOK = &failed
		}
	}
	return out
}

func (d *demo) run(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	now := time.Now().UnixMilli()
	result := model.ActionResult{RunID: fmt.Sprintf("demo-%d", now%100000), ActionID: id, StartedAt: now, DurationMs: 840}
	switch id {
	case "restart-jellyfin":
		result.ExitCode = 1
		result.Stdout = "container jellyfin stopped"
		result.Stderr = "docker: Error response from daemon: port 8096 is already allocated."
	case "update-packages":
		result.Stdout = "12 packages upgraded, 0 newly installed\nno reboot required"
	case "wake-desk":
		result.Stdout = "sent 102-byte magic packet"
	case "backup-now":
		result.Stdout = "snapshot 8f21c4a2 saved\nfiles new 1,204 changed 86\nadded 412.8 MiB in 14.2 s"
		result.DurationMs = 14200
	default:
		result.Stdout = "ok"
	}
	result.OK = result.ExitCode == 0
	d.mu.Lock()
	d.runs[id] = result
	d.mu.Unlock()
	write(w, 200, result)
}

func (d *demo) build() *model.Snapshot {
	now := time.Now().UnixMilli()
	d.mu.Lock()
	trigged := d.trigged
	d.mu.Unlock()
	wave := float64(now/1000%600) / 600 * 8
	snap := &model.Snapshot{Ts: now}
	snap.Node = model.NodeInfo{ID: d.node, Name: d.node, Hostname: d.node, AgentVersion: "1.0.0"}
	snap.Disks = []model.DiskStats{}
	snap.Network = []model.NetStats{}
	snap.Processes = []model.Process{}
	snap.Services = []model.Service{}
	snap.Containers = []model.Container{}
	snap.Images = []model.Image{}
	snap.Sensors = []model.Sensor{}
	snap.GPUs = []model.GPU{}
	snap.SMART = []model.SMARTDevice{}
	snap.Ports = []model.Port{}
	switch d.node {
	case "atlas":
		snap.Node.OS = "linux"
		snap.Node.Platform = "Ubuntu 24.04.1 LTS"
		snap.Node.Kernel = "6.8.0-45-generic"
		snap.Node.Arch = "amd64"
		snap.Node.CPUModel = "AMD EPYC 7763 (2 vCPU)"
		snap.Node.Cores = 2
		snap.Node.Virtualization = "kvm"
		snap.Node.UptimeSec = 3_564_000
		snap.Node.BootTime = d.bootAt
		snap.Node.Labels = []string{"prod", "vps"}
		snap.CPU = model.CPUStats{Percent: 18 + wave*0.3, PerCore: []float64{14 + wave*0.2, 22 + wave*0.4}, User: 9, System: 4, Iowait: 0.3, Load1: 0.42, Load5: 0.38, Load15: 0.31, Procs: 128}
		snap.Memory = model.MemoryStats{Total: 4 << 30, Used: 2 << 30, Available: 1 << 30, Cached: 900 << 20, UsedPercent: 65}
		snap.Pressure = model.PressureStats{CPU: model.PressureStat{Some: 2.1}, IO: model.PressureStat{Some: 0.8}, Mem: model.PressureStat{Some: 0.4}}
		snap.Disks = []model.DiskStats{{Device: "/dev/vda1", Mount: "/", FsType: "ext4", Total: 78 << 30, Used: 48 << 30, UsedPct: 62, InodePct: 21, ReadBps: 400 << 10, WriteBps: 1_200 << 10}}
		snap.Network = []model.NetStats{{Iface: "eth0", Up: true, RxBps: 1_050_000, TxBps: 397_000, SpeedMbps: 1000, Driver: "virtio_net"}}
		snap.Services = []model.Service{{Name: "ssh.service", Description: "OpenBSD Secure Shell server", ActiveState: "active", SubState: "running", Enabled: "enabled", Since: now - 41*24*3600*1000}, {Name: "caddy.service", Description: "Caddy web server", ActiveState: "active", SubState: "running", Enabled: "enabled", Since: now - 41*24*3600*1000}}
		snap.Ports = []model.Port{{Proto: "tcp", Address: "0.0.0.0", Port: 22, State: "LISTEN", PID: 812, Process: "sshd"}, {Proto: "tcp", Address: "0.0.0.0", Port: 443, State: "LISTEN", PID: 903, Process: "caddy"}}
		snap.Processes = []model.Process{{PID: 6741, Name: "codex", User: "deploy", Command: "codex [4 args redacted]", CPUPercent: 12.9, RSSBytes: 512 << 20, Threads: 9, StartedAt: now - 5*3600*1000}, {PID: 812, Name: "caddy", User: "root", Command: "caddy", CPUPercent: 1.2, RSSBytes: 64 << 20, Threads: 12, StartedAt: now - 41*24*3600*1000}}
	case "beelink":
		snap.Node.OS = "linux"
		snap.Node.Platform = "Ubuntu 24.04.1 LTS"
		snap.Node.Kernel = "6.8.0-45-generic"
		snap.Node.Arch = "amd64"
		snap.Node.CPUModel = "AMD Ryzen 7 5825U"
		snap.Node.Cores = 8
		snap.Node.UptimeSec = 1_047_600
		snap.Node.BootTime = d.bootAt
		snap.Node.Labels = []string{"homelab", "media"}
		snap.CPU = model.CPUStats{Percent: 34 + wave, PerCore: []float64{40, 35, 30, 28, 45, 22, 38, 31}, User: 18, System: 9, Iowait: 2, Load1: 2.71, Load5: 2.44, Load15: 2.12, Procs: 246}
		snap.Memory = model.MemoryStats{Total: 32 << 30, Used: 18 << 30, Available: 13 << 30, Cached: 7 << 30, UsedPercent: 58, SwapTotal: 8 << 30, SwapUsed: 400 << 20}
		snap.Pressure = model.PressureStats{CPU: model.PressureStat{Some: 8.4}, IO: model.PressureStat{Some: 3.6}, Mem: model.PressureStat{Some: 1.2}}
		snap.Disks = []model.DiskStats{
			{Device: "/dev/nvme0n1p2", Mount: "/", FsType: "ext4", Total: 512 << 30, Used: 245 << 30, UsedPct: 48, InodePct: 14, ReadBps: 4_100_000, WriteBps: 9_600_000},
			{Device: "/dev/md0", Mount: "/srv", FsType: "btrfs", Total: 4000 << 30, Used: 2840 << 30, UsedPct: 71, InodePct: 3, ReadBps: 12_400_000, WriteBps: 22_800_000},
		}
		snap.Network = []model.NetStats{{Iface: "enp1s0", Up: true, RxBps: 7_800_000, TxBps: 1_850_000, SpeedMbps: 1000, Driver: "r8169"}}
		snap.Services = []model.Service{{Name: "jellyfin.service", Description: "Jellyfin media server", ActiveState: "active", SubState: "running", Enabled: "enabled", Since: now - 6*24*3600*1000}, {Name: "docker.service", Description: "Docker", ActiveState: "active", SubState: "running", Enabled: "enabled", Since: now - 41*24*3600*1000}}
		snap.Containers = []model.Container{{ID: "c11a9d3e8f21", Name: "jellyfin", Image: "jellyfin/jellyfin:10.10.3", State: "running", Status: "Up 3 days", UptimeSec: 260000, CPUPercent: 12.4, MemBytes: 1_840 << 20, MemLimit: 8 << 30, Ports: []string{"0.0.0.0:8096->8096/tcp"}}}
		snap.Images = []model.Image{
			{ID: "9d3f21ac4b8e", RepoTag: "jellyfin/jellyfin:10.10.3", Size: 1_180 << 20, SharedSize: 620 << 20, Containers: 1, CreatedAt: now - 21*24*3600*1000},
			{ID: "4c81be07a2dd", RepoTag: "postgres:16-alpine", Size: 402 << 20, SharedSize: 388 << 20, Containers: 1, CreatedAt: now - 96*24*3600*1000},
			{ID: "b20e4a55c9f1", RepoTag: "traefik:v3.2", Size: 268 << 20, SharedSize: 210 << 20, Containers: 1, CreatedAt: now - 40*24*3600*1000},
			{ID: "77ba11c0d3a4", RepoTag: "ghcr.io/immich-app/immich-server:v1.120.3", Size: 1_640 << 20, SharedSize: 900 << 20, Containers: 1, CreatedAt: now - 12*24*3600*1000},
		}
		snap.Ports = []model.Port{{Proto: "tcp", Address: "0.0.0.0", Port: 8096, State: "LISTEN", PID: 1102, Process: "docker-proxy"}, {Proto: "tcp", Address: "0.0.0.0", Port: 22, State: "LISTEN", PID: 900, Process: "sshd"}}
		snap.Sensors = []model.Sensor{{Chip: "k10temp", Label: "CPU package", Kind: "temperature", Value: 48, Unit: "°C"}, {Chip: "nvme", Label: "NVMe composite", Kind: "temperature", Value: 39, Unit: "°C"}}
		snap.SMART = []model.SMARTDevice{{Device: "/dev/nvme0n1", Model: "Samsung SSD 980 PRO 1TB", Type: "nvme", Health: "passed", TemperatureC: 39, WearPercent: 2, PowerOnHours: 8210}}
		snap.Processes = []model.Process{{PID: 2210, Name: "opencode", User: "ops", Command: "opencode [1 arg redacted]", CPUPercent: 7.2, RSSBytes: 318 << 20, Threads: 11, StartedAt: now - 26*60*1000}, {PID: 941, Name: "dockerd", User: "root", Command: "dockerd", CPUPercent: 2.1, RSSBytes: 142 << 20, Threads: 38, StartedAt: now - 12*24*3600*1000}}
		if trigged {
			snap.Services = append(snap.Services, model.Service{Name: "restic-backup.service", Description: "Nightly restic backup", ActiveState: "failed", SubState: "failed", Enabled: "enabled", Restarts: 1, Since: now - 60*1000})
			snap.Ports = append(snap.Ports, model.Port{Proto: "tcp", Address: "0.0.0.0", Port: 8080, State: "LISTEN", PID: 1102, Process: "docker-proxy"})
		}
		// Plex discovery opens a few UDP ports every five seconds. The hub reports
		// each one as a new listening port, which is what the events list folds
		// into a single row with a count.
		for i := 0; i < 3; i++ {
			snap.Ports = append(snap.Ports, model.Port{
				Proto: "udp", Address: "0.0.0.0",
				Port:  uint32(int((now/5000)%1000)*3 + 34000 + i),
				State: "UNCONN", PID: 2210, Process: "Plex Media Ser",
			})
		}
	case "studio":
		snap.Node.OS = "linux"
		snap.Node.Platform = "Arch Linux"
		snap.Node.Kernel = "6.12.4-arch1-1"
		snap.Node.Arch = "amd64"
		snap.Node.CPUModel = "AMD Ryzen 9 7950X"
		snap.Node.Cores = 32
		snap.Node.UptimeSec = 327_600
		snap.Node.BootTime = d.bootAt
		snap.Node.Labels = []string{"workstation", "gpu"}
		snap.CPU = model.CPUStats{Percent: 71 + wave*0.5, PerCore: []float64{80, 75, 71, 68, 74, 70, 66, 72, 69, 73, 70, 68, 71, 72, 67, 70, 74, 69, 71, 68, 72, 70, 66, 71, 73, 69, 70, 72, 68, 71, 70, 69}, User: 55, System: 12, Iowait: 3, Load1: 23.84, Load5: 18.21, Load15: 12.44, Procs: 486}
		snap.Memory = model.MemoryStats{Total: 64 << 30, Used: 58 << 30, Available: 5 << 30, Cached: 3 << 30, UsedPercent: 91, SwapTotal: 32 << 30, SwapUsed: 1 << 30}
		snap.Pressure = model.PressureStats{CPU: model.PressureStat{Some: 42.7}, IO: model.PressureStat{Some: 18.4}, Mem: model.PressureStat{Some: 6.8}}
		snap.Disks = []model.DiskStats{
			{Device: "/dev/nvme0n1p2", Mount: "/", FsType: "btrfs", Total: 1863 << 30, Used: 1695 << 30, UsedPct: 91, InodePct: 38, ReadBps: 48_200_000, WriteBps: 96_400_000},
			{Device: "/dev/nvme1n1p1", Mount: "/mnt/media", FsType: "xfs", Total: 3726 << 30, Used: 2385 << 30, UsedPct: 64, InodePct: 9, ReadBps: 12_800_000, WriteBps: 4_200_000},
		}
		snap.Network = []model.NetStats{{Iface: "enp5s0", Up: true, RxBps: 23_000_000, TxBps: 5_320_000, SpeedMbps: 2500, Driver: "r8169"}}
		snap.Services = []model.Service{{Name: "ssh.service", Description: "OpenSSH Daemon", ActiveState: "active", SubState: "running", Enabled: "enabled"}, {Name: "jellyfin.service", Description: "Jellyfin", ActiveState: "failed", SubState: "failed", Enabled: "enabled", Restarts: 4}}
		snap.Containers = []model.Container{{ID: "c92b1f7a3d40", Name: "ollama", Image: "ollama/ollama:0.5.4", State: "restarting", Status: "Restarting (137) 12 seconds ago", UptimeSec: 30, CPUPercent: 34.6, MemBytes: 4_910 << 20, MemLimit: 16 << 30, Restarts: 4}}
		snap.Images = []model.Image{
			{ID: "ac30b7e1f902", RepoTag: "ollama/ollama:0.5.4", Size: 4_920 << 20, SharedSize: 3_100 << 20, Containers: 1, CreatedAt: now - 6*24*3600*1000},
			{ID: "1f70c9a4b21c", RepoTag: "ghcr.io/ggerganov/llama.cpp:server-cuda", Size: 3_210 << 20, SharedSize: 2_640 << 20, Containers: 0, CreatedAt: now - 30*24*3600*1000},
			{ID: "5c2e88b0aa37", RepoTag: "<none>", Size: 890 << 20, SharedSize: 0, Containers: 0, Dangling: true, CreatedAt: now - 9*24*3600*1000},
		}
		snap.Ports = []model.Port{{Proto: "tcp", Address: "127.0.0.1", Port: 11434, State: "LISTEN", PID: 39221, Process: "ollama"}, {Proto: "tcp", Address: "127.0.0.1", Port: 5173, State: "LISTEN", PID: 47210, Process: "node"}}
		snap.Sensors = []model.Sensor{{Chip: "k10temp", Label: "CPU package", Kind: "temperature", Value: 74, Unit: "°C"}, {Chip: "amdgpu", Label: "GPU edge", Kind: "temperature", Value: 61, Unit: "°C"}, {Chip: "nvme", Label: "NVMe composite", Kind: "temperature", Value: 52, Unit: "°C"}}
		snap.GPUs = []model.GPU{{Index: 0, Vendor: "nvidia", Name: "NVIDIA GeForce RTX 4080", UtilPercent: 38, MemUsed: 6 << 30, MemTotal: 16 << 30, TempC: 61, PowerW: 120, PowerLimitW: 320}}
		snap.SMART = []model.SMARTDevice{{Device: "/dev/nvme0n1", Model: "WD_BLACK SN850X 2TB", Type: "nvme", Health: "passed", TemperatureC: 52, WearPercent: 3, PowerOnHours: 12400}}
		snap.Processes = []model.Process{
			{PID: 41822, Name: "codex", User: "dev", Command: "codex [6 args redacted]", CPUPercent: 42.1, RSSBytes: 1240 << 20, Threads: 22, StartedAt: now - 134*60*1000},
			{PID: 39221, Name: "ollama", User: "dev", Command: "ollama serve", CPUPercent: 34.6, RSSBytes: 4910 << 20, Threads: 24, StartedAt: now - 4*3600*1000},
			{PID: 39214, Name: "claude", User: "dev", Command: "claude [2 args redacted]", CPUPercent: 21.4, RSSBytes: 962 << 20, Threads: 12, StartedAt: now - 68*60*1000},
			{PID: 47210, Name: "node", User: "dev", Command: "node vite", CPUPercent: 6.8, RSSBytes: 512 << 20, Threads: 11, StartedAt: now - 62*60*1000},
		}
	}
	snap.FD = model.FDStats{Allocated: 2432, Max: 9223372036854775807, Conntrack: 184}
	return snap
}

func write(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

var _ = os.Getenv
