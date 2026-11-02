package hub

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"os"
	"os/exec"
	"sort"
	"strings"
	"sync"
	"time"
)

// tailnetCacheTTL keeps the Add-a-system peer list fresh without running
// tailscale on every keystroke.
const tailnetCacheTTL = 10 * time.Second

// tailnetPeer is the narrow view the hub exposes: no node keys, no tailnet
// identity beyond the machine names the operator already owns.
type tailnetPeer struct {
	Name    string `json:"name"`
	IPv4    string `json:"ipv4"`
	OS      string `json:"os"`
	Online  bool   `json:"online"`
	DNSName string `json:"dns_name"`
}

type tailnetResult struct {
	Available bool          `json:"available"`
	Error     string        `json:"error,omitempty"`
	Peers     []tailnetPeer `json:"peers"`
	CheckedAt int64         `json:"checked_at"`
}

type tailnetCache struct {
	mu     sync.Mutex
	at     time.Time
	valid  bool
	result tailnetResult
}

// tailscaleStatus mirrors only the fields read from `tailscale status --json`.
type tailscaleStatus struct {
	BackendState string `json:"BackendState"`
	Self         struct {
		HostName     string   `json:"HostName"`
		DNSName      string   `json:"DNSName"`
		OS           string   `json:"OS"`
		TailscaleIPs []string `json:"TailscaleIPs"`
	} `json:"Self"`
	// Older releases emit Peer, newer ones Peers; accept both.
	Peer  map[string]tailscalePeer `json:"Peer"`
	Peers map[string]tailscalePeer `json:"Peers"`
}

type tailscalePeer struct {
	HostName     string   `json:"HostName"`
	DNSName      string   `json:"DNSName"`
	OS           string   `json:"OS"`
	Online       bool     `json:"Online"`
	TailscaleIPs []string `json:"TailscaleIPs"`
}

// handleTailnetPeers is read-only: it lists the other machines in the hub's
// tailnet so the Add-a-system dialog can offer them. `refresh=1` skips the
// short cache when the operator presses Refresh.
func (h *Hub) handleTailnetPeers(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.tailnetPeers(r.Context(), r.URL.Query().Get("refresh") == "1"))
}

func (h *Hub) tailnetPeers(ctx context.Context, refresh bool) tailnetResult {
	h.tailnet.mu.Lock()
	defer h.tailnet.mu.Unlock()

	now := time.Now()
	if !refresh && h.tailnet.valid && now.Sub(h.tailnet.at) < tailnetCacheTTL {
		return h.tailnet.result
	}
	result := readTailnet(ctx, os.Getenv("CUPOLA_TAILSCALE_BIN"))
	result.CheckedAt = now.UnixMilli()
	h.tailnet.at = now
	h.tailnet.valid = true
	h.tailnet.result = result
	return result
}

func readTailnet(ctx context.Context, override string) tailnetResult {
	unavailable := func(message string) tailnetResult {
		return tailnetResult{Error: message, Peers: []tailnetPeer{}}
	}

	bin := strings.TrimSpace(override)
	if bin == "" {
		bin = "tailscale"
	}
	path, err := exec.LookPath(bin)
	if err != nil {
		return unavailable("tailscale is not installed on the hub")
	}

	runCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	cmd := exec.CommandContext(runCtx, path, "status", "--json")
	cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + os.Getenv("HOME")}
	out, err := cmd.Output()
	if err != nil {
		if errors.Is(runCtx.Err(), context.DeadlineExceeded) {
			return unavailable("tailscale status timed out")
		}
		return unavailable("tailscale status failed; is tailscaled running?")
	}

	var status tailscaleStatus
	if err := json.Unmarshal(out, &status); err != nil {
		return unavailable("tailscale status returned unexpected output")
	}
	if status.BackendState != "" && status.BackendState != "Running" {
		return unavailable("tailscale is not connected to a tailnet (state: " + status.BackendState + ")")
	}

	self := make(map[string]bool, len(status.Self.TailscaleIPs))
	for _, raw := range status.Self.TailscaleIPs {
		self[raw] = true
	}
	peers := make([]tailnetPeer, 0, len(status.Peer)+len(status.Peers))
	seen := make(map[string]bool)
	add := func(peer tailscalePeer) {
		ipv4 := firstIPv4(peer.TailscaleIPs)
		if ipv4 == "" || seen[ipv4] {
			return
		}
		for _, raw := range peer.TailscaleIPs {
			if self[raw] {
				return
			}
		}
		name := strings.TrimSpace(peer.HostName)
		dnsName := strings.TrimSuffix(strings.TrimSpace(peer.DNSName), ".")
		if name == "" {
			name = strings.SplitN(dnsName, ".", 2)[0]
		}
		if name == "" {
			name = ipv4
		}
		seen[ipv4] = true
		peers = append(peers, tailnetPeer{
			Name:    name,
			IPv4:    ipv4,
			OS:      peer.OS,
			Online:  peer.Online,
			DNSName: dnsName,
		})
	}
	for _, peer := range status.Peer {
		add(peer)
	}
	for _, peer := range status.Peers {
		add(peer)
	}
	sort.Slice(peers, func(i, j int) bool {
		left, right := strings.ToLower(peers[i].Name), strings.ToLower(peers[j].Name)
		if left == right {
			return peers[i].IPv4 < peers[j].IPv4
		}
		return left < right
	})
	return tailnetResult{Available: true, Peers: peers}
}

func firstIPv4(addresses []string) string {
	for _, raw := range addresses {
		ip := net.ParseIP(raw)
		if ip != nil && ip.To4() != nil {
			return ip.String()
		}
	}
	return ""
}
