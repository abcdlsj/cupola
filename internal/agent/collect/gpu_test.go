//go:build linux

package collect

import "testing"

func TestIsCardName(t *testing.T) {
	cases := map[string]bool{
		"card0": true, "card1": true, "card12": true,
		"card0-DP-1": false, "renderD128": false, "version": false, "card": false, "cardX": false,
	}
	for name, want := range cases {
		if got := isCardName(name); got != want {
			t.Errorf("isCardName(%q) = %v, want %v", name, got, want)
		}
	}
}
