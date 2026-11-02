package updater

import "testing"

func TestCompare(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"1.0.1", "1.0.1", 0},
		{"v1.0.1", "1.0.1", 0},
		{"1.0.2", "1.0.1", 1},
		{"1.0.1", "1.0.2", -1},
		{"1.1.0", "1.0.9", 1},
		{"2.0.0", "1.99.99", 1},
		{"1.0", "1.0.0", 0},
		{"1.0.0-rc1", "1.0.0", -1},
		{"1.0.0", "1.0.0-rc1", 1},
		{"1.0.0-rc2", "1.0.0-rc1", 1},
		{"1.0.0+build7", "1.0.0", 0},
		{"dev", "0.0.1", -1},
		{"", "1.0.0", -1},
	}
	for _, tc := range cases {
		if got := Compare(tc.a, tc.b); got != tc.want {
			t.Errorf("Compare(%q, %q) = %d, want %d", tc.a, tc.b, got, tc.want)
		}
	}
}

func TestNewer(t *testing.T) {
	if !Newer("1.0.2", "1.0.1") {
		t.Fatal("1.0.2 should be newer than 1.0.1")
	}
	if Newer("1.0.1", "1.0.1") {
		t.Fatal("equal versions are not newer")
	}
	if Newer("1.0.1", "1.0.2") {
		t.Fatal("an older release is not newer")
	}
}
