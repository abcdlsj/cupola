// Package collect gathers one host's snapshot. Each collector is wrapped in a
// cache with its own cadence; a slow or unavailable collector yields a warning
// and the rest of the snapshot still ships.
package collect

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/process"

	"github.com/abcdlsj/cupola/internal/model"
	"github.com/abcdlsj/cupola/internal/version"
)

type Logger interface {
	Info(msg string, args ...any)
	Warn(msg string, args ...any)
}

type Options struct {
	NodeID    string
	Name      string
	Labels    []string
	Updates   bool
	Docker    bool
	SMART     bool
	GPU       bool
	Processes int
	Logger    Logger
}

type Collector struct {
	opts Options
	log  Logger

	mu sync.Mutex

	host    model.NodeInfo
	hostAt  time.Time
	coreMHz float64

	smart     []model.SMARTDevice
	smartAt   time.Time
	updates   *model.Updates
	updatesAt time.Time

	services   []model.Service
	servicesAt time.Time
	containers []model.Container
	containersAt time.Time
	ports      []model.Port
	portsAt    time.Time
	sensors    []model.Sensor
	sensorsAt  time.Time
	gpus       []model.GPU
	gpusAt     time.Time

	prevCPU   []cpu.TimesStat
	prevCPUAt time.Time
	prevProcs map[int32]procDelta
	prevNet   map[string]netDelta
	prevDisk  map[string]diskDelta

	allProcs   []model.Process
	allProcsAt time.Time

	containerPids map[int32]string
	dockerWarnAt  time.Time
}

type procDelta struct {
	cpuSeconds float64
	at         time.Time
	read       uint64
	write      uint64
}

type netDelta struct {
	rx uint64
	tx uint64
	at time.Time
}

type diskDelta struct {
	read, write           uint64
	readIOs, writeIOs     uint64
	readTicks, writeTicks uint64
	at                    time.Time
}

func New(opts Options) (*Collector, error) {
	if opts.NodeID == "" {
		return nil, errors.New("node id is required")
	}
	if opts.Processes <= 0 {
		opts.Processes = 40
	}
	return &Collector{
		opts:      opts,
		log:       opts.Logger,
		prevProcs:     make(map[int32]procDelta),
		prevNet:       make(map[string]netDelta),
		prevDisk:      make(map[string]diskDelta),
		containerPids: make(map[int32]string),
	}, nil
}

// Snapshot collects everything for one poll. It never returns a partial error:
// a failing collector adds a warning and the field stays empty.
func (c *Collector) Snapshot(ctx context.Context) (*model.Snapshot, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	snap := &model.Snapshot{
		Ts:         now.UnixMilli(),
		Disks:      []model.DiskStats{},
		Network:    []model.NetStats{},
		Processes:  []model.Process{},
		Agents:     []model.AgentSession{},
		Ports:      []model.Port{},
		Services:   []model.Service{},
		Containers: []model.Container{},
		Sensors:    []model.Sensor{},
		GPUs:       []model.GPU{},
		SMART:      []model.SMARTDevice{},
		Users:      []model.User{},
	}
	var warnings []string
	warn := func(area string, err error) {
		if err == nil {
			return
		}
		msg := fmt.Sprintf("%s: %v", area, err)
		warnings = append(warnings, msg)
		if c.log != nil {
			c.log.Warn("collector failed", "area", area, "error", err.Error())
		}
	}

	c.collectHost(ctx, &snap.Node, warn)
	c.collectCPU(ctx, &snap.CPU, warn)
	c.collectMemory(ctx, &snap.Memory, warn)
	c.collectPressure(&snap.Pressure, warn)
	c.collectDisks(ctx, &snap.Disks, warn)
	c.collectNetwork(ctx, &snap.Network, warn)
	c.collectProcesses(ctx, &snap.Processes, warn)
	snap.Agents = c.collectAgents(snap.Processes, now)
	c.collectPorts(&snap.Ports, warn)
	c.collectServices(&snap.Services, warn)
	c.collectContainers(ctx, &snap.Containers, warn)
	c.collectSensors(&snap.Sensors, warn)
	c.collectGPUs(&snap.GPUs, warn)
	c.collectSMART(&snap.SMART, warn)
	c.collectUsers(ctx, &snap.Users, warn)
	c.collectUpdates(&snap.Updates, warn)
	c.collectFD(&snap.FD, warn)

	snap.Warnings = warnings
	return snap, nil
}

func (c *Collector) collectHost(ctx context.Context, node *model.NodeInfo, warn func(string, error)) {
	node.ID = c.opts.NodeID
	node.Name = c.opts.Name
	node.AgentVersion = version.Version
	node.Labels = c.opts.Labels
	if node.Labels == nil {
		node.Labels = []string{}
	}
	if time.Since(c.hostAt) < time.Hour && c.host.Name != "" {
		*node = c.host
		node.Labels = c.opts.Labels
		return
	}
	info, err := host.InfoWithContext(ctx)
	if err != nil {
		warn("host", err)
	} else {
		node.Hostname = info.Hostname
		node.OS = info.OS
		node.Platform = info.Platform
		node.PlatformVer = info.PlatformVersion
		node.Kernel = info.KernelVersion
		node.Arch = info.KernelArch
		if node.Arch == "" {
			node.Arch = runtime.GOARCH
		}
		node.Virtualization = info.VirtualizationRole
		if node.Virtualization == "" && info.VirtualizationSystem != "" {
			node.Virtualization = info.VirtualizationSystem
		}
		if info.BootTime > 0 {
			node.BootTime = int64(info.BootTime) * 1000
		}
		node.UptimeSec = int64(info.Uptime)
	}
	if node.Hostname == "" {
		node.Hostname = c.opts.Name
	}

	cores, err := cpu.CountsWithContext(ctx, true)
	if err != nil || cores == 0 {
		cores = runtime.NumCPU()
	}
	node.Cores = cores
	if infos, err := cpu.InfoWithContext(ctx); err == nil && len(infos) > 0 {
		node.CPUModel = strings.TrimSpace(infos[0].ModelName)
		c.coreMHz = infos[0].Mhz
	}
	if node.CPUModel == "" {
		node.CPUModel = hardwareCPUModel()
	}
	c.host = *node
	c.hostAt = time.Now()
}

func (c *Collector) collectCPU(ctx context.Context, out *model.CPUStats, warn func(string, error)) {
	percents, err := cpu.PercentWithContext(ctx, 0, true)
	if err != nil {
		warn("cpu", err)
		return
	}
	if len(percents) == 0 {
		return
	}
	out.PerCore = make([]float64, len(percents))
	copy(out.PerCore, percents)
	if len(percents) == 1 {
		out.Percent = percents[0]
	} else {
		sum := 0.0
		for _, value := range percents {
			sum += value
		}
		out.Percent = sum / float64(len(percents))
	}

	times, err := cpu.TimesWithContext(ctx, false)
	if err == nil && len(times) > 0 {
		now := time.Now()
		current := times[0]
		if len(c.prevCPU) > 0 {
			prev := c.prevCPU[0]
			total := current.Total() - prev.Total()
			if total > 0 {
				out.User = (current.User - prev.User) / total * 100
				out.System = (current.System - prev.System) / total * 100
				out.Iowait = (current.Iowait - prev.Iowait) / total * 100
				out.Steal = (current.Steal - prev.Steal) / total * 100
				out.IDC = (current.Idle - prev.Idle) / total * 100
			}
		}
		c.prevCPU = times
		c.prevCPUAt = now
	}
	if c.coreMHz > 0 {
		out.MHz = c.coreMHz
	}
	if avg, err := load.AvgWithContext(ctx); err == nil {
		out.Load1, out.Load5, out.Load15 = avg.Load1, avg.Load5, avg.Load15
	}
	if procs, err := process.PidsWithContext(ctx); err == nil {
		out.Procs = len(procs)
	}
}

func (c *Collector) collectMemory(ctx context.Context, out *model.MemoryStats, warn func(string, error)) {
	vm, err := mem.VirtualMemoryWithContext(ctx)
	if err != nil {
		warn("memory", err)
		return
	}
	out.Total = vm.Total
	out.Used = vm.Used
	out.Available = vm.Available
	out.Cached = vm.Cached
	out.Buffers = vm.Buffers
	out.UsedPercent = vm.UsedPercent
	if swap, err := mem.SwapMemoryWithContext(ctx); err == nil {
		out.SwapTotal = swap.Total
		out.SwapUsed = swap.Used
	}
}

func (c *Collector) collectUsers(ctx context.Context, out *[]model.User, warn func(string, error)) {
	users, err := host.UsersWithContext(ctx)
	if err != nil {
		warn("users", err)
		return
	}
	for _, user := range users {
		*out = append(*out, model.User{
			Name:      user.User,
			TTY:       user.Terminal,
			Host:      user.Host,
			StartedAt: int64(user.Started) * 1000,
		})
	}
}

func (c *Collector) collectProcesses(ctx context.Context, out *[]model.Process, warn func(string, error)) {
	procs, err := process.ProcessesWithContext(ctx)
	if err != nil {
		warn("processes", err)
		return
	}
	now := time.Now()
	all := make([]model.Process, 0, len(procs))
	next := make(map[int32]procDelta, len(procs))

	for _, p := range procs {
		if err := ctx.Err(); err != nil {
			return
		}
		pid := p.Pid
		name, _ := p.NameWithContext(ctx)
		if name == "" {
			name = fmt.Sprintf("pid %d", pid)
		}
		modelProc := model.Process{PID: pid, Name: name}
		modelProc.PPID, _ = p.PpidWithContext(ctx)
		modelProc.User, _ = p.UsernameWithContext(ctx)
		modelProc.Threads, _ = p.NumThreadsWithContext(ctx)
		if states, err := p.StatusWithContext(ctx); err == nil && len(states) > 0 {
			modelProc.State = strings.Join(states, ",")
		}
		if created, err := p.CreateTimeWithContext(ctx); err == nil {
			modelProc.StartedAt = created
		}
		if rss, err := p.MemoryInfoWithContext(ctx); err == nil && rss != nil {
			modelProc.RSSBytes = rss.RSS
		}
		if tty, err := p.Terminal(); err == nil {
			modelProc.TTY = tty
		}
		if cwd, err := p.CwdWithContext(ctx); err == nil {
			modelProc.Cwd = cwd
		}
		if cmdline, err := p.CmdlineSlice(); err == nil {
			modelProc.Command = redactCommand(name, cmdline)
		} else {
			modelProc.Command = redactCommand(name, nil)
		}

		var cpuSeconds float64
		if times, err := p.TimesWithContext(ctx); err == nil {
			cpuSeconds = times.User + times.System
		}
		var readBytes, writeBytes uint64
		if io, err := p.IOCounters(); err == nil && io != nil {
			readBytes, writeBytes = io.ReadBytes, io.WriteBytes
		}
		if prev, ok := c.prevProcs[pid]; ok {
			elapsed := now.Sub(prev.at).Seconds()
			if elapsed > 0 {
				modelProc.CPUPercent = (cpuSeconds - prev.cpuSeconds) / elapsed * 100
				if modelProc.CPUPercent < 0 {
					modelProc.CPUPercent = 0
				}
				if readBytes >= prev.read {
					modelProc.ReadBps = float64(readBytes-prev.read) / elapsed
				}
				if writeBytes >= prev.write {
					modelProc.WriteBps = float64(writeBytes-prev.write) / elapsed
				}
			}
		}
		next[pid] = procDelta{cpuSeconds: cpuSeconds, at: now, read: readBytes, write: writeBytes}

		if container := c.containerForPID(pid); container != "" {
			modelProc.Container = container
		}
		if cgroup := readCgroup(pid); cgroup != "" {
			modelProc.Cgroup = cgroup
		}
		all = append(all, modelProc)
	}

	c.prevProcs = next
	c.allProcs = all
	c.allProcsAt = now

	sort.Slice(all, func(i, j int) bool {
		if all[i].CPUPercent == all[j].CPUPercent {
			return all[i].RSSBytes > all[j].RSSBytes
		}
		return all[i].CPUPercent > all[j].CPUPercent
	})
	limit := c.opts.Processes
	if limit > len(all) {
		limit = len(all)
	}
	*out = append(*out, all[:limit]...)
}

// redactCommand keeps the executable name and the argument count. Arguments
// are never collected: they can carry tokens, prompts or file paths.
func redactCommand(name string, argv []string) string {
	args := 0
	for _, arg := range argv {
		if strings.TrimSpace(arg) != "" {
			args++
		}
	}
	if args > 1 {
		return fmt.Sprintf("%s [%d args redacted]", name, args-1)
	}
	return name
}

func (c *Collector) collectAgents(top []model.Process, now time.Time) []model.AgentSession {
	all := c.allProcs
	if len(all) == 0 {
		all = top
	}
	byPID := make(map[int32]model.Process, len(all))
	for _, proc := range all {
		byPID[proc.PID] = proc
	}
	projectOf := func(cwd string) string {
		if cwd == "" {
			return ""
		}
		home, _ := os.UserHomeDir()
		if cwd == "/" || (home != "" && cwd == home) {
			return ""
		}
		return filepath.Base(cwd)
	}
	sessions := make([]model.AgentSession, 0)
	for _, proc := range all {
		def, ok := matchAgent(proc.Name, proc.Command, proc.Cwd)
		if !ok {
			continue
		}
		session := model.AgentSession{
			ID:         fmt.Sprintf("%s-%d", c.opts.NodeID, proc.PID),
			Type:       def.Type,
			Label:      def.Label,
			Category:   def.Category,
			PID:        proc.PID,
			PPID:       proc.PPID,
			Cwd:        proc.Cwd,
			Command:    proc.Command,
			StartedAt:  proc.StartedAt,
			CPUPercent: proc.CPUPercent,
			RSSBytes:   proc.RSSBytes,
			TTY:        proc.TTY,
			Container:  proc.Container,
			Project:    projectOf(proc.Cwd),
		}
		if proc.StartedAt > 0 {
			session.RuntimeSec = now.Unix() - proc.StartedAt/1000
			if session.RuntimeSec < 0 {
				session.RuntimeSec = 0
			}
		}
		if parent, ok := byPID[proc.PPID]; ok {
			session.Parent = parent.Name
		}
		sessions = append(sessions, session)
	}
	sort.Slice(sessions, func(i, j int) bool {
		if sessions[i].RuntimeSec == sessions[j].RuntimeSec {
			return sessions[i].PID < sessions[j].PID
		}
		return sessions[i].RuntimeSec > sessions[j].RuntimeSec
	})
	return sessions
}

type agentDef struct {
	Type     string
	Label    string
	Category string
	names    []string
	tokens   []string
}

var agentRegistry = []agentDef{
	{Type: "codex", Label: "Codex", Category: "coding agent", names: []string{"codex"}},
	{Type: "claude", Label: "Claude Code", Category: "coding agent", names: []string{"claude", "claude-code"}},
	{Type: "cursor-agent", Label: "Cursor Agent", Category: "coding agent", names: []string{"cursor-agent"}},
	{Type: "aider", Label: "Aider", Category: "coding agent", names: []string{"aider"}},
	{Type: "opencode", Label: "OpenCode", Category: "coding agent", names: []string{"opencode"}},
	{Type: "gemini", Label: "Gemini CLI", Category: "coding agent", names: []string{"gemini"}},
	{Type: "pi", Label: "Pi", Category: "coding agent", names: []string{"pi"}, tokens: []string{"--agent", "agent"}},
	{Type: "goose", Label: "Goose", Category: "coding agent", names: []string{"goose"}},
	{Type: "cline", Label: "Cline", Category: "coding agent", names: []string{"cline"}},
	{Type: "roo", Label: "Roo", Category: "coding agent", names: []string{"roo"}},
	{Type: "continue", Label: "Continue", Category: "coding agent", names: []string{"continue"}},
	{Type: "ollama", Label: "Ollama", Category: "model server", names: []string{"ollama", "ollama_llama_server"}},
	{Type: "llamacpp", Label: "llama.cpp", Category: "model server", names: []string{"llama-server", "llama-cli", "llama.cpp"}},
	{Type: "vllm", Label: "vLLM", Category: "model server", names: []string{"vllm"}},
	{Type: "comfyui", Label: "ComfyUI", Category: "model server", names: []string{"comfyui"}, tokens: []string{"comfyui"}},
}

func matchAgent(name, command, cwd string) (agentDef, bool) {
	base := strings.ToLower(filepath.Base(name))
	lowerCmd := strings.ToLower(command)
	lowerCwd := strings.ToLower(cwd)
	for _, def := range agentRegistry {
		for _, candidate := range def.names {
			if base == candidate || strings.HasPrefix(base, candidate+"-") {
				if def.Type == "pi" && !strings.Contains(lowerCmd, "agent") && !strings.Contains(lowerCwd, "pi") {
					// The Pi agent binary is `pi`; a random process called pi (Raspberry
					// Pi tools) is not a coding session.
					continue
				}
				if def.Type == "comfyui" && !strings.Contains(lowerCwd, "comfyui") && !strings.Contains(lowerCmd, "comfyui") {
					continue
				}
				return def, true
			}
		}
	}
	// ComfyUI runs as a Python process; the directory or command line is the
	// only signal.
	if strings.Contains(lowerCwd, "comfyui") || strings.Contains(lowerCmd, "comfyui") {
		for _, def := range agentRegistry {
			if def.Type == "comfyui" {
				return def, true
			}
		}
	}
	return agentDef{}, false
}

// hardwareCPUModel uses ghw for the inventory string; it is optional and must
// never block or crash the snapshot.
func hardwareCPUModel() string {
	defer func() { _ = recover() }()
	model := ghwCPUModel()
	return model
}
