// Package model holds the JSON shapes shared by the agent, the hub and the PWA.
//
// Units: every timestamp is Unix milliseconds, every byte figure is bytes,
// every rate is bytes per second, percentages are 0-100.
package model

const Version = "1.0.0"

type Snapshot struct {
	Ts       int64             `json:"ts"`
	Node     NodeInfo          `json:"node"`
	CPU      CPUStats          `json:"cpu"`
	Memory   MemoryStats       `json:"memory"`
	Pressure PressureStats     `json:"pressure"`
	Disks    []DiskStats       `json:"disks"`
	Network  []NetStats        `json:"network"`
	Processes []Process        `json:"processes"`
	Agents   []AgentSession    `json:"agents"`
	Ports    []Port            `json:"ports"`
	Services []Service         `json:"services"`
	Containers []Container     `json:"containers"`
	Sensors  []Sensor          `json:"sensors"`
	GPUs     []GPU             `json:"gpus"`
	SMART    []SMARTDevice     `json:"smart"`
	Users    []User            `json:"users"`
	Updates  *Updates          `json:"updates,omitempty"`
	FD       FDStats           `json:"fd"`
	Warnings []string          `json:"warnings,omitempty"`
}

type NodeInfo struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Hostname     string   `json:"hostname"`
	OS           string   `json:"os"`
	Platform     string   `json:"platform"`
	PlatformVer  string   `json:"platform_version"`
	Kernel       string   `json:"kernel"`
	Arch         string   `json:"arch"`
	Virtualization string `json:"virtualization"`
	CPUModel     string   `json:"cpu_model"`
	Cores        int      `json:"cores"`
	BootTime     int64    `json:"boot_time"`
	UptimeSec    int64    `json:"uptime_sec"`
	AgentVersion string   `json:"agent_version"`
	Labels       []string `json:"labels"`
}

type CPUStats struct {
	Percent  float64   `json:"percent"`
	PerCore  []float64 `json:"per_core"`
	User     float64   `json:"user"`
	System   float64   `json:"system"`
	Iowait   float64   `json:"iowait"`
	Steal    float64   `json:"steal"`
	IDC      float64   `json:"idle"`
	MHz      float64   `json:"mhz"`
	Load1    float64   `json:"load1"`
	Load5    float64   `json:"load5"`
	Load15   float64   `json:"load15"`
	Procs    int       `json:"procs"`
}

type MemoryStats struct {
	Total       uint64  `json:"total"`
	Used        uint64  `json:"used"`
	Available   uint64  `json:"available"`
	Cached      uint64  `json:"cached"`
	Buffers     uint64  `json:"buffers"`
	UsedPercent float64 `json:"used_percent"`
	SwapTotal   uint64  `json:"swap_total"`
	SwapUsed    uint64  `json:"swap_used"`
}

type PressureStat struct {
	Some float64 `json:"some"`
	Full float64 `json:"full"`
}

type PressureStats struct {
	CPU PressureStat `json:"cpu"`
	IO  PressureStat `json:"io"`
	Mem PressureStat `json:"mem"`
}

type DiskStats struct {
	Device    string  `json:"device"`
	Mount     string  `json:"mount"`
	FsType    string  `json:"fstype"`
	Total     uint64  `json:"total"`
	Used      uint64  `json:"used"`
	Free      uint64  `json:"free"`
	UsedPct   float64 `json:"used_pct"`
	Inodes    uint64  `json:"inodes"`
	InodesUsed uint64 `json:"inodes_used"`
	InodePct  float64 `json:"inode_pct"`
	ReadBps   float64 `json:"read_bps"`
	WriteBps  float64 `json:"write_bps"`
	ReadIOPS  float64 `json:"read_iops"`
	WriteIOPS float64 `json:"write_iops"`
	LatencyMs float64 `json:"latency_ms"`
	ReadOnly  bool    `json:"read_only"`
}

type NetStats struct {
	Iface     string  `json:"iface"`
	Up        bool    `json:"up"`
	RxBytes   uint64  `json:"rx_bytes"`
	TxBytes   uint64  `json:"tx_bytes"`
	RxBps     float64 `json:"rx_bps"`
	TxBps     float64 `json:"tx_bps"`
	RxErrors  uint64  `json:"rx_errors"`
	TxErrors  uint64  `json:"tx_errors"`
	RxDrops   uint64  `json:"rx_drops"`
	TxDrops   uint64  `json:"tx_drops"`
	SpeedMbps int     `json:"speed_mbps"`
	Duplex    string  `json:"duplex"`
	Driver    string  `json:"driver"`
	MAC       string  `json:"-"` // never exposed: MACs are identity, not telemetry
}

type Process struct {
	PID        int32   `json:"pid"`
	PPID       int32   `json:"ppid"`
	User       string  `json:"user"`
	Name       string  `json:"name"`
	Command    string  `json:"command"`
	Cwd        string  `json:"cwd,omitempty"`
	Cgroup     string  `json:"cgroup,omitempty"`
	Container  string  `json:"container,omitempty"`
	TTY        string  `json:"tty,omitempty"`
	CPUPercent float64 `json:"cpu_percent"`
	RSSBytes   uint64  `json:"rss_bytes"`
	Threads    int32   `json:"threads"`
	StartedAt  int64   `json:"started_at"`
	State      string  `json:"state"`
	ReadBps    float64 `json:"read_bps"`
	WriteBps   float64 `json:"write_bps"`
}

type AgentSession struct {
	ID         string  `json:"id"`
	Type       string  `json:"type"`
	Label      string  `json:"label"`
	Category   string  `json:"category"`
	PID        int32   `json:"pid"`
	PPID       int32   `json:"ppid"`
	Project    string  `json:"project"`
	Cwd        string  `json:"cwd"`
	Command    string  `json:"command"`
	StartedAt  int64   `json:"started_at"`
	RuntimeSec int64   `json:"runtime_sec"`
	CPUPercent float64 `json:"cpu_percent"`
	RSSBytes   uint64  `json:"rss_bytes"`
	TTY        string  `json:"tty"`
	Parent     string  `json:"parent"`
	Container  string  `json:"container,omitempty"`
	Service    string  `json:"service,omitempty"`
}

type Port struct {
	Proto     string `json:"proto"`
	Address   string `json:"address"`
	Port      uint32 `json:"port"`
	State     string `json:"state"`
	Inode     uint64 `json:"inode"`
	PID       int32  `json:"pid"`
	Process   string `json:"process"`
	Cgroup    string `json:"cgroup,omitempty"`
	Container string `json:"container,omitempty"`
	Service   string `json:"service,omitempty"`
}

type Service struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	LoadState   string `json:"load_state"`
	ActiveState string `json:"active_state"`
	SubState    string `json:"sub_state"`
	Enabled     string `json:"enabled"`
	Restarts    int    `json:"restarts"`
	Since       int64  `json:"since,omitempty"`
}

type Container struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Image      string  `json:"image"`
	State      string  `json:"state"`
	Status     string  `json:"status"`
	UptimeSec  int64   `json:"uptime_sec"`
	CPUPercent float64 `json:"cpu_percent"`
	MemBytes   uint64  `json:"mem_bytes"`
	MemLimit   uint64  `json:"mem_limit"`
	Restarts   int     `json:"restarts"`
	Ports      []string `json:"ports"`
}

type Sensor struct {
	Chip  string  `json:"chip"`
	Label string  `json:"label"`
	Kind  string  `json:"kind"` // temperature | fan | voltage
	Value float64 `json:"value"`
	Unit  string  `json:"unit"`
	Min   float64 `json:"min,omitempty"`
	Max   float64 `json:"max,omitempty"`
	Crit  float64 `json:"crit,omitempty"`
}

type GPUProcess struct {
	PID        int32  `json:"pid"`
	Name       string `json:"name"`
	MemBytes   uint64 `json:"mem_bytes"`
}

type GPU struct {
	Index       int          `json:"index"`
	Vendor      string       `json:"vendor"`
	Name        string       `json:"name"`
	UtilPercent float64      `json:"util_percent"`
	MemUsed     uint64       `json:"mem_used"`
	MemTotal    uint64       `json:"mem_total"`
	TempC       float64      `json:"temp_c"`
	PowerW      float64      `json:"power_w"`
	PowerLimitW float64      `json:"power_limit_w"`
	Processes   []GPUProcess `json:"processes,omitempty"`
}

type SMARTDevice struct {
	Device       string `json:"device"`
	Model        string `json:"model"`
	Type         string `json:"type"`
	Health       string `json:"health"` // passed | failing | unknown
	TemperatureC float64 `json:"temperature_c"`
	WearPercent  float64 `json:"wear_percent"`
	Reallocated  int64   `json:"reallocated"`
	PowerOnHours int64   `json:"power_on_hours"`
	Error        string  `json:"error,omitempty"`
}

type User struct {
	Name      string `json:"name"`
	TTY       string `json:"tty"`
	Host      string `json:"host"`
	StartedAt int64  `json:"started_at"`
}

type Updates struct {
	Manager   string `json:"manager"`
	Pending   int    `json:"pending"`
	Security  int    `json:"security"`
	CheckedAt int64  `json:"checked_at"`
	Error     string `json:"error,omitempty"`
}

type FDStats struct {
	Allocated uint64 `json:"allocated"`
	Max       uint64 `json:"max"`
	Conntrack int    `json:"conntrack"`
}

// Action is advertised by the agent. Script paths, MACs and broadcast
// addresses never leave the agent.
type Action struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
	Type        string `json:"type"` // script | wol
	Danger      bool   `json:"danger"`
	AllowAPI    bool   `json:"allow_api"`
	LastRunAt   int64  `json:"last_run_at,omitempty"`
	LastOK      *bool  `json:"last_ok,omitempty"`
	CustomIcon  string `json:"custom_icon,omitempty"` // hub-supplied raster URL, never a path
}

type ActionResult struct {
	RunID      string `json:"run_id"`
	ActionID   string `json:"action_id"`
	OK         bool   `json:"ok"`
	ExitCode   int    `json:"exit_code"`
	DurationMs int64  `json:"duration_ms"`
	Stdout     string `json:"stdout"`
	Stderr     string `json:"stderr"`
	Truncated  bool   `json:"truncated"`
	StartedAt  int64  `json:"started_at"`
}

// Event is produced by the agent (actions) and by the hub (changes, alerts).
type Event struct {
	ID       int64  `json:"id,omitempty"`
	NodeID   string `json:"node_id"`
	Ts       int64  `json:"ts"`
	Kind     string `json:"kind"`
	Severity string `json:"severity"` // info | warning | critical
	Message  string `json:"message"`
	Meta     string `json:"meta,omitempty"` // JSON object, kept small
}

// SeriesPoint is one bucket of a metric series.
type SeriesPoint struct {
	Ts  int64   `json:"ts"`
	Min float64 `json:"min"`
	Avg float64 `json:"avg"`
	Max float64 `json:"max"`
}

type Series struct {
	NodeID string        `json:"node_id"`
	Metric string        `json:"metric"`
	Range  string        `json:"range"`
	Step   int64         `json:"step_sec"`
	Points []SeriesPoint `json:"points"`
}

type NodeHealth struct {
	Status       string   `json:"status"` // healthy | degraded | offline | unknown
	DaysToFull   float64  `json:"days_to_full,omitempty"`
	Attention    int      `json:"attention"`
	RootDiskPct  float64  `json:"root_disk_pct"`
	MemPct       float64  `json:"mem_pct"`
	CPUPct       float64  `json:"cpu_pct"`
	Load1        float64  `json:"load1"`
	UptimeSec    int64    `json:"uptime_sec"`
	Agents        int     `json:"agents"`
	FailedUnits   int     `json:"failed_units"`
	Containers    int     `json:"containers"`
	Apps          int     `json:"apps"`
	MemUsed       uint64  `json:"mem_used"`
	MemTotal      uint64  `json:"mem_total"`
	RootDiskUsed  uint64  `json:"root_disk_used"`
	RootDiskTotal uint64  `json:"root_disk_total"`
	NetRxBps      float64 `json:"net_rx_bps"`
	Warnings     []string `json:"warnings,omitempty"`
}

type NodeView struct {
	Node     NodeRecord `json:"node"`
	Health   NodeHealth `json:"health"`
	Snapshot *Snapshot  `json:"snapshot,omitempty"`
}

type NodeRecord struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Labels       []string `json:"labels"`
	Mode         string   `json:"mode"` // pull | push
	URL          string   `json:"url,omitempty"`
	AgentVersion string   `json:"agent_version"`
	OS           string   `json:"os"`
	Kernel       string   `json:"kernel"`
	Arch         string   `json:"arch"`
	CreatedAt    int64    `json:"created_at"`
	LastSeen     int64    `json:"last_seen"`
	Status       string   `json:"status"`
}

type AlertRule struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Type        string  `json:"type"` // metric | event
	Metric      string  `json:"metric,omitempty"`
	Comparator  string  `json:"comparator,omitempty"` // gt | lt
	Threshold   float64 `json:"threshold,omitempty"`
	DurationSec int     `json:"duration_sec,omitempty"`
	Severity    string  `json:"severity"`
	NodeID      string  `json:"node_id,omitempty"`
	Kinds       []string `json:"kinds,omitempty"`
	ChannelID   string  `json:"channel_id,omitempty"`
	Enabled     bool    `json:"enabled"`
	CooldownSec int     `json:"cooldown_sec"`
	CreatedAt   int64   `json:"created_at"`
}

type Alert struct {
	ID        int64  `json:"id"`
	RuleID    string `json:"rule_id"`
	RuleName  string `json:"rule_name,omitempty"`
	NodeID    string `json:"node_id"`
	Ts        int64  `json:"ts"`
	State     string `json:"state"` // firing | resolved
	Value     float64 `json:"value"`
	Message   string `json:"message"`
}

type Channel struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Kind      string `json:"kind"` // webhook | ntfy | discord | slack | telegram
	HasSecret bool   `json:"has_secret"`
	Target    string `json:"target"` // redacted display form
	CreatedAt int64  `json:"created_at"`
}

type Delivery struct {
	ID        int64  `json:"id"`
	AlertID   int64  `json:"alert_id"`
	ChannelID string `json:"channel_id"`
	Ts        int64  `json:"ts"`
	OK        bool   `json:"ok"`
	Status    string `json:"status"`
	Attempts  int    `json:"attempts"`
	Error     string `json:"error,omitempty"`
}

type APIToken struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Prefix    string   `json:"prefix"`
	Scopes    []string `json:"scopes"`
	NodeIDs   []string `json:"node_ids"`
	ActionIDs []string `json:"action_ids"`
	CreatedAt int64    `json:"created_at"`
	ExpiresAt int64    `json:"expires_at,omitempty"`
	LastUsed  int64    `json:"last_used,omitempty"`
}

type ActionRun struct {
	ID         string `json:"id"`
	NodeID     string `json:"node_id"`
	ActionID   string `json:"action_id"`
	ActionName string `json:"action_name,omitempty"`
	Ts         int64  `json:"ts"`
	Actor      string `json:"actor"`
	Source     string `json:"source"` // ui | api
	OK         bool   `json:"ok"`
	ExitCode   int    `json:"exit_code"`
	DurationMs int64  `json:"duration_ms"`
	Output     string `json:"output,omitempty"`
	Truncated  bool   `json:"truncated"`
}
