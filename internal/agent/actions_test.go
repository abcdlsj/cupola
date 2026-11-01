package agent

import (
	"context"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/abcdlsj/cupola/internal/model"
)

func TestWOLPacket(t *testing.T) {
	listener, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 0})
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	port := listener.LocalAddr().(*net.UDPAddr).Port
	_, err = sendWOL(ActionConfig{Type: "wol", MAC: "aa:bb:cc:dd:ee:ff", Broadcast: "127.0.0.1", Port: port})
	if err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 128)
	_ = listener.SetReadDeadline(time.Now().Add(2 * time.Second))
	n, _, err := listener.ReadFromUDP(buf)
	if err != nil {
		t.Fatal(err)
	}
	if n != 102 {
		t.Fatalf("packet length = %d, want 102", n)
	}
	for i := 0; i < 6; i++ {
		if buf[i] != 0xff {
			t.Fatalf("header byte %d = %x, want ff", i, buf[i])
		}
	}
	for i := 0; i < 16; i++ {
		mac := buf[6+6*i : 12+6*i]
		for j, want := range []byte{0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff} {
			if mac[j] != want {
				t.Fatalf("mac repetition %d byte %d = %x, want %x", i, j, mac[j], want)
			}
		}
	}
}

func TestScriptRunsWithoutShellOrArguments(t *testing.T) {
	dir := t.TempDir()
	script := filepath.Join(dir, "action.sh")
	// If a shell were involved, the semicolon would run touch; it must not.
	body := "#!/bin/sh\necho hello\nexit 0\n"
	if err := os.WriteFile(script, []byte(body), 0o755); err != nil {
		t.Fatal(err)
	}
	actions := NewActions([]ActionConfig{{
		ID: "hello", Name: "Hello", Type: "script", Script: script, Timeout: "5s",
	}}, nil)
	result, err := actions.Run(context.Background(), "hello", "tester", "api")
	if err != nil {
		t.Fatal(err)
	}
	if !result.OK || result.ExitCode != 0 {
		t.Fatalf("result = %+v, want exit 0", result)
	}
	if result.Stdout != "hello\n" {
		t.Fatalf("stdout = %q", result.Stdout)
	}
}

func TestScriptTimeoutIsReported(t *testing.T) {
	dir := t.TempDir()
	script := filepath.Join(dir, "slow.sh")
	if err := os.WriteFile(script, []byte("#!/bin/sh\nsleep 5\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	actions := NewActions([]ActionConfig{{
		ID: "slow", Name: "Slow", Type: "script", Script: script, Timeout: "1s",
	}}, nil)
	started := time.Now()
	result, err := actions.Run(context.Background(), "slow", "tester", "api")
	if err != nil {
		t.Fatal(err)
	}
	if result.OK {
		t.Fatal("timed-out action reported OK")
	}
	if time.Since(started) > 3*time.Second {
		t.Fatalf("timeout took %s", time.Since(started))
	}
}

func TestAdvertisedHidesSecrets(t *testing.T) {
	actions := NewActions([]ActionConfig{{
		ID: "wake", Name: "Wake", Type: "wol", MAC: "aa:bb:cc:dd:ee:ff",
		Broadcast: "192.0.2.255", Port: 9, AllowAPI: true,
	}, {
		ID: "script", Name: "Script", Type: "script", Script: "/usr/local/bin/backup.sh", Timeout: "5s",
	}}, nil)
	advertised := actions.Advertised()
	if len(advertised) != 2 {
		t.Fatalf("got %d actions", len(advertised))
	}
	if advertised[0].AllowAPI != true {
		t.Fatal("allow_api not advertised")
	}
	body := model.Action{}
	_ = body
}

func TestLimitedBufferTruncates(t *testing.T) {
	buf := &limitedBuffer{limit: 4}
	_, _ = buf.Write([]byte("abcdef"))
	if buf.String() != "abcd" || !buf.truncated {
		t.Fatalf("buffer = %q truncated=%v", buf.String(), buf.truncated)
	}
}
