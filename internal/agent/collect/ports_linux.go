//go:build linux

package collect

import (
	"fmt"
	"net"
	"sort"
	"time"

	"github.com/prometheus/procfs"

	"github.com/abcdlsj/cupola/internal/model"
)

const (
	tcpListen = 0x0A
	udpUnconn = 0x07
)

// collectPorts joins the kernel socket table with the process file descriptors
// to name each listener. The join has no library, so it is done here and
// cached with the other 15s collectors.
func (c *Collector) collectPorts(out *[]model.Port, warn func(string, error)) {
	if time.Since(c.portsAt) < 30*time.Second {
		*out = append(*out, c.ports...)
		return
	}
	fs, err := procfs.NewDefaultFS()
	if err != nil {
		warn("ports", err)
		return
	}
	owners := resolveSocketPIDs()
	seen := make(map[string]struct{})
	var ports []model.Port

	add := func(proto, state string, ip net.IP, port uint64, inode uint64) {
		if port == 0 {
			return
		}
		address := "0.0.0.0"
		if ip != nil {
			address = ip.String()
		}
		key := fmt.Sprintf("%s/%s/%d", proto, address, port)
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		entry := model.Port{Proto: proto, Address: address, Port: uint32(port), State: state, Inode: inode}
		if owner, ok := owners[inode]; ok {
			entry.PID = owner.PID
			entry.Process = owner.Name
			entry.Cgroup = readCgroup(owner.PID)
			entry.Container = c.containerForPID(owner.PID)
		}
		ports = append(ports, entry)
	}

	if tcp4, err := fs.NetTCP(); err == nil {
		for _, line := range tcp4 {
			if line.St == tcpListen {
				add("tcp", "LISTEN", line.LocalAddr, line.LocalPort, line.Inode)
			}
		}
	}
	if tcp6, err := fs.NetTCP6(); err == nil {
		for _, line := range tcp6 {
			if line.St == tcpListen {
				add("tcp", "LISTEN", line.LocalAddr, line.LocalPort, line.Inode)
			}
		}
	}
	if udp4, err := fs.NetUDP(); err == nil {
		for _, line := range udp4 {
			if line.St == udpUnconn {
				add("udp", "UNCONN", line.LocalAddr, line.LocalPort, line.Inode)
			}
		}
	}
	if udp6, err := fs.NetUDP6(); err == nil {
		for _, line := range udp6 {
			if line.St == udpUnconn {
				add("udp", "UNCONN", line.LocalAddr, line.LocalPort, line.Inode)
			}
		}
	}
	sort.Slice(ports, func(i, j int) bool {
		if ports[i].Port == ports[j].Port {
			return ports[i].Proto < ports[j].Proto
		}
		return ports[i].Port < ports[j].Port
	})
	c.ports = ports
	c.portsAt = time.Now()
	*out = append(*out, ports...)
}
