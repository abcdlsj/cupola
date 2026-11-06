// Package collect gathers one host's snapshot. Each collector is wrapped in a
// cache with its own cadence; a slow or unavailable collector yields a warning
// and the rest of the snapshot still ships.
package collect

import (
	"context"
	"errors"
	"fmt"
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

	services     []model.Service
	servicesAt   time.Time
	containers   []model.Container
	containersAt time.Time
	images       []model.Image
	imagesAt     time.Time
	ports        []model.Port
	portsAt      time.Time
	sensors      []model.Sensor
	sensorsAt    time.Time
	gpus         []model.GPU
	gpusAt       time.Time

	prevCPU   []cpu.TimesStat
	prevCPUAt time.Time
	prevProcs map[int32]procDelta
	prevNet   map[string]netDelta
	prevDisk  map[string]diskDelta


	containerPids map[int32]string
	dockerWarnAt  time.Time
}

type procDelta struct {
	cpuSeconds float64
	at         time.Time
	read       uint64
	write      uint64
	hasIO      bool
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
		opts:          opts,
		log:           opts.Logger,
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
	c.collectPorts(&snap.Ports, warn)
	c.collectServices(&snap.Services, warn)
	c.collectContainers(ctx, &snap.Containers, &snap.Images, warn)
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

	// Pass one: the cheap read every process needs, /proc/<pid>/stat through
	// gopsutil's Times. Everything else (status, cmdline, cwd, io, cgroup) is
	// read in pass two, for the processes the snapshot keeps plus anything that
	// looks like an AI agent. Reading all of it for every process on a box with
	// a few hundred of them was the second largest cost in the profile.
	type candidate struct {
		proc       *process.Process
		pid        int32
		name       string
		cpuSeconds float64
		cpuPercent float64
	}
	candidates := make([]candidate, 0, len(procs))
	for _, p := range procs {
		if err := ctx.Err(); err != nil {
			return
		}
		name, _ := p.NameWithContext(ctx)
		if name == "" {
			name = fmt.Sprintf("pid %d", p.Pid)
		}
		var cpuSeconds, cpuPercent float64
		if times, err := p.TimesWithContext(ctx); err == nil {
			cpuSeconds = times.User + times.System
		}
		if prev, ok := c.prevProcs[p.Pid]; ok {
			if elapsed := now.Sub(prev.at).Seconds(); elapsed > 0 && cpuSeconds >= prev.cpuSeconds {
				cpuPercent = (cpuSeconds - prev.cpuSeconds) / elapsed * 100
			}
		}
		candidates = append(candidates, candidate{proc: p, pid: p.Pid, name: name, cpuSeconds: cpuSeconds, cpuPercent: cpuPercent})
	}
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].cpuPercent == candidates[j].cpuPercent {
			return candidates[i].pid < candidates[j].pid
		}
		return candidates[i].cpuPercent > candidates[j].cpuPercent
	})

	keep := make(map[int32]bool, c.opts.Processes)
	for index, cand := range candidates {
		if index >= c.opts.Processes {
			continue
		}
		keep[cand.pid] = true
	}

	next := make(map[int32]procDelta, len(candidates))
	all := make([]model.Process, 0, len(keep))
	for _, cand := range candidates {
		pid := cand.pid
		delta := procDelta{cpuSeconds: cand.cpuSeconds, at: now}
		if !keep[pid] {
			// Keep the CPU baseline for every process so the next percentage is
			// right when one of them climbs into the snapshot.
			next[pid] = delta
			continue
		}
		p := cand.proc
		modelProc := model.Process{PID: pid, Name: cand.name, CPUPercent: cand.cpuPercent}
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
		if tty := processTTY(pid); tty != "" {
			modelProc.TTY = tty
		}
		if cwd, err := p.CwdWithContext(ctx); err == nil {
			modelProc.Cwd = cwd
		}
		if cmdline, err := p.CmdlineSlice(); err == nil {
			modelProc.Command = redactCommand(cand.name, cmdline)
		} else {
			modelProc.Command = redactCommand(cand.name, nil)
		}
		if io, err := p.IOCounters(); err == nil && io != nil {
			delta.read, delta.write = io.ReadBytes, io.WriteBytes
			delta.hasIO = true
		}
		if prev, ok := c.prevProcs[pid]; ok && prev.hasIO && delta.hasIO {
			if elapsed := now.Sub(prev.at).Seconds(); elapsed > 0 {
				if delta.read >= prev.read {
					modelProc.ReadBps = float64(delta.read-prev.read) / elapsed
				}
				if delta.write >= prev.write {
					modelProc.WriteBps = float64(delta.write-prev.write) / elapsed
				}
			}
		}
		next[pid] = delta

		if container := c.containerForPID(pid); container != "" {
			modelProc.Container = container
		}
		if cgroup := readCgroup(pid); cgroup != "" {
			modelProc.Cgroup = cgroup
		}
		all = append(all, modelProc)
	}

	c.prevProcs = next

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

// hardwareCPUModel uses ghw for the inventory string; it is optional and must
// never block or crash the snapshot.
func hardwareCPUModel() string {
	defer func() { _ = recover() }()
	model := ghwCPUModel()
	return model
}
