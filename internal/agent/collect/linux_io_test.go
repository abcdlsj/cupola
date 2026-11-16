//go:build linux

package collect

import (
	"testing"
	"time"
)

// ethtool writes its own warnings to stderr and costs two ioctls per call, so
// the answers are cached; the journal on a 5 s poll must not repeat them.
func TestEthtoolDetailsAreCachedUntilTheTTLExpires(t *testing.T) {
	c := &Collector{}
	first := c.ethtoolDetails()
	if c.ethAt.IsZero() {
		t.Fatal("no cache timestamp after the first read")
	}
	first["marker0"] = linkDetail{speed: 1234}

	if got := c.ethtoolDetails()["marker0"].speed; got != 1234 {
		t.Fatalf("second read rebuilt the map (marker speed %d), want the cached one", got)
	}
	// linkInfo copies the detail out of the cache, so carrier state cannot leak
	// back into it.
	links := c.linkInfo()
	if _, ok := links["lo"]; ok {
		t.Fatal("loopback is skipped")
	}
	if got := c.ethDetails["marker0"].up; got {
		t.Fatal("linkInfo wrote carrier state into the cache")
	}

	c.ethAt = time.Now().Add(-2 * ethDetailTTL)
	if _, ok := c.ethtoolDetails()["marker0"]; ok {
		t.Fatal("expired cache was not rebuilt")
	}
}
