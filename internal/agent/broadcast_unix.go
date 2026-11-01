//go:build unix

package agent

import (
	"net"

	"golang.org/x/sys/unix"
)

// setBroadcast enables SO_BROADCAST so the magic packet can leave the host.
func setBroadcast(conn *net.UDPConn) error {
	raw, err := conn.SyscallConn()
	if err != nil {
		return err
	}
	var setErr error
	err = raw.Control(func(fd uintptr) {
		setErr = unix.SetsockoptInt(int(fd), unix.SOL_SOCKET, unix.SO_BROADCAST, 1)
	})
	if err != nil {
		return err
	}
	return setErr
}
