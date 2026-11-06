package model

import "testing"

func TestPrunePortsDropsClientsAndEphemeralSockets(t *testing.T) {
	ports := []Port{
		{Proto: "tcp", Address: "0.0.0.0", Port: 22, State: "LISTEN", Process: "sshd"},
		{Proto: "tcp", Address: "::", Port: 22, State: "LISTEN", Process: "sshd"},
		{Proto: "tcp", Address: "::", Port: 443, State: "LISTEN", Process: "nexo"},
		{Proto: "tcp", Address: "127.0.0.1", Port: 5432, State: "LISTEN", Process: "postgres"},
		{Proto: "udp", Address: "0.0.0.0", Port: 68, State: "UNCONN", Process: "systemd-network"},
		{Proto: "udp", Address: "::", Port: 546, State: "UNCONN", Process: "systemd-network"},
		{Proto: "udp", Address: "127.0.0.1", Port: 323, State: "UNCONN", Process: "chronyd"},
		{Proto: "tcp", Address: "100.92.247.132", Port: 48773, State: "LISTEN", Process: "tailscaled"},
		{Proto: "tcp", Address: "100.89.191.123", Port: 55022, State: "LISTEN", Process: "tailscaled"},
		{Proto: "tcp", Address: "0.0.0.0", Port: 41641, State: "LISTEN", Process: "tailscaled"},
	}
	got := PrunePorts(ports)
	want := map[string]bool{
		"sshd/22/LISTEN":          true, // one row for the dual-stack listener
		"nexo/443/LISTEN":         true,
		"postgres/5432/LISTEN":    true,
		"tailscaled/41641/LISTEN": true,
	}
	seen := map[string]int{}
	for _, port := range got {
		seen[port.Process+"/"+itoaTest(port.Port)+"/"+port.State]++
	}
	for key, count := range seen {
		if !want[key] {
			t.Errorf("PrunePorts kept noise %s", key)
		}
		if count > 1 {
			t.Errorf("%s listed %d times, want once", key, count)
		}
	}
	for key := range want {
		if seen[key] != 1 {
			t.Errorf("PrunePorts dropped %s", key)
		}
	}
}

func itoaTest(value uint32) string {
	digits := ""
	if value == 0 {
		return "0"
	}
	for value > 0 {
		digits = string(rune('0'+value%10)) + digits
		value /= 10
	}
	return digits
}
